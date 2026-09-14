"""Run the clean-source fallback corpus through the production engine.

This deliberately bypasses PDF extraction.  It records one row per fixture so
whole-unit failures can be compared with segmenter output without changing
production acceptance rules.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engines.madlad_mps import MADLADEngine  # noqa: E402
from engines.segmenter import segment_for_translation  # noqa: E402


def main() -> None:
    fixture_path = ROOT / "benchmarks" / "translation-unit-fallback-fixtures-v66.json"
    output_path = ROOT / "benchmarks" / "translation-unit-diagnosis-v76.json"
    fixtures = json.loads(fixture_path.read_text())
    engine = MADLADEngine()
    engine.load_model()
    rows = []
    for case in fixtures["cases"]:
        source = case["source"]
        units = segment_for_translation(source)
        row = {
            "id": case["id"],
            "source": source,
            "units": [u.text for u in units],
            "model_inputs": [u.model_input for u in units],
            "unit_count": len(units),
            "source_round_trip": " ".join(u.text for u in units).split()
            == source.split(),
            "model_version": engine.model_version,
        }
        try:
            result = engine.translate(source, "en", "ja")
            row["result"] = result.__dict__
            row["error"] = None
        except Exception as exc:  # diagnostics must preserve failures
            row["result"] = None
            row["error"] = f"{type(exc).__name__}: {exc}"
        rows.append(row)
    output_path.write_text(json.dumps({"model_version": engine.model_version, "rows": rows}, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {output_path} ({len(rows)} fixtures)")


if __name__ == "__main__":
    main()
