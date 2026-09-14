#!/usr/bin/env python3
"""Fill empty fallback diagnostics from already persisted extraction matches."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "test-data/real-papers/reports/translation-fallback-attribution.json"

def main() -> None:
    data = json.loads(REPORT.read_text(encoding="utf-8"))
    changed = 0
    for row in data.get("failures", []):
        if row.get("diagnostics"):
            continue
        matches = row.get("matches") or []
        lines = [line for match in matches for line in match.get("lines", [])]
        row["diagnostics"] = {
            "evidenceSource": "persisted extraction matches",
            "matchCount": len(matches),
            "lineCount": len(lines),
            "columns": sorted({line.get("column") for line in lines if line.get("column")}),
            "pages": sorted({line.get("page") for line in lines if line.get("page") is not None}),
            "bbox": [match.get("bbox") for match in matches if match.get("bbox")],
            "manualReviewRequired": True,
        }
        changed += 1
    REPORT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"enriched {changed} rows")

if __name__ == "__main__":
    main()
