#!/usr/bin/env node
// Import works from CCEL ThML/XML into Locinet YAML.
// Usage: node scripts/import-ccel.js [--force]
//
// Reads ccel.yaml for the list of works to import. Each entry:
//   - url: https://ccel.org/ccel/hodge/theology1/theology1.xml  (direct XML URL)
//     author: Q12345                                              (Wikidata QID)
//     id: hodge-theology-1                                        (work ID for the YAML file)
//     lang: en                                       (optional, default: en)
//     orig_lang: la                                  (optional, if the original was in another language)
//     category: systematic                           (optional)
//     work_level: 0                                  (optional, 0=one file, 1+=split at that depth)
//
// The script downloads the ThML XML from CCEL, extracts the section structure
// from div1/div2/div3 elements, and generates YAML skeleton files in works/.

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { DOMParser } = require("@xmldom/xmldom");

const WORKS_DIR = path.resolve(__dirname, "../works");
const MANIFEST_PATH = path.resolve(__dirname, "../ccel.yaml");
const CACHE_DIR = path.resolve(__dirname, "../_cache/ccel");

function parseArgs(argv) {
  const args = { force: false, id: null };
  let i = 2;
  while (i < argv.length) {
    if (argv[i] === "--force") {
      args.force = true;
    } else if (argv[i] === "--id" && argv[i + 1]) {
      args.id = argv[++i];
    }
    i++;
  }
  return args;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function yamlQuote(val) {
  if (!val) return '""';
  if (/[:#'"{}[\],&*?|>!%@`]/.test(val)) {
    return '"' + val.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  return val;
}

function makeUniqueSlug(base, seen) {
  let slug = base;
  let n = 2;
  while (seen.has(slug)) {
    slug = `${base}-${n++}`;
  }
  seen.add(slug);
  return slug;
}

function toTitleCase(str) {
  const minor = new Set([
    "a", "an", "the", "and", "but", "or", "nor", "for", "yet", "so",
    "at", "by", "in", "of", "on", "to", "up", "as", "is", "it",
  ]);
  return str
    .split(/\s+/)
    .map((word, i) => {
      if (i === 0 || !minor.has(word.toLowerCase())) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word.toLowerCase();
    })
    .join(" ");
}

// Get the text content of an element, stripping all markup
function getPlainText(el) {
  if (!el) return "";
  let text = "";
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === 3) { // text node
      text += child.nodeValue;
    } else if (child.nodeType === 1) { // element node
      text += getPlainText(child);
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

// Extract the book ID from an XML URL (filename without .xml)
function ccelBookId(url) {
  const parts = url.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1].replace(/\.xml$/, "");
}

// Derive the CCEL page URL from the XML URL (strip /bookId.xml)
function ccelPageUrl(url) {
  return url.replace(/\/[^/]+\.xml$/, "");
}

async function downloadXml(url, cachePath) {
  if (fs.existsSync(cachePath)) {
    console.error(`  Using cached XML: ${cachePath}`);
    return fs.readFileSync(cachePath, "utf8");
  }

  console.error(`  Downloading ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  console.error(`  Downloaded ${text.length} characters`);

  // Cache for future runs
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, text, "utf8");
  console.error(`  Cached to ${cachePath}`);

  return text;
}

// Parse the ThML XML and extract metadata + section structure
function parseThml(xmlStr) {
  const doc = new DOMParser({
    errorHandler: { warning: () => {}, error: () => {}, fatalError: (e) => { throw e; } }
  }).parseFromString(xmlStr, "text/xml");

  const root = doc.documentElement;

  // Extract metadata from ThML.head
  let title = null;
  let author = null;
  let year = null;
  let ccelUrl = null;

  const dcTitles = root.getElementsByTagName("DC.Title");
  if (dcTitles.length > 0) {
    title = getPlainText(dcTitles[0]);
  }

  const dcCreators = root.getElementsByTagName("DC.Creator");
  for (let i = 0; i < dcCreators.length; i++) {
    const sub = dcCreators[i].getAttribute("sub");
    if (sub === "Author") {
      const scheme = dcCreators[i].getAttribute("scheme");
      if (scheme === "short-form") {
        author = getPlainText(dcCreators[i]);
      }
    }
  }

  const dcIdentifiers = root.getElementsByTagName("DC.Identifier");
  for (let i = 0; i < dcIdentifiers.length; i++) {
    const scheme = dcIdentifiers[i].getAttribute("scheme");
    if (scheme === "URL") {
      ccelUrl = getPlainText(dcIdentifiers[i]);
    }
  }

  // Extract section tree from div1/div2/div3/div4 elements
  const body = root.getElementsByTagName("ThML.body");
  if (!body || body.length === 0) {
    return { title, author, year, ccelUrl, sections: [] };
  }

  const sections = collectDivSections(body[0]);
  return { title, author, year, ccelUrl, sections };
}

// Recursively collect sections from div1, div2, div3, div4 elements
function collectDivSections(parentEl) {
  const results = [];

  for (let i = 0; i < parentEl.childNodes.length; i++) {
    const child = parentEl.childNodes[i];
    if (child.nodeType !== 1) continue;

    const tag = child.localName || child.tagName;
    if (!tag || !tag.match(/^div[1-4]$/)) continue;

    const divTitle = child.getAttribute("title") || "";
    const divId = child.getAttribute("id") || "";

    // Skip front-matter divs (Title, Prefatory, etc.)
    if (isSkippableDiv(divTitle)) continue;

    const children = collectDivSections(child);
    const cleanTitle = cleanSectionTitle(divTitle);

    if (cleanTitle) {
      results.push({ title: cleanTitle, id: divId, children });
    } else if (children.length > 0) {
      // No title on this div — promote children up
      results.push(...children);
    }
  }

  return results;
}

// Identify front-matter divs to skip
function isSkippableDiv(title) {
  if (!title) return true;
  const lower = title.toLowerCase().trim();
  return (
    lower === "title" ||
    lower === "prefatory" ||
    lower === "preface" ||
    lower === "title page" ||
    lower === "table of contents" ||
    lower === "contents" ||
    lower === "indexes" ||
    lower === "index" ||
    lower === ""
  );
}

// Clean up a section title from the ThML title attribute
function cleanSectionTitle(title) {
  if (!title) return null;
  // Trim whitespace
  title = title.replace(/\s+/g, " ").trim();
  if (!title) return null;
  return title;
}

// Walk the section tree to the given depth, returning the sections at that level.
// level 1 = top-level sections, level 2 = their children, etc.
function getSectionsAtLevel(sections, level) {
  if (level <= 1) return sections;
  const result = [];
  for (const section of sections) {
    result.push(...getSectionsAtLevel(section.children, level - 1));
  }
  return result;
}

function generateSections(sections, indent, slugSeen, ccelBaseUrl, urlList) {
  let out = "";
  const pad = " ".repeat(indent);

  for (const section of sections) {
    const slug = makeUniqueSlug(slugify(section.title), slugSeen);
    out += `${pad}- ${slug}: ${yamlQuote(section.title)}\n`;
    out += `${pad}  # loci:\n`;

    // Collect page URL for section_urls
    if (ccelBaseUrl && section.id) {
      urlList.push({ slug, id: section.id });
    }

    if (section.children.length > 0) {
      out += `${pad}  sections:\n`;
      out += generateSections(section.children, indent + 4, slugSeen, ccelBaseUrl, urlList);
    }
  }

  return out;
}

// Generate YAML for a single work.
// workId: the YAML work ID
// workTitle: the title for this work
// sections: the section tree for this work
// entry: the manifest entry (for author, lang, category, url)
function generateYaml(workId, workTitle, sections, entry) {
  const authorQid = entry.author;
  const lang = entry.lang || "en";
  const origLang = entry.orig_lang || null;
  const category = entry.category || null;
  const today = new Date().toISOString().slice(0, 10);

  const ccelBaseUrl = ccelPageUrl(entry.url);
  const bookId = ccelBookId(entry.url);

  const slugSeen = new Set();
  const urlList = [];
  const sectionsYaml = generateSections(sections, 6, slugSeen, ccelBaseUrl, urlList);

  let out = "";
  out += `${workId}:\n`;
  out += `  author: ${authorQid}\n`;
  out += `  date_added: ${today}\n`;
  if (category) {
    out += `  category: ${category}\n`;
  }
  out += `  # loci:\n`;

  if (origLang) {
    // Work has a non-English original language
    out += `  ${origLang}:\n`;
    out += `    title: # FILL IN\n`;
    out += `    orig_lang: true\n`;
    out += `    editions:\n`;
    out += `      - year: # FILL IN\n`;
    out += `  en:\n`;
    out += `    title: ${yamlQuote(workTitle || "# FILL IN")}\n`;
    if (sectionsYaml) {
      out += `    sections:\n`;
      out += sectionsYaml;
    }
    out += `    translations:\n`;
    out += `      - translator: # FILL IN\n`;
    out += `        sites:\n`;
    out += `          - site: CCEL\n`;
    out += `            url: ${ccelBaseUrl}\n`;
    if (urlList.length > 0) {
      out += `            section_urls:\n`;
      for (const { slug, id } of urlList) {
        out += `              - ${slug}: ${ccelBaseUrl}/${bookId}.${id}.html\n`;
      }
    }
  } else if (lang === "en") {
    // English original
    out += `  en:\n`;
    out += `    title: ${yamlQuote(workTitle || "# FILL IN")}\n`;
    out += `    orig_lang: true\n`;
    out += `    editions:\n`;
    out += `      - year: # FILL IN\n`;
    out += `        sites:\n`;
    out += `          - site: CCEL\n`;
    out += `            url: ${ccelBaseUrl}\n`;
    if (urlList.length > 0) {
      out += `            section_urls:\n`;
      for (const { slug, id } of urlList) {
        out += `              - ${slug}: ${ccelBaseUrl}/${bookId}.${id}.html\n`;
      }
    }
    if (sectionsYaml) {
      out += `    sections:\n`;
      out += sectionsYaml;
    }
  } else {
    // Non-English original, no English translation on CCEL
    out += `  ${lang}:\n`;
    out += `    title: ${yamlQuote(workTitle || "# FILL IN")}\n`;
    out += `    orig_lang: true\n`;
    out += `    editions:\n`;
    out += `      - year: # FILL IN\n`;
    out += `        sites:\n`;
    out += `          - site: CCEL\n`;
    out += `            url: ${ccelBaseUrl}\n`;
    out += `  en:\n`;
    out += `    title: # FILL IN\n`;
    if (sectionsYaml) {
      out += `    sections:\n`;
      out += sectionsYaml;
    }
  }

  return out;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`Manifest not found: ${MANIFEST_PATH}`);
    console.error(`Create ccel.yaml with a list of entries. Example:`);
    console.error(`\n- url: https://ccel.org/ccel/hodge/theology1/theology1.xml`);
    console.error(`  author: Q507025`);
    console.error(`  id: hodge-st`);
    console.error(`  category: systematic`);
    process.exit(1);
  }

  const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
  const manifest = yaml.load(raw);
  if (!manifest || !Array.isArray(manifest)) {
    console.error("ccel.yaml is empty or not a list");
    process.exit(0);
  }

  let entries = manifest;
  if (args.id) {
    entries = entries.filter((e) => e.id === args.id);
    if (entries.length === 0) {
      console.error(`No entry with id "${args.id}" found in ccel.yaml`);
      process.exit(1);
    }
  }

  // Ensure cache dir exists
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  let imported = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.url || !entry.author || !entry.id) {
      console.error(`Skipping entry missing required fields (url, author, id):`, entry);
      continue;
    }

    const workLevel = entry.work_level || 0;
    const outPath = path.join(WORKS_DIR, `${entry.id}.yaml`);

    if (workLevel === 0 && fs.existsSync(outPath) && !args.force) {
      console.log(`Skipping ${entry.id} — ${outPath} already exists (use --force to overwrite)`);
      skipped++;
      continue;
    }

    console.log(`Importing ${entry.id}...`);

    try {
      // Download or load cached XML
      const bookId = ccelBookId(entry.url);
      const cachePath = path.join(CACHE_DIR, `${bookId}.xml`);
      const xmlStr = await downloadXml(entry.url, cachePath);

      // Parse and extract sections
      const metadata = parseThml(xmlStr);
      console.log(`  Title: ${metadata.title || "(none)"}`);
      console.log(`  Author: ${metadata.author || "(none)"}`);
      console.log(`  Sections: ${metadata.sections.length}`);

      if (workLevel === 0) {
        // Single work file
        const yamlContent = generateYaml(entry.id, metadata.title, metadata.sections, entry);
        fs.writeFileSync(outPath, yamlContent, "utf8");
        console.log(`  Wrote ${outPath}`);
        imported++;
      } else {
        // Split at the given level: each top-level section becomes its own work
        const splitSections = getSectionsAtLevel(metadata.sections, workLevel);
        const idSeen = new Set();
        for (const section of splitSections) {
          const sectionSlug = makeUniqueSlug(slugify(section.title), idSeen);
          const splitWorkId = `${entry.id}-${sectionSlug}`;
          const splitOutPath = path.join(WORKS_DIR, `${splitWorkId}.yaml`);

          if (fs.existsSync(splitOutPath) && !args.force) {
            console.log(`  Skipping ${splitWorkId} — already exists`);
            skipped++;
            continue;
          }

          const yamlContent = generateYaml(splitWorkId, section.title, section.children, entry);
          fs.writeFileSync(splitOutPath, yamlContent, "utf8");
          console.log(`  Wrote ${splitOutPath}`);
          imported++;
        }
      }
    } catch (err) {
      console.error(`  Error importing ${entry.id}: ${err.message}`);
    }
  }

  console.log(`\nDone: ${imported} imported, ${skipped} skipped`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
