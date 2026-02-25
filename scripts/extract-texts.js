#!/usr/bin/env node
// Usage: node scripts/extract-texts.js <work-yaml-file>
// Extracts all text: | blocks from YAML sections into _texts/{workId}/{sectionId}.html,
// then strips text: fields from the YAML and rewrites it.

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const workFile = process.argv[2];
if (!workFile) {
  console.error("Usage: node scripts/extract-texts.js <work-yaml-file>");
  process.exit(1);
}

const TEXTS_DIR = path.resolve(__dirname, "../_texts");
const RESERVED = new Set(["loci", "sections", "text"]);

const raw = fs.readFileSync(workFile, "utf8");
const data = yaml.load(raw);
const workId = Object.keys(data)[0];
const outDir = path.join(TEXTS_DIR, workId);

let extracted = 0;

function stripTexts(sections) {
  if (!Array.isArray(sections)) return;
  for (const item of sections) {
    if (!item || typeof item !== "object") continue;
    let sectionId = null;
    for (const k of Object.keys(item)) {
      if (!RESERVED.has(k)) { sectionId = k; break; }
    }
    if (sectionId && typeof item.text === "string") {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, `${sectionId}.html`), item.text, "utf8");
      delete item.text;
      extracted++;
    }
    if (item.sections) stripTexts(item.sections);
  }
}

const work = data[workId];
for (const langCode of Object.keys(work)) {
  const langData = work[langCode];
  if (langData && typeof langData === "object" && langData.sections) {
    stripTexts(langData.sections);
  }
}

if (extracted === 0) {
  console.log("No text blocks found, YAML unchanged.");
  process.exit(0);
}

console.log(`Extracted ${extracted} text blocks to ${outDir}/`);

const newYaml = yaml.dump(data, { lineWidth: 120, noRefs: true });
fs.writeFileSync(workFile, newYaml, "utf8");
console.log(`Rewrote ${workFile}`);
