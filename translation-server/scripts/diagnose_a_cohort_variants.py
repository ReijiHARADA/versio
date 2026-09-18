"""Compare whole-source and semantic-unit inputs for one clean fallback fixture."""
from __future__ import annotations
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engines.madlad_mps import MADLADEngine  # noqa: E402
import engines.madlad_mps as madlad_module  # noqa: E402
from engines.segmenter import segment_for_translation, rescue_units_for_translation  # noqa: E402
from engines.citation_protect import protect_citations, restore_citations  # noqa: E402
import re

FIXTURES = ROOT / "benchmarks" / "translation-unit-fallback-fixtures-v66.json"
OUTPUT = ROOT / "benchmarks" / "translation-unit-variants-v79.json"

def main() -> None:
    cases = json.loads(FIXTURES.read_text(encoding="utf-8"))["cases"]
    requested = os.environ.get("A_COHORT_CASE")
    if requested == "ozchi-author-year":
        case = {"id": requested, "source": "The closest related work on finger specific interaction has been presented by (Sigure & Koseki, 1998; Marquardt et al., 2011; Benko et al, 2009), however none are in the mobile domain.", "expected": {"mustKeep": ["mobile domain", "1998", "2011", "2009"]}}
    else:
        case = next((item for item in cases if item["id"] == requested), cases[0])
    source = case["source"]
    expected = case.get("expected", {})
    engine = MADLADEngine(); engine.load_model()
    units = [u.text for u in segment_for_translation(source)]
    rescue_units = [u.text for u in rescue_units_for_translation(source)]
    rows = []
    variants = [("whole_source", source, [source]),
                ("semantic_units_joined", "\n".join(units), units)]
    if rescue_units:
        variants.append(("rescue_units_joined", "\n".join(rescue_units), rescue_units))
    original_protect = madlad_module.protect_citations
    original_restore = madlad_module.restore_citations
    # Directly invoke one decode per condition. This intentionally bypasses
    # translate()'s production segmentation/retry so protection effects are
    # measured independently and remain comparable.
    direct_variants = [("whole_unprotected", source, "none")]
    direct_variants.append(("whole_current_protection", source, "current"))
    match = re.search(r"\((?=[^()]*\b(?:18|19|20)\d{2}\b)[^()]+\)", source)
    if match:
        direct_variants.append(("whole_atomic_author_year", source, "atomic_author_year"))
    direct_variants.extend((f"unit_{i}_current_protection", unit, "current") for i, unit in enumerate(units))
    requested = os.environ.get("A_COHORT_CONDITIONS")
    if requested:
        allowed = {item.strip() for item in requested.split(",") if item.strip()}
        direct_variants = [item for item in direct_variants if item[0] in allowed]
        if not direct_variants:
            raise ValueError(f"no conditions matched A_COHORT_CONDITIONS={requested}")
    for name, text, mode in direct_variants:
        if mode == "none":
            protected, citations, nonce = text, [], 0
            madlad_module.protect_citations = lambda value: (value, [], 0)
            madlad_module.restore_citations = lambda value, _c, _n, **_kw: value
        elif mode == "current":
            protected, citations, nonce = original_protect(text)
            madlad_module.protect_citations = original_protect
            madlad_module.restore_citations = original_restore
        else:
            match = re.search(r"\((?=[^()]*\b(?:18|19|20)\d{2}\b)[^()]+\)", text)
            token = "ZZREF1ZZ"
            protected = text[:match.start()] + token + text[match.end():]
            citations, nonce = [match.group(0)], 0
            madlad_module.protect_citations = lambda value: (protected if value == text else value, citations, nonce)
            def restore_atomic(value, c, _n, **_kw):
                if not c:
                    return value
                normalized = value.translate(str.maketrans("ＺＺＲＥＦ１２３４５６７８９０", "ZZREF1234567890"))
                normalized = re.sub(r"Z\s*Z\s*R\s*E\s*F\s*1\s*Z\s*Z", token, normalized, flags=re.IGNORECASE)
                return normalized.replace(token, c[0])
            madlad_module.restore_citations = restore_atomic
        try:
            # Pass the original text; the patched protection function controls
            # exactly what reaches the model and avoids double protection.
            translated, input_tokens, output_tokens = engine._translate_chunk(text, "ja", text)
            output = translated
            required_tokens = expected.get("mustKeep", [])
            relations = expected.get("mustKeepRelations", [])
            rows.append({"condition": name, "protection_mode": mode, "expected": expected, "model_input": protected,
                         "units": [text],
                         "output": output,
                         "coverage": {
                             "requiredTokenPresence": {token: token in output for token in required_tokens},
                             "relationTokenPresence": [
                                 {"tokens": pair, "allPresent": all(token in output for token in pair)}
                                 for pair in relations
                             ],
                         },
                         "input_tokens": input_tokens, "output_tokens": output_tokens,
                         "error": None})
        except Exception as exc:
            rows.append({"condition": name, "protection_mode": mode, "expected": expected, "model_input": protected,
                         "units": [text],
                         "output": None, "input_tokens": None, "output_tokens": None,
                         "error": f"{type(exc).__name__}: {exc}"})
    madlad_module.protect_citations = original_protect
    madlad_module.restore_citations = original_restore
    OUTPUT.write_text(json.dumps({"fixture": case["id"], "model_version": engine.model_version,
                                  "source": source, "rows": rows}, ensure_ascii=False, indent=2) + "\n")
    print(OUTPUT)

if __name__ == "__main__":
    main()
