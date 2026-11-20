import { describe, expect, it } from "vitest";
import { looksLikeMathOrDataFragment } from "../../services/pdfLayout";

describe("looksLikeMathOrDataFragment", () => {
  it("flags display-math and chart fragments", () => {
    for (const text of ["S∈[Y ]\\k |S|", "1 X kikj", "1 u(s, x, l)", "46.29 dB / 90.62% 46.93 dB / 93.75%", "VC-N VC-R(%) MF-N"]) {
      expect(looksLikeMathOrDataFragment(text), text).toBe(true);
    }
  });

  it("keeps ordinary and acronym headings", () => {
    for (const text of ["4.1.2 GPT-4", "3 A New Method", "4.3 RoBERTa (Liu et al.)", "2 mBERT", "Results", "A.1 Proof of Lemma 3"]) {
      expect(looksLikeMathOrDataFragment(text), text).toBe(false);
    }
  });
});
