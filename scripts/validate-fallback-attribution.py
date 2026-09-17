#!/usr/bin/env python3
"""Validate the persisted ordinary-body fallback attribution inventory.

This is deliberately a data-quality check: it does not reinterpret model
outputs or change acceptance policy.  It prevents a partial/stale inventory
from being presented as complete evidence for the next experiment.
"""
from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "test-data/real-papers/reports/translation-fallback-attribution.json"
configured_report = os.environ.get("TRANSLATION_AUDIT_REPORT")
default_report = "translation-audit-fresh-v1.json" if (ROOT / "test-data/real-papers/reports/translation-audit-fresh-v1.json").exists() else "translation-audit.json"
CURRENT_REPORT = ROOT / "test-data/real-papers/reports" / (configured_report or default_report)
REQUIRED = {
    "paperId", "blockId", "pageStart", "pageEnd", "role", "source",
    "fallbackReason", "diagnostics", "attribution", "sourceIntegrity",
}
ALLOWED = {"A", "B", "C", "D", "E", "F", "G"}


def main() -> None:
    payload = json.loads(REPORT.read_text(encoding="utf-8"))
    failures = payload.get("failures")
    if not isinstance(failures, list) or not failures:
        raise SystemExit("fallback attribution report has no failures list")
    missing: list[str] = []
    warnings: list[str] = []
    causes: Counter[str] = Counter()
    for row in failures:
        row_id = f"{row.get('paperId')}/{row.get('blockId')}"
        absent = sorted(REQUIRED - row.keys())
        if absent:
            missing.append(f"{row_id}: missing {', '.join(absent)}")
        cause = row.get("attribution", {}).get("primary")
        if cause not in ALLOWED:
            missing.append(f"{row_id}: invalid primaryCause {cause!r}")
        else:
            causes[cause] += 1
        if not str(row.get("source", "")).strip():
            missing.append(f"{row_id}: empty source")
        if not row.get("diagnostics"):
            warnings.append(f"{row_id}: diagnostics are empty; manual evidence still required")
        if not str(row.get("attribution", {}).get("basis", "")).strip():
            warnings.append(f"{row_id}: attribution basis is empty; manual evidence still required")
    if missing:
        raise SystemExit("\n".join(missing))
    print(f"validated {len(failures)} fallback rows")
    print("primary causes: " + ", ".join(f"{key}={causes[key]}" for key in sorted(causes)))
    if CURRENT_REPORT.exists():
        current = json.loads(CURRENT_REPORT.read_text(encoding="utf-8"))
        current_ids = {
            (paper["paper"]["id"], row["blockId"])
            for paper in current.get("papers", [])
            for row in paper.get("rows", [])
            if row.get("sourceCategory") == "ordinary-body-prose"
            and (row.get("readerVisibleFallback") or row.get("sourceFallback"))
        }
        historical_ids = {(row.get("paperId"), row.get("blockId")) for row in failures}
        stale = historical_ids - current_ids
        print(f"current benchmark ordinary fallback rows: {len(current_ids)}")
        if stale:
            print(f"WARNING: {len(stale)} persisted attribution row(s) are no longer current: {sorted(stale)}")
    for warning in warnings:
        print(f"WARNING: {warning}")


if __name__ == "__main__":
    main()
