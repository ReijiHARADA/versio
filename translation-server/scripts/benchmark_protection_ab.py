"""Compare raw, minimal, and current source protection on clean paper blocks.

Diagnostic only: this script loads the same MADLAD engine and runs identical
greedy decodes while changing only pre-translation protection. It never
changes production routing.  Inputs are sampled from the latest translation
audit report and rows marked as extraction/source fragments are excluded.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))

from engines.citation_protect import protect_citations, restore_citations  # noqa: E402
from engines.madlad_mps import MADLADEngine  # noqa: E402
from engines.segmenter import segment_for_translation  # noqa: E402

REPORT = REPO / "test-data/real-papers/reports/translation-audit.json"
OUT = REPO / "test-data/real-papers/reports/protection-ab-diagnostic-v1.json"

# Keep literal spans whose meaning is available to the model. Opaque names,
# URLs, DOIs and structural identifiers remain protected in the minimal arm.
_KEEP_LITERAL = re.compile(
    r"^(?:"
    r"\[[0-9][0-9,\-–— ]*\]|"
    r"\(?[A-Z][A-Za-z'’-]+(?:\s+et\s+al\.?)?,?\s+\d{4}[a-z]?[^)]*\)?|"
    r"(?:18|19|20)\d{2}[a-z]?|"
    r"[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*(?:%|mm|cm|kg|mg|ms|s|Hz|px|°C|years?|months?)|"
    r"(?:p|F|t|z|χ²|χ2)\s*[<>=]\s*[^ ]+|"
    r"\d+(?:\.\d+)?"
    r")$",
    re.I,
)


def minimal_protection(source: str, *, expose_repeated_acronyms: bool = False):
    current, spans, nonce = protect_citations(source)
    literal = {span for span in spans if _KEEP_LITERAL.match(span.strip())}
    if expose_repeated_acronyms:
        # Diagnostic arm only: repeated short acronyms are often opaque
        # placeholders that the decoder drops. Keep them visible so we can
        # measure whether context beats placeholder fidelity. This does not
        # alter production protection.
        counts: dict[str, int] = {}
        for match in re.finditer(r"\b[A-Z][A-Z0-9]{1,5}\b", source):
            counts[match.group(0)] = counts.get(match.group(0), 0) + 1
        literal.update({value for value, count in counts.items() if count >= 2})
    protected, kept_spans, kept_nonce = protect_citations(source, unprotected_values=literal)
    return protected, kept_spans, kept_nonce, sorted(literal)


def load_rows(limit: int, offset: int = 0, segment_units: bool = False):
    data = json.loads(REPORT.read_text(encoding="utf-8"))
    rows = []
    seen = set()
    for paper in data.get("papers", []):
        for row in paper.get("rows", []):
            if row.get("sourceCategory") != "ordinary-body-prose":
                continue
            if row.get("sourceIntegrity") != "clean" or not row.get("wouldSubmitToModel"):
                continue
            source = str(row.get("source", "")).strip()
            # Older audit generations could label a wrapped acknowledgements
            # paragraph as ordinary prose. Keep author/grant text out of the
            # protection-quality denominator even when using those reports.
            if re.match(r"^acknowledg(?:e)?ments?\b", source, re.I):
                continue
            key = (row.get("paperId"), source)
            if len(source) < 90 or key in seen:
                continue
            seen.add(key)
            rows.append({"paperId": row.get("paperId"), "key": row.get("key"), "source": source})
    # Stable, cross-paper order; this is a diagnostic sample, not tuning data.
    rows.sort(key=lambda r: (r["paperId"] or "", r["key"] or ""))
    selected = rows[offset:]
    if segment_units:
        expanded = []
        for row in selected:
            for index, unit in enumerate(segment_for_translation(row["source"])):
                if len(unit.text.strip()) >= 70:
                    expanded.append({**row, "key": f"{row['key']}#unit-{index}", "source": unit.text})
        return expanded[:limit]
    return selected[:limit]


def decode(engine: MADLADEngine, model_input: str):
    started = time.perf_counter()
    output, in_tokens, out_tokens = engine._translate_chunk(model_input, "ja", model_input)
    return {"output": output, "inputTokens": in_tokens, "outputTokens": out_tokens,
            "latencyMs": round((time.perf_counter() - started) * 1000, 1)}


def run_condition(engine, source: str, condition: str, production_rescue: bool = False, *, expose_repeated_acronyms: bool = False):
    if condition == "raw":
        model_input, spans, nonce, literal = source, [], 0, []
        unprotected = set()
    elif condition == "minimal":
        model_input, spans, nonce, literal = minimal_protection(
            source, expose_repeated_acronyms=expose_repeated_acronyms
        )
        unprotected = set(literal)
    else:
        model_input, spans, nonce = protect_citations(source)
        literal = []
        unprotected = set()
    try:
        previous = os.environ.get("MADLAD_DISABLE_PROTECTION")
        if condition == "raw":
            os.environ["MADLAD_DISABLE_PROTECTION"] = "1"
        else:
            os.environ.pop("MADLAD_DISABLE_PROTECTION", None)
        # Pass the original source so the engine's normal restore path remains
        # comparable. `unprotected_values` is the only difference in minimal.
        started = time.perf_counter()
        if production_rescue:
            output, in_tokens, out_tokens = engine._translate_chunk_with_rescue(source, "ja", source)
        else:
            output, in_tokens, out_tokens = engine._translate_chunk(
                source, "ja", source, unprotected_values=unprotected
            )
        result = {"output": output, "inputTokens": in_tokens, "outputTokens": out_tokens,
                  "latencyMs": round((time.perf_counter() - started) * 1000, 1)}
        if previous is None:
            os.environ.pop("MADLAD_DISABLE_PROTECTION", None)
        else:
            os.environ["MADLAD_DISABLE_PROTECTION"] = previous
        restored = restore_citations(result["output"], spans, nonce, reject_missing=False) if spans else result["output"]
        return {"condition": condition, "modelInput": model_input, "protectedSpanCount": len(spans),
                "literalSpans": literal, "restoredOutput": restored, **result, "error": None}
    except Exception as exc:
        return {"condition": condition, "modelInput": model_input, "protectedSpanCount": len(spans),
                "literalSpans": literal, "restoredOutput": None, "inputTokens": None,
                "outputTokens": None, "latencyMs": round((time.perf_counter() - started) * 1000, 1) if 'started' in locals() else None,
                "error": f"{type(exc).__name__}: {exc}"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--allow-short", action="store_true", help="diagnostic only: bypass implausibly_short gate")
    parser.add_argument("--segment-units", action="store_true", help="diagnostic: sample production segmenter units")
    parser.add_argument("--production-rescue", action="store_true", help="use production retry/rescue path")
    parser.add_argument("--expose-repeated-acronyms", action="store_true", help="diagnostic minimal arm: keep repeated short acronyms literal")
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    if args.allow_short:
        os.environ["MADLAD_DIAGNOSTIC_ALLOW_SHORT"] = "1"
    rows = load_rows(args.limit, args.offset, args.segment_units)
    engine = MADLADEngine()
    engine.load_model()
    records = []
    for index, row in enumerate(rows, 1):
        print(f"[{index}/{len(rows)}] {row['paperId']} {row['key']}", flush=True)
        names = ("current",) if args.production_rescue else ("raw", "minimal", "current")
        conditions = [run_condition(engine, row["source"], name, args.production_rescue, expose_repeated_acronyms=args.expose_repeated_acronyms) for name in names]
        records.append({**row, "conditions": conditions})
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"version": "protection-ab-v1", "sourceReport": str(REPORT),
                                    "model": engine.MODEL_ID, "modelVersion": engine.model_version,
                                    "generation": {"numBeams": 1, "doSample": False},
                                    "offset": args.offset, "segmentUnits": args.segment_units, "productionRescue": args.production_rescue,
                                    "exposeRepeatedAcronyms": args.expose_repeated_acronyms,
                                    "sampleCount": len(records), "records": records},
                                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(args.out)


if __name__ == "__main__":
    main()
