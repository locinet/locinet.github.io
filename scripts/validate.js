const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const WORKS_DIR = path.resolve(__dirname, "../works");
const LOCI_PATH = path.resolve(__dirname, "../loci.yaml");

function collectSlugs(nodes, set) {
  set = set || new Set();
  for (const node of nodes) {
    set.add(node.slug);
    if (node.children) collectSlugs(node.children, set);
  }
  return set;
}

function extractLoci(sections, found) {
  found = found || [];
  if (!sections) return found;
  for (const item of sections) {
    const keys = Object.keys(item);
    for (const k of keys) {
      if (k === "loci") {
        const val = item[k];
        const tags = Array.isArray(val) ? val : [val];
        found.push(...tags);
      }
      if (k === "sections") {
        extractLoci(item[k], found);
      }
    }
  }
  return found;
}

function main() {
  const lociTree = yaml.load(fs.readFileSync(LOCI_PATH, "utf8"));
  const validSlugs = collectSlugs(lociTree);

  let errors = 0;
  let warnings = 0;

  for (const file of fs.readdirSync(WORKS_DIR).sort()) {
    if (!file.endsWith(".yaml")) continue;

    let data;
    try {
      data = yaml.load(fs.readFileSync(path.join(WORKS_DIR, file), "utf8"));
    } catch (err) {
      console.error(`ERROR [${file}]: YAML parse error — ${err.message}`);
      errors++;
      continue;
    }

    for (const key of Object.keys(data)) {
    const work = data[key];

    if (!work.author) {
      console.error(`ERROR [${file}/${key}]: Missing author field`);
      errors++;
    } else if (Array.isArray(work.author)) {
      if (work.author.length === 0) {
        console.error(`ERROR [${file}/${key}]: author array is empty`);
        errors++;
      }
    }

    if (work.corporate_author && typeof work.corporate_author === "object") {
      if (!work.corporate_author.label) {
        console.error(`ERROR [${file}/${key}]: corporate_author object missing label field`);
        errors++;
      }
    }

    // Check work-level loci
    if (work.loci) {
      const tags = Array.isArray(work.loci) ? work.loci : [work.loci];
      for (const tag of tags) {
        if (!validSlugs.has(String(tag))) {
          console.warn(`WARN [${file}/${key}]: Unknown locus "${tag}" (work-level)`);
          warnings++;
        }
      }
    }

    // Check section-level loci
    const en = work.en;
    if (en && en.sections) {
      const tags = extractLoci(en.sections);
      for (const tag of tags) {
        if (!validSlugs.has(String(tag))) {
          console.warn(`WARN [${file}/${key}]: Unknown locus "${tag}"`);
          warnings++;
        }
      }
    }
    }
  }

  console.log(`\nValidation complete: ${errors} errors, ${warnings} warnings`);
  if (errors > 0) process.exit(1);
}

main();
