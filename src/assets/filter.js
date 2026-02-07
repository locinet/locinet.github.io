// Locinet client-side filtering and download logic

(function () {
  "use strict";

  // --- Loci filtering ---

  const filterInput = document.getElementById("loci-filter");

  if (filterInput) {
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
  }

  // --- Works index author filtering ---

  const authorFilterInput = document.getElementById("author-filter");
  const isWorksIndex = document.querySelector("#works-index") !== null;
  if (authorFilterInput && isWorksIndex) {
    function applyAuthorFilter() {
      const query = authorFilterInput.value.toLowerCase().trim();
      const authors = document.querySelectorAll(".works-index-author");
      for (const author of authors) {
        if (!query || author.dataset.authorName.includes(query)) {
          author.classList.remove("filtered-hidden");
        } else {
          author.classList.add("filtered-hidden");
        }
      }
    }

    authorFilterInput.addEventListener("input", applyAuthorFilter);

    const clearAuthorBtn = document.getElementById("clear-author-filter");
    if (clearAuthorBtn) {
      clearAuthorBtn.addEventListener("click", function () {
        authorFilterInput.value = "";
        applyAuthorFilter();
        authorFilterInput.focus();
      });
    }
  }

  // --- Add a work (multi-step panel) ---

  const contributeBtn = document.getElementById("contribute-btn");
  const addWorkPanel = document.getElementById("add-work-panel");

  if (contributeBtn && addWorkPanel) {
    var workData = { origTitle: "", year: "", place: "", enTitle: "", workId: "" };
    var currentStep = 1;

    contributeBtn.addEventListener("click", function (e) {
      e.preventDefault();
      var open = addWorkPanel.style.display !== "none";
      addWorkPanel.style.display = open ? "none" : "";
      if (!open) {
        currentStep = 1;
        workData = { origTitle: "", year: "", place: "", enTitle: "", workId: "" };
        renderStep();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && addWorkPanel.style.display !== "none") {
        addWorkPanel.style.display = "none";
      }
    });

    document.addEventListener("click", function (e) {
      if (
        addWorkPanel.style.display !== "none" &&
        !addWorkPanel.contains(e.target) &&
        e.target !== contributeBtn
      ) {
        addWorkPanel.style.display = "none";
      }
    });

    function renderStep() {
      if (currentStep === 1) renderStep1();
      else if (currentStep === 2) renderStep2();
    }

    // Step 1: Original edition — search-as-you-type via Open Library
    var olSearchTimer = null;
    var olAbortController = null;

    function renderStep1() {
      addWorkPanel.innerHTML =
        '<h3>Step 1: Original edition</h3>' +
        '<div class="panel-field-group"><label for="orig-title-input">Original title</label>' +
        '<input type="text" id="orig-title-input" value="' + escapeAttr(workData.origTitle) + '"></div>' +
        '<div class="panel-field-group"><label for="orig-year-input">Year</label>' +
        '<input type="text" id="orig-year-input" value="' + escapeAttr(workData.year) + '" placeholder="e.g. 1559"></div>' +
        '<div class="panel-status" id="ol-status"></div>' +
        '<ul class="ol-search-results" id="ol-results"></ul>' +
        '<div class="panel-field-group" id="place-group" style="display:none;">' +
          '<label for="orig-place-input">Place of publication</label>' +
          '<input type="text" id="orig-place-input" value="' + escapeAttr(workData.place) + '"></div>' +
        '<div class="panel-buttons">' +
          '<button type="button" class="panel-btn" id="skip-step1-btn">Skip</button>' +
          '<button type="button" class="panel-btn panel-btn-primary" id="next-step1-btn">Next</button>' +
        '</div>';

      var titleInput = document.getElementById("orig-title-input");
      var yearInput = document.getElementById("orig-year-input");
      var statusEl = document.getElementById("ol-status");
      var resultsEl = document.getElementById("ol-results");
      var placeGroup = document.getElementById("place-group");

      // Get the author's English name for Open Library queries
      var olAuthorName = contributeBtn.dataset.authorName || "";

      function doSearch() {
        var title = titleInput.value.trim();
        if (title.length < 3) {
          resultsEl.innerHTML = "";
          statusEl.textContent = title.length > 0 ? "Type at least 3 characters..." : "";
          return;
        }

        if (olAbortController) olAbortController.abort();
        olAbortController = new AbortController();
        var signal = olAbortController.signal;

        statusEl.textContent = "Searching...";
        resultsEl.innerHTML = "";

        var params = "title=" + encodeURIComponent(title);
        if (olAuthorName) params += "&author=" + encodeURIComponent(olAuthorName);
        var year = yearInput.value.trim();
        if (year) params += "&first_publish_year=" + encodeURIComponent(year);
        params += "&limit=6&fields=title,first_publish_year,publish_place,key";

        fetch("https://openlibrary.org/search.json?" + params, { signal: signal })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            var docs = data.docs || [];
            if (docs.length === 0) {
              statusEl.textContent = "No results found.";
              return;
            }
            statusEl.textContent = "Select a result:";
            resultsEl.innerHTML = "";
            docs.forEach(function (doc) {
              var li = document.createElement("li");
              var place = doc.publish_place ? doc.publish_place[0] : "";
              var yr = doc.first_publish_year || "";
              li.innerHTML =
                '<span class="ol-result-title">' + escapeHtml(doc.title || "") + '</span>' +
                (yr ? ' <span class="ol-result-year">(' + escapeHtml(String(yr)) + ')</span>' : "") +
                (place ? '<br><span class="ol-result-place">' + escapeHtml(place) + '</span>' : "");
              li.addEventListener("click", function (e) {
                e.stopPropagation();
                titleInput.value = doc.title || titleInput.value;
                yearInput.value = yr || yearInput.value;
                if (place) {
                  document.getElementById("orig-place-input").value = place;
                  placeGroup.style.display = "";
                }
                resultsEl.innerHTML = "";
                statusEl.textContent = "Selected. Edit if needed, then click Next.";
              });
              resultsEl.appendChild(li);
            });
          })
          .catch(function (err) {
            if (err.name === "AbortError") return;
            statusEl.textContent = "Search failed.";
          });
      }

      function scheduleSearch() {
        clearTimeout(olSearchTimer);
        olSearchTimer = setTimeout(doSearch, 400);
      }

      titleInput.addEventListener("input", scheduleSearch);
      yearInput.addEventListener("input", scheduleSearch);

      document.getElementById("skip-step1-btn").addEventListener("click", function (e) {
        e.stopPropagation();
        workData.origTitle = "";
        workData.year = "";
        workData.place = "";
        currentStep = 2;
        renderStep();
      });

      document.getElementById("next-step1-btn").addEventListener("click", function (e) {
        e.stopPropagation();
        workData.origTitle = titleInput.value.trim();
        workData.year = yearInput.value.trim();
        workData.place = document.getElementById("orig-place-input").value.trim();
        currentStep = 2;
        renderStep();
      });

      titleInput.focus();

      // Trigger search if returning to step 1 with existing data
      if (workData.origTitle) scheduleSearch();
    }

    // Step 2: English title + work ID → generate & open GitHub
    function renderStep2() {
      addWorkPanel.innerHTML =
        '<h3>Step 2: Work details</h3>' +
        '<div class="panel-field-group"><label for="en-title-input">English title (required)</label>' +
        '<input type="text" id="en-title-input" value="' + escapeAttr(workData.enTitle) + '"></div>' +
        '<div class="panel-field-group"><label for="work-id-input">Work ID (slug)</label>' +
        '<input type="text" id="work-id-input" value="' + escapeAttr(workData.workId) + '" placeholder="auto-generated from title"></div>' +
        '<div class="panel-buttons">' +
          '<button type="button" class="panel-btn" id="back-step2-btn">Back</button>' +
          '<button type="button" class="panel-btn panel-btn-primary" id="generate-btn">Open in GitHub</button>' +
        '</div>';

      var enTitleInput = document.getElementById("en-title-input");
      var workIdInput = document.getElementById("work-id-input");

      enTitleInput.addEventListener("input", function () {
        if (!workIdInput.dataset.edited) {
          workIdInput.value = slugify(enTitleInput.value);
        }
      });

      workIdInput.addEventListener("input", function () {
        workIdInput.dataset.edited = "true";
      });

      document.getElementById("back-step2-btn").addEventListener("click", function (e) {
        e.stopPropagation();
        workData.enTitle = enTitleInput.value.trim();
        workData.workId = workIdInput.value.trim();
        currentStep = 1;
        renderStep();
      });

      document.getElementById("generate-btn").addEventListener("click", function (e) {
        e.stopPropagation();
        var enTitle = enTitleInput.value.trim();
        if (!enTitle) { enTitleInput.style.borderColor = "red"; enTitleInput.focus(); return; }
        var wid = workIdInput.value.trim() || slugify(enTitle);
        generateAndOpen(wid, enTitle);
      });

      enTitleInput.focus();
    }

    function generateAndOpen(wid, enTitle) {
      var name = contributeBtn.dataset.authorName;
      var qid = contributeBtn.dataset.authorQid;
      var repo = typeof repoUrl !== "undefined" ? repoUrl : "https://github.com/locinet/locinet";

      var origTitle = workData.origTitle;
      var year = workData.year;
      var place = workData.place;

      // Build original-language block
      var origBlock;
      if (origTitle || year || place) {
        origBlock =
          "  la:  # Original language (use la, fr, de, nl, etc.)\n" +
          "    title: " + yamlQuote(origTitle || "") + "\n" +
          "    orig_lang: true\n" +
          "    editions:\n" +
          "      - year: " + (year || "") + "\n" +
          (place ? "        place: " + yamlQuote(place) + "\n" : "");
      } else {
        origBlock =
          "  la:  # Original language (use la, fr, de, nl, etc.)\n" +
          "    title:  # REQUIRED\n" +
          "    orig_lang: true\n" +
          "    editions:\n" +
          "      - year:  # REQUIRED\n" +
          "        # place:  # Optional\n";
      }

      var skeleton =
        "# New work for " + name + "\n" +
        '# Fill in the fields below, then click "Commit changes" and open a pull request.\n' +
        "# For valid loci tags, see the Tagging Reference page on the site.\n" +
        "# For more examples, see other files in the works/ folder.\n\n" +
        wid + ":\n" +
        "  author: " + qid + "  # " + name + " \u2014 do not change\n" +
        "  # category: systematic  # Optional: systematic, monograph, sermons\n" +
        "  # loci: tag  # Optional: work-level loci tag\n" +
        origBlock +
        "  en:\n" +
        "    title: " + yamlQuote(enTitle) + "\n" +
        "    sections:  # Optional\n" +
        "      - section-id: Section Title\n" +
        "        loci: tag  # Optional\n" +
        "    translations:\n" +
        "      - translator:  # Name of translator\n" +
        "        # AI: true  # Set if AI-translated\n" +
        "        sites:\n" +
        "          - site:  # Hosting website name\n" +
        "            url:  # URL to full text\n";

      var filename = slugify(name) + "-" + wid + ".yaml";
      var url = repo + "/new/main/works?filename=" + encodeURIComponent(filename) + "&value=" + encodeURIComponent(skeleton);
      window.open(url, "_blank");
      addWorkPanel.style.display = "none";
    }

    function yamlQuote(val) {
      if (!val) return '""';
      if (val.indexOf(":") !== -1 || val.indexOf("#") !== -1 || val.indexOf("'") !== -1) {
        return '"' + val.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
      }
      return val;
    }

    function escapeAttr(val) {
      return val.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    }
  }

  // --- Edit (opens GitHub file editor) ---

  document.querySelectorAll(".edit-link").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      const filename = this.dataset.yamlFilename;
      const repo =
        typeof repoUrl !== "undefined" ? repoUrl : "https://github.com/locinet/locinet";
      window.open(`${repo}/edit/main/works/${filename}`, "_blank");
    });
  });

  // --- Add an author (Wikidata search) ---

  const addAuthorBtn = document.getElementById("add-author-btn");
  const addAuthorDropdown = document.getElementById("add-author-dropdown");
  const authorSearchInput = document.getElementById("author-search");
  const authorSearchStatus = document.getElementById("author-search-status");
  const authorSearchResults = document.getElementById("author-search-results");

  if (addAuthorBtn && addAuthorDropdown) {
    let searchTimer = null;
    let abortController = null;

    addAuthorBtn.addEventListener("click", function (e) {
      e.preventDefault();
      const open = addAuthorDropdown.style.display !== "none";
      addAuthorDropdown.style.display = open ? "none" : "";
      if (!open) authorSearchInput.focus();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && addAuthorDropdown.style.display !== "none") {
        addAuthorDropdown.style.display = "none";
      }
    });

    document.addEventListener("click", function (e) {
      if (
        addAuthorDropdown.style.display !== "none" &&
        !addAuthorDropdown.contains(e.target) &&
        e.target !== addAuthorBtn
      ) {
        addAuthorDropdown.style.display = "none";
      }
    });

    authorSearchInput.addEventListener("input", function () {
      const query = this.value.trim();
      clearTimeout(searchTimer);
      if (query.length < 3) {
        authorSearchResults.innerHTML = "";
        authorSearchStatus.textContent =
          query.length > 0 ? "Type at least 3 characters..." : "";
        return;
      }
      authorSearchStatus.textContent = "Searching...";
      searchTimer = setTimeout(function () {
        searchWikidata(query);
      }, 300);
    });

    function searchWikidata(query) {
      if (abortController) abortController.abort();
      abortController = new AbortController();
      var signal = abortController.signal;

      var searchUrl =
        "https://www.wikidata.org/w/api.php?action=query&list=search" +
        "&srsearch=" +
        encodeURIComponent("haswbstatement:P31=Q5 " + query) +
        "&srlimit=8&format=json&origin=*";

      fetch(searchUrl, { signal: signal })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var results = (data.query && data.query.search) || [];
          if (results.length === 0) {
            authorSearchResults.innerHTML = "";
            authorSearchStatus.textContent = "No results found.";
            return;
          }
          var qids = results.map(function (r) { return r.title; });
          return fetchEntities(qids, signal);
        })
        .catch(function (err) {
          if (err.name === "AbortError") return;
          authorSearchResults.innerHTML = "";
          authorSearchStatus.textContent = "Search failed. Try again.";
        });
    }

    function fetchEntities(qids, signal) {
      var url =
        "https://www.wikidata.org/w/api.php?action=wbgetentities" +
        "&ids=" + qids.join("|") +
        "&props=labels|claims|descriptions&languages=en&format=json&origin=*";

      return fetch(url, { signal: signal })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          authorSearchStatus.textContent = "";
          authorSearchResults.innerHTML = "";
          var entities = data.entities || {};
          qids.forEach(function (qid) {
            var entity = entities[qid];
            if (!entity || entity.missing !== undefined) return;

            var label =
              entity.labels && entity.labels.en
                ? entity.labels.en.value
                : qid;
            var desc =
              entity.descriptions && entity.descriptions.en
                ? entity.descriptions.en.value
                : "";
            var birth = getYear(entity, "P569");
            var death = getYear(entity, "P570");
            var dates = "";
            if (birth || death) dates = (birth || "?") + "\u2013" + (death || "");

            var li = document.createElement("li");
            li.innerHTML =
              '<span class="author-result-name">' + escapeHtml(label) + "</span>" +
              (dates ? ' <span class="author-result-dates">' + escapeHtml(dates) + "</span>" : "") +
              (desc ? '<br><span class="author-result-desc">' + escapeHtml(desc) + "</span>" : "");
            li.addEventListener("click", function () {
              openNewWorkFile(qid, label);
              addAuthorDropdown.style.display = "none";
            });
            authorSearchResults.appendChild(li);
          });
        });
    }

    function getYear(entity, prop) {
      if (
        !entity.claims ||
        !entity.claims[prop] ||
        !entity.claims[prop][0] ||
        !entity.claims[prop][0].mainsnak ||
        !entity.claims[prop][0].mainsnak.datavalue
      )
        return "";
      var time = entity.claims[prop][0].mainsnak.datavalue.value.time || "";
      // Format: +1509-07-10T00:00:00Z → extract year
      var match = time.match(/([+-]?\d+)-/);
      return match ? match[1].replace(/^\+/, "") : "";
    }

    function openNewWorkFile(qid, label) {
      var repo =
        typeof repoUrl !== "undefined"
          ? repoUrl
          : "https://github.com/locinet/locinet";
      var skeleton =
        "# New work for " + label + "\n" +
        '# Fill in the fields below, then click "Commit changes" and open a pull request.\n' +
        "# For valid loci tags, see the Tagging Reference page on the site.\n" +
        "# For more examples, see other files in the works/ folder.\n\n" +
        "CHANGE-THIS-ID:\n" +
        "  author: " + qid + "  # " + label + " \u2014 do not change\n" +
        "  # category: systematic  # Optional: systematic, monograph, sermons\n" +
        "  # loci: tag  # Optional: work-level loci tag\n" +
        "  la:  # Original language (use la, fr, de, nl, etc.)\n" +
        "    title:  # REQUIRED\n" +
        "    orig_lang: true\n" +
        "    editions:\n" +
        "      - year:  # REQUIRED\n" +
        "        # place:  # Optional\n" +
        "  en:\n" +
        "    title:  # REQUIRED: English title\n" +
        "    sections:  # Optional\n" +
        "      - section-id: Section Title\n" +
        "        loci: tag  # Optional\n" +
        "    translations:\n" +
        "      - translator:  # Name of translator\n" +
        "        # AI: true  # Set if AI-translated\n" +
        "        sites:\n" +
        "          - site:  # Hosting website name\n" +
        "            url:  # URL to full text\n";
      var filename = slugify(label) + "-WORK.yaml";
      var url =
        repo +
        "/new/main/works?filename=" +
        encodeURIComponent(filename) +
        "&value=" +
        encodeURIComponent(skeleton);
      window.open(url, "_blank");
    }
  }

  // --- Helpers ---

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function slugify(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");
  }
})();
