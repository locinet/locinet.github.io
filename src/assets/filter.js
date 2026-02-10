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

    // --- View toggle (home page only) ---

    const toggleTopicBtn = document.getElementById("toggle-topic");
    const toggleAuthorBtn = document.getElementById("toggle-author");
    const lociMain = document.querySelector(".loci-main");
    const worksMain = document.querySelector(".works-main");
    const filterBoxTopic = document.getElementById("filter-box-topic");
    const filterBoxAuthor = document.getElementById("filter-box-author");
    const authorFilterInput = document.getElementById("author-filter");

    // --- Tradition dropdown (always active) ---

    var activeTraditions = new Set();
    var traditionDropdownBtn = document.getElementById("tradition-dropdown-btn");
    var traditionDropdownMenu = document.getElementById("tradition-dropdown-menu");
    var traditionCheckboxes = document.querySelectorAll(".tradition-checkbox");

    if (traditionDropdownBtn && traditionDropdownMenu) {
      var traditionJustOpened = false;

      traditionDropdownBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var open = traditionDropdownMenu.style.display !== "none";
        traditionDropdownMenu.style.display = open ? "none" : "";
        if (!open) {
          traditionJustOpened = true;
          requestAnimationFrame(function () { traditionJustOpened = false; });
        }
      });

      traditionDropdownMenu.addEventListener("click", function (e) {
        e.stopPropagation();
      });

      document.addEventListener("click", function (e) {
        if (traditionJustOpened) return;
        if (traditionDropdownMenu.style.display !== "none" &&
            !traditionDropdownMenu.contains(e.target) &&
            e.target !== traditionDropdownBtn) {
          traditionDropdownMenu.style.display = "none";
        }
      });

      traditionCheckboxes.forEach(function (cb) {
        cb.addEventListener("change", function () {
          if (this.checked) {
            activeTraditions.add(this.value);
          } else {
            activeTraditions.delete(this.value);
          }
          updateTraditionLabel();
          applyTraditionToLociTree();
          if (typeof applyAuthorAndLocusFilter === "function") {
            applyAuthorAndLocusFilter();
          }
        });
      });
    }

    function updateTraditionLabel() {
      if (!traditionDropdownBtn) return;
      if (activeTraditions.size === 0) {
        traditionDropdownBtn.textContent = "All traditions";
        return;
      }
      var names = [];
      traditionCheckboxes.forEach(function (cb) {
        if (activeTraditions.has(cb.value)) {
          names.push(cb.parentElement.textContent.trim());
        }
      });
      traditionDropdownBtn.textContent = names.join(", ");
    }

    function applyTraditionToLociTree() {
      var authorItems = document.querySelectorAll(".loci-author-item");
      for (var item of authorItems) {
        var tradition = item.dataset.tradition || "";
        if (activeTraditions.size > 0 && !activeTraditions.has(tradition)) {
          item.classList.add("filtered-hidden");
        } else {
          item.classList.remove("filtered-hidden");
        }
      }
      // Hide the "— " dash and entire .loci-authors when all children are hidden
      var authorSpans = document.querySelectorAll(".loci-authors");
      for (var span of authorSpans) {
        var anyVisible = span.querySelector(".loci-author-item:not(.filtered-hidden)");
        var dash = span.querySelector(".loci-authors-dash");
        if (dash) dash.style.display = anyVisible ? "" : "none";
      }
    }

    if (toggleTopicBtn && toggleAuthorBtn && lociMain && worksMain) {
      let currentMode = "topic";
      let activeLocusSlug = null;

      // Active locus indicator elements
      const activeLociIndicator = document.getElementById("active-locus-indicator");
      const activeLocusName = document.getElementById("active-locus-name");
      const clearLocusBtn = document.getElementById("clear-locus-filter");

      function setMode(mode) {
        currentMode = mode;

        // Update toggle buttons
        toggleTopicBtn.classList.toggle("active", mode === "topic");
        toggleAuthorBtn.classList.toggle("active", mode === "author");

        // Show/hide main content areas
        lociMain.style.display = mode === "topic" ? "" : "none";
        worksMain.style.display = mode === "author" ? "" : "none";

        // Show/hide filter boxes
        if (filterBoxTopic) filterBoxTopic.style.display = mode === "topic" ? "" : "none";
        if (filterBoxAuthor) filterBoxAuthor.style.display = mode === "author" ? "" : "none";

        // Clear filters when switching
        if (mode === "topic") {
          if (authorFilterInput) authorFilterInput.value = "";
          clearLocusFilter();
          applyAuthorAndLocusFilter();
        } else {
          filterInput.value = "";
          applyFilter();
        }

        // Update URL
        var params = new URLSearchParams(window.location.search);
        if (mode === "author") {
          params.set("view", "author");
        } else {
          params.delete("view");
        }
        var newUrl = window.location.pathname;
        var qs = params.toString();
        if (qs) newUrl += "?" + qs;
        history.replaceState(null, "", newUrl);
      }

      toggleTopicBtn.addEventListener("click", function () { setMode("topic"); });
      toggleAuthorBtn.addEventListener("click", function () { setMode("author"); });

      // --- Sidebar behavior ---

      function getSlugsForLocus(slug) {
        var entry = flat[slug];
        if (!entry) return new Set([slug]);
        var set = new Set([slug]);
        for (var d of (entry.descendants || [])) set.add(d);
        return set;
      }

      function setLocusFilter(slug) {
        activeLocusSlug = slug;
        var entry = flat[slug];
        if (activeLociIndicator && activeLocusName) {
          activeLocusName.textContent = entry ? entry.name : slug;
          activeLociIndicator.style.display = "";
        }

        // Highlight sidebar link
        document.querySelectorAll(".loci-sidebar a.sidebar-active").forEach(function (a) {
          a.classList.remove("sidebar-active");
        });
        var sidebarLink = document.querySelector('.loci-sidebar a[data-slug="' + slug + '"]');
        if (sidebarLink) sidebarLink.classList.add("sidebar-active");

        // Expand parent tree in sidebar so the active locus is visible
        if (entry && entry.ancestors) {
          for (var anc of entry.ancestors) {
            var ancLink = document.querySelector('.loci-sidebar a[data-slug="' + anc + '"]');
            if (ancLink) {
              var sibling = ancLink.nextElementSibling;
              if (sibling && sibling.classList.contains("stree-collapsed")) {
                sibling.classList.remove("stree-collapsed");
                ancLink.classList.add("expanded");
              }
            }
          }
        }

        applyAuthorAndLocusFilter();
      }

      function clearLocusFilter() {
        activeLocusSlug = null;
        if (activeLociIndicator) activeLociIndicator.style.display = "none";
        document.querySelectorAll(".loci-sidebar a.sidebar-active").forEach(function (a) {
          a.classList.remove("sidebar-active");
        });
      }

      if (clearLocusBtn) {
        clearLocusBtn.addEventListener("click", function () {
          clearLocusFilter();
          applyAuthorAndLocusFilter();
        });
      }

      // Override sidebar click behavior
      document.querySelectorAll(".loci-sidebar a").forEach(function (link) {
        link.addEventListener("click", function (e) {
          if (currentMode === "author") {
            e.preventDefault();
            var slug = this.dataset.slug;
            if (slug) {
              // Toggle expand/collapse for nodes with children (stree-toggle)
              if (this.classList.contains("stree-toggle")) {
                var children = this.nextElementSibling;
                if (children && children.classList.contains("stree")) {
                  children.classList.toggle("stree-collapsed");
                  this.classList.toggle("expanded");
                }
              }
              setLocusFilter(slug);
            }
          }
          // In topic mode, keep original behavior (handled by the existing stree-toggle handler below)
        });
      });

      // --- Author + locus combined filter for works ---

      function applyAuthorAndLocusFilter() {
        var authorQuery = authorFilterInput ? authorFilterInput.value.toLowerCase().trim() : "";
        var locusSlugs = activeLocusSlug ? getSlugsForLocus(activeLocusSlug) : null;

        var authors = document.querySelectorAll("#works-index .works-index-author");
        for (var author of authors) {
          var authorName = author.dataset.authorName || "";
          var authorTradition = author.dataset.tradition || "";

          // Tradition filter
          if (activeTraditions.size > 0 && !activeTraditions.has(authorTradition)) {
            author.classList.add("filtered-hidden");
            continue;
          }

          // Author name filter
          var authorNameMatch = !authorQuery || authorName.includes(authorQuery);
          if (!authorNameMatch) {
            author.classList.add("filtered-hidden");
            continue;
          }

          // Locus filter: check individual works
          if (locusSlugs) {
            var workItems = author.querySelectorAll(".works-index-list li");
            var anyWorkVisible = false;
            for (var li of workItems) {
              var workLoci;
              try {
                workLoci = JSON.parse(li.dataset.loci || "[]");
              } catch (ex) {
                workLoci = [];
              }
              var workMatches = workLoci.some(function (l) { return locusSlugs.has(l); });
              if (workMatches) {
                li.classList.remove("filtered-hidden");
                anyWorkVisible = true;
              } else {
                li.classList.add("filtered-hidden");
              }
            }
            if (anyWorkVisible) {
              author.classList.remove("filtered-hidden");
            } else {
              author.classList.add("filtered-hidden");
            }
          } else {
            // No locus filter — show all works for this author
            author.classList.remove("filtered-hidden");
            author.querySelectorAll(".works-index-list li").forEach(function (li) {
              li.classList.remove("filtered-hidden");
            });
          }
        }
      }

      if (authorFilterInput) {
        authorFilterInput.addEventListener("input", applyAuthorAndLocusFilter);
      }

      var clearAuthorBtn = document.getElementById("clear-author-filter");
      if (clearAuthorBtn) {
        clearAuthorBtn.addEventListener("click", function () {
          if (authorFilterInput) {
            authorFilterInput.value = "";
            applyAuthorAndLocusFilter();
            authorFilterInput.focus();
          }
        });
      }

      // --- Check URL params for initial state ---

      var params = new URLSearchParams(window.location.search);
      var viewParam = params.get("view");
      var locusParam = params.get("locus");

      if (viewParam === "author") {
        setMode("author");
        if (locusParam && flat[locusParam]) {
          setLocusFilter(locusParam);
        }
      } else {
        if (locusParam) {
          filterInput.value = locusParam;
          applyFilter();
        }
      }
    } else {
      // Not on home page — check URL params for pre-filled filter (author pages)
      var params = new URLSearchParams(window.location.search);
      var locusParam = params.get("locus");
      if (locusParam) {
        filterInput.value = locusParam;
        applyFilter();
      }
    }
  }

  // --- Works index standalone author filtering (for pages that still use #works-index without toggle) ---

  var standaloneAuthorFilter = document.getElementById("author-filter");
  var isStandaloneWorksIndex = document.querySelector("#works-index") !== null && document.getElementById("toggle-topic") === null;
  if (standaloneAuthorFilter && isStandaloneWorksIndex) {
    function applyStandaloneAuthorFilter() {
      var query = standaloneAuthorFilter.value.toLowerCase().trim();
      var authors = document.querySelectorAll(".works-index-author");
      for (var author of authors) {
        if (!query || author.dataset.authorName.includes(query)) {
          author.classList.remove("filtered-hidden");
        } else {
          author.classList.add("filtered-hidden");
        }
      }
    }

    standaloneAuthorFilter.addEventListener("input", applyStandaloneAuthorFilter);

    var clearStandaloneBtn = document.getElementById("clear-author-filter");
    if (clearStandaloneBtn) {
      clearStandaloneBtn.addEventListener("click", function () {
        standaloneAuthorFilter.value = "";
        applyStandaloneAuthorFilter();
        standaloneAuthorFilter.focus();
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
      var repo = typeof repoUrl !== "undefined" ? repoUrl : "https://github.com/locinet/locinet.github.io";

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
        typeof repoUrl !== "undefined" ? repoUrl : "https://github.com/locinet/locinet.github.io";
      window.open(`${repo}/edit/main/works/${filename}`, "_blank");
    });
  });

  // --- Add a work (Wikidata search) ---

  const addAuthorBtn = document.getElementById("add-author-btn");
  const addAuthorDropdown = document.getElementById("add-author-dropdown");
  const authorSearchInput = document.getElementById("author-search");
  const authorSearchStatus = document.getElementById("author-search-status");
  const authorSearchResults = document.getElementById("author-search-results");
  const knownAuthors = typeof siteAuthors !== "undefined" ? siteAuthors : {};

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

            var onSite = knownAuthors[qid];
            var li = document.createElement("li");
            li.innerHTML =
              '<span class="author-result-name">' + escapeHtml(label) + "</span>" +
              (onSite ? ' <span class="author-on-site">\u2713 on site</span>' : "") +
              (dates ? ' <span class="author-result-dates">' + escapeHtml(dates) + "</span>" : "") +
              (desc ? '<br><span class="author-result-desc">' + escapeHtml(desc) + "</span>" : "");
            li.addEventListener("click", function () {
              openNewWorkFile(qid, onSite ? onSite.name : label);
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
          : "https://github.com/locinet/locinet.github.io";
      var guideUrl = "https://locinet.github.io/locinet/contributing/";
      var skeleton =
        "# New work for " + label + "\n" +
        "# Guide: " + guideUrl + "\n" +
        "#\n" +
        "# Instructions:\n" +
        "#   1. Change the work ID below (e.g. calvin-institutes)\n" +
        "#   2. Fill in the title, year, and translation fields\n" +
        "#   3. Use AI to add sections and loci tags (see guide)\n" +
        '#   4. Click "Commit changes" and open a pull request\n\n' +
        "CHANGE-THIS-ID:  # <-- replace with a short slug (e.g. author-short-title)\n" +
        "  author: " + qid + "  # " + label + " \u2014 do not change\n" +
        "  # category: systematic  # Optional: systematic, monograph, sermons\n" +
        "  la:  # Change to original language if not Latin (fr, de, nl, etc.)\n" +
        "    title:  # Original-language title\n" +
        "    orig_lang: true\n" +
        "    editions:\n" +
        "      - year:  # Year of first publication\n" +
        "  en:\n" +
        "    title:  # English title\n" +
        "    # sections:  # Use AI to generate sections from a table of contents\n" +
        "    translations:\n" +
        "      - translator:  # Translator name\n" +
        "        sites:\n" +
        "          - site:  # Website name (e.g. CCEL, Internet Archive)\n" +
        "            url:  # URL to the full text\n";
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

  // --- Sidebar tree expand/collapse (topic mode) ---

  document.querySelectorAll('.stree-toggle').forEach(function(toggle) {
    toggle.addEventListener('click', function(e) {
      // Only handle expand/collapse in topic mode (author mode handles it separately)
      var toggleBtn = document.getElementById("toggle-topic");
      if (toggleBtn && !toggleBtn.classList.contains("active")) return;

      e.preventDefault();
      var children = this.nextElementSibling;
      if (children && children.classList.contains('stree')) {
        children.classList.toggle('stree-collapsed');
        this.classList.toggle('expanded');
      }
      var target = document.querySelector(this.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

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
