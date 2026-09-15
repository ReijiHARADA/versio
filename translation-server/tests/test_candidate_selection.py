import unittest

from scripts.score_candidate_selection import signals


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


if __name__ == "__main__":
    unittest.main()
