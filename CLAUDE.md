# Locinet

A directory of theological works hosted on the internet, built with 11ty and deployed to GitHub Pages.

## Commands

- `npm run serve` — local dev server (requires `export PATH="/c/Program Files/nodejs:$PATH"` in git bash)
- `npm run build` — build to `_site/`
- `npm run fetch` — fetch/cache author data from Wikidata
- `npm run validate` — check loci tags against loci.yaml

## Architecture

### Data flow
1. `works/*.yaml` — one file per theological work (source of truth for works)
2. `loci.yaml` — the loci topic tree (source of truth for tags)
3. `_cache/authors/Q*.json` — cached Wikidata author data (name, dates, image)
4. `src/_data/site.js` — reads all of the above, builds data structures for templates
5. 11ty generates static HTML from Nunjucks templates

### YAML work file schema
Each file has one top-level key (the work ID, e.g. `calvin-institutes`). Structure:
```yaml
work-id:
  author: Q12345              # Wikidata Q number (required)
  category: systematic         # Optional: systematic, monograph, sermons
  loci: tag                    # Optional: work-level loci (string or array)
  la:                          # Original language block (la, fr, de, nl, etc.)
    title: Latin Title
    orig_lang: true
    editions:
      - year: 1559
        place: Geneva          # Optional
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

**Critical YAML rules:**
- `sections` and `translations` are siblings of `title` under the language key, never children
- Reserved keys in section mappings: `loci`, `sections` — all other keys are treated as section-id: title
- Colons in YAML values need quoting: `"THE TENTH TOPIC: On the LAW of GOD"`
- Loci slugs: lowercase, hyphens for spaces, no apostrophes (e.g., `lords-supper`)

### Loci tree (loci.yaml)
- 8 top-level categories: Theology, God, Man, Law, Christ, Salvation, Church, Last things
- 104 total valid slugs
- Tree nodes: `{name, slug, children[]}`

### Pages
- `/` — Loci index (home page), shows tree with author links and tooltips
- `/authors/[slug]/` — Author pages, paginated from `site.authorPages`
- `/tagging-reference/` — ASCII tree with slugs for contributors
- Author page URLs use Wikidata English labels slugified (e.g., `/authors/john-calvin/`)

### Client-side JavaScript (`src/assets/filter.js`)
- Loci filtering: matches typed text against loci names/slugs, includes all descendants
- Author pages: hides non-matching works/sections, preserves work headers
- Loci index: shows matching nodes plus their ancestors/descendants
- URL param `?locus=slug` pre-fills the filter (used by loci index author links)
- Contribute button: generates downloadable YAML skeleton with author pre-filled
- Edit links: fetches raw YAML from `/works-raw/` and adds instructions header

### 11ty configuration (.eleventy.js)
- Input: `src/`, Output: `_site/`
- Passthrough: `src/assets` and `works` → `works-raw` (for edit downloads)
- Watch targets: `works/`, `loci.yaml`, `_cache/`
- Custom filter: `padEnd` for tagging reference formatting

### Deployment
- GitHub Actions (`.github/workflows/deploy.yml`) builds and deploys to GitHub Pages
- Build steps: npm ci → fetch wikidata → validate → eleventy build → deploy
- Wikidata results are cached in repo so builds don't fail if Wikidata is down

## Known issues / TODOs

