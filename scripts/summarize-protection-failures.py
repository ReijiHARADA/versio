#!/usr/bin/env python3
"""Summarize protection-related rows from the authoritative fallback triage.

This is an audit helper. It never changes translation routing or quality gates.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("test-data/real-papers/reports/translation-failure-triage-v1.json"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("test-data/real-papers/reports/protection-failure-triage-v1.json"),
    )
    args = parser.parse_args()
    rows = json.loads(args.input.read_text())["rows"]
    selected = [row for row in rows if row.get("category") == "server-or-protection"]

    buckets: Counter[str] = Counter()
    for row in selected:
        reason = row.get("fallbackReason") or ""
        if "protected_token_restore_failed" in reason:
            bucket = "protected_token_restore_failed"
        elif "translation_quality_rejected" in reason:
            bucket = "translation_quality_rejected"
        elif "engine_exception" in reason:
            bucket = "engine_exception"
        else:
            bucket = "other"
        buckets[bucket] += 1

    restore_rows = [
        {
            "key": row.get("key"),
            "paperId": row.get("paperId"),
            "discipline": row.get("discipline"),
            "sourceIntegrity": row.get("sourceIntegrity"),
            "source": row.get("source", ""),
            "fallbackReason": row.get("fallbackReason"),
        }
        for row in selected
        if "protected_token_restore_failed" in (row.get("fallbackReason") or "")
    ]
    result = {
        "version": "protection-failure-triage-v1",
        "source": str(args.input),
        "scope": "audit-only; no production routing or quality-gate changes",
        "serverProtectionRows": len(selected),
        "buckets": dict(sorted(buckets.items())),
        "protectedTokenRestoreRows": restore_rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"serverProtectionRows": len(selected), "buckets": dict(buckets)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
