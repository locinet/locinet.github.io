#!/usr/bin/env node
// Import bilingual (Latin/English) EPUB(s) into a Locinet YAML work file.
//
// ── Single-EPUB mode ──────────────────────────────────────────────────────────
//   npm run import-epub -- <epub-path> --author Q123 --id work-id [options]
//
//   Chapters become top-level sections.
//
// ── Manifest mode ─────────────────────────────────────────────────────────────
//   npm run import-epub -- --manifest <manifest.yaml> [--force] [--inspect]
//
//   Multiple EPUBs → single YAML with books as top-level sections, chapters
//   as sub-sections within each book. The manifest YAML format:
//
//     id: polanus-syntagma
//     author: Q454349
//     category: systematic
//     title: Syntagma of Christian Theology
//     la_title: Syntagma Theologiae Christianae
//     year: 1609
//     place: Basel
//     # url: https://...
//     lang_detect: alternate          # global default for all volumes
//     volumes:
//       - vol: 1
//         epub: ./polanus-v1.epub     # path relative to the manifest file
//         title: "Book I. Holy Scripture"
//         la_title: "Liber I. De Sacra Scriptura"
//         skip_chapters: 2            # skip front matter
//         # lang_detect: class        # per-volume override
//         # la_class: latin
//         # en_class: english
//       - vol: 2
//         epub: ./polanus-v2.epub
//         title: "Book II. God"
//         la_title: "Liber II. De Deo"
//
// ── Shared options ────────────────────────────────────────────────────────────
//   --force               Overwrite existing YAML file
//   --inspect             Print EPUB structure; don't write YAML
//   --no-headings         Treat each spine item as one flat section (old behaviour).
//                         By default the script splits each file on <h1>–<h6> headings
//                         so that internal sections become separate YAML sections.
//   --orig-lang la|en     Original language of the work (default: la).
//                         Use "en" for English-only EPUBs: generates en.orig_lang
//                         and en.editions rather than a la: block.
//   --no-la               Omit Latin inline text
//   --no-en               Omit English inline text
//   --lang-detect mode    How to assign paragraphs to languages:
//                           "alternate"  — p[0]=La, p[1]=En, p[2]=La, … (default)
//                           "en"         — all paragraphs → English (monolingual EPUB)
//                           "la"         — all paragraphs → Latin  (monolingual EPUB)
//                           "class"      — CSS class on <p> (see --la-class/--en-class)
//                           "lang"       — xml:lang attribute on <p>
//                           "half"       — first half=La, second half=En
//   --la-class cls        CSS class marking Latin paragraphs (with --lang-detect class)
//   --en-class cls        CSS class marking English paragraphs (with --lang-detect class)
//   --skip-chapters N     Skip the first N spine items (front matter)
//   --category cat        Work category (systematic, monograph, etc.)
//
// ── English-only EPUB example ─────────────────────────────────────────────────
//   npm run import-epub -- book.epub --author Q123 --id my-work \
//     --orig-lang en --lang-detect en --no-la \
//     --title "My English Work" --year 1700
//
// ── Output structure (manifest mode) ─────────────────────────────────────────
//   work-id:
//     la:
//       editions:
//         - sections:                 # flat list of all chapters across all books
//             - v1-ch-title: "Latin text..."
//     en:
//       sections:                     # hierarchical: books → chapters
//         - v1: Book I Title
//           sections:
//             - v1-ch-title: Chapter Title
//       translations:
//         - sites:
//             - text:                 # flat list matching la.editions.sections
//                 - v1-ch-title: "English text..."

"use strict";

const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { DOMParser } = require("@xmldom/xmldom");
const yaml = require("js-yaml");

const WORKS_DIR = path.resolve(__dirname, "../works");

// ─── CLI parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    epub: null,
    manifest: null,
    author: null,
    id: null,
    vol: null,
    title: null,
    laTitle: null,
    year: null,
    place: null,
    url: null,
    force: false,
    inspect: false,
    origLang: "la",
    langDetect: "alternate",
    laClass: null,
    enClass: null,
    skipChapters: 0,
    noLa: false,
    noEn: false,
    noHeadings: false,
    category: null,
  };

  let i = 2;
  if (argv[i] && !argv[i].startsWith("--")) {
    args.epub = argv[i++];
  }
  while (i < argv.length) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === "--manifest" && next)       { args.manifest = next; i += 2; }
    else if (flag === "--orig-lang" && next) { args.origLang = next; i += 2; }
    else if (flag === "--author" && next)    { args.author = next; i += 2; }
    else if (flag === "--id" && next)        { args.id = next; i += 2; }
    else if (flag === "--vol" && next)       { args.vol = next; i += 2; }
    else if (flag === "--title" && next)     { args.title = next; i += 2; }
    else if (flag === "--la-title" && next)  { args.laTitle = next; i += 2; }
    else if (flag === "--year" && next)      { args.year = parseInt(next, 10); i += 2; }
    else if (flag === "--place" && next)     { args.place = next; i += 2; }
    else if (flag === "--url" && next)       { args.url = next; i += 2; }
    else if (flag === "--force")             { args.force = true; i++; }
    else if (flag === "--inspect")           { args.inspect = true; i++; }
    else if (flag === "--lang-detect" && next) { args.langDetect = next; i += 2; }
    else if (flag === "--la-class" && next)  { args.laClass = next; i += 2; }
    else if (flag === "--en-class" && next)  { args.enClass = next; i += 2; }
    else if (flag === "--skip-chapters" && next) { args.skipChapters = parseInt(next, 10); i += 2; }
    else if (flag === "--no-la")             { args.noLa = true; i++; }
    else if (flag === "--no-en")             { args.noEn = true; i++; }
    else if (flag === "--no-headings")       { args.noHeadings = true; i++; }
    else if (flag === "--category" && next)  { args.category = next; i += 2; }
    else { i++; }
  }
  return args;
}

// ─── YAML helpers ─────────────────────────────────────────────────────────────

function yamlQuote(val) {
  if (val === null || val === undefined) return '""';
  const s = String(val);
  if (/[:#'"{}[\],&*?|>!%@`\n]/.test(s) || s.trim() !== s) {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
  }
  return s || '""';
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
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

// ─── XML / DOM helpers ────────────────────────────────────────────────────────

function makeDomParser() {
  return new DOMParser({
    errorHandler: {
      warning: () => {},
      error: () => {},
      fatalError: (e) => { throw e; },
    },
  });
}

function getTextContent(el) {
  if (!el) return "";
  let text = "";
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === 3) {
      text += child.nodeValue;
    } else if (child.nodeType === 1) {
      text += getTextContent(child);
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

function getElementsByTagNames(el, ...tags) {
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  const results = [];
  function walk(node) {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeType === 1) {
        const tag = (child.localName || child.tagName || "").toLowerCase();
        if (tagSet.has(tag)) results.push(child);
        walk(child);
      }
    }
  }
  walk(el);
  return results;
}

// ─── EPUB reading ─────────────────────────────────────────────────────────────

function readEpub(epubPath) {
  if (!fs.existsSync(epubPath)) {
    console.error(`File not found: ${epubPath}`);
    process.exit(1);
  }
  return new AdmZip(epubPath);
}

function getEntryText(zip, entryName) {
  const entry = zip.getEntry(entryName);
  if (!entry) return null;
  return zip.readAsText(entry, "utf8");
}

function findOpfPath(zip) {
  const containerXml = getEntryText(zip, "META-INF/container.xml");
  if (!containerXml) {
    console.error("No META-INF/container.xml found in EPUB");
    process.exit(1);
  }
  const doc = makeDomParser().parseFromString(containerXml, "text/xml");
  const rootfiles = doc.getElementsByTagName("rootfile");
  if (!rootfiles || rootfiles.length === 0) {
    console.error("No rootfile element in container.xml");
    process.exit(1);
  }
  return rootfiles[0].getAttribute("full-path");
}

function parseOpf(zip, opfPath) {
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const opfXml = getEntryText(zip, opfPath);
  if (!opfXml) {
    console.error(`Could not read OPF file: ${opfPath}`);
    process.exit(1);
  }

  const doc = makeDomParser().parseFromString(opfXml, "text/xml");

  const manifest = {};
  const manifestItems = doc.getElementsByTagName("item");
  for (let i = 0; i < manifestItems.length; i++) {
    const item = manifestItems[i];
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const mediaType = item.getAttribute("media-type") || "";
    if (id && href) {
      manifest[id] = { href: opfDir + href, mediaType };
    }
  }

  const spineItems = doc.getElementsByTagName("itemref");
  const spine = [];
  for (let i = 0; i < spineItems.length; i++) {
    const idref = spineItems[i].getAttribute("idref");
    if (idref && manifest[idref]) {
      spine.push(manifest[idref].href);
    }
  }

  let tocPath = null;
  for (const [, item] of Object.entries(manifest)) {
    if (item.mediaType === "application/x-dtbncx+xml") {
      tocPath = item.href;
      break;
    }
  }
  if (!tocPath) {
    for (const [, item] of Object.entries(manifest)) {
      if (item.href.endsWith("nav.xhtml") || item.href.endsWith("nav.html")) {
        tocPath = item.href;
        break;
      }
    }
  }

  const dcTitles = doc.getElementsByTagName("dc:title");
  const title = dcTitles.length > 0 ? getTextContent(dcTitles[0]) : null;

  return { spine, manifest, tocPath, title, opfDir };
}

function parseTocNcx(zip, ncxPath) {
  if (!ncxPath) return {};
  const ncxXml = getEntryText(zip, ncxPath);
  if (!ncxXml) return {};

  const doc = makeDomParser().parseFromString(ncxXml, "text/xml");
  const navPoints = doc.getElementsByTagName("navPoint");
  const titles = {};

  for (let i = 0; i < navPoints.length; i++) {
    const np = navPoints[i];
    const labelEls = np.getElementsByTagName("navLabel");
    const contentEls = np.getElementsByTagName("content");
    if (labelEls.length === 0 || contentEls.length === 0) continue;
    const label = getTextContent(labelEls[0]).trim();
    const src = contentEls[0].getAttribute("src") || "";
    const href = src.replace(/#.*$/, "");
    const baseName = href.replace(/^.*\//, "");
    // First match per file wins — later anchors in the same file are sub-sections
    if (label && baseName && !titles[baseName]) {
      titles[baseName] = label;
    }
  }

  return titles;
}

function parseTocNav(zip, navPath) {
  if (!navPath) return {};
  const navXml = getEntryText(zip, navPath);
  if (!navXml) return {};

  const doc = makeDomParser().parseFromString(navXml, "text/html");
  const titles = {};

  const anchors = getElementsByTagNames(doc.documentElement, "a");
  for (const a of anchors) {
    const href = (a.getAttribute("href") || "").replace(/#.*$/, "");
    const baseName = href.replace(/^.*\//, "");
    const label = getTextContent(a).trim();
    if (label && baseName && !titles[baseName]) {
      titles[baseName] = label;
    }
  }

  return titles;
}

// ─── Paragraph extraction ─────────────────────────────────────────────────────

function extractParagraphs(zip, href) {
  const xml = getEntryText(zip, href);
  if (!xml) return [];

  const doc = makeDomParser().parseFromString(xml, "text/html");
  const body = doc.getElementsByTagName("body");
  if (!body || body.length === 0) return [];

  const pEls = getElementsByTagNames(body[0], "p");
  const paragraphs = [];

  for (const p of pEls) {
    // Skip paragraphs that are purely navigation links (TOC entries)
    let linkOnly = true;
    for (let j = 0; j < p.childNodes.length; j++) {
      const c = p.childNodes[j];
      if (c.nodeType === 3 && c.nodeValue.trim()) { linkOnly = false; break; }
      if (c.nodeType === 1 && (c.localName || c.tagName || "").toLowerCase() !== "a") { linkOnly = false; break; }
    }
    if (linkOnly && p.childNodes.length > 0) continue;

    const text = getTextContent(p).trim();
    if (!text) continue;
    const cls = (p.getAttribute("class") || "").toLowerCase();
    const lang = p.getAttribute("lang") || p.getAttribute("xml:lang") || "";
    paragraphs.push({ text, classes: cls, lang });
  }

  return paragraphs;
}

// Extract heading-delimited sections from an XHTML file.
// Returns [{ title, depth, paragraphs: [string] }].
// Paragraphs that consist only of <a> links (TOC entries) are skipped.
// Sections whose title is "table of contents" or similar are skipped.
function extractHeadingSections(zip, href) {
  const xml = getEntryText(zip, href);
  if (!xml) return [];

  const doc = makeDomParser().parseFromString(xml, "text/html");
  const body = doc.getElementsByTagName("body");
  if (!body || body.length === 0) return [];

  const SKIP_TITLES = new Set(["table of contents", "contents", "index", "indices"]);

  function isLinkOnly(el) {
    for (let i = 0; i < el.childNodes.length; i++) {
      const c = el.childNodes[i];
      if (c.nodeType === 3 && c.nodeValue.trim()) return false;
      if (c.nodeType === 1) {
        const t = (c.localName || c.tagName || "").toLowerCase();
        if (t !== "a") return false;
      }
    }
    return true;
  }

  const sections = [];
  let current = null; // null = before first real heading or inside a skipped section

  function walk(node) {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeType !== 1) continue;
      const tag = (child.localName || child.tagName || "").toLowerCase();

      if (/^h[1-6]$/.test(tag)) {
        const title = getTextContent(child).trim();
        if (!title || SKIP_TITLES.has(title.toLowerCase())) {
          current = null; // absorb following paragraphs (e.g. TOC links)
        } else {
          current = { title, depth: parseInt(tag[1], 10), paragraphs: [] };
          sections.push(current);
        }
      } else if (tag === "p") {
        if (!current) continue;
        if (isLinkOnly(child)) continue; // skip TOC link paragraphs
        const text = getTextContent(child).trim();
        if (text) current.paragraphs.push(text);
      } else if (tag === "div" || tag === "section" || tag === "article" || tag === "blockquote") {
        walk(child);
      }
    }
  }

  walk(body[0]);
  return sections;
}

function detectLangClasses(paragraphs) {
  const classFreq = {};
  for (const p of paragraphs) {
    if (p.classes) {
      for (const cls of p.classes.split(/\s+/)) {
        if (cls) classFreq[cls] = (classFreq[cls] || 0) + 1;
      }
    }
  }
  return classFreq;
}

// Split paragraphs into {la, en} pairs.
// volOpts: { langDetect, laClass, enClass } — per-volume options
function splitParagraphs(paragraphs, volOpts) {
  const mode = volOpts.langDetect || "alternate";

  if (mode === "en") {
    // All paragraphs are English (monolingual English EPUB)
    return paragraphs.map((p) => ({ la: null, en: p.text }));

  } else if (mode === "la") {
    // All paragraphs are Latin (monolingual Latin EPUB)
    return paragraphs.map((p) => ({ la: p.text, en: null }));

  } else if (mode === "class") {
    const laClass = volOpts.laClass || "la";
    const enClass = volOpts.enClass || "en";
    const laPars = paragraphs.filter((p) => p.classes.includes(laClass));
    const enPars = paragraphs.filter((p) => p.classes.includes(enClass));
    const count = Math.max(laPars.length, enPars.length);
    return Array.from({ length: count }, (_, i) => ({
      la: laPars[i] ? laPars[i].text : null,
      en: enPars[i] ? enPars[i].text : null,
    }));

  } else if (mode === "lang") {
    const laPars = paragraphs.filter((p) => p.lang && p.lang.startsWith("la"));
    const enPars = paragraphs.filter((p) => p.lang && (p.lang.startsWith("en") || !p.lang));
    const count = Math.max(laPars.length, enPars.length);
    return Array.from({ length: count }, (_, i) => ({
      la: laPars[i] ? laPars[i].text : null,
      en: enPars[i] ? enPars[i].text : null,
    }));

  } else if (mode === "half") {
    const mid = Math.ceil(paragraphs.length / 2);
    const laPars = paragraphs.slice(0, mid);
    const enPars = paragraphs.slice(mid);
    const count = Math.max(laPars.length, enPars.length);
    return Array.from({ length: count }, (_, i) => ({
      la: laPars[i] ? laPars[i].text : null,
      en: enPars[i] ? enPars[i].text : null,
    }));

  } else {
    // "alternate": p[0]=Latin, p[1]=English, p[2]=Latin, …
    const pairs = [];
    for (let i = 0; i < paragraphs.length; i += 2) {
      pairs.push({
        la: paragraphs[i] ? paragraphs[i].text : null,
        en: paragraphs[i + 1] ? paragraphs[i + 1].text : null,
      });
    }
    return pairs;
  }
}

function joinParagraphs(texts) {
  return texts.filter(Boolean).join("\n\n");
}

// ─── Process one EPUB into a list of chapter objects ──────────────────────────
//
// Returns: [{ slug, title, laText, enText }, ...]
// slugSeen is a shared Set across all volumes to guarantee global uniqueness.

function processEpub(epubPath, volOpts, slugSeen, inspectMode) {
  console.error(`\nReading EPUB: ${epubPath}`);
  const zip = readEpub(epubPath);

  const opfPath = findOpfPath(zip);
  const { spine, tocPath } = parseOpf(zip, opfPath);
  console.error(`  Spine: ${spine.length} items, TOC: ${tocPath || "(none)"}`);

  let tocTitles = {};
  if (tocPath) {
    tocTitles = tocPath.endsWith(".ncx")
      ? parseTocNcx(zip, tocPath)
      : parseTocNav(zip, tocPath);
  }

  if (inspectMode) {
    return { zip, spine, tocTitles };
  }

  const skip = volOpts.skipChapters || 0;
  const noHeadings = volOpts.noHeadings || false;
  const chapters = [];

  for (let i = skip; i < spine.length; i++) {
    const href = spine[i];
    const baseName = href.replace(/^.*\//, "");
    const fileTitle = tocTitles[baseName] || `Chapter ${i - skip + 1}`;
    const volPrefix = volOpts.volPrefix || "";

    if (!noHeadings) {
      // ── Heading-based extraction ──
      const headingSections = extractHeadingSections(zip, href);

      if (headingSections.length === 0) {
        console.error(`  [${i}] ${baseName} — no headings/paragraphs, skipping`);
        continue;
      }

      for (const sec of headingSections) {
        const slug = makeUniqueSlug(`${volPrefix}${slugify(sec.title)}`, slugSeen);

        if (sec.paragraphs.length === 0) {
          // Structural heading with no body text (e.g. a Part header whose
          // content is entirely in sub-headings). Include in sections for
          // tagging purposes; omit from text: since there is nothing to show.
          console.error(`  [${i}] ${slug} (h${sec.depth}): structural heading, no body text`);
          chapters.push({ slug, title: sec.title, laText: "", enText: "" });
          continue;
        }

        const rawParagraphs = sec.paragraphs.map((t) => ({ text: t, classes: "", lang: "" }));
        const pairs = splitParagraphs(rawParagraphs, volOpts);
        const laTexts = pairs.map((p) => p.la).filter(Boolean);
        const enTexts = pairs.map((p) => p.en).filter(Boolean);

        console.error(`  [${i}] ${slug} (h${sec.depth}): ${sec.paragraphs.length} paragraphs`);

        chapters.push({
          slug,
          title: sec.title,
          laText: joinParagraphs(laTexts),
          enText: joinParagraphs(enTexts),
        });
      }

    } else {
      // ── Flat extraction (--no-headings) ──
      const paragraphs = extractParagraphs(zip, href);
      if (paragraphs.length === 0) {
        console.error(`  [${i}] ${baseName} — empty, skipping`);
        continue;
      }

      const pairs = splitParagraphs(paragraphs, volOpts);
      const laTexts = pairs.map((p) => p.la).filter(Boolean);
      const enTexts = pairs.map((p) => p.en).filter(Boolean);

      const slug = makeUniqueSlug(`${volPrefix}${slugify(fileTitle)}`, slugSeen);
      console.error(`  [${i}] ${slug}: ${laTexts.length} La / ${enTexts.length} En paragraphs`);

      chapters.push({
        slug,
        title: fileTitle,
        laText: joinParagraphs(laTexts),
        enText: joinParagraphs(enTexts),
      });
    }
  }

  return chapters;
}

// ─── YAML generation: single-EPUB mode ───────────────────────────────────────
//
// Chapters become flat top-level sections (original behaviour).
// origLang controls which language block gets orig_lang: true and the edition
// metadata. Use "en" for English-only works; "la" (default) for Latin originals.

function generateSingleYaml(args, chapters) {
  const today = new Date().toISOString().slice(0, 10);
  const origLang = args.origLang || "la";
  const enIsOrig = origLang === "en";

  let out = "";
  out += `${args.id}:\n`;
  out += `  author: ${args.author}\n`;
  out += `  date_added: ${today}\n`;
  if (args.category) out += `  category: ${args.category}\n`;
  out += `  # loci:\n`;

  if (enIsOrig) {
    // ── English original ──
    out += `  en:\n`;
    out += `    title: ${yamlQuote(args.title || "# FILL IN")}\n`;
    out += `    orig_lang: true\n`;
    out += `    editions:\n`;
    out += `      - year: ${args.year || "# FILL IN"}\n`;
    if (args.place) out += `        place: ${yamlQuote(args.place)}\n`;
    out += `        # oclc:\n`;
    if (args.url) out += `        sites:\n          - site: Monergism\n            formats:\n              - type: HTML\n                url: ${args.url}\n`;
    out += `    sections:\n`;
    for (const ch of chapters) {
      out += `      - ${ch.slug}: ${yamlQuote(ch.title)}\n`;
      out += `        # loci:\n`;
    }
    if (!args.noEn && chapters.some((c) => c.enText)) {
      out += `    translations:\n`;
      out += `      - AI: false\n`;
      out += `        sites:\n`;
      out += `          - site: Monergism\n`;
      out += args.url ? `            formats:\n              - type: HTML\n                url: ${args.url}\n` : ``;
      out += `            text:\n`;
      for (const ch of chapters) {
        if (!ch.enText) continue;
        out += `              - ${ch.slug}: ${yamlQuote(ch.enText)}\n`;
      }
    }

  } else {
    // ── Latin original (default) ──
    out += `  la:\n`;
    out += `    title: ${yamlQuote(args.laTitle || "# FILL IN")}\n`;
    out += `    orig_lang: true\n`;
    out += `    editions:\n`;
    out += `      - year: ${args.year || "# FILL IN"}\n`;
    if (args.place) out += `        place: ${yamlQuote(args.place)}\n`;
    out += `        # oclc:\n`;
    if (!args.noLa && chapters.some((c) => c.laText)) {
      out += `        sections:\n`;
      for (const ch of chapters) {
        if (!ch.laText) continue;
        out += `          - ${ch.slug}: ${yamlQuote(ch.laText)}\n`;
      }
    }

    out += `  en:\n`;
    out += `    title: ${yamlQuote(args.title || "# FILL IN")}\n`;
    out += `    sections:\n`;
    for (const ch of chapters) {
      out += `      - ${ch.slug}: ${yamlQuote(ch.title)}\n`;
      out += `        # loci:\n`;
    }
    out += `    translations:\n`;
    out += `      - AI: true\n`;
    out += `        sites:\n`;
    out += `          - site: Monergism\n`;
    out += args.url ? `            url: ${args.url}\n` : `            # url:\n`;
    if (!args.noEn && chapters.some((c) => c.enText)) {
      out += `            text:\n`;
      for (const ch of chapters) {
        if (!ch.enText) continue;
        out += `              - ${ch.slug}: ${yamlQuote(ch.enText)}\n`;
      }
    }
  }

  return out;
}

// ─── YAML generation: manifest mode ──────────────────────────────────────────
//
// Books (volumes) become top-level sections; chapters are sub-sections.
// Latin text and English text are flat lists keyed by chapter slug.
// origLang: "la" (default) or "en" — determines which block gets orig_lang: true.

function generateManifestYaml(manifest, books, noLa, noEn) {
  const today = new Date().toISOString().slice(0, 10);
  const origLang = manifest.orig_lang || "la";
  const enIsOrig = origLang === "en";

  let out = "";
  out += `${manifest.id}:\n`;
  out += `  author: ${manifest.author}\n`;
  out += `  date_added: ${today}\n`;
  if (manifest.category) out += `  category: ${manifest.category}\n`;
  out += `  # loci:\n`;

  // ── Hierarchical section list (shared between both layout variants) ──
  function writeSections(indent) {
    const pad = " ".repeat(indent);
    for (const book of books) {
      out += `${pad}- ${book.slug}: ${yamlQuote(book.title)}\n`;
      out += `${pad}  # loci:\n`;
      if (book.chapters.length > 0) {
        out += `${pad}  sections:\n`;
        for (const ch of book.chapters) {
          out += `${pad}    - ${ch.slug}: ${yamlQuote(ch.title)}\n`;
          out += `${pad}      # loci:\n`;
        }
      }
    }
  }

  if (enIsOrig) {
    // ── English original ──
    out += `  en:\n`;
    out += `    title: ${yamlQuote(manifest.title || "# FILL IN")}\n`;
    out += `    orig_lang: true\n`;
    out += `    editions:\n`;
    out += `      - year: ${manifest.year || "# FILL IN"}\n`;
    if (manifest.place) out += `        place: ${yamlQuote(manifest.place)}\n`;
    out += `        # oclc:\n`;
    if (manifest.url) out += `        sites:\n          - site: Monergism\n            formats:\n              - type: HTML\n                url: ${manifest.url}\n`;
    out += `    sections:\n`;
    writeSections(6);
    if (!noEn) {
      const hasEn = books.some((b) => b.chapters.some((c) => c.enText));
      if (hasEn) {
        out += `    translations:\n`;
        out += `      - AI: false\n`;
        out += `        sites:\n`;
        out += `          - site: Monergism\n`;
        out += manifest.url ? `            formats:\n              - type: HTML\n                url: ${manifest.url}\n` : ``;
        out += `            text:\n`;
        for (const book of books) {
          for (const ch of book.chapters) {
            if (!ch.enText) continue;
            out += `              - ${ch.slug}: ${yamlQuote(ch.enText)}\n`;
          }
        }
      }
    }

  } else {
    // ── Latin original (default) ──
    out += `  la:\n`;
    out += `    title: ${yamlQuote(manifest.la_title || "# FILL IN")}\n`;
    out += `    orig_lang: true\n`;
    out += `    editions:\n`;
    out += `      - year: ${manifest.year || "# FILL IN"}\n`;
    if (manifest.place) out += `        place: ${yamlQuote(manifest.place)}\n`;
    out += `        # oclc:\n`;
    if (!noLa) {
      const hasLa = books.some((b) => b.chapters.some((c) => c.laText));
      if (hasLa) {
        out += `        sections:\n`;
        for (const book of books) {
          for (const ch of book.chapters) {
            if (!ch.laText) continue;
            out += `          - ${ch.slug}: ${yamlQuote(ch.laText)}\n`;
          }
        }
      }
    }

    out += `  en:\n`;
    out += `    title: ${yamlQuote(manifest.title || "# FILL IN")}\n`;
    out += `    sections:\n`;
    writeSections(6);
    out += `    translations:\n`;
    out += `      - AI: true\n`;
    out += `        sites:\n`;
    out += `          - site: Monergism\n`;
    out += manifest.url ? `            url: ${manifest.url}\n` : `            # url:\n`;
    if (!noEn) {
      const hasEn = books.some((b) => b.chapters.some((c) => c.enText));
      if (hasEn) {
        out += `            text:\n`;
        for (const book of books) {
          for (const ch of book.chapters) {
            if (!ch.enText) continue;
            out += `              - ${ch.slug}: ${yamlQuote(ch.enText)}\n`;
          }
        }
      }
    }
  }

  return out;
}

// ─── Inspect mode ─────────────────────────────────────────────────────────────

function printInspect(zip, spine, tocTitles, skipChapters) {
  console.log(`  Spine: ${spine.length} items`);
  for (let i = 0; i < spine.length; i++) {
    const href = spine[i];
    const baseName = href.replace(/^.*\//, "");
    const title = tocTitles[baseName] || "(no title)";
    const tag = i < skipChapters ? " [SKIP]" : "";

    const paragraphs = extractParagraphs(zip, href);
    const headingSections = extractHeadingSections(zip, href);
    const classFreq = detectLangClasses(paragraphs);
    const topClasses = Object.entries(classFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cls, n]) => `${cls}(${n})`)
      .join(", ");

    console.log(`  [${i}]${tag} ${baseName} — "${title}" — ${paragraphs.length} paragraphs, ${headingSections.length} heading sections`);
    if (topClasses) console.log(`       classes: ${topClasses}`);
    if (paragraphs[0]) console.log(`       p[0]: "${paragraphs[0].text.slice(0, 100)}"`);
    if (paragraphs[1]) console.log(`       p[1]: "${paragraphs[1].text.slice(0, 100)}"`);
    for (const sec of headingSections) {
      console.log(`       h${sec.depth} "${sec.title}" — ${sec.paragraphs.length} paragraphs`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  // ── Manifest mode ──
  if (args.manifest) {
    const manifestPath = path.resolve(args.manifest);
    if (!fs.existsSync(manifestPath)) {
      console.error(`Manifest not found: ${manifestPath}`);
      process.exit(1);
    }
    const manifest = yaml.load(fs.readFileSync(manifestPath, "utf8"));
    const manifestDir = path.dirname(manifestPath);

    if (!manifest.id || !manifest.author) {
      console.error("Manifest must have 'id' and 'author' fields");
      process.exit(1);
    }
    if (!manifest.volumes || !Array.isArray(manifest.volumes) || manifest.volumes.length === 0) {
      console.error("Manifest must have a 'volumes' list");
      process.exit(1);
    }

    const outPath = path.join(WORKS_DIR, `${manifest.id}.yaml`);
    if (fs.existsSync(outPath) && !args.force && !args.inspect) {
      console.error(`Output file already exists: ${outPath}`);
      console.error("Use --force to overwrite.");
      process.exit(1);
    }

    if (args.inspect) {
      for (const vol of manifest.volumes) {
        const epubPath = path.resolve(manifestDir, vol.epub);
        console.log(`\n=== Volume ${vol.vol}: ${vol.title || vol.la_title || vol.epub} ===`);
        const { zip, spine, tocTitles } = processEpub(epubPath, {}, null, true);
        printInspect(zip, spine, tocTitles, vol.skip_chapters || 0);
      }
      return;
    }

    // Global slug namespace shared across all volumes
    const slugSeen = new Set();
    const books = [];

    for (const vol of manifest.volumes) {
      const epubPath = path.resolve(manifestDir, vol.epub);
      const volNum = vol.vol || books.length + 1;

      // Build per-volume options, falling back to manifest-level defaults
      const volOpts = {
        langDetect: vol.lang_detect || manifest.lang_detect || args.langDetect,
        laClass: vol.la_class || manifest.la_class || args.laClass,
        enClass: vol.en_class || manifest.en_class || args.enClass,
        skipChapters: vol.skip_chapters || 0,
        noHeadings: vol.no_headings || manifest.no_headings || args.noHeadings || false,
        volPrefix: `v${volNum}-`,
      };

      const chapters = processEpub(epubPath, volOpts, slugSeen, false);

      // Book-level slug: v1, v2, …
      const bookSlug = `v${volNum}`;
      slugSeen.add(bookSlug);

      books.push({
        slug: bookSlug,
        title: vol.title || `Book ${volNum}`,
        laTitle: vol.la_title || null,
        chapters,
      });
    }

    // CLI --orig-lang overrides manifest-level orig_lang
    if (args.origLang && args.origLang !== "la") manifest.orig_lang = args.origLang;

    console.error(`\nGenerating YAML: ${books.length} books, ${books.reduce((n, b) => n + b.chapters.length, 0)} chapters...`);
    const yamlContent = generateManifestYaml(manifest, books, args.noLa, args.noEn);
    fs.writeFileSync(outPath, yamlContent, "utf8");
    console.error(`Wrote ${outPath}`);

    console.log(`\nNext steps:`);
    console.log(`  1. Fill in # FILL IN placeholders (titles, year, place)`);
    console.log(`  2. npm run validate`);
    console.log(`  3. npm run list-sections -- works/${manifest.id}.yaml`);
    console.log(`  4. npm run tag -- works/${manifest.id}.yaml < mappings.txt`);
    console.log(`  5. npm run build`);
    return;
  }

  // ── Single-EPUB mode ──
  if (!args.epub) {
    console.error("Usage:");
    console.error("  npm run import-epub -- <epub-path> --author Q123 --id work-id [options]");
    console.error("  npm run import-epub -- --manifest <manifest.yaml> [--force] [--inspect]");
    console.error("");
    console.error("Options: --inspect, --orig-lang la|en, --lang-detect alternate|en|la|class|lang|half,");
    console.error("         --skip-chapters N, --no-headings, --vol N, --no-la, --no-en, --force");
    process.exit(1);
  }

  if (!args.inspect && (!args.author || !args.id)) {
    console.error("Error: --author and --id are required (or use --inspect)");
    process.exit(1);
  }

  if (args.inspect) {
    const zip = readEpub(args.epub);
    const opfPath = findOpfPath(zip);
    const { spine, tocPath } = parseOpf(zip, opfPath);
    let tocTitles = {};
    if (tocPath) {
      tocTitles = tocPath.endsWith(".ncx")
        ? parseTocNcx(zip, tocPath)
        : parseTocNav(zip, tocPath);
    }
    console.log(`\n=== ${path.basename(args.epub)} ===`);
    printInspect(zip, spine, tocTitles, args.skipChapters);
    return;
  }

  const outPath = path.join(WORKS_DIR, `${args.id}.yaml`);
  if (fs.existsSync(outPath) && !args.force) {
    console.error(`Output file already exists: ${outPath}`);
    console.error("Use --force to overwrite.");
    process.exit(1);
  }

  const slugSeen = new Set();
  const volOpts = {
    langDetect: args.langDetect,
    laClass: args.laClass,
    enClass: args.enClass,
    skipChapters: args.skipChapters,
    noHeadings: args.noHeadings,
    volPrefix: args.vol ? `v${args.vol}-` : "",
  };
  const chapters = processEpub(args.epub, volOpts, slugSeen, false);

  console.error(`\nGenerating YAML for ${chapters.length} chapters...`);
  const yamlContent = generateSingleYaml(args, chapters);
  fs.writeFileSync(outPath, yamlContent, "utf8");
  console.error(`Wrote ${outPath}`);

  console.log(`\nNext steps:`);
  console.log(`  1. Fill in # FILL IN placeholders`);
  console.log(`  2. npm run validate`);
  console.log(`  3. npm run list-sections -- works/${args.id}.yaml`);
  console.log(`  4. npm run tag -- works/${args.id}.yaml < mappings.txt`);
  console.log(`  5. npm run build`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
