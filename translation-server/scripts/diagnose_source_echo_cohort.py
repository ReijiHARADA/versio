"""Reproduce fresh-audit English source echoes on the current model/runtime.

Samples ordinary-body rows that the v16 audit received back unchanged, then
compares direct engine calls with concurrent production MicroBatchScheduler
calls in one process and with one loaded model. PDF extraction is not run.
"""
from __future__ import annotations

import concurrent.futures
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engines.madlad_mps import MADLADEngine  # noqa: E402
from engines.micro_batcher import MicroBatchScheduler  # noqa: E402

AUDIT = ROOT / "test-data/real-papers/reports/translation-audit-fresh-20260920-v16.json"
OUTPUT = ROOT / "test-data/real-papers/reports/source-echo-diagnosis-fresh-20260920-v16.json"
SAMPLE_SIZE = int(os.environ.get("SOURCE_ECHO_SAMPLE_SIZE", "8"))
ONLY_KEY = os.environ.get("SOURCE_ECHO_ONLY_KEY")
ONLY_KEYS = {
    key.strip()
    for key in os.environ.get("SOURCE_ECHO_KEYS", "").split(",")
    if key.strip()
}


def select_rows() -> list[dict]:
    report = json.loads(AUDIT.read_text(encoding="utf-8"))
    rows = [
        row
        for paper in report["papers"]
        for row in paper["rows"]
        if (
            row["key"] in ONLY_KEYS
            if ONLY_KEYS
            else row.get("sourceCategory") == "ordinary-body-prose"
            and row.get("readerVisibleFallback")
            and row.get("wouldSubmitToModel")
            and row.get("sourceFallback")
        )
    ]
    if ONLY_KEY:
        rows = [row for row in rows if row["key"] == ONLY_KEY]
    rows.sort(key=lambda row: (len(row["source"]), row["key"]))
    requested_keys = ONLY_KEYS or ({ONLY_KEY} if ONLY_KEY else set())
    found_keys = {row["key"] for row in rows}
    if requested_keys and requested_keys != found_keys:
        raise ValueError(f"diagnostic keys not found in report: {sorted(requested_keys - found_keys)}")
    if len(rows) <= max(1, SAMPLE_SIZE):
        return rows
    if SAMPLE_SIZE <= 1:
        return [rows[len(rows) // 2]]
    indices = [round(i * (len(rows) - 1) / (SAMPLE_SIZE - 1)) for i in range(SAMPLE_SIZE)]
    return [rows[index] for index in indices]


def result_record(row: dict, result, *, path: str) -> dict:
    return {
        "key": row["key"],
        "paperId": row["paperId"],
        "source": row["source"],
        "sourceChars": len(row["source"]),
        "path": path,
        "text": result.text,
        "sourceEcho": result.text.strip() == row["source"].strip(),
        "modelVersion": result.model_version,
        "inputTokens": result.input_tokens,
        "outputTokens": result.output_tokens,
        "translationTimeMs": result.translation_time_ms,
        "fallbackReason": result.fallback_reason,
        "fallbackStage": result.fallback_stage,
    }


def main() -> None:
    rows = select_rows()
    engine = MADLADEngine()
    engine.load_model()
    scheduler = MicroBatchScheduler(engine)
    results = []

    for row in rows:
        try:
            direct = engine.translate(row["source"], "en", "ja")
            results.append(result_record(row, direct, path="direct_engine"))
        except Exception as exc:
            results.append({"key": row["key"], "path": "direct_engine", "error": f"{type(exc).__name__}: {exc}"})

    def scheduled(row: dict) -> dict:
        try:
            result = scheduler.translate(row["source"], "en", "ja")
            return result_record(row, result, path="concurrent_microbatch_scheduler")
        except Exception as exc:
            return {"key": row["key"], "path": "concurrent_microbatch_scheduler", "error": f"{type(exc).__name__}: {exc}"}

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(rows)) as pool:
        results.extend(pool.map(scheduled, rows))

    payload = {
        "sourceAudit": str(AUDIT.relative_to(ROOT)),
        "sourceRunId": json.loads(AUDIT.read_text(encoding="utf-8"))["runId"],
        "model": engine.MODEL_ID,
        "modelVersion": engine.MODEL_VERSION,
        "sampledRows": len(rows),
        "paths": ["direct_engine", "concurrent_microbatch_scheduler"],
        "results": results,
        "summary": {
            "sourceEchoesByPath": {
                path: sum(row.get("path") == path and row.get("sourceEcho") is True for row in results)
                for path in {row.get("path") for row in results}
            },
            "errorsByPath": {
                path: sum(row.get("path") == path and "error" in row for row in results)
                for path in {row.get("path") for row in results}
            },
        },
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), **payload["summary"]}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
