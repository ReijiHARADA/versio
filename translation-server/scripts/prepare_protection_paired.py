"""Prepare a hash-stable whole-vs-segmented protection benchmark input.

This is diagnostic-only. It does not call the model or alter production
translation. Both arms are derived from one source audit report so later
model runs can be compared without mixing report generations.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))

from engines.segmenter import segment_for_translation  # noqa: E402


def source_hash(text: str) -> str:
    normalized = " ".join(text.split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-report", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()
    report = args.source_report if args.source_report.is_absolute() else REPO / args.source_report
    out = args.out if args.out.is_absolute() else REPO / args.out
    data = json.loads(report.read_text(encoding="utf-8"))
    rows = []
    seen: set[str] = set()
    for paper in data.get("papers", []):
        for row in paper.get("rows", []):
            if row.get("sourceCategory") != "ordinary-body-prose" or row.get("sourceIntegrity") != "clean":
                continue
            source = str(row.get("source", "")).strip()
            if len(source) < 70:
                continue
            digest = source_hash(source)
            if digest in seen:
                continue
            seen.add(digest)
            units = segment_for_translation(source)
            rows.append({
                "paperId": row.get("paperId"),
                "key": row.get("key"),
                "sourceHash": digest,
                "source": source,
                "whole": {"text": source, "chars": len(source)},
                "segments": [
                    {"index": i, "text": unit.text, "chars": len(unit.text)}
                    for i, unit in enumerate(units)
                ],
                "segmentRoundTrip": " ".join(unit.text for unit in units).split() == source.split(),
            })
            if len(rows) >= args.limit:
                break
        if len(rows) >= args.limit:
            break
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": "protection-paired-input-v1",
        "sourceReport": str(report),
        "normalization": "whitespace token sequence only",
        "rows": rows,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(out)
    print(f"rows={len(rows)} roundtrip={sum(r['segmentRoundTrip'] for r in rows)}/{len(rows)}")


if __name__ == "__main__":
    main()
