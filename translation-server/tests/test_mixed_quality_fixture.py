import json
import unittest
from pathlib import Path


class MixedQualityHeldoutFixtureTest(unittest.TestCase):
    def test_fixture_has_balanced_baseline_labels_and_blank_review_labels(self):
        path = Path(__file__).parents[2] / "test-data" / "real-papers" / "reports" / "mixed-quality-heldout-v1.json"
        payload = json.loads(path.read_text(encoding="utf-8"))
        cases = payload["cases"]
        accepted = [case for case in cases if case["baselineAccepted"]]
        fallback = [case for case in cases if not case["baselineAccepted"]]
        self.assertEqual(len(cases), payload["count"])
        self.assertEqual(len(accepted), 12)
        self.assertEqual(len(fallback), 5)
        self.assertTrue(all(case["truth"]["severity"] is None for case in cases))
        self.assertTrue(all(case["truth"]["manualLabel"] is None for case in cases))
        self.assertTrue(all(case["source"] and case["baselineTranslation"] for case in cases))


if __name__ == "__main__":
    unittest.main()
