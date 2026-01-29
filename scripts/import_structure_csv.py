import csv
import yaml
from collections import defaultdict
from pathlib import Path
import sys

# -------------------------
# Paths (adjusted for /scripts location)
# -------------------------
SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent

CSV_PATH = REPO_ROOT / "csv" / "structure.csv"
OUT_DIR_STRUCTURES = REPO_ROOT / "data" / "structures"
OUT_DIR_TITLES = REPO_ROOT / "data" / "titles"
OUT_DIR_LINKS = REPO_ROOT / "data" / "links"

# Ensure output directories exist
OUT_DIR_STRUCTURES.mkdir(parents=True, exist_ok=True)
OUT_DIR_TITLES.mkdir(parents=True, exist_ok=True)
OUT_DIR_LINKS.mkdir(parents=True, exist_ok=True)

# -------------------------
# Required CSV columns
# -------------------------
REQUIRED_COLUMNS = {
    "work_id",
    "node_id",
    "parent_id",
    "level_id",
    "ordinal",
    "lang",
    "title",
    "site",
    "url",
}

def fail(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)

def validate_columns(fieldnames):
    missing = REQUIRED_COLUMNS - set(fieldnames)
    if missing:
        fail(f"CSV is missing columns: {', '.join(sorted(missing))}")

# -------------------------
# Main importer
# -------------------------
def main():
    if not CSV_PATH.exists():
        fail(f"CSV file not found: {CSV_PATH}")

    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        validate_columns(reader.fieldnames)
        rows = list(reader)

    # Group rows by work_id
    works = defaultdict(list)
    for row in rows:
        works[row["work_id"]].append(row)

    for work_id, work_rows in works.items():
        build_work_yaml(work_id, work_rows)

def build_work_yaml(work_id, rows):
    # -------------------------
    # Data containers
    # -------------------------
    nodes = {}
    level_ordinals = {}

    titles = defaultdict(dict)    # titles[lang][node_id] = title
    links = defaultdict(dict)     # links[site][node_id] = url

    # -------------------------
    # Process CSV rows
    # -------------------------
    for row in rows:
        node_id = row["node_id"].strip()
        if not node_id:
            fail(f"Empty node_id in work {work_id}")

        # Initialize node
        nodes.setdefault(node_id, {
            "id": node_id,
            "level": row["level_id"].strip(),
            "ordinal": int(row["ordinal"]),
        })

        node = nodes[node_id]

        parent_id = row["parent_id"].strip()
        if parent_id:
            node["parent"] = parent_id

        # Track level ordinals
        lvl = row["level_id"].strip()
        level_ordinals[lvl] = min(level_ordinals.get(lvl, int(row["ordinal"])), int(row["ordinal"]))

        # Titles
        lang = row["lang"].strip()
        title = row["title"].strip()
        if lang and title:
            titles[lang][node_id] = title

        # Links
        site = row["site"].strip()
        url = row["url"].strip()
        if site and url:
            links[site][node_id] = url

    # -------------------------
    # Validate parent references
    # -------------------------
    for node in nodes.values():
        if "parent" in node and node["parent"] not in nodes:
            fail(f"Parent '{node['parent']}' not found for node '{node['id']}' in work '{work_id}'")

    # -------------------------
    # Build levels YAML
    # -------------------------
    levels = [
        {"id": lvl, "ordinal": ord_}
        for lvl, ord_ in sorted(level_ordinals.items(), key=lambda x: x[1])
    ]

    # -------------------------
    # Sort nodes for output
    # -------------------------
    def node_sort_key(n):
        return (n.get("parent", ""), n["ordinal"], n["id"])

    sorted_nodes = sorted(nodes.values(), key=node_sort_key)

    # -------------------------
    # Write structure YAML
    # -------------------------
    structure_out = {
        "structure": {
            "levels": levels,
            "nodes": sorted_nodes,
        }
    }

    with (OUT_DIR_STRUCTURES / f"{work_id}.yaml").open("w", encoding="utf-8") as f:
        yaml.safe_dump(structure_out, f, sort_keys=False, allow_unicode=True)

    # -------------------------
    # Write titles YAML
    # -------------------------
    titles_out = {"chapter_titles": titles}
    with (OUT_DIR_TITLES / f"{work_id}.yaml").open("w", encoding="utf-8") as f:
        yaml.safe_dump(titles_out, f, sort_keys=False, allow_unicode=True)

    # -------------------------
    # Write links YAML
    # -------------------------
    links_out = {"sites": {}}
    for site, nodes_map in links.items():
        links_out["sites"][site] = {"nodes": nodes_map}

    with (OUT_DIR_LINKS / f"{work_id}.yaml").open("w", encoding="utf-8") as f:
        yaml.safe_dump(links_out, f, sort_keys=False, allow_unicode=True)

    print(f"Generated YAML for work: {work_id}")

# -------------------------
# Run main
# -------------------------
if __name__ == "__main__":
    main()
