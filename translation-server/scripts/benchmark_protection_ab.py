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


def minimal_protection(source: str, *, expose_repeated_acronyms: bool = False,
                       expose_all_spans: bool = False,
                       expose_short_context_spans: bool = False):
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
    if expose_all_spans:
        # Diagnostic-only arm: leave every detected span literal so the model
        # sees the same context as Raw while the post-decode invariant checks
        # remain unchanged. Never enable this in production.
        literal.update(spans)
    if expose_short_context_spans:
        # Diagnostic-only middle arm: keep short opaque identifiers and
        # document-reference spans readable, while leaving measurements,
        # statistics, URLs and DOI-like facts protected.
        literal.update(
            span for span in spans
            if re.fullmatch(r"[A-Z][A-Za-z0-9]{1,7}", span.strip())
            or re.fullmatch(r"\d{1,3}\s*\([^)]{1,80}\)", span.strip())
        )
    protected, kept_spans, kept_nonce = protect_citations(source, unprotected_values=literal)
    return protected, kept_spans, kept_nonce, sorted(literal)


def load_rows(report: Path, limit: int, offset: int = 0, segment_units: bool = False,
              max_per_paper: int | None = None):
    data = json.loads(report.read_text(encoding="utf-8"))
    rows = []
    seen = set()
    for paper in data.get("papers", []):
        for row in paper.get("rows", []):
            if row.get("sourceCategory") != "ordinary-body-prose":
                continue
            if row.get("sourceIntegrity") != "clean" or not row.get("wouldSubmitToModel"):
                continue
            source = str(row.get("source", "")).strip()
            if not _looks_like_clean_body(source, row):
                continue
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
    if max_per_paper is not None and max_per_paper > 0:
        # Stable round-robin prevents the alphabetically first paper from
        # dominating a diagnostic cohort while preserving reproducibility.
        grouped: dict[str, list[dict]] = {}
        for row in selected:
            grouped.setdefault(str(row.get("paperId") or ""), []).append(row)
        selected = []
        for index in range(max_per_paper):
            for paper_id in sorted(grouped):
                if index < len(grouped[paper_id]):
                    selected.append(grouped[paper_id][index])
    if segment_units:
        expanded = []
        for row in selected:
            for index, unit in enumerate(segment_for_translation(row["source"])):
                if len(unit.text.strip()) >= 70:
                    expanded.append({**row, "key": f"{row['key']}#unit-{index}", "source": unit.text})
        if max_per_paper is not None and max_per_paper > 0:
            grouped_units: dict[str, list[dict]] = {}
            for row in expanded:
                grouped_units.setdefault(str(row.get("paperId") or ""), []).append(row)
            expanded = []
            for index in range(max_per_paper):
                for paper_id in sorted(grouped_units):
                    if index < len(grouped_units[paper_id]):
                        expanded.append(grouped_units[paper_id][index])
        return expanded[:limit]
    return selected[:limit]


def _looks_like_clean_body(source: str, row: dict) -> bool:
    """Conservative diagnostic selector; never changes production routing.

    Audit labels can be stale after extraction changes, so reject obvious
    masthead/title-shaped rows before comparing protection arms.  Ambiguous
    prose remains eligible and is reviewed manually.
    """
    if row.get("role") not in (None, "paragraph"):
        return False
    # Historical audit rows can carry figure/table material while retaining a
    # paragraph role. Keep these structural units out of the protection
    # experiment; extraction attribution is measured separately.
    if re.match(r"^\s*(?:fig(?:ure)?|table)\s*\d+[A-Za-z]?\b", source, re.I):
        return False
    # A PDF can expose keyword/index terms as a paragraph-like block.  These
    # are not ordinary prose and are especially prone to placeholder-only
    # decoding, so keep them out of the protection comparison.  Require a
    # conservative conjunction (many comma-separated short segments, no
    # sentence punctuation, and no clause-like function word) to avoid
    # excluding normal enumerative prose.
    keyword_candidate = source.strip().rstrip(".")
    parts = [part.strip() for part in keyword_candidate.split(",")]
    if (
        len(parts) >= 4
        and not re.search(r"[!?;:]", keyword_candidate)
        and all(1 <= len(re.findall(r"\b[\wÀ-ÖØ-öø-ÿ'’-]+\b", part)) <= 8 for part in parts)
        and not re.search(r"\b(?:and|or|but|because|which|that|where)\b", source, re.I)
    ):
        return False
    if re.search(r"\b(?:see|shown in|as shown in)\s+(?:fig(?:ure)?|table)\s*\d+", source, re.I):
        return False
    if re.match(r"^(?:[A-Z][A-Za-z]{1,24}\s+\d+[A-Za-z]?\s+){2,}", source):
        return False
    if re.match(r"^\s*(?:human data|note|source)\s+(?:taken|from|:)", source, re.I):
        return False
    # The protection experiment targets English MADLAD input.  Some historical
    # audit rows contain already-translated Japanese text; including those would
    # measure the language gate rather than source protection.
    if len(re.findall(r"[\u3040-\u30ff\u3400-\u9fff]", source)) >= 8:
        return False
    words = re.findall(r"\b[\wÀ-ÖØ-öø-ÿ'’-]+\b", source)
    if len(words) < 18:
        return False
    capitalized = sum(1 for w in words if w[:1].isupper())
    # Author/masthead lines have a high proper-name ratio and usually contain
    # an affiliation marker or star; ordinary prose does not.
    if (capitalized / max(len(words), 1) > 0.42 and
            ("*" in source or re.search(r"\b(?:University|Department|Institute|Faculty)\b", source, re.I))):
        return False
    # A short title immediately followed by a sentence is a mixed
    # heading/body block; it must be fixed in extraction, not used here.
    if re.match(r"^[A-Z][A-Za-z0-9 &'’–-]{2,42}\s+(?:This|The|We|Our|In|To)\b", source):
        return False
    return True


def decode(engine: MADLADEngine, model_input: str):
    started = time.perf_counter()
    output, in_tokens, out_tokens = engine._translate_chunk(model_input, "ja", model_input)
    return {"output": output, "inputTokens": in_tokens, "outputTokens": out_tokens,
            "latencyMs": round((time.perf_counter() - started) * 1000, 1)}


def source_shape(source: str) -> dict[str, int | float]:
    """Record segmentation-risk dimensions without changing production input."""
    words = re.findall(r"\b[\wÀ-ÖØ-öø-ÿ'’-]+\b", source)
    # This intentionally remains a coarse diagnostic measure.  The production
    # segmenter is the source of truth for actual units; these counts let the
    # A/B report stratify long multi-sentence blocks independently of it.
    sentence_count = len(re.findall(r"[.!?](?=\s+[A-Z(\[])|[.!?]$", source))
    return {
        "charCount": len(source),
        "wordCount": len(words),
        "sentenceCountEstimate": max(1, sentence_count),
        "semicolonCount": source.count(";"),
    }


def run_condition(engine, source: str, condition: str, production_rescue: bool = False, *, expose_repeated_acronyms: bool = False, expose_all_spans: bool = False, expose_short_context_spans: bool = False):
    _, all_source_spans, _ = protect_citations(source)
    if condition == "raw":
        model_input, spans, nonce, literal = source, [], 0, []
        unprotected = set()
    elif condition == "minimal":
        model_input, spans, nonce, literal = minimal_protection(
            source, expose_repeated_acronyms=expose_repeated_acronyms,
            expose_all_spans=expose_all_spans,
            expose_short_context_spans=expose_short_context_spans,
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
        # Raw and minimal must actually send their prepared model input.  The
        # engine normally protects internally, so disable that second pass for
        # these diagnostic arms; otherwise all three arms silently benchmark
        # the same source and the comparison is invalid.
        started = time.perf_counter()
        if condition == "minimal":
            os.environ["MADLAD_DISABLE_PROTECTION"] = "1"
            output, in_tokens, out_tokens = engine._translate_chunk(model_input, "ja", model_input)
        elif production_rescue:
            output, in_tokens, out_tokens = engine._translate_chunk_with_rescue(source, "ja", source)
        else:
            output, in_tokens, out_tokens = engine._translate_chunk(source, "ja", source)
        result = {"output": output, "inputTokens": in_tokens, "outputTokens": out_tokens,
                  "latencyMs": round((time.perf_counter() - started) * 1000, 1)}
        if previous is None:
            os.environ.pop("MADLAD_DISABLE_PROTECTION", None)
        else:
            os.environ["MADLAD_DISABLE_PROTECTION"] = previous
        restored = restore_citations(result["output"], spans, nonce, reject_missing=False) if spans else result["output"]
        missing_exposed = [span for span in all_source_spans if span and span not in restored]
        return {"condition": condition, "modelInput": model_input, "protectedSpanCount": len(spans),
                "sourceProtectedSpanCount": len(all_source_spans),
                "missingSourceSpans": missing_exposed,
                "literalSpans": literal, "restoredOutput": restored, **result, "error": None}
    except Exception as exc:
        if previous is None:
            os.environ.pop("MADLAD_DISABLE_PROTECTION", None)
        else:
            os.environ["MADLAD_DISABLE_PROTECTION"] = previous
        return {"condition": condition, "modelInput": model_input, "protectedSpanCount": len(spans),
                "sourceProtectedSpanCount": len(all_source_spans),
                "missingSourceSpans": all_source_spans if expose_all_spans else [],
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
    parser.add_argument("--expose-all-spans", action="store_true", help="diagnostic minimal arm: expose every protected span to the model")
    parser.add_argument("--expose-short-context-spans", action="store_true", help="diagnostic minimal arm: expose short identifiers/document references")
    parser.add_argument("--source-report", type=Path, default=REPORT,
                        help="audit JSON containing ordinary-body rows (default: translation-audit.json)")
    parser.add_argument("--max-per-paper", type=int, default=0,
                        help="diagnostic cohort cap per paper; selected round-robin")
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    if args.allow_short:
        os.environ["MADLAD_DIAGNOSTIC_ALLOW_SHORT"] = "1"
    source_report = args.source_report if args.source_report.is_absolute() else REPO / args.source_report
    rows = load_rows(source_report, args.limit, args.offset, args.segment_units,
                     args.max_per_paper or None)
    engine = MADLADEngine()
    engine.load_model()
    records = []
    for index, row in enumerate(rows, 1):
        print(f"[{index}/{len(rows)}] {row['paperId']} {row['key']}", flush=True)
        names = ("current",) if args.production_rescue else ("raw", "minimal", "current")
        conditions = [run_condition(engine, row["source"], name, args.production_rescue, expose_repeated_acronyms=args.expose_repeated_acronyms, expose_all_spans=args.expose_all_spans, expose_short_context_spans=args.expose_short_context_spans) for name in names]
        records.append({**row, "sourceShape": source_shape(row["source"]), "conditions": conditions})
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"version": "protection-ab-v1", "sourceReport": str(source_report),
                                    "model": engine.MODEL_ID, "modelVersion": engine.model_version,
                                    "generation": {"numBeams": 1, "doSample": False},
                                    "offset": args.offset, "segmentUnits": args.segment_units, "productionRescue": args.production_rescue,
                                    "exposeRepeatedAcronyms": args.expose_repeated_acronyms,
                                    "exposeAllSpans": args.expose_all_spans,
                                    "exposeShortContextSpans": args.expose_short_context_spans,
                                    "sampleCount": len(records), "records": records},
                                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(args.out)


if __name__ == "__main__":
    main()
