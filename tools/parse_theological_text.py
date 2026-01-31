#!/usr/bin/env python3
"""
Theological Text Parser for the Theological Syntopticon
========================================================

Takes a URL to a full-text theological work hosted online, parses its
hierarchical structure, assigns topics from the Syntopticon taxonomy,
and generates the YAML data files needed by the Jekyll site.

Usage:
    python3 tools/parse_theological_text.py [URL]

If no URL is provided, the tool will prompt interactively.

Generated files (in _data/):
    works/<work-id>.yaml       - Work metadata (title, author, year, editions)
    structures/<work-id>.yaml  - Hierarchical structure (levels, nodes)
    titles/<work-id>.yaml      - Section titles
    links/<work-id>.yaml       - URLs to online text
    topics/<work-id>.yaml      - Topic assignments per section

Also generates:
    _works/<work-id>.md        - Jekyll collection page
"""

import argparse
import os
import re
import sys
import time
import yaml
from collections import defaultdict, Counter
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup, NavigableString, Tag

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(REPO_ROOT, "_data")
WORKS_COLLECTION_DIR = os.path.join(REPO_ROOT, "_works")

TOPICS_DEFINITIONS_PATH = os.path.join(DATA_DIR, "topics_definitions.yaml")
AUTHORS_PATH = os.path.join(DATA_DIR, "authors.yaml")

REQUEST_HEADERS = {
    "User-Agent": (
        "Theological-Syntopticon-Parser/1.0 "
        "(https://github.com/jfhutson/Theological-Syntopticon)"
    )
}
REQUEST_DELAY = 1.0  # seconds between fetches to be polite

# Minimum number of keyword hits to consider a topic relevant
MIN_TOPIC_SCORE = 2
# Maximum topics to assign per section
MAX_TOPICS_PER_SECTION = 5

# ---------------------------------------------------------------------------
# YAML helpers (preserve nice formatting)
# ---------------------------------------------------------------------------


class LiteralStr(str):
    """String that YAML should dump in literal block style."""
    pass


def _literal_representer(dumper, data):
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")


yaml.add_representer(LiteralStr, _literal_representer)


def yaml_dump(data):
    """Dump data to YAML with clean formatting."""
    return yaml.dump(
        data,
        default_flow_style=False,
        allow_unicode=True,
        sort_keys=False,
        width=120,
    )


# ---------------------------------------------------------------------------
# Network helpers
# ---------------------------------------------------------------------------


def fetch_page(url, session=None):
    """Fetch a URL and return a BeautifulSoup object."""
    sess = session or requests.Session()
    resp = sess.get(url, headers=REQUEST_HEADERS, timeout=30)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "lxml"), resp.url


def get_text_content(soup):
    """Extract readable text from a BeautifulSoup element."""
    for tag in soup.find_all(["script", "style", "nav", "header", "footer"]):
        tag.decompose()
    return soup.get_text(separator=" ", strip=True)


# ---------------------------------------------------------------------------
# Topic index (keyword-based matching)
# ---------------------------------------------------------------------------

# Additional theological keywords mapped to topic IDs, beyond what can be
# extracted from the topic names/descriptions automatically.
EXTRA_KEYWORDS = {
    # Theology Proper
    "deity": "nature-of-god",
    "godhead": "nature-of-god",
    "theism": "existence-of-god",
    "aseity": "nature-of-god",
    "impassibility": "divine-immutability",
    "triune": "trinity",
    "consubstantial": "trinity",
    "homoousios": "trinity",
    "filioque": "procession-of-spirit",
    "monotheism": "unity-of-god",
    # Creation and Providence
    "cosmogony": "creation",
    "creatio": "creation",
    "nihilo": "creation-ex-nihilo",
    "preservation": "divine-providence",
    "concurrence": "divine-concurrence",
    "decree": "predestination",
    "decrees": "predestination",
    "foreordination": "predestination",
    "elect": "election",
    "reprobate": "reprobation",
    # Scripture and Revelation
    "bible": "scripture",
    "biblical": "scripture",
    "canonical": "canon",
    "hermeneutics": "interpretation",
    "exegesis": "interpretation",
    "perspicuity": "clarity",
    "infallible": "inerrancy",
    "sola scriptura": "sufficiency",
    # Christology
    "messiah": "christology",
    "messianic": "christology",
    "mediator": "offices-of-christ",
    "logos": "incarnation",
    "theanthropos": "hypostatic-union",
    "kenosis": "incarnation",
    "chalcedon": "two-natures",
    "chalcedonian": "two-natures",
    "crucifixion": "passion-of-christ",
    "cross": "passion-of-christ",
    "calvary": "passion-of-christ",
    "propitiation": "atonement",
    "expiation": "atonement",
    "ransom": "atonement",
    "substitution": "penal-substitution",
    # Soteriology
    "sola fide": "justification-by-faith-alone",
    "sola gratia": "grace",
    "impute": "imputation",
    "imputed": "imputation",
    "righteousness": "justification",
    "regenerate": "regeneration",
    "born again": "regeneration",
    "sanctify": "sanctification",
    "holiness": "sanctification",
    "persevere": "perseverance",
    "assurance": "perseverance",
    "glorify": "glorification",
    "merit": "merit",
    "meritorious": "merit",
    "ordo salutis": "soteriology",
    # Ecclesiology
    "ecclesia": "nature-of-church",
    "church": "nature-of-church",
    "clergy": "ministry",
    "laity": "priesthood-of-believers",
    "bishop": "episcopacy",
    "elder": "presbyterianism",
    "deacon": "ordained-ministry",
    "ordination": "holy-orders",
    "excommunication": "church-discipline",
    "pope": "papacy",
    "papal": "papacy",
    "pontiff": "papacy",
    "primacy": "papacy",
    # Sacraments
    "sacrament": "sacraments",
    "sacramental": "sacraments",
    "baptize": "baptism",
    "baptized": "baptism",
    "baptismal": "baptism",
    "paedobaptism": "infant-baptism",
    "pedobaptism": "infant-baptism",
    "credobaptism": "believers-baptism",
    "eucharistic": "eucharist",
    "communion": "eucharist",
    "transubstantiation": "transubstantiation",
    "consubstantiation": "consubstantiation",
    "real presence": "real-presence",
    "sacrament of penance": "penance",
    "extreme unction": "anointing",
    "confirmation": "confirmation",
    "matrimony": "marriage",
    # Eschatology
    "parousia": "second-coming",
    "millennium": "millennium",
    "millenarian": "millennium",
    "chiliasm": "premillennialism",
    "rapture": "rapture",
    "antichrist": "antichrist",
    "purgatory": "purgatory",
    "limbo": "limbo",
    "beatific vision": "beatific-vision",
    "resurrection": "resurrection",
    "judgment": "final-judgment",
    "damnation": "hell",
    "eternal punishment": "eternal-punishment",
    "annihilation": "annihilationism",
    "heaven": "heaven",
    "paradise": "paradise",
    # Moral Theology
    "natural law": "natural-law",
    "decalogue": "moral-precepts",
    "commandments": "moral-precepts",
    "virtue": "virtues",
    "prudence": "prudence",
    "temperance": "temperance",
    "fortitude": "fortitude",
    "justice": "justice",
    "charity": "charity-virtue",
    "chastity": "sexual-ethics",
    "conscience": "conscience",
    "casuistry": "conscience",
    "just war": "war-and-peace",
    # Anthropology
    "imago dei": "image-of-god",
    "image of god": "image-of-god",
    "soul": "soul-and-body",
    "intellect": "human-faculties",
    "concupiscence": "concupiscence",
    "total depravity": "effects-of-sin",
    "bondage of the will": "free-will-after-fall",
    # Pneumatology
    "paraclete": "person-of-spirit",
    "charism": "charismatic-gifts",
    "tongues": "charismatic-gifts",
    "prophecy": "prophecy",
    # Angels
    "angel": "nature-of-angels",
    "angelic": "nature-of-angels",
    "demon": "demons",
    "demonic": "demons",
    "devil": "satan",
    "satan": "satan",
    "seraph": "angelic-orders",
    "cherub": "angelic-orders",
    # Mariology
    "theotokos": "theotokos",
    "immaculate conception": "immaculate-conception",
    "assumption": "assumption",
    "marian": "mariology",
    # Prayer and Spiritual Life
    "prayer": "prayer",
    "contemplation": "contemplation",
    "meditation": "meditation",
    "mystical": "mystical-experiences",
    "ascetical": "ascetical-theology",
    "monasticism": "monasticism",
    "religious life": "religious-life",
    "vow": "vows",
    "vows": "vows",
    # Liturgy
    "liturgy": "liturgical-theology",
    "liturgical": "liturgical-theology",
    "worship": "worship",
    "mass": "mass",
    "icon": "sacred-art",
    "idolatry": "idolatry",
    "idols": "idolatry",
}


def build_topic_index(topics_defs_path):
    """Build keyword-to-topic-id mapping from topics_definitions.yaml.

    Returns:
        all_topics: dict mapping topic_id -> {name, description}
        keyword_index: dict mapping lowercase keyword -> list of topic_ids
    """
    with open(topics_defs_path, "r") as f:
        data = yaml.safe_load(f)

    all_topics = {}
    keyword_index = defaultdict(list)

    stop_words = {
        "the", "a", "an", "and", "or", "of", "in", "to", "for", "is",
        "its", "it", "as", "at", "by", "on", "not", "no", "with", "from",
        "that", "this", "be", "are", "was", "were", "has", "have", "his",
        "her", "their", "them", "all", "each", "which", "whether", "how",
        "what", "who", "whom",
    }

    def extract_keywords(text):
        """Extract meaningful keywords from text."""
        words = re.findall(r"[a-z][a-z'-]+", text.lower())
        return [w for w in words if w not in stop_words and len(w) > 2]

    def process_topic(topic, parent_ids=None):
        """Recursively process a topic node and its children."""
        tid = topic["id"]
        name = topic.get("name", "")
        desc = topic.get("description", "")
        all_topics[tid] = {"name": name, "description": desc}

        # Extract keywords from name and description
        name_kws = extract_keywords(name)
        desc_kws = extract_keywords(desc)

        # Name keywords are more important — add them
        for kw in name_kws:
            if tid not in keyword_index[kw]:
                keyword_index[kw].append(tid)
        # Multi-word name as a phrase
        name_lower = name.lower()
        if len(name_lower.split()) > 1:
            if tid not in keyword_index[name_lower]:
                keyword_index[name_lower].append(tid)

        # Description keywords
        for kw in desc_kws:
            if tid not in keyword_index[kw]:
                keyword_index[kw].append(tid)

        # Process children
        for child in topic.get("children", []):
            process_topic(child, (parent_ids or []) + [tid])

    for topic in data.get("topics", []):
        process_topic(topic)

    # Add extra manually-curated keywords
    for kw, tid in EXTRA_KEYWORDS.items():
        kw_lower = kw.lower()
        if tid in all_topics and tid not in keyword_index[kw_lower]:
            keyword_index[kw_lower].append(tid)

    return all_topics, keyword_index


def assign_topics(title, content, all_topics, keyword_index):
    """Assign topics to a section based on its title and content.

    Returns a list of topic IDs sorted by relevance score.
    """
    scores = Counter()
    text_lower = (content or "").lower()
    title_lower = (title or "").lower()

    # Check multi-word phrases first (higher value)
    phrase_keys = sorted(
        [k for k in keyword_index if " " in k],
        key=len,
        reverse=True,
    )
    for phrase in phrase_keys:
        title_hits = len(re.findall(re.escape(phrase), title_lower))
        content_hits = len(re.findall(re.escape(phrase), text_lower))
        if title_hits or content_hits:
            for tid in keyword_index[phrase]:
                scores[tid] += title_hits * 5 + content_hits

    # Check single-word keywords
    # Tokenize once
    title_words = set(re.findall(r"[a-z][a-z'-]+", title_lower))
    content_words = re.findall(r"[a-z][a-z'-]+", text_lower)
    content_word_counts = Counter(content_words)

    for kw, topic_ids in keyword_index.items():
        if " " in kw:
            continue  # already handled above
        title_hit = kw in title_words
        content_count = content_word_counts.get(kw, 0)
        if title_hit or content_count:
            for tid in topic_ids:
                scores[tid] += (5 if title_hit else 0) + min(content_count, 10)

    # Filter and sort
    results = [
        (tid, score)
        for tid, score in scores.most_common()
        if score >= MIN_TOPIC_SCORE
    ]
    return [tid for tid, _ in results[:MAX_TOPICS_PER_SECTION]]


# ---------------------------------------------------------------------------
# HTML structure detection
# ---------------------------------------------------------------------------


def _is_navigation_text(text):
    """Check if link text looks like site navigation rather than a chapter title."""
    nav_patterns = [
        "home", "about", "contact", "search", "help", "login", "sign in",
        "copyright", "next", "previous", "back", "forward", "menu",
        "read online", "download", "listen", "formats", "summary",
        "popularity", "available formats", "print", "share", "cite",
        "subscribe", "newsletter", "donate", "support", "privacy",
        "terms of use", "feedback", "report", "settings", "profile",
        "log in", "log out", "sign up", "register", "cart", "shop",
        "buy", "purchase", "order", "browse", "catalog", "library",
        "all works", "all authors", "site map", "sitemap", "faq",
        "mobile", "desktop", "pdf", "epub", "kindle", "mobi",
        # File format labels (common on sites that offer multiple download formats)
        "html", "xml", "read on mobile", "microsoft word", "unicode text",
        "theological markup", "word document", "plain text", "rich text",
        "open document", "postscript",
    ]
    text_lower = text.lower().strip()
    # Exact match or starts with a nav pattern
    for pat in nav_patterns:
        if text_lower == pat or text_lower.startswith(pat + " "):
            return True
    # Very short generic text
    if len(text_lower) <= 3:
        return True
    return False


# File extensions that indicate a download link rather than a chapter page
_DOWNLOAD_EXTENSIONS = {
    ".epub", ".mobi", ".azw", ".azw3",  # e-book formats
    ".pdf",                               # PDF
    ".doc", ".docx", ".rtf", ".odt",     # word processing
    ".txt",                               # plain text
    ".xml", ".thml",                      # markup/data
    ".zip", ".gz", ".tar", ".bz2",       # archives
    ".mp3", ".ogg", ".wav", ".m4a",      # audio
}


def _is_download_url(url):
    """Check if a URL points to a downloadable file rather than an HTML page."""
    path = urlparse(url).path.lower()
    for ext in _DOWNLOAD_EXTENSIONS:
        if path.endswith(ext):
            return True
    # Also catch URLs with /cache/ directories (common pattern for download mirrors)
    if "/cache/" in path:
        return True
    return False


def _url_is_related(link_url, base_url):
    """Check if a link URL looks like a sub-page of the current work.

    For example, on https://ccel.org/ccel/luther/bondage/bondage,
    a link to bondage.iii.html is related, but a link to /about is not.
    """
    base_parsed = urlparse(base_url)
    link_parsed = urlparse(link_url)

    # Must be same host (or relative)
    if link_parsed.netloc and link_parsed.netloc != base_parsed.netloc:
        return False

    base_path = base_parsed.path.rstrip("/")
    link_path = link_parsed.path.rstrip("/")

    # Link path should share a common prefix with the base path
    # e.g. base=/ccel/luther/bondage/bondage, link=/ccel/luther/bondage/bondage.iii.html
    # Get the directory of the base path
    base_dir = base_path.rsplit("/", 1)[0] if "/" in base_path else ""

    if link_path.startswith(base_dir + "/"):
        return True

    # Also accept links where the base path is a prefix of the link
    # e.g. base=bondage, link=bondage.iii.html
    base_stem = base_path.rsplit("/", 1)[-1]
    link_stem = link_path.rsplit("/", 1)[-1]
    if base_stem and link_stem.startswith(base_stem):
        return True

    return False


def detect_toc_links(soup, base_url):
    """Detect table-of-contents links from the page.

    Uses multiple strategies and scores each list of links to find the
    most likely table of contents, filtering out site navigation.

    Returns list of dicts: {title, url, level}
    """

    def extract_entries_from_list(list_el):
        """Extract link entries from a list element."""
        entries = []
        for a in list_el.find_all("a", href=True):
            href = a.get("href", "")
            if not href or href.startswith("#") or href.startswith("javascript"):
                continue
            text = a.get_text(strip=True)
            if len(text) < 3 or _is_navigation_text(text):
                continue
            full_url = urljoin(base_url, href)
            if _is_download_url(full_url):
                continue
            # Determine nesting level
            depth = 0
            parent = a.parent
            while parent and parent != list_el:
                if parent.name in ["ol", "ul"]:
                    depth += 1
                parent = parent.parent
            entries.append({
                "title": text,
                "url": full_url,
                "level": depth,
            })
        return entries

    def score_toc_candidate(entries):
        """Score a list of entries on how likely it is to be a real TOC.

        Higher score = more likely to be the actual table of contents.
        """
        if len(entries) < 3:
            return -1

        score = 0
        related_count = 0
        for entry in entries:
            if _url_is_related(entry["url"], base_url):
                related_count += 1

        # Proportion of URLs related to this work (most important signal)
        if len(entries) > 0:
            related_ratio = related_count / len(entries)
            score += related_ratio * 100

        # Bonus for having multiple hierarchy levels (suggests real TOC)
        levels = set(e["level"] for e in entries)
        if len(levels) > 1:
            score += 20

        # Bonus for reasonable count (not too few, not hundreds)
        if 3 <= len(entries) <= 200:
            score += 10

        # Penalty for very short average title length (likely nav)
        avg_title_len = sum(len(e["title"]) for e in entries) / len(entries)
        if avg_title_len < 10:
            score -= 20
        elif avg_title_len > 15:
            score += 10

        return score

    # Strategy 1: Score all <ol>/<ul> lists and pick the best one
    best_entries = []
    best_score = -1

    for list_el in soup.find_all(["ol", "ul"]):
        entries = extract_entries_from_list(list_el)
        if len(entries) < 3:
            continue
        score = score_toc_candidate(entries)
        if score > best_score:
            best_score = score
            best_entries = entries

    if best_entries and best_score >= 30:
        return best_entries

    # Strategy 2: Collect all links on the page that point to related URLs
    body = soup.find("body") or soup
    all_links = body.find_all("a", href=True)
    candidate = []
    for a in all_links:
        href = a.get("href", "")
        text = a.get_text(strip=True)
        if (
            href
            and not href.startswith("#")
            and not href.startswith("javascript")
            and len(text) > 3
            and not _is_navigation_text(text)
        ):
            full_url = urljoin(base_url, href)
            if _is_download_url(full_url):
                continue
            if _url_is_related(full_url, base_url):
                candidate.append({
                    "title": text,
                    "url": full_url,
                    "level": 0,
                })

    if len(candidate) >= 3:
        return candidate

    # Strategy 3: Fall back to any links that aren't navigation
    fallback = []
    for a in all_links:
        href = a.get("href", "")
        text = a.get_text(strip=True)
        if (
            href
            and not href.startswith("#")
            and not href.startswith("javascript")
            and len(text) > 5
            and not _is_navigation_text(text)
        ):
            full_url = urljoin(base_url, href)
            if _is_download_url(full_url):
                continue
            fallback.append({
                "title": text,
                "url": full_url,
                "level": 0,
            })
    if len(fallback) >= 3:
        return fallback

    return []


def detect_headings_structure(soup):
    """Detect structure from heading hierarchy in a single-page work.

    Returns list of dicts: {title, level, element}
    """
    headings = []
    for h in soup.find_all(["h1", "h2", "h3", "h4", "h5"]):
        level = int(h.name[1])
        text = h.get_text(strip=True)
        if text and len(text) > 2:
            headings.append({
                "title": text,
                "level": level,
                "element": h,
            })
    return headings


def extract_section_text(soup, heading_element, next_heading_element=None):
    """Extract text between two heading elements."""
    parts = []
    el = heading_element.next_sibling
    while el:
        if el == next_heading_element:
            break
        if isinstance(el, Tag):
            if el.name and el.name.startswith("h") and el.name[1:].isdigit():
                break
            parts.append(el.get_text(separator=" ", strip=True))
        elif isinstance(el, NavigableString):
            text = str(el).strip()
            if text:
                parts.append(text)
        el = el.next_sibling
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Level naming helpers
# ---------------------------------------------------------------------------

COMMON_LEVEL_NAMES = {
    0: [
        ("part", "Part"),
        ("book", "Book"),
        ("volume", "Volume"),
        ("treatise", "Treatise"),
        ("section", "Section"),
    ],
    1: [
        ("chapter", "Chapter"),
        ("question", "Question"),
        ("article", "Article"),
        ("section", "Section"),
        ("lecture", "Lecture"),
        ("sermon", "Sermon"),
        ("disputation", "Disputation"),
        ("locus", "Locus"),
    ],
    2: [
        ("article", "Article"),
        ("section", "Section"),
        ("paragraph", "Paragraph"),
        ("point", "Point"),
    ],
    3: [
        ("sub-section", "Sub-section"),
        ("point", "Point"),
        ("paragraph", "Paragraph"),
    ],
}


def prompt_level_names(num_levels):
    """Ask the user to name each hierarchical level."""
    print(f"\nThe work has {num_levels} hierarchical level(s).")
    levels = []
    for i in range(num_levels):
        options = COMMON_LEVEL_NAMES.get(i, COMMON_LEVEL_NAMES[1])
        option_strs = [f"{j+1}) {label}" for j, (_, label) in enumerate(options)]
        default_id, default_label = options[0]

        print(f"\n  Level {i+1} (outermost = 1):")
        print(f"    Common names: {', '.join(option_strs)}")
        choice = input(
            f"    Enter level name (or pick 1-{len(options)}) [{default_label}]: "
        ).strip()

        if not choice:
            levels.append({"id": default_id, "label": {"en": default_label}})
        elif choice.isdigit() and 1 <= int(choice) <= len(options):
            idx = int(choice) - 1
            levels.append({
                "id": options[idx][0],
                "label": {"en": options[idx][1]},
            })
        else:
            level_id = re.sub(r"[^a-z0-9]+", "-", choice.lower()).strip("-")
            levels.append({"id": level_id, "label": {"en": choice}})

    return levels


# ---------------------------------------------------------------------------
# Core parsing pipeline
# ---------------------------------------------------------------------------


def parse_toc_based(toc_entries, session):
    """Parse a work that has a TOC page linking to separate chapter pages.

    Returns list of section dicts:
        {title, url, level, content}
    """
    sections = []
    total = len(toc_entries)

    fetch_content = input(
        f"\nFetch content of all {total} sections for topic analysis? "
        f"(y/n) [y]: "
    ).strip().lower()
    fetch_content = fetch_content != "n"

    for i, entry in enumerate(toc_entries):
        content = ""
        if fetch_content:
            print(f"  Fetching [{i+1}/{total}]: {entry['title'][:60]}...", end="", flush=True)
            try:
                page_soup, _ = fetch_page(entry["url"], session)
                body = page_soup.find("body") or page_soup
                content = get_text_content(body)
                # Truncate to ~5000 words for topic matching efficiency
                words = content.split()
                if len(words) > 5000:
                    content = " ".join(words[:5000])
                print(f" ({len(words)} words)")
            except Exception as e:
                print(f" [error: {e}]")
            if i < total - 1:
                time.sleep(REQUEST_DELAY)
        else:
            print(f"  Section [{i+1}/{total}]: {entry['title'][:60]}")

        sections.append({
            "title": entry["title"],
            "url": entry["url"],
            "level": entry["level"],
            "content": content,
        })

    return sections


def parse_headings_based(soup, headings):
    """Parse a single-page work using heading elements.

    Returns list of section dicts:
        {title, url, level, content}
    """
    sections = []
    for i, h in enumerate(headings):
        next_h = headings[i + 1]["element"] if i + 1 < len(headings) else None
        content = extract_section_text(soup, h["element"], next_h)
        words = content.split()
        if len(words) > 5000:
            content = " ".join(words[:5000])

        sections.append({
            "title": h["title"],
            "url": "",
            "level": h["level"],
            "content": content,
        })
        print(f"  Section [{i+1}/{len(headings)}]: {h['title'][:60]} ({len(words)} words)")

    return sections


def organize_hierarchy(sections):
    """Organize flat section list into a tree structure.

    Determines how many distinct levels exist and groups sections
    into parent-child relationships.

    Returns:
        levels: sorted list of distinct level values
        tree: list of dicts with 'section' and 'children' keys
    """
    level_values = sorted(set(s["level"] for s in sections))

    if len(level_values) == 1:
        # All at same level — flat list
        return level_values, [{"section": s, "children": []} for s in sections]

    # Build tree: top-level sections contain their children
    tree = []
    current_parent = None
    top_level = level_values[0]

    for s in sections:
        if s["level"] == top_level:
            current_parent = {"section": s, "children": []}
            tree.append(current_parent)
        else:
            if current_parent is None:
                # Orphan — create a synthetic parent
                current_parent = {
                    "section": {
                        "title": "(Untitled Section)",
                        "url": "",
                        "level": top_level,
                        "content": "",
                    },
                    "children": [],
                }
                tree.append(current_parent)
            current_parent["children"].append({"section": s, "children": []})

    return level_values, tree


# ---------------------------------------------------------------------------
# Interactive metadata collection
# ---------------------------------------------------------------------------


def collect_work_metadata(detected_title=None):
    """Interactively collect work metadata from the user."""
    print("\n--- Work Metadata ---")

    title = input(
        f"  Work title"
        + (f" [{detected_title}]" if detected_title else "")
        + ": "
    ).strip()
    if not title and detected_title:
        title = detected_title

    short_title = input(f"  Short title (abbreviation, e.g. 'ST', 'Institutes'): ").strip()

    work_id = input(
        f"  Work ID (kebab-case, e.g. 'institutes-1559', 'summa'): "
    ).strip()
    if not work_id:
        work_id = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        print(f"    Using auto-generated ID: {work_id}")

    year = input("  Year of original publication: ").strip()
    year = int(year) if year.isdigit() else None

    original_lang = input("  Original language code (la=Latin, en=English, de=German, etc.) [la]: ").strip()
    if not original_lang:
        original_lang = "la"

    return {
        "title": title,
        "short_title": short_title or title,
        "id": work_id,
        "year": year,
        "original_lang": original_lang,
    }


def collect_author_metadata():
    """Interactively collect author information."""
    print("\n--- Author Information ---")

    # Load existing authors
    authors_data = {"authors": []}
    if os.path.exists(AUTHORS_PATH):
        with open(AUTHORS_PATH, "r") as f:
            authors_data = yaml.safe_load(f) or {"authors": []}

    existing = authors_data.get("authors", [])
    if existing:
        print("  Existing authors:")
        for i, a in enumerate(existing):
            print(f"    {i+1}) {a['name']['en']} (id: {a['id']})")
        choice = input(
            f"  Select an existing author (1-{len(existing)}) or press Enter for new: "
        ).strip()
        if choice.isdigit() and 1 <= int(choice) <= len(existing):
            return existing[int(choice) - 1], False  # existing author, no update needed

    # New author
    name = input("  Author's full name (English): ").strip()
    short_name = input(f"  Short name (e.g. 'Calvin', 'Aquinas') [{name.split()[-1] if name else ''}]: ").strip()
    if not short_name and name:
        short_name = name.split()[-1]

    author_id = input(
        f"  Author ID (kebab-case) [{re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') if name else ''}]: "
    ).strip()
    if not author_id and name:
        author_id = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

    tradition = input("  Theological tradition (e.g. Reformed, Roman Catholic, Lutheran): ").strip()

    author = {
        "id": author_id,
        "name": {"en": name},
        "short_name": short_name,
        "tradition": tradition,
    }
    return author, True  # new author, needs to be saved


def collect_edition_metadata(source_url):
    """Collect edition information for the online text."""
    print("\n--- Edition Information ---")
    site_name = input(
        f"  Site name (e.g. 'CCEL', 'EEBO', 'archive.org'): "
    ).strip()

    edition_id = input("  Edition ID (e.g. 'beveridge-1845'): ").strip()
    edition_title = input("  Edition title (leave blank to use work title): ").strip()
    edition_lang = input("  Edition language code [en]: ").strip() or "en"
    translator = input("  Translator (leave blank if original language): ").strip()
    edition_year = input("  Edition year: ").strip()
    edition_year = int(edition_year) if edition_year.isdigit() else None

    parsed_url = urlparse(source_url)
    url_base = f"{parsed_url.scheme}://{parsed_url.netloc}"

    return {
        "site_name": site_name or parsed_url.netloc,
        "edition_id": edition_id,
        "edition_title": edition_title,
        "edition_lang": edition_lang,
        "translator": translator,
        "edition_year": edition_year,
        "url_base": url_base,
    }


# ---------------------------------------------------------------------------
# YAML file generation
# ---------------------------------------------------------------------------


def generate_work_yaml(work_meta, author, edition_meta):
    """Generate _data/works/<work-id>.yaml content."""
    data = {
        "id": work_meta["id"],
        "title": work_meta["title"],
        "short_title": work_meta["short_title"],
        "author": author["id"],
        "year": work_meta["year"],
        "original_lang": work_meta["original_lang"],
    }
    if edition_meta.get("edition_id"):
        edition = {
            "id": edition_meta["edition_id"],
            "title": edition_meta.get("edition_title") or work_meta["title"],
            "lang": edition_meta.get("edition_lang", "en"),
        }
        if edition_meta.get("translator"):
            edition["translator"] = edition_meta["translator"]
        if edition_meta.get("edition_year"):
            edition["year"] = edition_meta["edition_year"]
        data["editions"] = [edition]
    return data


def generate_structure_yaml(work_id, levels, tree):
    """Generate _data/structures/<work-id>.yaml content."""
    data = {
        "work": work_id,
        "structure": {
            "levels": levels,
            "nodes": [],
        },
    }
    nodes = data["structure"]["nodes"]

    if len(levels) == 1:
        # Flat: all sections at one level
        for i, item in enumerate(tree, 1):
            node_id = f"{work_id.replace('-', '')}_{i}"
            item["_node_id"] = node_id
            nodes.append({
                "id": node_id,
                "level": levels[0]["id"],
                "ordinal": i,
            })
    else:
        # Hierarchical: parents and children
        parent_ordinal = 0
        for item in tree:
            parent_ordinal += 1
            parent_id = f"{work_id.replace('-', '')}_{parent_ordinal}"
            item["_node_id"] = parent_id
            nodes.append({
                "id": parent_id,
                "level": levels[0]["id"],
                "ordinal": parent_ordinal,
            })
            for j, child in enumerate(item.get("children", []), 1):
                child_id = f"{work_id.replace('-', '')}_{parent_ordinal}_{j}"
                child["_node_id"] = child_id
                nodes.append({
                    "id": child_id,
                    "level": levels[1]["id"] if len(levels) > 1 else levels[0]["id"],
                    "parent": parent_id,
                    "ordinal": j,
                })

    return data


def generate_titles_yaml(work_id, levels, tree):
    """Generate _data/titles/<work-id>.yaml content."""
    data = {"work": work_id}

    if len(levels) == 1:
        level_key = f"{levels[0]['id']}_titles"
        titles = {}
        for item in tree:
            nid = item.get("_node_id", "")
            title = item["section"]["title"]
            if nid and title:
                titles[nid] = title
        data[level_key] = {"en": titles}
    else:
        # Parent level titles
        parent_key = f"{levels[0]['id']}_titles"
        parent_titles = {}
        for item in tree:
            nid = item.get("_node_id", "")
            title = item["section"]["title"]
            if nid and title and title != "(Untitled Section)":
                parent_titles[nid] = title
        data[parent_key] = {"en": parent_titles}

        # Child level titles
        child_key = f"{levels[1]['id']}_titles"
        child_titles = {}
        for item in tree:
            for child in item.get("children", []):
                nid = child.get("_node_id", "")
                title = child["section"]["title"]
                if nid and title:
                    child_titles[nid] = title
        data[child_key] = {"en": child_titles}

    return data


def generate_links_yaml(work_id, edition_meta, tree):
    """Generate _data/links/<work-id>.yaml content."""
    site_name = edition_meta.get("site_name", "Source")
    data = {
        "work": work_id,
        "sites": {
            site_name: {
                "edition": edition_meta.get("edition_id", ""),
                "url_base": edition_meta.get("url_base", ""),
                "nodes": {},
            }
        },
    }
    nodes = data["sites"][site_name]["nodes"]

    def add_node_link(item):
        nid = item.get("_node_id", "")
        url = item["section"].get("url", "")
        if nid and url:
            nodes[nid] = url

    for item in tree:
        add_node_link(item)
        for child in item.get("children", []):
            add_node_link(child)

    return data


def generate_topics_yaml(work_id, tree, all_topics, keyword_index):
    """Generate _data/topics/<work-id>.yaml content."""
    data = {
        "work": work_id,
        "assignments": [],
    }

    def process_item(item):
        nid = item.get("_node_id", "")
        section = item["section"]
        if not nid:
            return
        topics = assign_topics(
            section["title"],
            section.get("content", ""),
            all_topics,
            keyword_index,
        )
        if topics:
            data["assignments"].append({
                "section_id": nid,
                "topics": topics,
            })

    for item in tree:
        # For parent-level items, only assign topics if they have content
        if item["section"].get("content"):
            process_item(item)
        for child in item.get("children", []):
            process_item(child)

    return data


def write_yaml_file(path, data):
    """Write a YAML file, creating directories as needed."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(yaml_dump(data))
    print(f"  Written: {os.path.relpath(path, REPO_ROOT)}")


def write_work_collection_page(work_id):
    """Write _works/<work-id>.md for the Jekyll collection."""
    os.makedirs(WORKS_COLLECTION_DIR, exist_ok=True)
    path = os.path.join(WORKS_COLLECTION_DIR, f"{work_id}.md")
    with open(path, "w") as f:
        f.write(f"---\nlayout: work\nwork_id: {work_id}\n---\n")
    print(f"  Written: {os.path.relpath(path, REPO_ROOT)}")


def update_authors_yaml(author):
    """Add a new author to authors.yaml if not already present."""
    authors_data = {"authors": []}
    if os.path.exists(AUTHORS_PATH):
        with open(AUTHORS_PATH, "r") as f:
            authors_data = yaml.safe_load(f) or {"authors": []}

    existing_ids = {a["id"] for a in authors_data.get("authors", [])}
    if author["id"] not in existing_ids:
        authors_data["authors"].append(author)
        with open(AUTHORS_PATH, "w") as f:
            f.write(yaml_dump(authors_data))
        print(f"  Updated: {os.path.relpath(AUTHORS_PATH, REPO_ROOT)}")
    else:
        print(f"  Author '{author['id']}' already exists in authors.yaml")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def parse_level_names_arg(levels_str):
    """Parse a comma-separated levels string like 'book,chapter' into level dicts."""
    levels = []
    for name in levels_str.split(","):
        name = name.strip()
        if not name:
            continue
        level_id = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        levels.append({"id": level_id, "label": {"en": name.title()}})
    return levels


def parse_toc_based_batch(toc_entries, session, fetch_content=True):
    """Non-interactive version of parse_toc_based."""
    sections = []
    total = len(toc_entries)

    for i, entry in enumerate(toc_entries):
        content = ""
        if fetch_content:
            print(f"  Fetching [{i+1}/{total}]: {entry['title'][:60]}...", end="", flush=True)
            try:
                page_soup, _ = fetch_page(entry["url"], session)
                body = page_soup.find("body") or page_soup
                content = get_text_content(body)
                words = content.split()
                if len(words) > 5000:
                    content = " ".join(words[:5000])
                print(f" ({len(words)} words)")
            except Exception as e:
                print(f" [error: {e}]")
            if i < total - 1:
                time.sleep(REQUEST_DELAY)
        else:
            print(f"  Section [{i+1}/{total}]: {entry['title'][:60]}")

        sections.append({
            "title": entry["title"],
            "url": entry["url"],
            "level": entry["level"],
            "content": content,
        })

    return sections


def build_arg_parser():
    """Build the argument parser with all CLI options."""
    parser = argparse.ArgumentParser(
        description="Parse a theological text and generate Syntopticon data files.",
        epilog=(
            "When all required options are provided via CLI, the tool runs "
            "non-interactively (suitable for GitHub Actions). Otherwise, it "
            "prompts for missing values."
        ),
    )
    parser.add_argument("url", nargs="?", help="URL of the theological work")

    work = parser.add_argument_group("work metadata")
    work.add_argument("--work-id", help="Work ID in kebab-case (e.g. 'institutes-1559')")
    work.add_argument("--title", help="Full title of the work")
    work.add_argument("--short-title", help="Abbreviated title (e.g. 'ST', 'Institutes')")
    work.add_argument("--year", type=int, help="Year of original publication")
    work.add_argument("--original-lang", default="la",
                       help="Original language code (default: la)")

    author = parser.add_argument_group("author")
    author.add_argument("--author-id", help="Author ID (use existing or create new)")
    author.add_argument("--author-name", help="Author's full name (for new authors)")
    author.add_argument("--author-short-name", help="Author short name (e.g. 'Calvin')")
    author.add_argument("--author-tradition", help="Theological tradition (e.g. Reformed)")

    edition = parser.add_argument_group("edition")
    edition.add_argument("--site-name", help="Source site name (e.g. 'CCEL')")
    edition.add_argument("--edition-id", help="Edition ID (e.g. 'beveridge-1845')")
    edition.add_argument("--edition-lang", default="en", help="Edition language (default: en)")
    edition.add_argument("--translator", help="Translator name")
    edition.add_argument("--edition-year", type=int, help="Edition year")

    structure = parser.add_argument_group("structure")
    structure.add_argument("--levels", help=(
        "Comma-separated hierarchy level names (e.g. 'book,chapter'). "
        "If omitted, auto-detected level count is used with prompts."
    ))
    structure.add_argument("--mode", choices=["toc", "headings"],
                           help="Force structure detection mode")
    structure.add_argument("--no-fetch-content", action="store_true",
                           help="Skip fetching section pages (faster, but no topic analysis)")

    return parser


def main():
    parser = build_arg_parser()
    args = parser.parse_args()

    # Determine if we can run non-interactively
    batch_mode = all([
        args.url,
        args.work_id,
        args.title,
        args.author_id,
    ])

    print("=" * 60)
    print("  Theological Text Parser")
    print("  for the Theological Syntopticon")
    if batch_mode:
        print("  (running in non-interactive mode)")
    print("=" * 60)

    # --- Step 1: Get the URL ---
    url = args.url
    if not url:
        url = input("\nEnter the URL of the theological work: ").strip()
    if not url:
        print("Error: URL is required.")
        sys.exit(1)

    # --- Step 2: Load topic index ---
    print("\nLoading topic definitions...")
    if not os.path.exists(TOPICS_DEFINITIONS_PATH):
        print(f"Error: {TOPICS_DEFINITIONS_PATH} not found.")
        print("Run this tool from the Theological-Syntopticon repository root.")
        sys.exit(1)
    all_topics, keyword_index = build_topic_index(TOPICS_DEFINITIONS_PATH)
    print(f"  Loaded {len(all_topics)} topics with {len(keyword_index)} keywords")

    # --- Step 3: Fetch and analyze the page ---
    print(f"\nFetching {url}...")
    session = requests.Session()
    try:
        soup, final_url = fetch_page(url, session)
    except Exception as e:
        print(f"Error fetching URL: {e}")
        sys.exit(1)

    # Try to detect a title from the page
    page_title = None
    title_tag = soup.find("title")
    if title_tag:
        page_title = title_tag.get_text(strip=True)
    h1 = soup.find("h1")
    if h1:
        page_title = h1.get_text(strip=True)

    print(f"  Page title: {page_title or '(none detected)'}")

    # --- Step 4: Detect structure ---
    toc_entries = detect_toc_links(soup, final_url)
    headings = detect_headings_structure(soup)

    mode = args.mode  # may be None
    if mode is None:
        if batch_mode:
            # Auto-select: prefer TOC if available
            if toc_entries and len(toc_entries) >= 3:
                mode = "toc"
            elif headings and len(headings) >= 3:
                mode = "headings"
        else:
            # Interactive selection
            if toc_entries and len(toc_entries) >= 3:
                print(f"\n  Detected {len(toc_entries)} table-of-contents links")
                for i, entry in enumerate(toc_entries[:10]):
                    indent = "    " + "  " * entry["level"]
                    print(f"{indent}{entry['title'][:70]}")
                if len(toc_entries) > 10:
                    print(f"    ... and {len(toc_entries) - 10} more")

                if headings and len(headings) >= 3:
                    print(f"\n  Also detected {len(headings)} headings on this page")
                    choice = input(
                        "\n  Use (t)able-of-contents links or (h)eadings? [t]: "
                    ).strip().lower()
                    mode = "headings" if choice == "h" else "toc"
                else:
                    use_toc = input("\n  Use these TOC entries? (y/n) [y]: ").strip().lower()
                    mode = "toc" if use_toc != "n" else None

            if mode is None and headings and len(headings) >= 3:
                print(f"\n  Detected {len(headings)} headings on this page")
                for i, h in enumerate(headings[:10]):
                    indent = "    " + "  " * (h["level"] - 1)
                    print(f"{indent}[h{h['level']}] {h['title'][:70]}")
                if len(headings) > 10:
                    print(f"    ... and {len(headings) - 10} more")
                use_h = input("\n  Use these headings? (y/n) [y]: ").strip().lower()
                mode = "headings" if use_h != "n" else None

    if mode is None:
        print("\nCould not auto-detect the work structure from this page.")
        print("Please provide a URL to a table-of-contents page or a page")
        print("with clear heading hierarchy (h1, h2, h3, etc.).")
        sys.exit(1)

    print(f"\n  Using mode: {mode}")

    # --- Step 5: Collect metadata ---
    if batch_mode:
        work_meta = {
            "title": args.title,
            "short_title": args.short_title or args.title,
            "id": args.work_id,
            "year": args.year,
            "original_lang": args.original_lang or "la",
        }

        # Resolve author
        authors_data = {"authors": []}
        if os.path.exists(AUTHORS_PATH):
            with open(AUTHORS_PATH, "r") as f:
                authors_data = yaml.safe_load(f) or {"authors": []}
        existing = {a["id"]: a for a in authors_data.get("authors", [])}

        if args.author_id in existing:
            author = existing[args.author_id]
            is_new_author = False
        else:
            author = {
                "id": args.author_id,
                "name": {"en": args.author_name or args.author_id},
                "short_name": args.author_short_name or (
                    args.author_name.split()[-1] if args.author_name else args.author_id
                ),
                "tradition": args.author_tradition or "",
            }
            is_new_author = True

        parsed_url = urlparse(final_url)
        edition_meta = {
            "site_name": args.site_name or parsed_url.netloc,
            "edition_id": args.edition_id or "",
            "edition_title": "",
            "edition_lang": args.edition_lang or "en",
            "translator": args.translator or "",
            "edition_year": args.edition_year,
            "url_base": f"{parsed_url.scheme}://{parsed_url.netloc}",
        }
    else:
        work_meta = collect_work_metadata(detected_title=page_title)
        author, is_new_author = collect_author_metadata()
        edition_meta = collect_edition_metadata(final_url)

    # --- Step 6: Parse sections ---
    print("\n--- Parsing Sections ---")
    if mode == "toc":
        if batch_mode:
            sections = parse_toc_based_batch(
                toc_entries, session,
                fetch_content=not args.no_fetch_content,
            )
        else:
            sections = parse_toc_based(toc_entries, session)
    else:
        sections = parse_headings_based(soup, headings)

    # --- Step 7: Organize hierarchy ---
    level_values, tree = organize_hierarchy(sections)
    num_levels = len(level_values)

    print(f"\n  Found {num_levels} hierarchical level(s)")
    if num_levels >= 2:
        parent_count = len(tree)
        child_count = sum(len(item["children"]) for item in tree)
        print(f"  Top-level sections: {parent_count}")
        print(f"  Sub-sections: {child_count}")
    else:
        print(f"  Total sections: {len(tree)}")

    if args.levels:
        levels = parse_level_names_arg(args.levels)
        # Pad or trim to match detected level count
        while len(levels) < num_levels:
            default = COMMON_LEVEL_NAMES.get(len(levels), COMMON_LEVEL_NAMES[1])[0]
            levels.append({"id": default[0], "label": {"en": default[1]}})
        levels = levels[:num_levels]
    elif batch_mode:
        # Use sensible defaults
        levels = []
        for i in range(num_levels):
            default = COMMON_LEVEL_NAMES.get(i, COMMON_LEVEL_NAMES[1])[0]
            levels.append({"id": default[0], "label": {"en": default[1]}})
    else:
        levels = prompt_level_names(num_levels)

    print(f"  Levels: {', '.join(l['label']['en'] for l in levels)}")

    # --- Step 8: Generate node IDs ---
    struct_data = generate_structure_yaml(work_meta["id"], levels, tree)

    # --- Step 9: Assign topics ---
    print("\n--- Assigning Topics ---")
    topics_data = generate_topics_yaml(
        work_meta["id"], tree, all_topics, keyword_index
    )
    assigned_count = len(topics_data["assignments"])
    print(f"  Assigned topics to {assigned_count} section(s)")
    for assignment in topics_data["assignments"][:5]:
        topic_names = [
            all_topics[t]["name"]
            for t in assignment["topics"]
            if t in all_topics
        ]
        print(f"    {assignment['section_id']}: {', '.join(topic_names)}")
    if assigned_count > 5:
        print(f"    ... and {assigned_count - 5} more")

    # --- Step 10: Generate files ---
    print("\n--- Generating Files ---")
    wid = work_meta["id"]

    # works/<id>.yaml
    work_data = generate_work_yaml(work_meta, author, edition_meta)
    write_yaml_file(os.path.join(DATA_DIR, "works", f"{wid}.yaml"), work_data)

    # structures/<id>.yaml
    write_yaml_file(
        os.path.join(DATA_DIR, "structures", f"{wid}.yaml"), struct_data
    )

    # titles/<id>.yaml
    titles_data = generate_titles_yaml(wid, levels, tree)
    write_yaml_file(os.path.join(DATA_DIR, "titles", f"{wid}.yaml"), titles_data)

    # links/<id>.yaml
    links_data = generate_links_yaml(wid, edition_meta, tree)
    write_yaml_file(os.path.join(DATA_DIR, "links", f"{wid}.yaml"), links_data)

    # topics/<id>.yaml
    write_yaml_file(os.path.join(DATA_DIR, "topics", f"{wid}.yaml"), topics_data)

    # _works/<id>.md
    write_work_collection_page(wid)

    # Update authors.yaml if needed
    if is_new_author:
        update_authors_yaml(author)

    print("\n" + "=" * 60)
    print("  Done! Files generated successfully.")
    print(f"  View the work at: /works/{wid}/")
    print("=" * 60)


if __name__ == "__main__":
    main()
