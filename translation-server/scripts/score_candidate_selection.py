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
# Characters used in simplified Chinese but not Japanese orthography.  This is
# an audit signal for mixed-script model output; it is deliberately not a
# rejection rule in production and avoids confusing ordinary shared kanji.
SIMPLIFIED_ONLY_CJK = set("显简体词语汉语仅数据学术显著为们这对从发进动应并个国实现时机经过说该让")

def signals(source: str, output: str) -> dict:
    src_tokens = re.findall(r"\b\d+(?:\.\d+)?\b", source)
    out = output.replace(",", "")
    kept = sum(1 for t in src_tokens if t in out.replace(",", ""))
    neg = not NEG_EN.search(source) or bool(NEG_JA.search(output))
    contrast = not CON_EN.search(source) or bool(CON_JA.search(output))
    ratio = len(output.replace(" ", "")) / max(1, len(source.replace(" ", "")))
    # Candidate safety signals only: a sentence ending in a continuation word
    # or a stream of isolated spaced characters is not a rescue.
    continuation = bool(re.search(r"(?:の|が|を|に|と|で|は|も|そして|または|および|、)$", output.strip()))
    spaced_chars = len(re.findall(r"(?:\b\S\b\s+){4,}", output)) > 0
    simplified_only = sorted(set(ch for ch in output if ch in SIMPLIFIED_ONLY_CJK))
    return {"numericTotal": len(src_tokens), "numericKept": kept,
            "negationPreserved": neg, "contrastPreserved": contrast,
            "lengthRatio": round(ratio, 3), "likelyTruncated": continuation,
            "garbledSpacing": spaced_chars,
            "simplifiedOnlyCjk": simplified_only,
            "mixedScriptRisk": bool(simplified_only)}

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--candidate", action="append", required=True,
                    help="JSON report containing a results array")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    baseline_payload = json.loads(Path(args.baseline).read_text())
    # Accept either the reviewed unsafe fixture (`rows`) or a model report
    # (`results`) so the harness cannot silently discard review metadata.
    baseline_rows = baseline_payload.get("rows") or baseline_payload.get("results") or []
    unsafe = {r["paperId"] + ":" + r["blockId"]: r for r in baseline_rows}
    candidates = []
    for filename in args.candidate:
        report = json.loads(Path(filename).read_text())
        for row in (report.get("results") or report.get("rows") or []):
            key = row["paperId"] + ":" + row["blockId"]
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
            not r["signals"]["likelyTruncated"], not r["signals"]["garbledSpacing"],
            r["signals"]["lengthRatio"] >= 0.28), reverse=True)
        selected = ranked[0]
        rows.append({"key": key, "severity": unsafe[key].get("severity"),
                     "reviewLabel": unsafe[key].get("reviewLabel"),
                     "candidates": options, "auditSelection": selected["model"],
                     "selectionSignals": selected["signals"]})
    summary = {"rows": len(rows), "candidateCount": len(candidates),
               "selectionIsAuditOnly": True,
               "hardSignalPass": sum(1 for r in rows if r["selectionSignals"]["numericKept"] == r["selectionSignals"]["numericTotal"] and r["selectionSignals"]["negationPreserved"] and r["selectionSignals"]["contrastPreserved"] and not r["selectionSignals"]["likelyTruncated"] and not r["selectionSignals"]["garbledSpacing"])}
    Path(args.output).write_text(json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary))

if __name__ == "__main__":
    main()
