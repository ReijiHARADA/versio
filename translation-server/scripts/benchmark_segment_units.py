"""Measure translation latency per shared semantic unit without changing production.

Usage: python scripts/benchmark_segment_units.py /path/to/source.txt --url http://127.0.0.1:8765
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path

from engines.segmenter import segment_for_translation


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    parser.add_argument("--timeout", type=float, default=90.0)
    args = parser.parse_args()
    source = args.source.read_text(encoding="utf-8")
    units = segment_for_translation(source)
    rows = []
    for index, unit in enumerate(units):
        payload = json.dumps({"text": unit.model_input, "source_language": "en", "target_language": "ja"}).encode()
        request = urllib.request.Request(
            f"{args.url.rstrip('/')}/translate", data=payload,
            headers={"content-type": "application/json"}, method="POST",
        )
        started = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=args.timeout) as response:
                result = json.loads(response.read())
            rows.append({"index": index, "source": unit.text, "chars": len(unit.text),
                         "latency_s": round(time.monotonic() - started, 3),
                         "error": result.get("error"), "translation": result.get("text", "")})
        except Exception as error:  # diagnostic: preserve the failing unit and continue
            rows.append({"index": index, "source": unit.text, "chars": len(unit.text),
                         "latency_s": round(time.monotonic() - started, 3), "error": str(error)})
    print(json.dumps({"unit_count": len(units), "source_chars": len(source), "units": rows}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
