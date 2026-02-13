const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const WORKS_DIR = path.resolve(__dirname, "../../works");
const LOCI_PATH = path.resolve(__dirname, "../../loci.yaml");
const AUTHORS_DIR = path.resolve(__dirname, "../../_cache/authors");
const TRADITIONS_PATH = path.resolve(__dirname, "../../traditions.yaml");
const TRANSLATORS_PATH = path.resolve(__dirname, "../../translators.yaml");
const DISPLAY_NAMES_PATH = path.resolve(__dirname, "../../display_names.yaml");

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

// --- Traditions ---

function loadTraditions() {
  if (!fs.existsSync(TRADITIONS_PATH)) return { traditions: [], authors: {} };
  const raw = fs.readFileSync(TRADITIONS_PATH, "utf8");
  return yaml.load(raw) || { traditions: [], authors: {} };
}

// --- Translators ---

function loadTranslators() {
  if (!fs.existsSync(TRANSLATORS_PATH)) return {};
  const raw = fs.readFileSync(TRANSLATORS_PATH, "utf8");
  return yaml.load(raw) || {};
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

// --- Display names ---

function loadDisplayNames() {
  if (!fs.existsSync(DISPLAY_NAMES_PATH)) return { corporate_authors: {} };
  const raw = fs.readFileSync(DISPLAY_NAMES_PATH, "utf8");
  const data = yaml.load(raw) || {};
  return { corporate_authors: data.corporate_authors || {} };
}

// For "Name of Place" authors (e.g., "Augustine of Hippo"), use the part
// before " of " as the family name instead of the last word.
function deriveFamilyName(name) {
  const ofIndex = name.indexOf(" of ");
  if (ofIndex > 0) return name.substring(0, ofIndex);
  return name.split(/\s+/).pop();
}

// --- Slugify ---

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// --- Work parsing ---

const WORK_META_KEYS = new Set(["author", "category", "loci", "corporate_author", "date_added"]);

function parseWork(fileId, data, translatorsMap) {
  const work = data[fileId];
  if (!work) return null;

  const en = work.en || {};
  const origLangs = [];
  for (const langCode of Object.keys(work)) {
    if (WORK_META_KEYS.has(langCode)) continue;
    const langData = work[langCode];
    if (langData && typeof langData === "object" && langData.orig_lang) {
      origLangs.push({ lang: langCode, ...langData });
    }
  }
  const origLang = origLangs[0] || null;

  // Get year from original language editions, falling back to any language's editions
  let year = null;
  if (origLang && origLang.editions) {
    for (const ed of origLang.editions) {
      if (ed.year && (year === null || ed.year < year)) year = ed.year;
    }
  }
  if (year === null) {
    for (const langCode of Object.keys(work)) {
      if (WORK_META_KEYS.has(langCode)) continue;
      const langData = work[langCode];
      if (langData && typeof langData === "object" && langData.editions) {
        for (const ed of langData.editions) {
          if (ed.year && (year === null || ed.year < year)) year = ed.year;
        }
      }
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
        sectionTexts: buildSectionUrlMap(s.text),
      };
    });
    const translatorName = t.translator || "Unknown";
    return {
      translator: translatorName,
      translatorInfo: translatorsMap[translatorName] || null,
      year: t.year || null,
      AI: t.AI || false,
      sites,
    };
  });

  // Merged section texts from all translation sites
  const sectionTexts = {};
  for (const t of translations) {
    for (const s of t.sites) {
      for (const [k, v] of Object.entries(s.sectionTexts)) {
        if (!sectionTexts[k]) sectionTexts[k] = v;
      }
    }
  }

  // Original language edition sites
  const origEditions = [];
  let oclc = null;
  if (origLang && origLang.editions) {
    for (const ed of origLang.editions) {
      const entry = { year: ed.year, place: ed.place || null, sites: [] };
      if (ed.sites) {
        for (const s of ed.sites) {
          entry.sites.push({ siteName: s.site, url: s.url });
        }
      }
      if (ed.oclc && !oclc) oclc = String(ed.oclc);
      origEditions.push(entry);
    }
  }

  // Normalize author to array
  const authors = Array.isArray(work.author) ? work.author : [work.author];

  // Parse corporate_author
  let corporateAuthor = null;
  if (work.corporate_author) {
    if (typeof work.corporate_author === "string") {
      corporateAuthor = {
        label: work.corporate_author,
        slug: slugify(work.corporate_author),
        qid: null,
      };
    } else if (typeof work.corporate_author === "object") {
      const ca = work.corporate_author;
      corporateAuthor = {
        label: ca.label,
        slug: ca.qid ? null : slugify(ca.label), // resolved later if QID
        qid: ca.qid || null,
      };
    }
  }

  // First original edition site URL (for linking the original title)
  let origUrl = null;
  for (const ed of origEditions) {
    for (const s of ed.sites) {
      if (s.url) { origUrl = s.url; break; }
    }
    if (origUrl) break;
  }

  return {
    id: fileId,
    author: authors[0], // backward compat: primary author QID
    authors,
    corporateAuthor,
    category: work.category || null,
    dateAdded: work.date_added
      ? (work.date_added instanceof Date
          ? work.date_added.toISOString().slice(0, 10)
          : String(work.date_added))
      : null,
    workLoci,
    allLoci: [...new Set(allLoci)],
    year,
    origTitle: origLang ? origLang.title : null,
    origLang: origLang ? origLang.lang : null,
    origUrl,
    oclc,
    origEditions,
    title: en.title || origLang?.title || fileId,
    sections,
    flatSections,
    translations,
    sectionTexts,
    yamlFilename: fileId + ".yaml",
  };
}

function loadAllWorks(translatorsMap) {
  const works = [];
  for (const file of fs.readdirSync(WORKS_DIR).sort()) {
    if (!file.endsWith(".yaml")) continue;
    try {
      const raw = fs.readFileSync(path.join(WORKS_DIR, file), "utf8");
      const data = yaml.load(raw);
      const fileId = Object.keys(data)[0];
      const work = parseWork(fileId, data, translatorsMap);
      if (work) works.push(work);
    } catch (err) {
      console.error(`Error parsing ${file}: ${err.message}`);
    }
  }
  return works;
}

// --- Build author pages ---

function getAuthorMeta(qid, authors) {
  return authors[qid] || {
    qid,
    name: qid,
    slug: slugify(qid),
    birthYear: null,
    deathYear: null,
    imageUrl: null,
    wikipediaUrl: null,
    prdlId: null,
    labels: {},
  };
}

function buildAuthorPages(works, authors, traditionAuthors) {
  const byAuthor = {};
  const corporateAuthors = {}; // keyed by slug

  for (const w of works) {
    // Resolve corporate author slug from QID cache if needed
    if (w.corporateAuthor && w.corporateAuthor.qid && !w.corporateAuthor.slug) {
      const caMeta = authors[w.corporateAuthor.qid];
      w.corporateAuthor.slug = caMeta ? caMeta.slug : slugify(w.corporateAuthor.label);
    }

    if (w.corporateAuthor) {
      // Build corporate author entry
      const caKey = w.corporateAuthor.slug;
      if (!corporateAuthors[caKey]) {
        const caQid = w.corporateAuthor.qid;
        const caMeta = caQid ? authors[caQid] : null;
        corporateAuthors[caKey] = {
          label: w.corporateAuthor.label,
          slug: w.corporateAuthor.slug,
          qid: caQid,
          meta: caMeta,
          memberQids: new Set(),
          works: [],
        };
      }
      for (const qid of w.authors) {
        corporateAuthors[caKey].memberQids.add(qid);
      }
      corporateAuthors[caKey].works.push(w);
    }

    // Add work to each individual author
    for (const qid of w.authors) {
      if (!byAuthor[qid]) byAuthor[qid] = [];

      // Annotate individual author's copy with corporate info
      const workCopy = { ...w };
      if (w.corporateAuthor) {
        workCopy.corporateAuthor = { ...w.corporateAuthor };
        workCopy.coMembers = w.authors
          .filter((q) => q !== qid)
          .map((q) => {
            const m = getAuthorMeta(q, authors);
            return { qid: q, name: m.name, slug: m.slug };
          });
      }
      byAuthor[qid].push(workCopy);
    }
  }

  // Build individual author pages
  const pages = Object.entries(byAuthor)
    .map(([qid, authorWorks]) => {
      const meta = getAuthorMeta(qid, authors);
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

      // Pick the original-language author name (first orig lang label, or English)
      const origLangName = origLangCodes.length > 0 && (meta.labels || {})[origLangCodes[0]]
        ? (meta.labels || {})[origLangCodes[0]]
        : meta.name;

      return {
        qid,
        name: meta.name,
        slug: meta.slug,
        birthYear: meta.birthYear,
        deathYear: meta.deathYear,
        imageUrl: meta.imageUrl,
        commonsUrl: meta.imageUrl
          ? meta.imageUrl.replace('http://', 'https://').replace('Special:FilePath/', 'File:')
          : null,
        wikipediaUrl: meta.wikipediaUrl || null,
        prdlId: meta.prdlId || null,
        openLibraryId: meta.openLibraryId || null,
        origLangName,
        authorLabels,
        tradition: traditionAuthors[qid] || null,
        works: authorWorks,
      };
    });

  // Build corporate author pages
  for (const ca of Object.values(corporateAuthors)) {
    const caMeta = ca.meta;
    const members = [...ca.memberQids].map((qid) => {
      const m = getAuthorMeta(qid, authors);
      return { qid, name: m.name, slug: m.slug };
    });

    ca.works.sort((a, b) => (a.year || 9999) - (b.year || 9999));

    pages.push({
      qid: ca.qid || ca.slug,
      name: ca.label,
      slug: ca.slug,
      birthYear: caMeta?.birthYear || null,
      deathYear: caMeta?.deathYear || null,
      imageUrl: caMeta?.imageUrl || null,
      commonsUrl: caMeta?.imageUrl
        ? caMeta.imageUrl.replace('http://', 'https://').replace('Special:FilePath/', 'File:')
        : null,
      wikipediaUrl: caMeta?.wikipediaUrl || null,
      prdlId: caMeta?.prdlId || null,
      openLibraryId: caMeta?.openLibraryId || null,
      origLangName: ca.label,
      authorLabels: [],
      tradition: ca.qid ? (traditionAuthors[ca.qid] || null) : null,
      isCorporate: true,
      members,
      works: ca.works,
    });
  }

  return pages.sort((a, b) => (a.birthYear || 9999) - (b.birthYear || 9999));
}

// --- Build loci index ---

function buildLociIndex(lociFlat, works, authors, corporateShortNames) {
  // Map each locus slug to authors + works/sections that discuss it
  const index = {};

  for (const work of works) {
    let authorMeta;
    if (work.corporateAuthor) {
      // Use corporate author in loci index
      const ca = work.corporateAuthor;
      const caMeta = ca.qid ? authors[ca.qid] : null;
      authorMeta = {
        name: ca.label,
        slug: ca.slug,
        qid: ca.qid || ca.slug,
        familyName: ca.label.split(/\s+/).pop(),
        givenName: ca.label.split(/\s+/)[0],
        birthYear: caMeta?.birthYear || null,
        shortName: corporateShortNames[ca.label] || null,
      };
    } else {
      authorMeta = authors[work.author] || { name: work.author, slug: slugify(work.author), qid: work.author };
    }

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
    const nameParts = authorMeta.name.split(/\s+/);
    index[slug][authorKey] = {
      name: authorMeta.name,
      slug: authorMeta.slug,
      qid: authorMeta.qid,
      familyName: authorMeta.familyName || deriveFamilyName(authorMeta.name),
      givenName: authorMeta.givenName || nameParts[0],
      birthYear: authorMeta.birthYear || null,
      shortName: authorMeta.shortName || null,
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

function computeDisplayNames(index) {
  for (const slug of Object.keys(index)) {
    const authors = Object.values(index[slug]);

    // Group by family name to detect collisions (skip entries with shortName override)
    const byFamily = {};
    for (const a of authors) {
      if (a.shortName) continue;
      const fam = a.familyName;
      if (!byFamily[fam]) byFamily[fam] = [];
      byFamily[fam].push(a);
    }

    for (const a of authors) {
      // Corporate authors / entries with explicit short names
      if (a.shortName) {
        a.displayName = a.shortName;
        continue;
      }

      const fam = a.familyName;
      const peers = byFamily[fam];
      if (peers.length === 1) {
        // Unique family name
        a.displayName = fam;
      } else {
        // Collision on family name — add initial
        const initial = a.givenName ? a.givenName[0] + "." : "";
        const key = initial + " " + fam;
        // Check if initial + family name is also ambiguous
        const sameInitial = peers.filter(
          (p) => p.givenName && p.givenName[0] === (a.givenName ? a.givenName[0] : "")
        );
        if (sameInitial.length > 1) {
          // Same initial + family — add birth year
          a.displayName = initial + " " + fam + (a.birthYear ? " (b. " + a.birthYear + ")" : "");
        } else {
          a.displayName = initial + " " + fam;
        }
      }
    }
  }
}

// --- Build translator index ---

function sortTranslatorsByLastName(translators) {
  translators.sort((a, b) => {
    const aParts = a.name.split(/\s+/);
    const bParts = b.name.split(/\s+/);
    const aLast = aParts[aParts.length - 1];
    const bLast = bParts[bParts.length - 1];
    if (aLast !== bLast) return aLast.localeCompare(bLast);
    return a.name.localeCompare(b.name);
  });
}

function sortWorksByAuthor(works) {
  works.sort((a, b) => {
    if (a.authorName !== b.authorName) return a.authorName.localeCompare(b.authorName);
    return a.title.localeCompare(b.title);
  });
}

function buildTranslatorIndex(works, authorPages) {
  // site -> translator -> works[]
  const bySite = {};

  // Build a lookup from QID to author page for name/slug
  const authorByQid = {};
  for (const ap of authorPages) {
    if (ap.qid && ap.qid.startsWith("Q")) {
      authorByQid[ap.qid] = ap;
    }
  }

  for (const work of works) {
    // Resolve author display info (prefer corporate author)
    let authorName, authorSlug;
    if (work.corporateAuthor) {
      authorName = work.corporateAuthor.label;
      authorSlug = work.corporateAuthor.slug;
    } else {
      const ap = authorByQid[work.author];
      authorName = ap ? ap.name : work.author;
      authorSlug = ap ? ap.slug : slugify(work.author);
    }

    for (const t of work.translations) {
      const translatorName = t.translator;
      const translatorKey = translatorName.toLowerCase();

      for (const s of t.sites) {
        const siteName = s.siteName;
        const siteKey = siteName.toLowerCase();
        if (!bySite[siteKey]) {
          bySite[siteKey] = { name: siteName, translators: {} };
        }
        if (!bySite[siteKey].translators[translatorKey]) {
          bySite[siteKey].translators[translatorKey] = { name: translatorName, slug: slugify(translatorName), translatorInfo: t.translatorInfo || null, works: [] };
        }
        bySite[siteKey].translators[translatorKey].works.push({
          title: work.title,
          workId: work.id,
          authorName,
          authorSlug,
          year: t.year,
          AI: t.AI,
          url: s.url,
          volumes: s.volumes,
        });
      }
    }
  }

  // Convert to sorted arrays
  const sites = Object.values(bySite);
  sites.sort((a, b) => a.name.localeCompare(b.name));

  for (const site of sites) {
    site.translators = Object.values(site.translators);
    sortTranslatorsByLastName(site.translators);
    for (const t of site.translators) {
      sortWorksByAuthor(t.works);
    }
  }

  return sites;
}

// --- Main export ---

module.exports = function () {
  const lociTree = loadLociTree();
  const lociFlat = buildLociFlat(lociTree);
  const authors = loadAuthors();
  const translatorsMap = loadTranslators();
  const works = loadAllWorks(translatorsMap);
  const traditionsData = loadTraditions();
  const traditionAuthors = traditionsData.authors || {};
  const displayNames = loadDisplayNames();
  const authorPages = buildAuthorPages(works, authors, traditionAuthors);
  const lociIndex = buildLociIndex(lociFlat, works, authors, displayNames.corporate_authors);
  computeDisplayNames(lociIndex);

  // Annotate lociIndex entries with tradition
  for (const slug of Object.keys(lociIndex)) {
    for (const authorKey of Object.keys(lociIndex[slug])) {
      lociIndex[slug][authorKey].tradition = traditionAuthors[authorKey] || null;
    }
  }

  // Works index: authors sorted by first published work year
  const worksIndex = [...authorPages].sort((a, b) => {
    const aYear = a.works[0]?.year || 9999;
    const bYear = b.works[0]?.year || 9999;
    return aYear - bYear;
  });

  const translatorIndex = buildTranslatorIndex(works, authorPages);

  // Build a lookup from QID to author page for whatsNew
  const authorByQid = {};
  for (const ap of authorPages) {
    if (ap.qid && String(ap.qid).startsWith("Q")) {
      authorByQid[ap.qid] = ap;
    }
  }

  // What's New: works sorted by date_added descending, limit 100
  const whatsNew = works
    .filter((w) => w.dateAdded)
    .sort((a, b) => (b.dateAdded > a.dateAdded ? 1 : b.dateAdded < a.dateAdded ? -1 : 0))
    .slice(0, 100)
    .map((w) => {
      let authorName, authorSlug;
      if (w.corporateAuthor) {
        authorName = w.corporateAuthor.label;
        authorSlug = w.corporateAuthor.slug;
      } else {
        const ap = authorByQid[w.author];
        authorName = ap ? ap.name : w.author;
        authorSlug = ap ? ap.slug : slugify(w.author);
      }
      // Flatten translations to translator + site pairs
      const translations = [];
      for (const t of w.translations) {
        for (const s of t.sites) {
          translations.push({
            translator: t.translator,
            translatorInfo: t.translatorInfo || null,
            siteName: s.siteName,
            url: s.url,
            volumes: s.volumes,
          });
        }
      }
      return {
        id: w.id,
        title: w.title,
        year: w.year,
        dateAdded: w.dateAdded,
        authorName,
        authorSlug,
        translations,
      };
    });

  return {
    lociTree,
    lociFlat,
    authorPages,
    worksIndex,
    lociIndex,
    translatorIndex,
    whatsNew,
    traditions: traditionsData.traditions || [],
    repoUrl: "https://github.com/locinet/locinet.github.io",
  };
};
