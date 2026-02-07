const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const WORKS_DIR = path.resolve(__dirname, "../../works");
const LOCI_PATH = path.resolve(__dirname, "../../loci.yaml");
const AUTHORS_DIR = path.resolve(__dirname, "../../_cache/authors");

// --- Loci processing ---

function loadLociTree() {
  const raw = fs.readFileSync(LOCI_PATH, "utf8");
  return yaml.load(raw);
}

function buildLociFlat(nodes, parentSlugs, flat) {
  flat = flat || {};
  parentSlugs = parentSlugs || [];
  for (const node of nodes) {
    const descendants = [];
    collectDescendantSlugs(node.children || [], descendants);
    flat[node.slug] = {
      name: node.name,
      slug: node.slug,
      ancestors: [...parentSlugs],
      descendants,
    };
    if (node.children) {
      buildLociFlat(node.children, [...parentSlugs, node.slug], flat);
    }
  }
  return flat;
}

function collectDescendantSlugs(nodes, out) {
  for (const node of nodes) {
    out.push(node.slug);
    if (node.children) collectDescendantSlugs(node.children, out);
  }
}

// --- Author cache ---

function loadAuthors() {
  const authors = {};
  if (!fs.existsSync(AUTHORS_DIR)) return authors;
  for (const file of fs.readdirSync(AUTHORS_DIR)) {
    if (!file.endsWith(".json")) continue;
    const data = JSON.parse(fs.readFileSync(path.join(AUTHORS_DIR, file), "utf8"));
    authors[data.qid] = data;
  }
  return authors;
}

// --- Section parsing ---

const RESERVED_KEYS = new Set(["loci", "sections"]);

function parseSection(item) {
  const keys = Object.keys(item);
  let id = null;
  let title = null;
  for (const k of keys) {
    if (!RESERVED_KEYS.has(k)) {
      id = String(k);
      title = String(item[k]);
      break;
    }
  }
  if (id === null) return null;

  const lociRaw = item.loci;
  const loci = lociRaw
    ? Array.isArray(lociRaw)
      ? lociRaw.map(String)
      : [String(lociRaw)]
    : [];

  const children = item.sections
    ? item.sections.map(parseSection).filter(Boolean)
    : [];

  return { id, title, loci, children };
}

function flattenSections(sections, depth, out) {
  out = out || [];
  depth = depth || 0;
  for (const s of sections) {
    out.push({ ...s, depth, children: undefined, childCount: s.children.length });
    if (s.children.length > 0) {
      flattenSections(s.children, depth + 1, out);
    }
  }
  return out;
}

function collectAllSectionLoci(sections) {
  const all = [];
  for (const s of sections) {
    all.push(...s.loci);
    if (s.children) all.push(...collectAllSectionLoci(s.children));
  }
  return all;
}

// --- Section URL lookup ---

function buildSectionUrlMap(sectionUrls) {
  const map = {};
  if (!sectionUrls) return map;
  for (const item of sectionUrls) {
    const keys = Object.keys(item);
    for (const k of keys) {
      map[String(k)] = item[k];
    }
  }
  return map;
}

// --- Work parsing ---

function parseWork(fileId, data) {
  const work = data[fileId];
  if (!work) return null;

  const en = work.en || {};
  const origLangs = [];
  for (const langCode of Object.keys(work)) {
    if (langCode === "author" || langCode === "category" || langCode === "loci" || langCode === "en") continue;
    const langData = work[langCode];
    if (langData && typeof langData === "object" && langData.orig_lang) {
      origLangs.push({ lang: langCode, ...langData });
    }
  }
  const origLang = origLangs[0] || null;

  // Get year from original language editions
  let year = null;
  if (origLang && origLang.editions) {
    for (const ed of origLang.editions) {
      if (ed.year && (year === null || ed.year < year)) year = ed.year;
    }
  }

  // Parse sections
  const rawSections = en.sections || [];
  const sections = rawSections.map(parseSection).filter(Boolean);
  const flatSections = flattenSections(sections);

  // Work-level loci
  const workLociRaw = work.loci;
  const workLoci = workLociRaw
    ? Array.isArray(workLociRaw)
      ? workLociRaw.map(String)
      : [String(workLociRaw)]
    : [];

  // All loci (work + sections) for filtering
  const allLoci = [...workLoci, ...collectAllSectionLoci(sections)];

  // Translations
  const translations = (en.translations || []).map((t) => {
    const sites = (t.sites || []).map((s) => {
      const urlData = s.url;
      let mainUrl = null;
      let volumes = null;
      if (urlData && typeof urlData === "object" && urlData.volumes) {
        volumes = urlData.volumes;
      } else {
        mainUrl = urlData || null;
      }
      return {
        siteName: s.site || "Unknown",
        url: mainUrl,
        volumes,
        pdf: s.pdf || false,
        sectionUrls: buildSectionUrlMap(s.section_urls),
      };
    });
    return {
      translator: t.translator || "Unknown",
      year: t.year || null,
      sites,
    };
  });

  // Original language edition sites
  const origEditions = [];
  if (origLang && origLang.editions) {
    for (const ed of origLang.editions) {
      const entry = { year: ed.year, place: ed.place || null, sites: [] };
      if (ed.sites) {
        for (const s of ed.sites) {
          entry.sites.push({ siteName: s.site, url: s.url });
        }
      }
      origEditions.push(entry);
    }
  }

  return {
    id: fileId,
    author: work.author,
    category: work.category || null,
    workLoci,
    allLoci: [...new Set(allLoci)],
    year,
    origTitle: origLang ? origLang.title : null,
    origLang: origLang ? origLang.lang : null,
    origEditions,
    title: en.title || origLang?.title || fileId,
    sections,
    flatSections,
    translations,
    yamlFilename: fileId + ".yaml",
  };
}

function loadAllWorks() {
  const works = [];
  for (const file of fs.readdirSync(WORKS_DIR).sort()) {
    if (!file.endsWith(".yaml")) continue;
    try {
      const raw = fs.readFileSync(path.join(WORKS_DIR, file), "utf8");
      const data = yaml.load(raw);
      const fileId = Object.keys(data)[0];
      const work = parseWork(fileId, data);
      if (work) works.push(work);
    } catch (err) {
      console.error(`Error parsing ${file}: ${err.message}`);
    }
  }
  return works;
}

// --- Build author pages ---

function buildAuthorPages(works, authors) {
  const byAuthor = {};
  for (const w of works) {
    if (!byAuthor[w.author]) byAuthor[w.author] = [];
    byAuthor[w.author].push(w);
  }

  return Object.entries(byAuthor)
    .map(([qid, authorWorks]) => {
      const meta = authors[qid] || {
        qid,
        name: qid,
        slug: qid.toLowerCase(),
        birthYear: null,
        deathYear: null,
        imageUrl: null,
        wikipediaUrl: null,
        prdlId: null,
        labels: {},
      };
      authorWorks.sort((a, b) => (a.year || 9999) - (b.year || 9999));

      // Collect unique original languages for this author's works
      const origLangCodes = [...new Set(
        authorWorks
          .map((w) => w.origLang)
          .filter(Boolean)
      )];

      // Build labels for languages this author published in (excluding English)
      const authorLabels = [];
      const labels = meta.labels || {};
      for (const lang of origLangCodes) {
        if (lang === "en") continue;
        if (labels[lang]) {
          authorLabels.push({ lang, label: labels[lang] });
        }
      }

      return {
        qid,
        name: meta.name,
        slug: meta.slug,
        birthYear: meta.birthYear,
        deathYear: meta.deathYear,
        imageUrl: meta.imageUrl,
        wikipediaUrl: meta.wikipediaUrl || null,
        prdlId: meta.prdlId || null,
        authorLabels,
        works: authorWorks,
      };
    })
    .sort((a, b) => (a.birthYear || 9999) - (b.birthYear || 9999));
}

// --- Build loci index ---

function buildLociIndex(lociFlat, works, authors) {
  // Map each locus slug to authors + works/sections that discuss it
  const index = {};

  for (const work of works) {
    const authorMeta = authors[work.author] || { name: work.author, slug: work.author.toLowerCase(), qid: work.author };

    // Work-level loci
    for (const slug of work.workLoci) {
      addToLociIndex(index, slug, authorMeta, work, null);
    }

    // Section-level loci (recursive)
    indexSectionsLoci(work.sections, index, authorMeta, work);
  }

  return index;
}

function indexSectionsLoci(sections, index, authorMeta, work) {
  for (const section of sections) {
    for (const slug of section.loci) {
      addToLociIndex(index, slug, authorMeta, work, section);
    }
    if (section.children) {
      indexSectionsLoci(section.children, index, authorMeta, work);
    }
  }
}

function addToLociIndex(index, slug, authorMeta, work, section) {
  if (!index[slug]) index[slug] = {};
  const authorKey = authorMeta.qid;
  if (!index[slug][authorKey]) {
    index[slug][authorKey] = {
      name: authorMeta.name,
      slug: authorMeta.slug,
      qid: authorMeta.qid,
      entries: [],
    };
  }
  index[slug][authorKey].entries.push({
    workId: work.id,
    workTitle: work.title,
    sectionId: section ? section.id : null,
    sectionTitle: section ? section.title : null,
  });
}

// --- Main export ---

module.exports = function () {
  const lociTree = loadLociTree();
  const lociFlat = buildLociFlat(lociTree);
  const authors = loadAuthors();
  const works = loadAllWorks();
  const authorPages = buildAuthorPages(works, authors);
  const lociIndex = buildLociIndex(lociFlat, works, authors);

  return {
    lociTree,
    lociFlat,
    authorPages,
    lociIndex,
    repoUrl: "https://github.com/YOUR_USERNAME/locinet",
  };
};
