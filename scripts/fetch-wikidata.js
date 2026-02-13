const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const WORKS_DIR = path.resolve(__dirname, "../works");
const CACHE_DIR = path.resolve(__dirname, "../_cache/authors");

function isQid(s) {
  return typeof s === "string" && /^Q\d+$/.test(s);
}

function collectQids() {
  const qids = new Set();
  for (const file of fs.readdirSync(WORKS_DIR)) {
    if (!file.endsWith(".yaml")) continue;
    const raw = fs.readFileSync(path.join(WORKS_DIR, file), "utf8");
    const data = yaml.load(raw);
    const key = Object.keys(data)[0];
    const work = data[key];
    const author = work.author;
    if (author) {
      if (Array.isArray(author)) {
        for (const qid of author) {
          if (isQid(qid)) qids.add(qid);
        }
      } else {
        if (isQid(author)) qids.add(author);
      }
    }
    // Collect corporate_author QID if present
    if (work.corporate_author && typeof work.corporate_author === "object" && work.corporate_author.qid) {
      qids.add(work.corporate_author.qid);
    }
  }
  return [...qids];
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchAuthor(qid) {
  const sparql = `
    SELECT ?label ?birthYear ?deathYear ?image ?enwiki ?prdl ?familyName ?givenName ?openLibrary WHERE {
      wd:${qid} rdfs:label ?label . FILTER(LANG(?label) = "en")
      OPTIONAL { wd:${qid} wdt:P569 ?birth . BIND(YEAR(?birth) AS ?birthYear) }
      OPTIONAL { wd:${qid} wdt:P570 ?death . BIND(YEAR(?death) AS ?deathYear) }
      OPTIONAL { wd:${qid} wdt:P18 ?image . }
      OPTIONAL { ?enwiki schema:about wd:${qid} ; schema:isPartOf <https://en.wikipedia.org/> . }
      OPTIONAL { wd:${qid} wdt:P1463 ?prdl . }
      OPTIONAL { wd:${qid} wdt:P734 ?familyNameItem . ?familyNameItem rdfs:label ?familyName . FILTER(LANG(?familyName) = "en") }
      OPTIONAL { wd:${qid} wdt:P735 ?givenNameItem . ?givenNameItem rdfs:label ?givenName . FILTER(LANG(?givenName) = "en") }
      OPTIONAL { wd:${qid} wdt:P648 ?openLibrary . }
    } LIMIT 1
  `;
  const url =
    "https://query.wikidata.org/sparql?format=json&query=" +
    encodeURIComponent(sparql);

  const res = await fetch(url, {
    headers: { "User-Agent": "Locinet/1.0 (theological directory)" },
  });
  if (!res.ok) throw new Error(`Wikidata query failed for ${qid}: ${res.status}`);
  const json = await res.json();
  const row = json.results.bindings[0];
  if (!row) throw new Error(`No results for ${qid}`);

  const name = row.label.value;

  // Fetch all labels via SPARQL
  const labelsSparql = `
    SELECT ?label (LANG(?label) AS ?lang) WHERE {
      wd:${qid} rdfs:label ?label .
    }
  `;
  const labelsUrl =
    "https://query.wikidata.org/sparql?format=json&query=" +
    encodeURIComponent(labelsSparql);
  const labelsRes = await fetch(labelsUrl, {
    headers: { "User-Agent": "Locinet/1.0 (theological directory)" },
  });
  let labels = {};
  if (labelsRes.ok) {
    const labelsJson = await labelsRes.json();
    for (const row2 of labelsJson.results.bindings) {
      labels[row2.lang.value] = row2.label.value;
    }
  }

  const referenceWorks = await fetchReferenceWorks(qid);

  return {
    _cacheVersion: 4,
    qid,
    name,
    slug: slugify(name),
    birthYear: row.birthYear ? parseInt(row.birthYear.value) : null,
    deathYear: row.deathYear ? parseInt(row.deathYear.value) : null,
    imageUrl: row.image ? row.image.value : null,
    wikipediaUrl: row.enwiki ? row.enwiki.value : null,
    prdlId: row.prdl ? row.prdl.value : null,
    familyName: row.familyName ? row.familyName.value : null,
    givenName: row.givenName ? row.givenName.value : null,
    openLibraryId: row.openLibrary ? row.openLibrary.value : null,
    referenceWorks,
    labels,
  };
}

async function fetchReferenceWorks(qid) {
  const sparql = `
    SELECT DISTINCT ?prop ?propLabel ?type ?typeLabel ?identifier ?resolvedUrl ?shortAlias WHERE {
      VALUES ?type { wd:Q97584729 wd:Q55452870 }

      wd:${qid} ?prop ?identifier .
      FILTER(isLiteral(?identifier))

      ?property wikibase:directClaim ?prop .
      ?property wdt:P31 ?type .

      ?property p:P1630 ?formatterStmt .
      ?formatterStmt ps:P1630 ?formatterUrl .
      ?formatterStmt pq:P407 wd:Q1860 .

      OPTIONAL {
        ?property wdt:P9073 ?referenceWorkItem .
        ?referenceWorkItem skos:altLabel ?shortAlias .
        FILTER(LANG(?shortAlias) = "en")
        FILTER NOT EXISTS {
          ?referenceWorkItem skos:altLabel ?alias2 .
          FILTER(LANG(?alias2) = "en")
          FILTER(STRLEN(STR(?alias2)) < STRLEN(STR(?shortAlias)))
        }
      }


      BIND(IRI(REPLACE(STR(?formatterUrl), "\\$1", ENCODE_FOR_URI(STR(?identifier)))) AS ?resolvedUrl)

      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
  const url =
    "https://query.wikidata.org/sparql?format=json&query=" +
    encodeURIComponent(sparql);

  const res = await fetch(url, {
    headers: { "User-Agent": "Locinet/1.0 (theological directory)" },
  });

  if (!res.ok) {
    throw new Error(`Wikidata reference query failed for ${qid}: ${res.status}`);
  }

  const json = await res.json();
  return json.results.bindings.map((row) => ({
    property: row.propLabel ? row.propLabel.value : row.prop.value,
    propertyIri: row.prop.value,
    type: row.typeLabel ? row.typeLabel.value : row.type.value,
    typeIri: row.type.value,
    identifier: row.identifier.value,
    url: row.resolvedUrl.value,
    shortAlias: row.shortAlias ? row.shortAlias.value : null,
  }));
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const qids = collectQids();
  console.log(`Found ${qids.length} unique authors`);

  for (const qid of qids) {
    const cachePath = path.join(CACHE_DIR, `${qid}.json`);
    if (fs.existsSync(cachePath)) {
      // Check if cache has the new fields; if not, re-fetch
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      if (cached._cacheVersion >= 4) {
        console.log(`  ${qid} — cached`);
        continue;
      }
      console.log(`  ${qid} — re-fetching (missing new fields)...`);
    }
    try {
      console.log(`  ${qid} — fetching...`);
      const data = await fetchAuthor(qid);
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
      console.log(`  ${qid} — ${data.name}`);
      // Be polite to Wikidata
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`  ${qid} — ERROR: ${err.message}`);
    }
  }
  console.log("Done.");
}

main();
