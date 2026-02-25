#!/usr/bin/env node
// scripts/convert-site-urls.js
// Migrates YAML work files:
//   url: <string>             → formats: [{type: HTML, url: ...}]
//   url: <string> + pdf: true → formats: [{type: PDF, url: ...}]
//   url: {volumes: {...}}     → volumes: {...}  (hoisted one level up)
//   pdf: true (no url)        → removed
// Existing formats: entries are preserved; new entry is prepended.

const fs = require("fs");
const path = require("path");

const WORKS_DIR = path.join(__dirname, "..", "works");

function transformContent(content) {
  const lines = content.split("\n");
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect a "- site:" sequence item at any indentation
    const siteMatch = line.match(/^(\s*)- site:/);
    if (!siteMatch) {
      result.push(line);
      i++;
      continue;
    }

    const siteStartIndent = siteMatch[1].length; // indent of the "-"
    const childIndent = siteStartIndent + 2; // keys like url:, formats: are here

    // Collect the site block: all following lines with indent > siteStartIndent,
    // stopping at blank lines (url/pdf/formats always precede section_urls/text).
    const siteBlockLines = [line];
    i++;

    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === "") break; // stop at blank lines
      const lIndent = l.match(/^(\s*)/)[1].length;
      if (lIndent <= siteStartIndent) break; // stop when indent drops
      siteBlockLines.push(l);
      i++;
    }

    // Transform and emit the site block
    const transformed = transformSiteBlock(siteBlockLines, childIndent);
    result.push(...transformed);
  }

  return result.join("\n");
}

function transformSiteBlock(lines, childIndent) {
  const childIndentStr = " ".repeat(childIndent);
  const fmtItemStr = childIndentStr + "  "; // format list items (- type:)
  const fmtChildStr = fmtItemStr + "  "; // format item keys (type:, url:)

  let urlLineIdx = -1;
  let urlValue = null; // string URL value, or null (volumes / empty)
  let isVolumeUrl = false;
  let pdfLineIdx = -1;
  let formatsStartIdx = -1;
  let formatsEndIdx = -1;
  let volumesBlockStart = -1;
  let volumesBlockEnd = -1;

  // Scan block for key lines at childIndent level
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const lineIndent = line.length - trimmed.length;

    if (lineIndent !== childIndent) continue;

    if (trimmed.startsWith("url:")) {
      urlLineIdx = i;
      const rest = trimmed.slice(4).trim();
      urlValue = rest || null; // null if nothing after "url:"
    } else if (trimmed === "pdf: true") {
      pdfLineIdx = i;
    } else if (trimmed.startsWith("formats:")) {
      formatsStartIdx = i;
      formatsEndIdx = i;
      for (let j = i + 1; j < lines.length; j++) {
        const fl = lines[j];
        if (fl.trim() === "") break;
        const fi = fl.length - fl.trimStart().length;
        if (fi <= childIndent) break;
        formatsEndIdx = j;
      }
    }
  }

  // No URL found — only remove pdf: true if stray
  if (urlLineIdx === -1) {
    if (pdfLineIdx !== -1) {
      return lines.filter((_, i) => i !== pdfLineIdx);
    }
    return lines;
  }

  // Check if url is a volumes object (urlValue === null means no inline value)
  if (urlValue === null) {
    // Look ahead for "volumes:" as next non-blank child
    for (let j = urlLineIdx + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === "") break;
      const li = l.length - l.trimStart().length;
      if (li === childIndent + 2 && l.trimStart().startsWith("volumes:")) {
        isVolumeUrl = true;
        volumesBlockStart = j;
        volumesBlockEnd = j;
        for (let k = j + 1; k < lines.length; k++) {
          const kl = lines[k];
          if (kl.trim() === "") break;
          const ki = kl.length - kl.trimStart().length;
          if (ki <= childIndent + 2) break;
          volumesBlockEnd = k;
        }
      }
      break; // only check the first non-blank line after url:
    }
  }

  // Case: volumes URL — hoist volumes to childIndent, remove url: wrapper and pdf: true
  if (isVolumeUrl) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (i === urlLineIdx) continue; // drop "url:" line
      if (i === pdfLineIdx) continue; // drop "pdf: true"
      if (i >= volumesBlockStart && i <= volumesBlockEnd) {
        // Reduce indentation by 2 (hoist from childIndent+2/+4 to childIndent/+2)
        out.push(lines[i].slice(2));
      } else {
        out.push(lines[i]);
      }
    }
    return out;
  }

  // Case: string URL — convert to format entry (HTML or PDF)
  const formatType = pdfLineIdx !== -1 ? "PDF" : "HTML";
  const newFormatLines = [
    `${fmtItemStr}- type: ${formatType}`,
    `${fmtChildStr}url: ${urlValue}`,
  ];

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === urlLineIdx) {
      if (formatsStartIdx === -1) {
        // No existing formats block — emit new one here
        out.push(`${childIndentStr}formats:`);
        out.push(...newFormatLines);
      }
      // else: formats block exists, we'll prepend there
    } else if (i === pdfLineIdx) {
      // Drop pdf: true
    } else if (i === formatsStartIdx) {
      // Emit "formats:" header, then prepend our new entry before existing ones
      out.push(lines[i]);
      out.push(...newFormatLines);
    } else {
      out.push(lines[i]);
    }
  }
  return out;
}

// Process all files
const files = fs.readdirSync(WORKS_DIR).filter((f) => f.endsWith(".yaml"));
let changed = 0;
for (const file of files) {
  const fullPath = path.join(WORKS_DIR, file);
  const content = fs.readFileSync(fullPath, "utf8");
  const transformed = transformContent(content);
  if (transformed !== content) {
    fs.writeFileSync(fullPath, transformed, "utf8");
    changed++;
    console.log(`Updated: ${file}`);
  }
}
console.log(`\nDone. Updated ${changed}/${files.length} files.`);
