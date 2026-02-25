#!/usr/bin/env node
// Import works from a CSV file into individual YAML files.
// Usage: node scripts/import-csv.js <csv-file> [--dry-run]
//
// CSV columns: orig_lang, lang, id, QID, en title, url, site, translator, ai, loci
// Generates one YAML file per row in works/<id>.yaml

const fs = require("fs");
const path = require("path");

const WORKS_DIR = path.join(__dirname, "../works");

function parseArgs(argv) {
  const args = { file: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--dry-run") {
      args.dryRun = true;
    } else if (!args.file) {
      args.file = argv[i];
    }
  }
  return args;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = parseRow(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseRow(line);
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (values[i] || "").trim(); });
    return row;
  });
}

// Simple CSV row parser that handles quoted fields
function parseRow(line) {
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field
      let val = "";
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          val += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          val += line[i++];
        }
      }
      fields.push(val);
      if (line[i] === ",") i++;
    } else {
      const end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      } else {
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
  }
  return fields;
}

function parseLoci(lociStr) {
  if (!lociStr) return null;
  const items = lociStr.split(",").map(s => s.trim().toLowerCase().replace(/\s+/g, "-"));
  return items.length === 1 ? items[0] : items;
}

function buildYaml(row) {
  const id = row["id"].toLowerCase();
  const qid = row["QID"];
  const origLang = row["orig_lang"] || "la";
  const transLang = row["lang"] || "en";
  const enTitle = row["en title"];
  const url = row["url"];
  const site = row["site"];
  const translator = row["translator"];
  const isAI = row["ai"].toUpperCase() === "TRUE";
  const loci = parseLoci(row["loci"]);

  const today = new Date().toISOString().slice(0, 10);

  // Build YAML manually to control ordering and style
  const lines = [];
  lines.push(`${id}:`);
  lines.push(`  date_added: ${today}`);
  lines.push(`  author: ${qid}`);

  if (loci) {
    if (Array.isArray(loci)) {
      lines.push(`  loci:`);
      loci.forEach(l => lines.push(`    - ${l}`));
    } else {
      lines.push(`  loci: ${loci}`);
    }
  }

  // Original language block (no title known from CSV, leave placeholder)
  lines.push(`  ${origLang}:`);
  lines.push(`    title: # FILL IN`);
  lines.push(`    orig_lang: true`);

  // Translation block
  lines.push(`  ${transLang}:`);
  lines.push(`    title: ${enTitle}`);
  lines.push(`    translations:`);
  lines.push(`      - translator: ${translator}`);
  if (isAI) lines.push(`        AI: true`);
  lines.push(`        sites:`);
  lines.push(`          - site: ${site}`);
  lines.push(`            formats:`);
  lines.push(`              - type: PDF`);
  lines.push(`                url: ${url}`);
  lines.push("");

  return { id, yaml: lines.join("\n") };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error("Usage: node scripts/import-csv.js <csv-file> [--dry-run]");
    process.exit(1);
  }

  const text = fs.readFileSync(args.file, "utf8");
  const rows = parseCsv(text);

  for (const row of rows) {
    const { id, yaml } = buildYaml(row);
    const outPath = path.join(WORKS_DIR, `${id}.yaml`);

    if (args.dryRun) {
      console.log(`=== ${outPath} ===`);
      console.log(yaml);
    } else {
      if (fs.existsSync(outPath)) {
        console.warn(`SKIP (exists): ${outPath}`);
      } else {
        fs.writeFileSync(outPath, yaml, "utf8");
        console.log(`WROTE: ${outPath}`);
      }
    }
  }
}

main();
