// Locinet client-side filtering and download logic

(function () {
  "use strict";

  // --- Loci filtering ---

  const filterInput = document.getElementById("loci-filter");
  if (!filterInput) return;

  // lociFlat is injected by the template as a global variable
  const flat = typeof lociFlat !== "undefined" ? lociFlat : {};

  function getMatchingSlugs(query) {
    if (!query) return null; // null means show everything
    const q = query.toLowerCase().trim();
    if (!q) return null;

    const matched = new Set();
    for (const slug in flat) {
      const name = flat[slug].name.toLowerCase();
      if (name.includes(q) || slug.includes(q)) {
        matched.add(slug);
        // Add all descendants
        for (const d of flat[slug].descendants || []) {
          matched.add(d);
        }
      }
    }
    return matched;
  }

  // --- Author page filtering ---

  function filterAuthorPage(matchingSlugs) {
    const works = document.querySelectorAll(".work");
    for (const work of works) {
      if (matchingSlugs === null) {
        work.classList.remove("filtered-hidden");
        work.querySelectorAll(".section-item").forEach((s) =>
          s.classList.remove("filtered-hidden")
        );
        continue;
      }

      let workLoci;
      try {
        workLoci = JSON.parse(work.dataset.loci || "[]");
      } catch (e) {
        workLoci = [];
      }

      // Check if any of the work's loci match
      const workMatches = workLoci.some((l) => matchingSlugs.has(l));
      if (!workMatches) {
        work.classList.add("filtered-hidden");
        continue;
      }

      // Work matches — show it, but filter sections
      work.classList.remove("filtered-hidden");
      const sections = work.querySelectorAll(".section-item");
      for (const section of sections) {
        let sectionLoci;
        try {
          sectionLoci = JSON.parse(section.dataset.loci || "[]");
        } catch (e) {
          sectionLoci = [];
        }

        if (sectionLoci.length === 0) {
          // Sections with no loci: hide when filtering
          section.classList.add("filtered-hidden");
        } else if (sectionLoci.some((l) => matchingSlugs.has(l))) {
          section.classList.remove("filtered-hidden");
        } else {
          section.classList.add("filtered-hidden");
        }
      }
    }
  }

  // --- Loci index page filtering ---

  function filterLociIndex(matchingSlugs) {
    const nodes = document.querySelectorAll(".loci-node");
    for (const node of nodes) {
      if (matchingSlugs === null) {
        node.classList.remove("filtered-hidden");
        continue;
      }
      const slug = node.dataset.slug;
      // Show this node if it matches, or if any descendant matches, or if any ancestor matches
      const entry = flat[slug];
      if (!entry) {
        node.classList.add("filtered-hidden");
        continue;
      }

      const selfMatches = matchingSlugs.has(slug);
      const descendantMatches = (entry.descendants || []).some((d) =>
        matchingSlugs.has(d)
      );
      const ancestorMatches = (entry.ancestors || []).some((a) =>
        matchingSlugs.has(a)
      );

      if (selfMatches || descendantMatches || ancestorMatches) {
        node.classList.remove("filtered-hidden");
      } else {
        node.classList.add("filtered-hidden");
      }
    }
  }

  // Determine which page we're on
  const isAuthorPage = document.querySelector("#works-list") !== null;
  const isLociIndex = document.querySelector("#loci-tree") !== null;

  function applyFilter() {
    const query = filterInput.value;
    const matchingSlugs = getMatchingSlugs(query);
    if (isAuthorPage) filterAuthorPage(matchingSlugs);
    if (isLociIndex) filterLociIndex(matchingSlugs);
  }

  filterInput.addEventListener("input", applyFilter);

  // Clear button
  const clearBtn = document.getElementById("clear-filter");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      filterInput.value = "";
      applyFilter();
      filterInput.focus();
    });
  }

  // Check URL params for pre-filled filter
  const params = new URLSearchParams(window.location.search);
  const locusParam = params.get("locus");
  if (locusParam) {
    filterInput.value = locusParam;
    applyFilter();
  }

  // --- Contribute download ---

  const contributeBtn = document.getElementById("contribute-btn");
  if (contributeBtn) {
    contributeBtn.addEventListener("click", function (e) {
      e.preventDefault();
      const name = this.dataset.authorName;
      const qid = this.dataset.authorQid;
      const repo =
        typeof repoUrl !== "undefined" ? repoUrl : "https://github.com/YOUR_USERNAME/locinet";

      const content = `# Contributing a new work for ${name}
#
# Instructions:
# 1. Fill in the fields below following the format shown.
# 2. Save this file as: ${slugify(name)}-SHORTTITLE.yaml
#    (Replace SHORTTITLE with a one-word identifier for the work)
# 3. Go to ${repo}/tree/main/works
# 4. Click "Add file" > "Upload files"
# 5. Upload your file and create a pull request.
# 6. A maintainer will review and merge your contribution.
#
# For the list of valid loci tags, see the Tagging Reference page.
# Fields marked REQUIRED must be filled in. All others are optional.
#
# For more complex examples (multiple translations, nested sections),
# see existing files in the works/ folder of the repository.

CHANGE-THIS-ID:
  author: ${qid}  # ${name} — do not change this
  # category: systematic  # Optional: systematic, monograph, sermons
  # loci: tag  # Optional: work-level loci tag
  la:  # Original language section (use la, fr, de, nl, etc.)
    title:  # REQUIRED: Title in original language
    orig_lang: true
    editions:
      - year:  # REQUIRED: Year of publication
        # place:  # Optional: City of publication
  en:
    title:  # REQUIRED: English title
    sections:  # Optional: List of sections/chapters
      - section-id: Section Title
        loci: tag  # Optional
    translations:  # At least one translation is recommended
      - translator:  # Name of translator
        # AI: true  # Set if AI-translated
        sites:
          - site:  # Name of the hosting website
            url:  # URL to the full text
            section_urls:  # Optional: URLs for each section
              - section-id: https://...
`;
      downloadFile(`contribute-${slugify(name)}.yaml`, content);
    });
  }

  // --- Edit download ---

  document.querySelectorAll(".edit-link").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      const workId = this.dataset.workId;
      const filename = this.dataset.yamlFilename;
      const repo =
        typeof repoUrl !== "undefined" ? repoUrl : "https://github.com/YOUR_USERNAME/locinet";

      // Fetch the actual YAML file
      fetch(`/works-raw/${filename}`)
        .then((r) => {
          if (r.ok) return r.text();
          throw new Error("Could not load file");
        })
        .then((yamlContent) => {
          const header = `# Editing: ${filename}
#
# Instructions:
# 1. Make your corrections to the YAML below.
# 2. Go to ${repo}/tree/main/works
# 3. Click on ${filename}
# 4. Click the pencil icon to edit, or upload your corrected file.
# 5. Create a pull request with your changes.
#
# For the list of valid loci tags, see the Tagging Reference page.
#
# ---
`;
          downloadFile(filename, header + yamlContent);
        })
        .catch(() => {
          // Fallback: just link to GitHub
          window.open(`${repo}/blob/main/works/${filename}`, "_blank");
        });
    });
  });

  // --- Helpers ---

  function slugify(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");
  }

  function downloadFile(filename, content) {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
})();
