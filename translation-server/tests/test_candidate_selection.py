import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.score_candidate_selection import main, signals


class CandidateSelectionSignalsTest(unittest.TestCase):
    def test_numeric_and_negation_loss_are_visible(self):
        result = signals("The result was not significant (p < 0.001).", "結果は有意でした (p < 0.01)")
        self.assertEqual(result["numericTotal"], 1)
        self.assertEqual(result["numericKept"], 0)
        self.assertFalse(result["negationPreserved"])

    def test_continuation_ending_is_rejected_as_surface_signal(self):
        result = signals("The method was evaluated in a second study.", "この方法は第2研究で")
        self.assertTrue(result["likelyTruncated"])

    def test_complete_academic_candidate_has_clean_surface_signals(self):
        result = signals("The result was significant (p < 0.001).", "結果は有意であった (p < 0.001)。")
        self.assertEqual(result["numericKept"], result["numericTotal"])
        self.assertFalse(result["likelyTruncated"])
        self.assertFalse(result["garbledSpacing"])

    def test_simplified_cjk_is_audit_only_mixed_script_signal(self):
        result = signals("The result was significant.", "結果は显著でした。")
        self.assertTrue(result["mixedScriptRisk"])
        self.assertIn("显", result["simplifiedOnlyCjk"])

    def test_scientific_technical_tokens_are_tracked_without_blacklisting_words(self):
        result = signals(
            "We evaluated the M2W system with EQS-HBP and TQP3M9009.",
            "M2WシステムをEQS-HBPで評価した。",
        )
        self.assertEqual(result["technicalTokenTotal"], 3)
        self.assertEqual(result["technicalTokenKept"], 2)
        self.assertEqual(result["missingTechnicalTokens"], ["TQP3M9009"])

    def test_claim_structure_signal_detects_respectively_and_pairings(self):
        result = signals(
            "A and B were tested against C and D, respectively.",
            "AとBは、それぞれCとDと比較された。",
        )
        self.assertTrue(result["claimStructurePresent"])
        self.assertTrue(result["claimStructurePreserved"])

    def test_claim_structure_signal_marks_missing_mapping(self):
        result = signals(
            "A and B were tested against C and D, respectively.",
            "AとBをCとDに対してテストした。",
        )
        self.assertFalse(result["claimStructurePreserved"])

    def test_semantic_relation_signals_cover_condition_time_and_trend(self):
        source = "If temperature increases before treatment, the later value is higher."
        result = signals(source, "治療前に温度が増加した場合、その後の値は高くなる。")
        self.assertTrue(result["conditionPreserved"])
        self.assertTrue(result["temporalRelationPreserved"])
        self.assertTrue(result["trendPreserved"])

    def test_heldout_rows_can_omit_paper_id(self):
        # Keep the held-out fixture shape explicit so future refactors do not
        # silently drop paperId-free rows.
        self.assertEqual(signals("A result was significant.", "結果は有意だった。")["numericTotal"], 0)

    def test_relative_where_clause_is_not_condition_requirement(self):
        result = signals("The study describes a setting where users interact.", "この研究はユーザーが操作する環境を説明する。")
        self.assertTrue(result["conditionPreserved"])

    def test_plain_more_is_not_trend_requirement(self):
        result = signals("The paper reports more examples in the appendix.", "付録に多くの例を示す。")
        self.assertTrue(result["trendPreserved"])

    def test_when_is_temporal_rather_than_condition(self):
        result = signals("When the trial ended, measurements were recorded.", "試験が終了したとき、測定値を記録した。")
        self.assertTrue(result["temporalRelationPreserved"])
        self.assertTrue(result["conditionPreserved"])

    def test_cli_matches_heldout_rows_without_paper_id(self):
        baseline = {"rows": [{"blockId": "heldout-1", "severity": 2,
                              "reviewLabel": "semantic_shift",
                              "source": "The result was not significant.",
                              "translation": "結果は有意ではなかった。"}]}
        candidate = {"results": [{"blockId": "heldout-1", "model": "fixture",
                                   "source": "The result was not significant.",
                                   "translation": "結果は有意ではなかった。"}]}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            baseline_path = root / "baseline.json"
            candidate_path = root / "candidate.json"
            output_path = root / "output.json"
            baseline_path.write_text(json.dumps(baseline), encoding="utf-8")
            candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
            with patch("sys.argv", ["score_candidate_selection.py", "--baseline", str(baseline_path),
                                     "--candidate", str(candidate_path), "--output", str(output_path)]):
                main()
            report = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(report["summary"]["rows"], 1)
            self.assertEqual(report["rows"][0]["auditSelection"], "fixture")


if __name__ == "__main__":
    unittest.main()
