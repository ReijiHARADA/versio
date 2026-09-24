"""Normalize historical audit rows and count source-integrity signals.

This is audit-only. It deliberately does not repair text or change production
classification; it creates a stable, deduplicated view across report
generations whose JSON envelopes differ.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

SIGNALS = {
    # High-precision marker for a dropped token in native extraction.  Keep
    # this narrower than generic article/conjunction checks because phrases
    # such as "a or b" are grammatical.
    "impossible_the_of": re.compile(r"\bthe\s+of\b", re.I),
    "spaced_thousands": re.compile(r"\b\d{1,3},\s+\d{3}\b"),
    "joined_count_word": re.compile(r"\b\d{1,3}\s+\d{3,4}(?:studies|participants|patients)\b", re.I),
    "starts_continuation": re.compile(r"^[a-z]"),
    "ends_continuation": re.compile(r"\b(?:and|or|to|of|with|that|which|one)\s*$", re.I),
}


def rows_from_report(data: object):
    if not isinstance(data, dict):
        return
    papers = data.get("papers")
    if not isinstance(papers, list):
        return
    for paper in papers:
        if not isinstance(paper, dict):
            continue
        nested_paper = paper.get("paper") if isinstance(paper.get("paper"), dict) else {}
        paper_id = str(paper.get("paperId") or paper.get("id") or nested_paper.get("id") or "")
        rows = paper.get("rows")
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            row_paper_id = str(row.get("paperId") or paper_id)
            source = str(row.get("source") or row.get("original") or "").strip()
            if not source:
                continue
            block_id = str(row.get("blockId") or row.get("key") or "")
            source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]
            yield {
                "paperId": row_paper_id,
                "blockId": block_id,
                "sourceHash": source_hash,
                "source": source,
                "sourceCategory": row.get("sourceCategory"),
                "report": row.get("benchmarkRunId"),
            }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reports-dir", type=Path, default=Path("test-data/real-papers/reports"))
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    unique: dict[tuple[str, str, str], dict] = {}
    for path in sorted(args.reports_dir.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        for row in rows_from_report(data) or ():
            key = (row["paperId"], row["blockId"], row["sourceHash"])
            unique.setdefault(key, {**row, "reports": []})["reports"].append(path.name)
    counts = {name: 0 for name in SIGNALS}
    by_category: dict[str, dict[str, int]] = {}
    examples_by_category: dict[str, list[dict]] = {}
    examples: dict[str, dict] = {}
    for row in unique.values():
        category = str(row.get("sourceCategory") or "unknown")
        category_counts = by_category.setdefault(category, {name: 0 for name in SIGNALS})
        for name, pattern in SIGNALS.items():
            if pattern.search(row["source"]):
                counts[name] += 1
                category_counts[name] += 1
                bucket = examples_by_category.setdefault(category, [])
                if len(bucket) < 20:
                    bucket.append({"signal": name, "paperId": row["paperId"], "source": row["source"][:300]})
                examples.setdefault(name, {"paperId": row["paperId"], "source": row["source"][:300]})
    result = {"version": "source-integrity-audit-v1", "uniqueRows": len(unique), "signalCounts": counts, "signalCountsByCategory": by_category, "examples": examples, "examplesByCategory": examples_by_category}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(args.out)


if __name__ == "__main__":
    main()
