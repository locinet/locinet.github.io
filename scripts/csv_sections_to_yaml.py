#!/usr/bin/env python3
"""
Generate YAML snippets (`sections` + `section_urls`) from a CSV file.

Required CSV columns:
- work-id
- section_num
- page_url
- section_title
- section_url
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Tuple


REQUIRED_FIELDS = ["work-id", "section_num", "page_url", "section_title", "section_url"]
SECTION_NUM_RE = re.compile(r"^\d+(?:\.\d+)*\.?$")


@dataclass
class Row:
    work_id: str
    section_num: str
    section_title: str
    url: str


@dataclass
class Node:
    key: str
    section_num: str
    title: str
    url: str
    children: List["Node"] = field(default_factory=list)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create per-work YAML snippets with `sections` and `section_urls`."
    )
    parser.add_argument("csv_path", type=Path, help="Input CSV path")
    parser.add_argument(
        "--works-dir",
        type=Path,
        default=Path("works"),
        help="Output directory for snippet files (default: works)",
    )
    parser.add_argument(
        "--suffix",
        default=".sections.yaml",
        help="Output filename suffix appended to work-id (default: .sections.yaml)",
    )
    return parser.parse_args()


def q(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def section_key(section_num: str) -> str:
    return "s" + "_".join(section_num.split("."))


def normalize_field_name(name: str) -> str:
    return name.strip().lower().replace("_", "-").replace(" ", "-")


def parse_csv(csv_path: Path) -> Dict[str, List[Row]]:
    grouped: Dict[str, List[Row]] = {}
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            raise ValueError("CSV has no header row.")

        field_map = {normalize_field_name(name): name for name in reader.fieldnames}
        missing = [name for name in REQUIRED_FIELDS if normalize_field_name(name) not in field_map]
        if missing:
            raise ValueError(f"Missing required CSV field(s): {', '.join(missing)}")

        work_id_field = field_map[normalize_field_name("work-id")]
        section_num_field = field_map[normalize_field_name("section_num")]
        page_url_field = field_map[normalize_field_name("page_url")]
        section_title_field = field_map[normalize_field_name("section_title")]
        section_url_field = field_map[normalize_field_name("section_url")]

        for i, raw in enumerate(reader, start=2):
            work_id = (raw.get(work_id_field) or "").strip()
            section_num = (raw.get(section_num_field) or "").strip().rstrip(".")
            section_title = (raw.get(section_title_field) or "").strip()
            section_url = (raw.get(section_url_field) or "").strip()
            page_url = (raw.get(page_url_field) or "").strip()

            if not work_id:
                raise ValueError(f"Row {i}: `work-id` is required.")
            if not section_num:
                raise ValueError(f"Row {i}: `section_num` is required.")
            if not SECTION_NUM_RE.match(section_num):
                raise ValueError(
                    f"Row {i}: invalid `section_num` {section_num!r}. Use numeric hierarchy like 1, 1.1, 1.1.1."
                )
            if not section_title:
                raise ValueError(f"Row {i}: `section_title` is required.")
            url = section_url or page_url
            if not url:
                raise ValueError(
                    f"Row {i}: provide either `section_url` or `page_url`."
                )

            grouped.setdefault(work_id, []).append(
                Row(
                    work_id=work_id,
                    section_num=section_num,
                    section_title=section_title,
                    url=url,
                )
            )
    return grouped


def sort_key(section_num: str) -> Tuple[int, ...]:
    return tuple(int(part) for part in section_num.split("."))


def build_tree(rows: List[Row]) -> List[Node]:
    rows_sorted = sorted(rows, key=lambda r: sort_key(r.section_num))
    nodes: Dict[Tuple[int, ...], Node] = {}
    roots: List[Node] = []

    for row in rows_sorted:
        path = sort_key(row.section_num)
        if path in nodes:
            raise ValueError(f"Duplicate `section_num` detected: {row.section_num}")

        node = Node(
            key=section_key(row.section_num),
            section_num=row.section_num,
            title=row.section_title,
            url=row.url,
        )
        nodes[path] = node

        if len(path) == 1:
            roots.append(node)
            continue

        parent_path = path[:-1]
        parent = nodes.get(parent_path)
        if parent is None:
            raise ValueError(
                f"Missing parent for section {row.section_num}. Expected parent {'.'.join(str(i) for i in parent_path)}."
            )
        parent.children.append(node)

    return roots


def emit_sections(nodes: List[Node], indent: str = "") -> List[str]:
    lines: List[str] = []
    for node in nodes:
        lines.append(f"{indent}- {node.key}: {q(node.title)}")
        if node.children:
            lines.append(f"{indent}  sections:")
            lines.extend(emit_sections(node.children, indent + "    "))
    return lines


def collect_preorder(nodes: List[Node]) -> List[Node]:
    result: List[Node] = []
    for node in nodes:
        result.append(node)
        result.extend(collect_preorder(node.children))
    return result


def render_snippet(roots: List[Node]) -> str:
    lines: List[str] = ["sections:"]
    lines.extend(emit_sections(roots, indent="  "))
    lines.append("section_urls:")
    for node in collect_preorder(roots):
        lines.append(f"  - {node.key}: {q(node.url)}")
    lines.append("")
    return "\n".join(lines)


def write_outputs(grouped_rows: Dict[str, List[Row]], works_dir: Path, suffix: str) -> int:
    works_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for work_id in sorted(grouped_rows.keys()):
        roots = build_tree(grouped_rows[work_id])
        out_path = works_dir / f"{work_id}{suffix}"
        out_path.write_text(render_snippet(roots), encoding="utf-8")
        count += 1
    return count


def main() -> int:
    args = parse_args()
    grouped = parse_csv(args.csv_path)
    written = write_outputs(grouped, args.works_dir, args.suffix)
    print(f"Wrote {written} snippet file(s) to {args.works_dir}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
