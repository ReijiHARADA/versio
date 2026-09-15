"""Audit-only comparison of translation candidates.

This deliberately does not alter production routing.  It makes the safety
trade-off explicit by scoring invariant and relation preservation alongside a
length signal, then joining the result to the manually reviewed unsafe cohort.
"""
from __future__ import annotations

import argparse, json, re
from pathlib import Path

NEG_EN = re.compile(r"\b(?:not|no|never|none|neither|without|cannot|can't|doesn't|don't|isn't|aren't|won't)\b", re.I)
NEG_JA = re.compile(r"(?:ない|ません|ず|ぬ|無い|なし|未|否定|できない|ありません)")
CON_EN = re.compile(r"\b(?:however|although|though|unlike|whereas|despite)\b", re.I)
CON_JA = re.compile(r"(?:しかし|だが|一方|対照的|異なり|にもかかわらず|反面|ものの)")
COND_EN = re.compile(r"\b(?:if|unless|only if|provided that|whether)\b", re.I)
COND_JA = re.compile(r"(?:もし|場合|限り|ない限り|とき|かどうか|条件)")
TEMP_EN = re.compile(r"\b(?:before|after|until|since|then|subsequent(?:ly)?|when)\b", re.I)
TEMP_JA = re.compile(r"(?:前|後|まで|以来|その後|続いて|時点|とき|際)")
TREND_EN = re.compile(r"\b(?:increase|decrease|increased|decreased|higher|lower|greater|smaller|improve|improved|reduce|reduced)\b", re.I)
TREND_JA = re.compile(r"(?:増加|減少|高い|低い|多い|少ない|改善|低減|小さい|大きい)")
# Characters used in simplified Chinese but not Japanese orthography.  This is
# an audit signal for mixed-script model output; it is deliberately not a
# rejection rule in production and avoids confusing ordinary shared kanji.
SIMPLIFIED_ONLY_CJK = set("显简词语汉仅为们这对从发进动应并个实现时机经说该让")

def signals(source: str, output: str) -> dict:
    src_tokens = re.findall(r"\b\d+(?:\.\d+)?\b", source)
    out = output.replace(",", "")
    kept = sum(1 for t in src_tokens if t in out.replace(",", ""))
    neg = not NEG_EN.search(source) or bool(NEG_JA.search(output))
    contrast = not CON_EN.search(source) or bool(CON_JA.search(output))
    condition = not COND_EN.search(source) or bool(COND_JA.search(output))
    temporal = not TEMP_EN.search(source) or bool(TEMP_JA.search(output))
    trend = not TREND_EN.search(source) or bool(TREND_JA.search(output))
    ratio = len(output.replace(" ", "")) / max(1, len(source.replace(" ", "")))
    # Candidate safety signals only: a sentence ending in a continuation word
    # or a stream of isolated spaced characters is not a rescue.
    continuation = bool(re.search(r"(?:の|が|を|に|と|で|は|も|そして|または|および|、)$", output.strip()))
    spaced_chars = len(re.findall(r"(?:\b\S\b\s+){4,}", output)) > 0
    simplified_only = sorted(set(ch for ch in output if ch in SIMPLIFIED_ONLY_CJK))
    return {"numericTotal": len(src_tokens), "numericKept": kept,
            "negationPreserved": neg, "contrastPreserved": contrast,
            "conditionPreserved": condition, "temporalRelationPreserved": temporal,
            "trendPreserved": trend,
            "lengthRatio": round(ratio, 3), "likelyTruncated": continuation,
            "garbledSpacing": spaced_chars,
            "simplifiedOnlyCjk": simplified_only,
            "mixedScriptRisk": bool(simplified_only)}

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--candidate", action="append", required=True,
                    help="JSON report containing a results array")
    ap.add_argument("--require-relations", action="store_true",
                    help="audit-only: reject selections missing relation signals")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    baseline_payload = json.loads(Path(args.baseline).read_text())
    # Accept either the reviewed unsafe fixture (`rows`) or a model report
    # (`results`) so the harness cannot silently discard review metadata.
    baseline_rows = baseline_payload.get("rows") or baseline_payload.get("results") or []
    def row_key(row):
        # Held-out fixtures may omit paperId; blockId is still unique within a
        # fixture and must not make the audit harness silently unusable.
        return (row.get("paperId", "") + ":" + row["blockId"]).lstrip(":")
    unsafe = {row_key(r): r for r in baseline_rows}
    candidates = []
    for filename in args.candidate:
        report = json.loads(Path(filename).read_text())
        for row in (report.get("results") or report.get("rows") or []):
            key = row_key(row)
            if key in unsafe:
                candidates.append({"key": key, "model": row.get("model", filename),
                                   "source": row["source"], "translation": row["translation"],
                                   "signals": signals(row["source"], row["translation"])})
    grouped = {}
    for row in candidates:
        grouped.setdefault(row["key"], []).append(row)
    rows = []
    for key, options in grouped.items():
        # Conservative audit ranking: hard relation/invariant losses disqualify
        # a candidate; length is only a tie-breaker, never an acceptance gate.
        ranked = sorted(options, key=lambda r: (
            r["signals"]["numericKept"] == r["signals"]["numericTotal"],
            r["signals"]["negationPreserved"], r["signals"]["contrastPreserved"],
            r["signals"]["conditionPreserved"], r["signals"]["temporalRelationPreserved"],
            r["signals"]["trendPreserved"],
            not r["signals"]["likelyTruncated"], not r["signals"]["garbledSpacing"],
            r["signals"]["lengthRatio"] >= 0.28), reverse=True)
        selected = ranked[0]
        if args.require_relations and not all(selected["signals"].get(k, True) for k in ("conditionPreserved", "temporalRelationPreserved", "trendPreserved")):
            selected = None
        rows.append({"key": key, "severity": unsafe[key].get("severity"),
                     "reviewLabel": unsafe[key].get("reviewLabel"),
                     "candidates": options, "auditSelection": selected["model"] if selected else None,
                     "selectionSignals": selected["signals"] if selected else {"rejectedByRelationGate": True}})
    summary = {"rows": len(rows), "candidateCount": len(candidates),
               "selectionIsAuditOnly": True,
               "hardSignalPass": sum(1 for r in rows if r["selectionSignals"].get("numericKept") == r["selectionSignals"].get("numericTotal") and r["selectionSignals"].get("negationPreserved") and r["selectionSignals"].get("contrastPreserved") and not r["selectionSignals"].get("likelyTruncated") and not r["selectionSignals"].get("garbledSpacing")),
               "relationSignalPass": sum(1 for r in rows if all(r["selectionSignals"].get(k, True) for k in ("conditionPreserved", "temporalRelationPreserved", "trendPreserved"))),
               "relationRiskRows": [r["key"] for r in rows if not all(r["selectionSignals"].get(k, True) for k in ("conditionPreserved", "temporalRelationPreserved", "trendPreserved"))],
               "rejectedByRelationGate": sum(1 for r in rows if r["auditSelection"] is None)}
    Path(args.output).write_text(json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary))

if __name__ == "__main__":
    main()
