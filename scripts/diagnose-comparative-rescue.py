#!/usr/bin/env python3
"""Replay one known comparative-statistics unit against a running server.

Diagnostic-only: it never changes production configuration or cached translations.
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="http://127.0.0.1:8765")
    parser.add_argument("--input", default="test-data/real-papers/reports/focused-cohort-current-v1.json")
    parser.add_argument("--key", default="dont-mind-me:b-4c16bae3")
    parser.add_argument("--output", default="test-data/real-papers/reports/server-stat-unit-diagnostic-replay.json")
    args = parser.parse_args()
    report = json.loads(Path(args.input).read_text())
    row = next(row for paper in report["papers"] for row in paper.get("rows", []) if row.get("key") == args.key)
    payload = json.dumps({"text": row["source"], "source_language": "en", "target_language": "ja"}).encode()
    request = urllib.request.Request(f"{args.endpoint.rstrip('/')}/translate", data=payload, headers={"Content-Type": "application/json"})
    started = time.time()
    with urllib.request.urlopen(request, timeout=300) as response:
        result = json.load(response)
    result.update({"key": args.key, "source": row["source"], "elapsedMs": round((time.time() - started) * 1000)})
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: result.get(k) for k in ("key", "fallback_stage", "fallback_reason", "unit_fallback_indices", "elapsedMs")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
