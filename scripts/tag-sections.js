#!/usr/bin/env node
// Tags sections in a work YAML file with loci.
// Reads mappings from stdin (one per line): section-id: locus
// Usage: echo "section-id: locus" | npm run tag -- <work-file.yaml>
//    or: npm run tag -- <work-file.yaml> < mappings.txt

const fs = require("fs");
const path = require("path");

const file = process.argv[2];
if (!file) {
  console.error("Usage: echo 'section-id: locus' | npm run tag -- <work-file.yaml>");
  process.exit(1);
}

const filePath = path.resolve(file);
const input = fs.readFileSync(0, "utf8"); // read stdin
const lines = fs.readFileSync(filePath, "utf8").split("\n");

// Parse mappings from stdin
const mappings = [];
for (const line of input.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx === -1) continue;
  const sectionId = trimmed.substring(0, colonIdx).trim();
  const value = trimmed.substring(colonIdx + 1).trim();
  if (!sectionId || !value) continue;
  mappings.push({ sectionId, value });
}

if (mappings.length === 0) {
  console.error("No mappings provided on stdin.");
  process.exit(1);
}

let changed = 0;
let notFound = 0;

for (const { sectionId, value } of mappings) {
  let found = false;

  if (sectionId === "_work") {
    // Work-level loci: find the `# loci:` or `loci:` line near the top
    // (before any language block's sections)
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const match = lines[i].match(/^(\s*)# loci:(.*)$/);
      if (match) {
        lines[i] = `${match[1]}loci: ${value}`;
        console.log(`  _work: ${value} (uncommented)`);
        found = true;
        changed++;
        break;
      }
      const existingMatch = lines[i].match(/^(\s*)loci:(.*)$/);
      if (existingMatch && i < 15) {
        lines[i] = `${existingMatch[1]}loci: ${value}`;
        console.log(`  _work: ${value} (updated)`);
        found = true;
        changed++;
        break;
      }
    }
    if (!found) {
      console.error(`  _work: NOT FOUND (no loci line in first 20 lines)`);
      notFound++;
    }
    continue;
  }

  // Find the section line: `- {section-id}: ...` or `- {section-id}:`
  // We need to match lines like:
  //   - section-id: Title Text
  //   - section-id: "Quoted Title"
  const escaped = sectionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionPattern = new RegExp(`^(\\s*)- ${escaped}:`);

  for (let i = 0; i < lines.length; i++) {
    if (!sectionPattern.test(lines[i])) continue;
    // Skip section_urls entries (value is a URL, not a title)
    const afterColon = lines[i].substring(lines[i].indexOf(sectionId + ":") + sectionId.length + 1).trim();
    if (afterColon.startsWith("http")) continue;
    found = true;
    const indent = lines[i].match(/^(\s*)/)[1];
    const lociIndent = indent + "  "; // 2 more spaces than the `- ` line

    // Check the next line for # loci: or loci:
    const nextLine = lines[i + 1] || "";
    const commentMatch = nextLine.match(/^(\s*)# loci:(.*)$/);
    const existingMatch = nextLine.match(/^(\s*)loci:(.*)$/);

    if (commentMatch) {
      lines[i + 1] = `${lociIndent}loci: ${value}`;
      console.log(`  ${sectionId}: ${value} (uncommented)`);
      changed++;
    } else if (existingMatch) {
      lines[i + 1] = `${lociIndent}loci: ${value}`;
      console.log(`  ${sectionId}: ${value} (updated)`);
      changed++;
    } else {
      // No loci line exists — insert one after the section line
      lines.splice(i + 1, 0, `${lociIndent}loci: ${value}`);
      console.log(`  ${sectionId}: ${value} (inserted)`);
      changed++;
    }
    break;
  }

  if (!found) {
    console.error(`  ${sectionId}: NOT FOUND`);
    notFound++;
  }
}

fs.writeFileSync(filePath, lines.join("\n"));
console.log(`\nDone: ${changed} updated, ${notFound} not found.`);

if (notFound > 0) process.exit(1);
