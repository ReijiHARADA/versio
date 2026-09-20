#!/usr/bin/env python3
"""Replay ordinary-prose source-echo fallbacks from one fresh audit report.

This diagnostic sends the exact extracted text from rows where the model was
called but the audit received an unchanged source string. It does not modify
the source report or production data.
"""
from __future__ import annotations

import concurrent.futures
import datetime as dt
import json
import os
import pathlib
import urllib.error
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPORT = pathlib.Path(os.environ.get(
    "SOURCE_ECHO_REPORT",
    ROOT / "test-data/real-papers/reports/translation-audit-fresh-20260920-v16.json",
))
OUTPUT = pathlib.Path(os.environ.get(
    "SOURCE_ECHO_OUTPUT",
    ROOT / "test-data/real-papers/reports/translation-source-echo-replay-fresh-20260920-v16.json",
))
ENDPOINT = os.environ.get("MADLAD_BENCH_URL", "http://127.0.0.1:18795").rstrip("/")
TOKEN = os.environ.get("MADLAD_SERVER_TOKEN", "").strip()
WORKERS = int(os.environ.get("SOURCE_ECHO_WORKERS", "12"))


def request_health() -> dict:
    with urllib.request.urlopen(f"{ENDPOINT}/health", timeout=10) as response:
        status = json.loads(response.read())
    if not status.get("model_loaded") and status.get("phase") != "ready":
        raise RuntimeError(f"translation model is not ready: {status}")
    return status


def replay(row: dict) -> dict:
    body = json.dumps({
        "text": row["source"],
        "source_language": "en",
        "target_language": "ja",
    }).encode()
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["X-Paper-Reader-Token"] = TOKEN
    request = urllib.request.Request(f"{ENDPOINT}/translate", data=body, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            result = json.loads(response.read())
        return {
            "key": row["key"],
            "paperId": row["paperId"],
            "blockId": row["blockId"],
            "pageStart": row["pageStart"],
            "pageEnd": row["pageEnd"],
            "fallbackReason": row.get("fallbackReason"),
            "source": row["source"],
            "text": result.get("text"),
            "modelVersion": result.get("model_version"),
            "inputTokens": result.get("input_tokens"),
            "outputTokens": result.get("output_tokens"),
            "translationTimeMs": result.get("translation_time_ms"),
            "serverFallbackReason": result.get("fallback_reason"),
            "serverFallbackStage": result.get("fallback_stage"),
            "sourceEcho": result.get("text") == row["source"],
        }
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        return {"key": row["key"], "paperId": row["paperId"], "source": row["source"], "error": str(exc)}


def main() -> None:
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    rows = [
        row
        for paper in report["papers"]
        for row in paper["rows"]
        if row.get("sourceCategory") == "ordinary-body-prose"
        and row.get("readerVisibleFallback")
        and row.get("wouldSubmitToModel")
        and row.get("sourceFallback")
    ]
    health = request_health()
    print(f"[replay] model={health.get('model_version')} rows={len(rows)} workers={WORKERS}", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = list(pool.map(replay, rows))
    payload = {
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "runId": str(uuid.uuid4()),
        "sourceReport": str(REPORT.relative_to(ROOT)),
        "sourceRunId": report.get("runId"),
        "endpoint": ENDPOINT,
        "modelVersionAtHealthCheck": health.get("model_version"),
        "requestWorkers": WORKERS,
        "rowCount": len(rows),
        "results": results,
        "summary": {
            "replayed": len(results),
            "sourceEchoAgain": sum(bool(row.get("sourceEcho")) for row in results),
            "translatedOutput": sum(bool(row.get("text")) and not row.get("sourceEcho") for row in results),
            "serverFallback": sum(bool(row.get("serverFallbackReason")) for row in results),
            "errors": sum(bool(row.get("error")) for row in results),
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), **payload["summary"]}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
