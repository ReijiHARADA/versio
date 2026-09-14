#!/usr/bin/env python3
"""Create a compact, reproducible summary of the fallback attribution report."""
from __future__ import annotations
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "test-data/real-papers/reports/translation-fallback-attribution.json"
OUTPUT = ROOT / "test-data/real-papers/reports/translation-fallback-attribution-summary-v77.json"

def main() -> None:
    failures = json.loads(SOURCE.read_text(encoding="utf-8"))["failures"]
    causes = Counter(row["attribution"]["primary"] for row in failures)
    integrity = Counter(row["sourceIntegrity"]["status"] for row in failures)
    reasons = Counter(row["fallbackReason"] for row in failures)
    summary = {
        "sourceReport": str(SOURCE.relative_to(ROOT)),
        "failureCount": len(failures),
        "primaryCauseCounts": dict(sorted(causes.items())),
        "sourceIntegrityCounts": dict(sorted(integrity.items())),
        "fallbackReasonCounts": dict(sorted(reasons.items())),
        "manualReviewRequired": True,
        "productMetric": {"ordinaryFallbacks": 14, "ordinaryRows": 48, "rate": 14 / 48},
    }
    OUTPUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(OUTPUT)
    print(json.dumps(summary, ensure_ascii=False))

if __name__ == "__main__":
    main()
