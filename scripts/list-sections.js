#!/usr/bin/env node
// Lists sections of a work YAML file with their loci tags.
// Usage: node scripts/list-sections.js <work-file.yaml>

const fs = require("fs");
const yaml = require("js-yaml");

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run list-sections -- <work-file.yaml>");
  process.exit(1);
}

const raw = yaml.load(fs.readFileSync(file, "utf8"));
const workIds = Object.keys(raw);

const PAD_ID = 50;
const PAD_TITLE = 60;

function formatLoci(loci) {
  if (!loci) return "(no loci)";
  if (Array.isArray(loci)) return "[" + loci.join(", ") + "]";
  return String(loci);
}

function printRow(indent, id, title, loci) {
  const prefix = "  ".repeat(indent);
  const idCol = (prefix + id).padEnd(PAD_ID);
  const titleCol = (title || "").substring(0, PAD_TITLE).padEnd(PAD_TITLE);
  console.log(`${idCol}\t${titleCol}\t${formatLoci(loci)}`);
}

// Walk sections recursively
function walkSections(sections, depth) {
  if (!sections) return;
  for (const entry of sections) {
    // Each entry is a mapping with one section-id key (plus optional reserved keys)
    const reserved = new Set(["loci", "sections"]);
    let sectionId = null;
    let title = null;
    for (const key of Object.keys(entry)) {
      if (!reserved.has(key)) {
        sectionId = key;
        title = entry[key];
        break;
      }
    }
    if (!sectionId) continue;
    printRow(depth, sectionId, String(title), entry.loci);
    if (entry.sections) {
      walkSections(entry.sections, depth + 1);
    }
  }
}

for (const workId of workIds) {
  const work = raw[workId];
  // Print work-level loci
  printRow(0, "[work] " + workId, work.en?.title || work.la?.title || "", work.loci);

  // Walk all language blocks looking for sections
  for (const key of Object.keys(work)) {
    if (typeof work[key] === "object" && work[key] !== null && work[key].sections) {
      walkSections(work[key].sections, 1);
    }
  }
}
