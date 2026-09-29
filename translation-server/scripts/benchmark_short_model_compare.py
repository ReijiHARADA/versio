#!/usr/bin/env python3
"""Compare MADLAD and an Ollama model on short, source-preserving fixtures.

This is an audit tool only. It intentionally caps each fixture and writes after
every row so one slow request cannot erase the comparison record.
"""
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.request
from pathlib import Path


def post_json(url: str, payload: dict, timeout: float) -> tuple[dict | None, float, str | None]:
    started = time.monotonic()
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response), (time.monotonic() - started) * 1000, None
    except Exception as error:  # diagnostic tool: preserve the row and continue
        return None, (time.monotonic() - started) * 1000, str(error)


def short_fixtures(report: dict, max_chars: int, limit: int) -> list[dict]:
    selected: list[dict] = []
    seen_papers: set[str] = set()
    papers = report.get("papers", [])
    for paper in papers:
        paper_id = str(paper.get("paperId", ""))
        for row in paper.get("rows", []):
            if row.get("readerVisibleFallback") or row.get("sourceCategory") != "ordinary-body-prose":
                continue
            for sentence in re.split(r"(?<=[.!?])\s+", str(row.get("source", "")).strip()):
                if 60 <= len(sentence) <= max_chars and paper_id not in seen_papers:
                    selected.append({"key": row.get("key"), "paperId": paper_id, "source": sentence})
                    seen_papers.add(paper_id)
                    break
            if len(selected) >= limit:
                return selected
    return selected


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--madlad-url", default="http://127.0.0.1:8765/translate")
    parser.add_argument("--ollama-url", default="http://127.0.0.1:11434/api/generate")
    parser.add_argument("--ollama-model", default="qwen3:14b")
    parser.add_argument("--max-chars", type=int, default=220)
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--timeout", type=float, default=45)
    args = parser.parse_args()

    report = json.loads(args.input.read_text())
    fixtures = short_fixtures(report, args.max_chars, args.limit)
    result = {
        "version": "short-model-compare-v1",
        "sourceReport": str(args.input),
        "conditions": {
            "maxChars": args.max_chars,
            "ollamaModel": args.ollama_model,
            "timeoutSeconds": args.timeout,
        },
        "fixtureCount": len(fixtures),
        "results": [],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for fixture in fixtures:
        source = fixture["source"]
        qwen, qwen_ms, qwen_error = post_json(
            args.ollama_url,
            {
                "model": args.ollama_model,
                "prompt": "Translate to Japanese. Preserve all facts, numbers, negation, comparison and technical terms. Output only the translation.\n\n" + source,
                "stream": False,
                "think": False,
                "options": {"temperature": 0},
            },
            args.timeout,
        )
        madlad, madlad_ms, madlad_error = post_json(
            args.madlad_url,
            {"text": source, "source_language": "en", "target_language": "ja"},
            args.timeout,
        )
        result["results"].append({
            **fixture,
            "qwen": qwen.get("response") if qwen else None,
            "qwenElapsedMs": round(qwen_ms),
            "qwenError": qwen_error,
            "madlad": madlad.get("text") if madlad else None,
            "madladElapsedMs": round(madlad_ms),
            "madladError": madlad_error,
        })
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        print(f"{fixture['key']} qwen={round(qwen_ms)}ms madlad={round(madlad_ms)}ms")
    print(f"wrote {args.output} ({len(result['results'])}/{len(fixtures)})")


if __name__ == "__main__":
    main()
