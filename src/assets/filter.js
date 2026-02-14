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
    const toggleChronologicalBtn = document.getElementById("toggle-chronological");
    const toggleAlphabeticalBtn = document.getElementById("toggle-alphabetical");
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

    if (toggleTopicBtn && toggleAuthorBtn && toggleChronologicalBtn && toggleAlphabeticalBtn && lociMain && worksMain) {
      let currentMode = "topic";
      let currentSort = "chronological";
      let activeLocusSlug = null;
      const worksIndex = document.getElementById("works-index");

      document.querySelectorAll(".loci-authors").forEach(function (container) {
        container.querySelectorAll(".loci-author-item").forEach(function (item, index) {
          item.dataset.origIndex = String(index);
        });
      });
      if (worksIndex) {
        Array.from(worksIndex.children).forEach(function (author, index) {
          author.dataset.origIndex = String(index);
        });
      }

      // Active locus indicator elements
      const activeLociIndicator = document.getElementById("active-locus-indicator");
      const activeLocusName = document.getElementById("active-locus-name");
      const clearLocusBtn = document.getElementById("clear-locus-filter");

      function updateHomeUrl() {
        var params = new URLSearchParams(window.location.search);
        if (currentMode === "author") {
          params.set("view", "author");
        } else {
          params.delete("view");
        }
        if (currentSort === "alphabetical") {
          params.set("sort", "alpha");
        } else {
          params.delete("sort");
        }
        var newUrl = window.location.pathname;
        var qs = params.toString();
        if (qs) newUrl += "?" + qs;
        history.replaceState(null, "", newUrl);
      }

      function sortLociAuthors() {
        var containers = document.querySelectorAll(".loci-authors");
        for (var container of containers) {
          var items = Array.from(container.querySelectorAll(".loci-author-item"));
          items.sort(function (a, b) {
            if (currentSort === "alphabetical") {
              var aName = (a.textContent || "").trim();
              var bName = (b.textContent || "").trim();
              return aName.localeCompare(bName);
            }
            return Number(a.dataset.origIndex || 0) - Number(b.dataset.origIndex || 0);
          });
          for (var item of items) {
            container.appendChild(item);
          }
        }
      }

      function sortAuthorIndex() {
        if (!worksIndex) return;
        var items = Array.from(worksIndex.querySelectorAll(":scope > .works-index-author"));
        items.sort(function (a, b) {
          if (currentSort === "alphabetical") {
            var aKey = a.dataset.authorAlphaKey || a.dataset.authorName || "";
            var bKey = b.dataset.authorAlphaKey || b.dataset.authorName || "";
            if (aKey !== bKey) return aKey.localeCompare(bKey);
            var aName = a.dataset.authorName || "";
            var bName = b.dataset.authorName || "";
            return aName.localeCompare(bName);
          }
          return Number(a.dataset.origIndex || 0) - Number(b.dataset.origIndex || 0);
        });
        for (var item of items) {
          worksIndex.appendChild(item);
        }
      }

      function setSortMode(mode) {
        currentSort = mode;
        toggleChronologicalBtn.classList.toggle("active", mode === "chronological");
        toggleAlphabeticalBtn.classList.toggle("active", mode === "alphabetical");
        sortLociAuthors();
        sortAuthorIndex();
        updateHomeUrl();
      }

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

        updateHomeUrl();
      }

      toggleTopicBtn.addEventListener("click", function () { setMode("topic"); });
      toggleAuthorBtn.addEventListener("click", function () { setMode("author"); });
      toggleChronologicalBtn.addEventListener("click", function () { setSortMode("chronological"); });
      toggleAlphabeticalBtn.addEventListener("click", function () { setSortMode("alphabetical"); });

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
      var sortParam = params.get("sort");
      var locusParam = params.get("locus");

      if (sortParam === "alpha" || sortParam === "alphabetical") {
        setSortMode("alphabetical");
      } else {
        setSortMode("chronological");
      }

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

  // --- Sections collapse/expand toggle ---

  document.querySelectorAll(".sections-toggle").forEach(function (toggle) {
    toggle.addEventListener("click", function (e) {
      // Don't toggle when clicking links inside
      if (e.target.closest("a")) return;
      var work = this.closest(".work");
      if (!work) return;
      var list = work.querySelector(".sections-list");
      var expandToggle = work.querySelector(".expand-all-toggle");
      if (list) {
        var opening = list.classList.contains("sections-collapsed");
        list.classList.toggle("sections-collapsed");
        this.classList.toggle("sections-open", opening);
        if (expandToggle) expandToggle.style.display = opening ? "" : "none";
      }
    });
  });

  // --- Expandable section text ---

  document.querySelectorAll(".section-item.has-text").forEach(function (li) {
    var title = li.querySelector(".section-title");
    if (title) {
      title.addEventListener("click", function (e) {
        if (e.target.closest("a")) return;
        li.classList.toggle("expanded");
      });
      if (title.getAttribute("role") === "button") {
        title.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            li.classList.toggle("expanded");
          }
        });
      }
    }
  });

  // --- Expand all / Collapse all ---

  document.querySelectorAll(".expand-all-link").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var work = this.closest(".work");
      if (!work) return;
      var items = work.querySelectorAll(".section-item.has-text");
      var allExpanded = true;
      items.forEach(function (li) { if (!li.classList.contains("expanded")) allExpanded = false; });
      if (allExpanded) {
        items.forEach(function (li) { li.classList.remove("expanded"); });
        this.textContent = "Expand all";
      } else {
        items.forEach(function (li) { li.classList.add("expanded"); });
        this.textContent = "Collapse all";
      }
    });
  });

  // --- Download links (PDF / EPUB) ---

  document.querySelectorAll(".download-link").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var self = this;
      var format = self.dataset.format;
      var work = self.closest(".work");
      if (!work || !work.dataset.hasText) return;

      var meta = {
        workId: work.id,
        workTitle: work.dataset.workTitle,
        origTitle: work.dataset.workOrigTitle,
        authorName: work.dataset.workAuthor,
        authorOrigName: work.dataset.authorOrigName,
        authorDates: work.dataset.authorDates,
        authorImage: work.dataset.authorImage,
        editionInfo: work.dataset.editionInfo,
        translationInfo: work.dataset.translationInfo
      };

      var items = work.querySelectorAll(".section-item.has-text");
      var sections = [];
      items.forEach(function (li) {
        var titleEl = li.querySelector(".section-title");
        var textEl = li.querySelector(".section-text");
        if (titleEl && textEl) {
          sections.push({ title: titleEl.textContent.trim(), text: textEl.textContent.trim() });
        }
      });
      if (sections.length === 0) return;

      var origText = self.textContent;
      self.textContent = "...";
      var libUrl = format === "pdf"
        ? "https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js"
        : "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js";
      var checkLoaded = format === "pdf"
        ? function () { return typeof window.jspdf !== "undefined"; }
        : function () { return typeof window.JSZip !== "undefined"; };
      loadScript(libUrl, checkLoaded, function () {
        self.textContent = origText;
        if (format === "pdf") generatePdf(meta, sections);
        else generateEpub(meta, sections);
      });
    });
  });

  function loadScript(url, checkLoaded, callback) {
    if (checkLoaded()) { callback(); return; }
    var script = document.createElement("script");
    script.src = url;
    script.onload = function () { callback(); };
    script.onerror = function () { alert("Failed to load library from " + url); };
    document.head.appendChild(script);
  }

  // Cache for loaded font data
  var _fontCache = null;
  var _fontBoldCache = null;
  var FONT_URLS = [
    "https://cdn.jsdelivr.net/gh/google/fonts@main/apache/tinos/Tinos-Regular.ttf",
    "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notoserif/NotoSerif-Regular.ttf"
  ];
  var FONT_BOLD_URLS = [
    "https://cdn.jsdelivr.net/gh/google/fonts@main/apache/tinos/Tinos-Bold.ttf",
    "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notoserif/NotoSerif-Bold.ttf"
  ];

  function fetchFontWithFallback(urls, idx) {
    if (idx >= urls.length) return Promise.resolve(null);
    return fetch(urls[idx])
      .then(function (r) { return r.ok ? r.arrayBuffer() : fetchFontWithFallback(urls, idx + 1); })
      .catch(function () { return fetchFontWithFallback(urls, idx + 1); });
  }

  function loadFonts(callback) {
    if (_fontCache !== undefined && _fontCache !== null) {
      callback(_fontCache, _fontBoldCache);
      return;
    }
    Promise.all([
      fetchFontWithFallback(FONT_URLS, 0),
      fetchFontWithFallback(FONT_BOLD_URLS, 0)
    ]).then(function (results) {
      _fontCache = results[0];
      _fontBoldCache = results[1];
      callback(_fontCache, _fontBoldCache);
    });
  }

  function generatePdf(meta, sections) {
    loadFonts(function (fontData, fontBoldData) {
      buildPdf(meta, sections, fontData, fontBoldData);
    });
  }

  function buildPdf(meta, sections, fontData, fontBoldData) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "mm", format: "a4" });
    var pageWidth = doc.internal.pageSize.getWidth();
    var pageHeight = doc.internal.pageSize.getHeight();
    var margin = 20;
    var usable = pageWidth - 2 * margin;
    var fontName = "times"; // fallback

    // Register custom Unicode font if loaded
    if (fontData) {
      var fontBytes = new Uint8Array(fontData);
      var fontStr = "";
      for (var ci = 0; ci < fontBytes.length; ci++) fontStr += String.fromCharCode(fontBytes[ci]);
      doc.addFileToVFS("CustomSerif-Regular.ttf", btoa(fontStr));
      doc.addFont("CustomSerif-Regular.ttf", "CustomSerif", "normal");
      fontName = "CustomSerif";
    }
    if (fontBoldData) {
      var boldBytes = new Uint8Array(fontBoldData);
      var boldStr = "";
      for (var bi = 0; bi < boldBytes.length; bi++) boldStr += String.fromCharCode(boldBytes[bi]);
      doc.addFileToVFS("CustomSerif-Bold.ttf", btoa(boldStr));
      doc.addFont("CustomSerif-Bold.ttf", "CustomSerif", "bold");
    }
    doc.setFont(fontName, "normal");

    function addImageAndFinish(imgData) {
      // --- Title page ---
      var y = 40;
      if (imgData) {
        var imgW = 40;
        var imgH = 50;
        doc.addImage(imgData, "JPEG", (pageWidth - imgW) / 2, y, imgW, imgH);
        y += imgH + 8;
      }
      doc.setFontSize(20);
      doc.setFont(fontName, fontBoldData ? "bold" : "normal");
      var titleLines = doc.splitTextToSize(meta.workTitle || meta.workId, usable);
      doc.text(titleLines, pageWidth / 2, y, { align: "center" });
      y += titleLines.length * 8 + 3;
      if (meta.origTitle && meta.origTitle !== meta.workTitle) {
        doc.setFontSize(13);
        doc.setFont(fontName, "normal");
        var origLines = doc.splitTextToSize(meta.origTitle, usable);
        doc.text(origLines, pageWidth / 2, y, { align: "center" });
        y += origLines.length * 6 + 3;
      }
      doc.setFont(fontName, "normal");
      doc.setFontSize(14);
      if (meta.authorName) {
        doc.text(meta.authorName, pageWidth / 2, y, { align: "center" });
        y += 6;
      }
      if (meta.authorOrigName && meta.authorOrigName !== meta.authorName) {
        doc.setFontSize(12);
        doc.text(meta.authorOrigName, pageWidth / 2, y, { align: "center" });
        y += 6;
      }
      if (meta.authorDates) {
        doc.setFontSize(11);
        doc.text(meta.authorDates, pageWidth / 2, y, { align: "center" });
        y += 8;
      }
      doc.setFontSize(10);
      if (meta.editionInfo) {
        doc.text(meta.editionInfo, pageWidth / 2, y, { align: "center" });
        y += 5;
      }
      if (meta.translationInfo) {
        var transLines = doc.splitTextToSize(meta.translationInfo, usable);
        doc.text(transLines, pageWidth / 2, y, { align: "center" });
      }

      // --- Content (continuous flow) ---
      doc.addPage();
      y = margin;
      var lineHeight = 5;
      for (var i = 0; i < sections.length; i++) {
        doc.setFontSize(12);
        doc.setFont(fontName, fontBoldData ? "bold" : "normal");
        var secTitleLines = doc.splitTextToSize(sections[i].title, usable);
        var headingHeight = secTitleLines.length * 6 + 4;
        if (y + headingHeight > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        if (i > 0) y += 4;
        doc.text(secTitleLines, margin, y);
        y += secTitleLines.length * 6 + 2;

        doc.setFontSize(11);
        doc.setFont(fontName, "normal");
        var bodyLines = doc.splitTextToSize(sections[i].text, usable);
        for (var j = 0; j < bodyLines.length; j++) {
          if (y > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(bodyLines[j], margin, y);
          y += lineHeight;
        }
      }

      doc.save(meta.workId + ".pdf");
    }

    // Try to load the author image
    if (meta.authorImage) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        var canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        try {
          var data = canvas.toDataURL("image/jpeg", 0.85);
          addImageAndFinish(data);
        } catch (e) {
          addImageAndFinish(null);
        }
      };
      img.onerror = function () { addImageAndFinish(null); };
      img.src = meta.authorImage + "?width=200";
    } else {
      addImageAndFinish(null);
    }
  }

  function generateEpub(meta, sections) {
    function buildEpub(imgArrayBuffer) {
      var zip = new JSZip();
      var hasImage = !!imgArrayBuffer;

      // mimetype (must be first, uncompressed)
      zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

      // META-INF/container.xml
      zip.file("META-INF/container.xml",
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
        '  <rootfiles>\n' +
        '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n' +
        '  </rootfiles>\n' +
        '</container>'
      );

      if (hasImage) {
        zip.file("OEBPS/images/author.jpg", imgArrayBuffer);
      }

      // Build chapter XHTML
      var css = 'body { font-family: Georgia, "Times New Roman", serif; line-height: 1.6; }\n' +
        '.title-page { text-align: center; margin-bottom: 2em; }\n' +
        '.title-page h1 { margin-bottom: 0.2em; }\n' +
        '.title-page .orig-title { font-style: italic; color: #555; }\n' +
        '.title-page .author-image { max-width: 200px; margin: 0 auto 0.5em; display: block; }\n' +
        '.title-page .dates { color: #777; }\n' +
        '.title-page .edition-info, .title-page .translation-info { font-size: 0.9em; color: #777; }\n' +
        'h2 { margin-top: 1.5em; margin-bottom: 0.3em; font-size: 1.1em; }\n';

      var body = '<div class="title-page">\n';
      if (hasImage) {
        body += '  <img class="author-image" src="images/author.jpg" alt="' + escapeHtml(meta.authorName) + '"/>\n';
      }
      body += '  <h1>' + escapeHtml(meta.workTitle || meta.workId) + '</h1>\n';
      if (meta.origTitle && meta.origTitle !== meta.workTitle) {
        body += '  <p class="orig-title">' + escapeHtml(meta.origTitle) + '</p>\n';
      }
      if (meta.authorName) {
        body += '  <p><strong>' + escapeHtml(meta.authorName) + '</strong></p>\n';
      }
      if (meta.authorOrigName && meta.authorOrigName !== meta.authorName) {
        body += '  <p class="orig-title">' + escapeHtml(meta.authorOrigName) + '</p>\n';
      }
      if (meta.authorDates) {
        body += '  <p class="dates">' + escapeHtml(meta.authorDates) + '</p>\n';
      }
      if (meta.editionInfo) {
        body += '  <p class="edition-info">' + escapeHtml(meta.editionInfo) + '</p>\n';
      }
      if (meta.translationInfo) {
        body += '  <p class="translation-info">' + escapeHtml(meta.translationInfo) + '</p>\n';
      }
      body += '</div>\n<hr/>\n';

      var tocItems = [];
      for (var i = 0; i < sections.length; i++) {
        var anchorId = "sec-" + i;
        tocItems.push({ id: anchorId, title: sections[i].title });
        body += '<h2 id="' + anchorId + '">' + escapeHtml(sections[i].title) + '</h2>\n';
        var paras = sections[i].text.split(/\n\n+/);
        for (var p = 0; p < paras.length; p++) {
          if (paras[p].trim()) {
            body += '<p>' + escapeHtml(paras[p].trim()) + '</p>\n';
          }
        }
      }

      var chapterXhtml =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<!DOCTYPE html>\n' +
        '<html xmlns="http://www.w3.org/1999/xhtml">\n' +
        '<head><title>' + escapeHtml(meta.workTitle || meta.workId) + '</title>\n' +
        '<style type="text/css">\n' + css + '</style>\n' +
        '</head>\n' +
        '<body>\n' + body + '</body>\n</html>';
      zip.file("OEBPS/chapter.xhtml", chapterXhtml);

      // content.opf
      var manifestExtra = '';
      if (hasImage) {
        manifestExtra = '    <item id="author-img" href="images/author.jpg" media-type="image/jpeg"/>\n';
      }
      var opf =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">\n' +
        '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
        '    <dc:identifier id="bookid">urn:locinet:' + escapeHtml(meta.workId) + '</dc:identifier>\n' +
        '    <dc:title>' + escapeHtml(meta.workTitle || meta.workId) + '</dc:title>\n' +
        '    <dc:creator>' + escapeHtml(meta.authorName || "Unknown") + '</dc:creator>\n' +
        '    <dc:language>en</dc:language>\n' +
        '    <meta property="dcterms:modified">' + new Date().toISOString().replace(/\.\d+Z/, "Z") + '</meta>\n' +
        '  </metadata>\n' +
        '  <manifest>\n' +
        '    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>\n' +
        '    <item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n' +
        '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n' +
        manifestExtra +
        '  </manifest>\n' +
        '  <spine toc="toc">\n' +
        '    <itemref idref="chapter"/>\n' +
        '  </spine>\n' +
        '</package>';
      zip.file("OEBPS/content.opf", opf);

      // toc.ncx
      var ncxPoints = '';
      for (var k = 0; k < tocItems.length; k++) {
        ncxPoints +=
          '    <navPoint id="np-' + k + '" playOrder="' + (k + 1) + '">\n' +
          '      <navLabel><text>' + escapeHtml(tocItems[k].title) + '</text></navLabel>\n' +
          '      <content src="chapter.xhtml#' + tocItems[k].id + '"/>\n' +
          '    </navPoint>\n';
      }
      var ncx =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n' +
        '  <head><meta name="dtb:uid" content="urn:locinet:' + escapeHtml(meta.workId) + '"/></head>\n' +
        '  <docTitle><text>' + escapeHtml(meta.workTitle || meta.workId) + '</text></docTitle>\n' +
        '  <navMap>\n' + ncxPoints + '  </navMap>\n' +
        '</ncx>';
      zip.file("OEBPS/toc.ncx", ncx);

      // nav.xhtml
      var navItems = '';
      for (var m = 0; m < tocItems.length; m++) {
        navItems += '      <li><a href="chapter.xhtml#' + tocItems[m].id + '">' + escapeHtml(tocItems[m].title) + '</a></li>\n';
      }
      var navXhtml =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<!DOCTYPE html>\n' +
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\n' +
        '<head><title>Table of Contents</title></head>\n' +
        '<body>\n' +
        '  <nav epub:type="toc">\n' +
        '    <h1>Table of Contents</h1>\n' +
        '    <ol>\n' + navItems + '    </ol>\n' +
        '  </nav>\n' +
        '</body>\n</html>';
      zip.file("OEBPS/nav.xhtml", navXhtml);

      zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = meta.workId + ".epub";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    // Try to fetch the author image as binary for embedding
    if (meta.authorImage) {
      fetch(meta.authorImage + "?width=200")
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (buf) { buildEpub(buf); })
        .catch(function () { buildEpub(null); });
    } else {
      buildEpub(null);
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
      var guideUrl = "https://locinet.github.io/contributing/";
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
