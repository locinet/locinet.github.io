import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import csv
import xml.etree.ElementTree as ET
from collections import deque
import time

START_URL = "https://confessionallyreformed.wordpress.com/"
SITEMAP_URL = START_URL + "sitemap.xml"
DOMAIN = urlparse(START_URL).netloc

SKIP_PATTERNS = ["/topics/", "/categories/", "?like_comment"]

# --- DEBUG MODE ---
DEBUG_ONE_PAGE = False   # set False to crawl whole site

visited = set()
results = []

# Seed queue from sitemap to discover all pages
print(f"Fetching sitemap: {SITEMAP_URL}")
try:
    sitemap_resp = requests.get(SITEMAP_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
    sitemap_resp.raise_for_status()
    root = ET.fromstring(sitemap_resp.text)
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    sitemap_urls = [loc.text for loc in root.findall(".//s:loc", ns)]
    print(f"  Found {len(sitemap_urls)} URLs in sitemap")
except Exception as e:
    print(f"  Failed to fetch sitemap: {e}, falling back to homepage")
    sitemap_urls = [START_URL]

queue = deque(sitemap_urls)

def is_internal(url):
    parsed = urlparse(url)
    return parsed.netloc == DOMAIN or parsed.netloc == ""

def should_skip(url):
    return any(pat in url for pat in SKIP_PATTERNS)

def walk_toc_list(ol_or_ul, prefix=""):
    """Walk nested ol/ul TOC lists, yielding (section_num, text, href) tuples."""
    counter = 0
    for li in ol_or_ul.find_all("li", recursive=False):
        counter += 1
        section_num = f"{prefix}{counter}" if prefix else str(counter)

        a = li.find("a", class_="wp-block-table-of-contents__entry", recursive=False)
        if a:
            text = a.get_text(strip=True)
            href = a.get("href", "")
            yield (section_num, text, href)

        # Recurse into nested lists
        nested = li.find(["ol", "ul"], recursive=False)
        if nested:
            yield from walk_toc_list(nested, prefix=section_num + ".")

headers = {
    "User-Agent": "Mozilla/5.0 (compatible; TOC-Crawler/1.0)"
}

while queue:
    url = queue.popleft()

    if url in visited or should_skip(url):
        continue

    print(f"\nScraping: {url}")

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
    except Exception as e:
        print(f"Failed to fetch {url}: {e}")
        continue

    visited.add(url)

    soup = BeautifulSoup(resp.text, "html.parser")

    # Find the list containing TOC entries (may be in a <nav> or directly in content)
    toc_nav = soup.find("nav", class_="wp-block-table-of-contents")
    if toc_nav:
        top_list = toc_nav.find(["ol", "ul"])
    else:
        # Find the first ul/ol that contains a TOC entry link
        first_entry = soup.select_one("a.wp-block-table-of-contents__entry")
        if first_entry:
            top_list = first_entry.find_parent(["ol", "ul"])
            # Walk up to the outermost list (skip nested sub-lists)
            while top_list:
                parent_list = top_list.find_parent(["ol", "ul"])
                if parent_list and parent_list.find("a", class_="wp-block-table-of-contents__entry"):
                    top_list = parent_list
                else:
                    break
        else:
            top_list = None

    if top_list:
        entries = list(walk_toc_list(top_list))
        print(f"  Found {len(entries)} TOC entries")
        for section_num, text, href in entries:
            entry_url = urljoin(url, href)
            results.append(["", section_num, url, text, entry_url])
            print(f"    {section_num} → {text[:60]}")

    # --- stop early if debugging one page ---
    if DEBUG_ONE_PAGE:
        break

    # --- Enqueue other internal links ---
    for link in soup.find_all("a", href=True):
        next_url = urljoin(url, link["href"])

        if "#" in next_url:
            next_url = next_url.split("#")[0]

        if is_internal(next_url) and next_url not in visited and not should_skip(next_url):
            queue.append(next_url)

    time.sleep(0.5)

# --- Write CSV ---
with open("crtoc_entries.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["work-id", "section_num", "page_url", "section_title", "section_url"])
    writer.writerows(results)

print(f"\nDone. Scraped {len(results)} total TOC entries.")
