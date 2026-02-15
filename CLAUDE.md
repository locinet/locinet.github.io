# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Locinet

A directory of theological works hosted on the internet, built with 11ty and deployed to GitHub Pages.

## Commands

- `npm run serve` — local dev server (requires `export PATH="/c/Program Files/nodejs:$PATH"` in git bash)
- `npm run build` — build to `_site/`
- `npm run fetch` — fetch/cache author data from Wikidata
- `npm run validate` — check loci tags against loci.yaml (exits non-zero on errors, warnings are non-fatal)
- `npm run pdf-toc -- <path-or-url>` — extract PDF outline/TOC with page numbers (add `-- --json` for JSON output; accepts local paths or URLs)
- `npm run wikidata-search -- "person name"` — search Wikidata for person entities, shows QID, name, dates, description
- `npm run oclc-search -- "author" "title"` — search Open Library for OCLC numbers, prints WorldCat link
- `npm run import-work -- <pdf-url> [--author Q123] [--id work-id] [--depth N] [--lang la]` — generate YAML skeleton from PDF outline
- `npm run import-ccel -- [--id work-id] [--force]` — import works from CCEL ThML/XML (reads `ccel.yaml` manifest)

## Architecture

### Data flow
1. `works/*.yaml` — one file per theological work (source of truth for works)
2. `loci.yaml` — the loci topic tree (source of truth for tags)
3. `traditions.yaml` — tradition definitions and author-to-tradition mapping
4. `_cache/authors/Q*.json` — cached Wikidata author data (name, dates, image, labels)
5. `src/_data/site.js` — reads all of the above, builds data structures for templates
6. 11ty generates static HTML from Nunjucks templates

### YAML work file schema
Each file has one top-level key (the work ID, e.g. `calvin-institutes`). Structure:
```yaml
work-id:
  author: Q12345              # Wikidata Q number (required), or array: [Q12345, Q67890]
  corporate_author: "Name"    # Optional: string label, or {label: "Name", qid: Q999}
  category: systematic         # Optional: systematic, monograph, sermons
  loci: tag                    # Optional: work-level loci (string or array)
  la:                          # Original language block (la, fr, de, nl, etc.)
    title: Latin Title
    orig_lang: true
    editions:
      - year: 1559
        place: Geneva          # Optional
        oclc: 123456789        # Optional: OCLC number (shows WorldCat link on works page)
        sites:                 # Optional: links to original
          - site: BSB
            url: https://...
  en:                          # English block
    title: English Title
    sections:                  # Optional (MUST be sibling of title, NOT child)
      - section-id: Section Title
        loci: tag              # Optional (string or array)
        sections:              # Optional: nested sub-sections
          - sub-id: Sub Title
    translations:              # Optional (MUST be sibling of title, NOT child)
      - translator: Name
        year: 1845             # Optional
        AI: true               # Optional
        sites:
          - site: Site Name
            url: https://...   # String, or {volumes: {1: url, 2: url}}
            pdf: true          # Optional
            section_urls:      # Optional
              - section-id: https://...
```

**Work granularity rules:**
- Each YAML file represents one distinct work. Do not combine multiple works into a single file.
- Collections of complete works (Opera Omnia, Opera Theologica Omnia, etc.) should be broken into their separate constituent works, each getting its own YAML file.
- Collections of select disputations/dissertations (e.g. Selectarum Disputationum Theologicarum) should likewise be broken into separate works — one file per disputation.
- Anthologies or excerpts from multiple authors should be broken into the individual works they are drawn from, with each excerpt tracked as a section of its parent work.

**Critical YAML rules:**
- `sections` and `translations` are siblings of `title` under the language key, never children
- Reserved keys in section mappings: `loci`, `sections` — all other keys are treated as section-id: title
- Colons in YAML values need quoting: `"THE TENTH TOPIC: On the LAW of GOD"`
- Loci slugs: lowercase, hyphens for spaces, no apostrophes (e.g., `lords-supper`)
- Section titles should be in title case (e.g., `Section I. On the Name` not `SECTION I. ON THE NAME`)
- Section titles should include their numbering from the source (e.g., `Q1. The Nature and Extent of Sacred Doctrine`, `Chapter 1. Of God`)
- Don't repeat a locus on a section if the same locus is already on the work or a parent section
- Use the most specific applicable locus; fall back to a broader parent when no child fits (e.g., `divine-infinity` for "The Infinity of God", but `attributes-of-god` for "The Existence of God in Things")

### Loci tree (loci.yaml)
- 8 top-level categories: Theology, God, Angels, Man, Law, Christ, Salvation, Church, Last things
- Tree nodes: `{name, slug, children[]}`
- `lociFlat` (built by site.js) maps each slug to `{name, slug, ancestors[], descendants[]}`

### Traditions (traditions.yaml)
- `traditions[]`: list of `{name, slug}` — defines available tradition filters
- `authors`: maps Wikidata QIDs to tradition slugs (e.g., `Q37577: reformed`)
- Used on the home page "By Author" view to filter authors by tradition
- Authors without a mapping show for all traditions (only hidden when a specific tradition is selected)

### Pages
- `/` — Loci index (home page), shows tree with author links and tooltips
- `/works/` — Works index, authors sorted by first published work year, with author name filter
- `/authors/[slug]/` — Author pages, paginated from `site.authorPages`
- `/tagging-reference/` — ASCII tree with slugs for contributors
- Author page URLs use Wikidata English labels slugified (e.g., `/authors/john-calvin/`)

### Client-side JavaScript (`src/assets/filter.js`)
- Loci filtering: matches typed text against loci names/slugs, includes all descendants
- Author pages: hides non-matching works/sections, preserves work headers
- Loci index: shows matching nodes plus their ancestors/descendants
- Works index: filters author entries by name and tradition (multi-select dropdown)
- URL param `?locus=slug` pre-fills the filter (used by loci index author links)
- Contribute button: generates YAML skeleton and opens GitHub new-file editor
- Edit links: open GitHub file editor for the work's YAML file
- Add author: Wikidata search for people (P31=Q5), shows results with dates/descriptions

### 11ty configuration (.eleventy.js)
- Input: `src/`, Output: `_site/`
- Passthrough: `src/assets`
- Watch targets: `works/`, `loci.yaml`, `traditions.yaml`, `_cache/`
- `pathPrefix`: reads from `PATH_PREFIX` env var (set to `/locinet/` in GitHub Actions deploy)
- Custom filter: `padEnd` for tagging reference formatting

### Deployment
- GitHub Actions (`.github/workflows/deploy.yml`) builds and deploys to GitHub Pages
- Build steps: npm ci → fetch wikidata → validate → eleventy build (with `PATH_PREFIX=/locinet/`) → deploy
- Wikidata results are cached in repo so builds don't fail if Wikidata is down

### Key data structures in site.js
- `authorPages[]`: one entry per author with `{qid, name, slug, birthYear, deathYear, tradition, works[], authorLabels[]}`, sorted by birth year
- `worksIndex[]`: same data as authorPages but sorted by earliest work year
- `lociIndex[slug][qid]`: maps each locus to authors who discuss it, with `{displayName, entries[]}` for the home page tree
- `computeDisplayNames()`: disambiguates authors sharing a family name (adds initial, then birth year if still ambiguous)

### Creating a work YAML from a PDF

**Quick method (recommended for online PDFs):**
1. Run `npm run import-work -- <pdf-url> --author Q123 --id work-id` to generate a YAML skeleton
2. Fill in `# FILL IN` placeholders (titles, translator, site name)
3. Uncomment and fill in `# loci:` tags using slugs from `loci.yaml`
4. Run `npm run validate` then `npm run build` to verify

**Manual method:**
1. Run `npm run pdf-toc -- <path-or-url>` to extract the outline with page numbers
2. Use the outline to build the `sections:` tree in the YAML (section IDs must be globally unique)
3. Tag sections with loci slugs from `loci.yaml` based on chapter titles
4. For PDFs hosted online, add `section_urls` under the translation site using `URL#page=N` fragments
5. Run `npm run validate` then `npm run build` to verify

## Known issues / TODOs
