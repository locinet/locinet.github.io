#!/usr/bin/env node
// Generate a YAML work skeleton from a PDF's table of contents.
// Usage: node scripts/import-work.js <pdf-url> [--author Q123] [--id work-id] [--depth N] [--lang la]

const fs = require("fs");
const { PDFParse } = require("pdf-parse");

function parseArgs(argv) {
  const args = { url: null, author: null, id: null, depth: Infinity, lang: "la" };
  let i = 2;
  // First positional arg is the URL/path
  if (argv[i] && !argv[i].startsWith("--")) {
    args.url = argv[i++];
  }
  while (i < argv.length) {
    if (argv[i] === "--author" && argv[i + 1]) {
      args.author = argv[++i];
    } else if (argv[i] === "--id" && argv[i + 1]) {
      args.id = argv[++i];
    } else if (argv[i] === "--depth" && argv[i + 1]) {
      args.depth = parseInt(argv[++i], 10);
    } else if (argv[i] === "--lang" && argv[i + 1]) {
      args.lang = argv[++i];
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

async function loadPdf(urlOrPath) {
  let dataBuffer;
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    console.error(`Downloading ${urlOrPath}...`);
    const res = await fetch(urlOrPath);
    if (!res.ok) {
      console.error(`Download failed: ${res.status} ${res.statusText}`);
      process.exit(1);
    }
    dataBuffer = new Uint8Array(await res.arrayBuffer());
    console.error(`Downloaded ${dataBuffer.length} bytes`);
  } else {
    if (!fs.existsSync(urlOrPath)) {
      console.error(`File not found: ${urlOrPath}`);
      process.exit(1);
    }
    dataBuffer = new Uint8Array(fs.readFileSync(urlOrPath));
  }
  return dataBuffer;
}

async function extractOutline(dataBuffer) {
  const parser = new PDFParse(dataBuffer);
  await parser.load();
  const info = await parser.getInfo();

  // Build obj-num → page-number map
  const objToPage = {};
  let doc = null;
  for (const key of Object.getOwnPropertyNames(parser)) {
    const val = parser[key];
    if (val && typeof val === "object" && typeof val.getPage === "function") {
      doc = val;
      break;
    }
  }
  if (doc) {
    for (let i = 1; i <= info.total; i++) {
      try {
        const page = await doc.getPage(i);
        if (page && page.ref) {
          objToPage[page.ref.num] = i;
        }
      } catch (e) {
        // skip
      }
    }
  }

  const hasPages = Object.keys(objToPage).length > 0;

  function getPage(dest) {
    if (!hasPages || !dest || !dest[0] || typeof dest[0] !== "object") return null;
    return objToPage[dest[0].num] || null;
  }

  function buildTree(items) {
    const result = [];
    for (const item of items) {
      const title = (item.title || "").trim();
      if (!title) continue;
      const page = getPage(item.dest);
      const children =
        item.items && item.items.length > 0 ? buildTree(item.items) : [];
      result.push({ title, page, children });
    }
    return result;
  }

  return info.outline ? buildTree(info.outline) : [];
}

function generateSections(nodes, pdfUrl, indent, depth, maxDepth, slugSeen, urlList) {
  if (depth > maxDepth) return "";

  let sections = "";
  const pad = " ".repeat(indent);

  for (const node of nodes) {
    const slug = makeUniqueSlug(slugify(node.title), slugSeen);
    sections += `${pad}- ${slug}: ${yamlQuote(node.title)}\n`;
    sections += `${pad}  # loci:\n`;

    if (node.page && pdfUrl) {
      urlList.push({ slug, page: node.page });
    }

    if (node.children.length > 0 && depth < maxDepth) {
      sections += `${pad}  sections:\n`;
      sections += generateSections(
        node.children, pdfUrl, indent + 4, depth + 1, maxDepth, slugSeen, urlList
      );
    }
  }

  return sections;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.url) {
    console.error(
      "Usage: npm run import-work -- <pdf-url> [--author Q123] [--id work-id] [--depth N] [--lang la]"
    );
    process.exit(1);
  }

  const dataBuffer = await loadPdf(args.url);
  const outline = await extractOutline(dataBuffer);

  if (outline.length === 0) {
    console.error("No outline/bookmarks found in this PDF.");
    process.exit(1);
  }
  console.error(`Found ${outline.length} top-level outline entries`);

  // Determine work ID
  const workId = args.id || "work-id";
  const pdfUrl = args.url.startsWith("http") ? args.url : null;

  const slugSeen = new Set();
  const urlList = [];
  const sections = generateSections(outline, pdfUrl, 6, 1, args.depth, slugSeen, urlList);

  // Build YAML
  let yaml = "";
  yaml += `${workId}:\n`;
  yaml += `  author: ${args.author || "Q000000  # FILL IN"}\n`;
  yaml += `  # loci:\n`;
  yaml += `  ${args.lang}:\n`;
  yaml += `    title: # FILL IN\n`;
  yaml += `    orig_lang: true\n`;
  yaml += `  en:\n`;
  yaml += `    title: # FILL IN\n`;
  yaml += `    sections:\n`;
  yaml += sections;
  yaml += `    translations:\n`;
  yaml += `      - translator: # FILL IN\n`;
  if (pdfUrl) {
    yaml += `        sites:\n`;
    yaml += `          - site: # FILL IN\n`;
    yaml += `            formats:\n`;
    yaml += `              - type: PDF\n`;
    yaml += `                url: ${pdfUrl}\n`;
    if (urlList.length > 0) {
      yaml += `            section_urls:\n`;
      for (const { slug, page } of urlList) {
        yaml += `              - ${slug}: ${pdfUrl}#page=${page}\n`;
      }
    }
  }

  process.stdout.write(yaml);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
