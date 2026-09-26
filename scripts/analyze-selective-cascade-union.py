#!/usr/bin/env python3
"""Audit-only comparison of alternate-model cascade decisions."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def load(path: Path) -> dict[str, dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {str(row["key"]): row for row in data.get("results", [])}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qwen", type=Path, required=True)
    parser.add_argument("--gemma", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    qwen = load(args.qwen)
    gemma = load(args.gemma)
    keys = sorted(set(qwen) | set(gemma))
    rows = []
    for key in keys:
        q = qwen.get(key, {})
        g = gemma.get(key, {})
        q_ok = bool(q.get("accepted"))
        g_ok = bool(g.get("accepted"))
        q_reasons = (q.get("alternateQuality") or q.get("quality") or {}).get("reasons", [])
        g_reasons = (g.get("alternateQuality") or g.get("quality") or {}).get("reasons", [])
        rows.append({
            "key": key,
            "qwenAccepted": q_ok,
            "gemmaAccepted": g_ok,
            "unionAccepted": q_ok or g_ok,
            "intersectionAccepted": q_ok and g_ok,
            "qwenReasons": q_reasons,
            "gemmaReasons": g_reasons,
        })
    summary = {
        "version": "selective-cascade-union-v1",
        "qwenSource": str(args.qwen),
        "gemmaSource": str(args.gemma),
        "sampleCount": len(rows),
        "qwenAccepted": sum(r["qwenAccepted"] for r in rows),
        "gemmaAccepted": sum(r["gemmaAccepted"] for r in rows),
        "unionAccepted": sum(r["unionAccepted"] for r in rows),
        "intersectionAccepted": sum(r["intersectionAccepted"] for r in rows),
        "rows": rows,
        "diagnosticOnly": True,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(args.out)


if __name__ == "__main__":
    main()
