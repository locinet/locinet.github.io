#!/usr/bin/env node
// Import works from EarlyPrint Library TEI XML into Locinet YAML.
// Usage: node scripts/import-earlyprint.js [xml-dir] [--id work-id] [--force]
// When xml-dir is omitted, looks for XML files in _cache/earlyprint/.
// Download XML from texts.earlyprint.org (XML dropdown) and save as <TCP_ID>.xml.

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { DOMParser } = require("@xmldom/xmldom");

const WORKS_DIR = path.resolve(__dirname, "../works");
const MANIFEST_PATH = path.resolve(__dirname, "../earlyprint.yaml");
const CACHE_DIR = path.resolve(__dirname, "../_cache/earlyprint");

function parseArgs(argv) {
  const args = { xmlDir: null, id: null, force: false };
  let i = 2;
  if (argv[i] && !argv[i].startsWith("--")) {
    args.xmlDir = argv[i++];
  }
  while (i < argv.length) {
    if (argv[i] === "--id" && argv[i + 1]) {
      args.id = argv[++i];
    } else if (argv[i] === "--force") {
      args.force = true;
    }
    i++;
  }
  return args;
}

function findCachedXml(tcpId) {
  const cachePath = path.join(CACHE_DIR, `${tcpId}.xml`);
  if (fs.existsSync(cachePath)) return cachePath;
  return null;
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

// Extract text from an element by joining <w> word elements.
// Uses the `reg` attribute for modernized spelling when available.
function extractText(el) {
  const words = [];
  walkWords(el, words);
  return words.join(" ").replace(/\s+/g, " ").replace(/ ([,;:.!?)\]])/g, "$1").trim();
}

function walkWords(node, words) {
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === 1) {
      // Element node
      const tag = child.localName || child.tagName;
      if (tag === "w") {
        // Use reg (modernized) attribute if available, else text content
        const reg = child.getAttribute("reg");
        if (reg) {
          words.push(reg);
        } else {
          words.push(child.textContent || "");
        }
      } else if (tag === "pc") {
        // Punctuation character
        words.push(child.textContent || "");
      } else {
        walkWords(child, words);
      }
    }
  }
}

// Convert extracted text to title case
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

function findXmlFile(xmlDir, tcpId) {
  // Try direct path first
  const direct = path.join(xmlDir, `${tcpId}.xml`);
  if (fs.existsSync(direct)) return direct;

  // Search recursively
  function search(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const found = search(path.join(dir, entry.name));
        if (found) return found;
      } else if (entry.name === `${tcpId}.xml`) {
        return path.join(dir, entry.name);
      }
    }
    return null;
  }
  return search(xmlDir);
}

function getElementsByTagNameNS(el, ns, localName) {
  // xmldom's getElementsByTagNameNS
  return el.getElementsByTagNameNS ? el.getElementsByTagNameNS(ns, localName) : el.getElementsByTagName(localName);
}

function getElementByPath(doc, teiNs, ...tagNames) {
  let current = doc.documentElement;
  for (const tag of tagNames) {
    const els = getElementsByTagNameNS(current, teiNs, tag);
    if (!els || els.length === 0) return null;
    current = els[0];
  }
  return current;
}

function getTextContent(el, teiNs, tagName) {
  if (!el) return null;
  const els = getElementsByTagNameNS(el, teiNs, tagName);
  if (!els || els.length === 0) return null;
  return (els[0].textContent || "").trim() || null;
}

function parseTeiXml(xmlPath, tcpId) {
  const xmlStr = fs.readFileSync(xmlPath, "utf8");
  const doc = new DOMParser().parseFromString(xmlStr, "text/xml");

  // Detect namespace
  const root = doc.documentElement;
  const teiNs = root.namespaceURI || "";

  // Extract metadata from teiHeader/sourceDesc
  const sourceDesc = getElementByPath(doc, teiNs, "teiHeader", "fileDesc", "sourceDesc");
  const biblFull = sourceDesc
    ? getElementsByTagNameNS(sourceDesc, teiNs, "biblFull")[0] || sourceDesc
    : null;

  let title = null;
  let authorName = null;
  let year = null;

  if (biblFull) {
    const titleStmt = getElementsByTagNameNS(biblFull, teiNs, "titleStmt")[0];
    if (titleStmt) {
      title = getTextContent(titleStmt, teiNs, "title");
      authorName = getTextContent(titleStmt, teiNs, "author");
    }
    const pubStmt = getElementsByTagNameNS(biblFull, teiNs, "publicationStmt")[0];
    if (pubStmt) {
      const dateEl = getElementsByTagNameNS(pubStmt, teiNs, "date")[0];
      if (dateEl) {
        const dateText = (dateEl.textContent || "").trim();
        const match = dateText.match(/\d{4}/);
        if (match) year = parseInt(match[0], 10);
      }
    }
  }

  // Clean up title: remove excessive whitespace from word-level markup
  if (title) {
    title = title.replace(/\s+/g, " ").trim();
    title = toTitleCase(title);
  }

  // Find ALL <body> elements — EarlyPrint XML can use <group> to nest
  // multiple <text> elements, each with its own <body>
  const allBodies = getElementsByTagNameNS(root, teiNs, "body");
  if (!allBodies || allBodies.length === 0) {
    console.error(`  Warning: no <body> found in ${xmlPath}`);
    return { title, authorName, year, sections: [] };
  }

  const sections = [];
  for (let i = 0; i < allBodies.length; i++) {
    const body = allBodies[i];

    // Check if this body has a direct <head> (part/book title)
    let bodyHeadText = null;
    for (let j = 0; j < body.childNodes.length; j++) {
      const c = body.childNodes[j];
      if (c.nodeType === 1 && (c.localName || c.tagName) === "head") {
        bodyHeadText = toTitleCase(extractText(c));
        break;
      }
    }

    const bodySections = collectSections(body, teiNs, tcpId);

    if (allBodies.length === 1 || !bodyHeadText) {
      // Single body or no heading — promote sections directly
      sections.push(...bodySections);
    } else {
      // Multiple bodies with headings — wrap as a parent section
      const pageId = findFirstPb(body, teiNs, tcpId);
      sections.push({ title: bodyHeadText, pageId, children: bodySections });
    }
  }

  return { title, authorName, year, sections };
}

// Returns an array of sections found in this element.
// If the element has a <head>, it becomes one section with its child divs as children.
// If it has no <head>, its child divs' sections are promoted to this level.
function collectSections(el, teiNs, tcpId) {
  const results = [];
  const childDivs = getElementsByTagNameNS(el, teiNs, "div");
  for (let i = 0; i < childDivs.length; i++) {
    if (childDivs[i].parentNode !== el) continue;
    const div = childDivs[i];

    // Extract heading from direct <head> child
    const headEls = getElementsByTagNameNS(div, teiNs, "head");
    let headText = null;
    for (let j = 0; j < headEls.length; j++) {
      if (headEls[j].parentNode === div) {
        headText = extractText(headEls[j]);
        break;
      }
    }

    // Recurse into child divs
    const childSections = collectSections(div, teiNs, tcpId);

    if (!headText) {
      // No heading — promote child sections to this level
      results.push(...childSections);
    } else {
      headText = toTitleCase(headText);
      const pageId = findFirstPb(div, teiNs, tcpId);
      results.push({ title: headText, pageId, children: childSections });
    }
  }
  return results;
}

function findFirstPb(el, teiNs, tcpId) {
  // Walk the element tree to find the first <pb> element
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === 1) {
      const tag = child.localName || child.tagName;
      if (tag === "pb") {
        const xmlId =
          child.getAttributeNS("http://www.w3.org/XML/1998/namespace", "id") ||
          child.getAttribute("xml:id") ||
          child.getAttribute("id");
        if (xmlId) {
          // Format: A14461-003-a → extract 003-a
          const prefix = tcpId + "-";
          if (xmlId.startsWith(prefix)) {
            return xmlId.substring(prefix.length);
          }
          return xmlId;
        }
        return null;
      }
      // Recurse into child elements (but not into nested divs)
      const childTag = child.localName || child.tagName;
      if (childTag !== "div") {
        const found = findFirstPb(child, teiNs, tcpId);
        if (found) return found;
      }
    }
  }
  return null;
}

function generateYaml(entry, metadata) {
  const { work_id, author, lang, orig_lang, translator } = entry;
  const tcpId = entry.tcp_id;
  const langCode = lang || "en";
  const { title, year, sections } = metadata;
  const earlyPrintUrl = `https://texts.earlyprint.org/works/${tcpId}.xml`;

  const slugSeen = new Set();
  const urlList = [];
  const sectionsYaml = generateSections(sections, 6, slugSeen, urlList, tcpId);

  let out = "";
  out += `${work_id}:\n`;
  out += `  author: ${author}\n`;
  out += `  # loci:\n`;

  if (orig_lang) {
    // Translation — original language gets a stub, English gets the content
    out += `  ${orig_lang}:\n`;
    out += `    title: # FILL IN\n`;
    out += `    orig_lang: true\n`;
    out += `  en:\n`;
    out += `    title: ${yamlQuote(title || "# FILL IN")}\n`;
    if (sectionsYaml) {
      out += `    sections:\n`;
      out += sectionsYaml;
    }
    out += `    translations:\n`;
    out += `      - year: ${year || "# FILL IN"}\n`;
    if (translator) {
      out += `        translator: ${yamlQuote(translator)}\n`;
    }
    out += `        sites:\n`;
    out += `          - site: EarlyPrint\n`;
    out += `            url: ${earlyPrintUrl}\n`;
    if (urlList.length > 0) {
      out += `            section_urls:\n`;
      for (const { slug, pageId } of urlList) {
        out += `              - ${slug}: ${earlyPrintUrl}?page=${pageId}\n`;
      }
    }
  } else if (langCode === "en") {
    // English is both original and display language
    out += `  en:\n`;
    out += `    title: ${yamlQuote(title || "# FILL IN")}\n`;
    out += `    orig_lang: true\n`;
    out += `    editions:\n`;
    out += `      - year: ${year || "# FILL IN"}\n`;
    out += `        sites:\n`;
    out += `          - site: EarlyPrint\n`;
    out += `            url: ${earlyPrintUrl}\n`;
    if (urlList.length > 0) {
      out += `            section_urls:\n`;
      for (const { slug, pageId } of urlList) {
        out += `              - ${slug}: ${earlyPrintUrl}?page=${pageId}\n`;
      }
    }
    if (sectionsYaml) {
      out += `    sections:\n`;
      out += sectionsYaml;
    }
  } else {
    // Non-English original
    out += `  ${langCode}:\n`;
    out += `    title: ${yamlQuote(title || "# FILL IN")}\n`;
    out += `    orig_lang: true\n`;
    out += `    editions:\n`;
    out += `      - year: ${year || "# FILL IN"}\n`;
    out += `        sites:\n`;
    out += `          - site: EarlyPrint\n`;
    out += `            url: ${earlyPrintUrl}\n`;
    if (urlList.length > 0) {
      out += `            section_urls:\n`;
      for (const { slug, pageId } of urlList) {
        out += `              - ${slug}: ${earlyPrintUrl}?page=${pageId}\n`;
      }
    }
    out += `  en:\n`;
    out += `    title: # FILL IN\n`;
    if (sectionsYaml) {
      out += `    sections:\n`;
      out += sectionsYaml;
    }
  }

  return out;
}

function generateSections(sections, indent, slugSeen, urlList, tcpId) {
  let out = "";
  const pad = " ".repeat(indent);

  for (const section of sections) {
    const slug = makeUniqueSlug(slugify(section.title), slugSeen);
    out += `${pad}- ${slug}: ${yamlQuote(section.title)}\n`;
    out += `${pad}  # loci:\n`;

    if (section.pageId) {
      urlList.push({ slug, pageId: section.pageId });
    }

    if (section.children.length > 0) {
      out += `${pad}  sections:\n`;
      out += generateSections(section.children, indent + 4, slugSeen, urlList, tcpId);
    }
  }

  return out;
}

function main() {
  const args = parseArgs(process.argv);

  if (args.xmlDir && !fs.existsSync(args.xmlDir)) {
    console.error(`XML directory not found: ${args.xmlDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`Manifest not found: ${MANIFEST_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
  const manifest = yaml.load(raw);
  if (!manifest || !Array.isArray(manifest)) {
    console.error("earlyprint.yaml is empty or not a list");
    process.exit(0);
  }

  let entries = manifest;
  if (args.id) {
    entries = entries.filter((e) => e.work_id === args.id);
    if (entries.length === 0) {
      console.error(`No entry with work_id "${args.id}" found in earlyprint.yaml`);
      process.exit(1);
    }
  }

  let imported = 0;
  let skipped = 0;

  for (const entry of entries) {
    const outPath = path.join(WORKS_DIR, `${entry.work_id}.yaml`);

    if (fs.existsSync(outPath) && !args.force) {
      console.log(`Skipping ${entry.work_id} — ${outPath} already exists (use --force to overwrite)`);
      skipped++;
      continue;
    }

    console.log(`Importing ${entry.work_id}...`);

    let xmlFile;
    if (args.xmlDir) {
      xmlFile = findXmlFile(args.xmlDir, entry.tcp_id);
      if (!xmlFile) {
        console.error(`  XML file not found for TCP ID ${entry.tcp_id} in ${args.xmlDir}`);
        continue;
      }
    } else {
      xmlFile = findCachedXml(entry.tcp_id);
      if (!xmlFile) {
        console.error(`  XML not found for ${entry.tcp_id}. Download from:`);
        console.error(`    https://texts.earlyprint.org/works/${entry.tcp_id}.xml`);
        console.error(`  Save as: _cache/earlyprint/${entry.tcp_id}.xml`);
        continue;
      }
    }

    const metadata = parseTeiXml(xmlFile, entry.tcp_id);
    console.log(`  Title: ${metadata.title || "(none)"}`);
    console.log(`  Year: ${metadata.year || "(none)"}`);
    console.log(`  Sections: ${metadata.sections.length}`);

    const yamlContent = generateYaml(entry, metadata);
    fs.writeFileSync(outPath, yamlContent, "utf8");
    console.log(`  Wrote ${outPath}`);
    imported++;
  }

  console.log(`\nDone: ${imported} imported, ${skipped} skipped`);
}

main();
