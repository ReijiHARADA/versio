import { describe, expect, it } from "vitest";
import { fuseTitle } from "../../services/pdfExtraction/fusion";
import {
  characterErrorRate,
  pairwiseOrderAccuracy,
  relationPrecision,
  setScores,
  substringRecall,
  substringPrecision,
  titleExactMatch,
} from "../../services/pdfExtraction/metrics";

describe("extraction metrics", () => {
  it("matches structural labels when native PDF streams omit marker spacing", () => {
    expect(substringRecall(["Table6Inter-item correlation matrix"], ["Table 6"])).toBe(1);
  });
  it("matches titles after punctuation folding", () => {
    expect(
      titleExactMatch(
        "Interactive Jewellery: a design exploration",
        "Interactive Jewellery a design exploration"
      )
    ).toBe(true);
  });

  it("computes author set F1", () => {
    const scores = setScores(["Jane Doe", "John Smith"], ["jane doe"]);
    expect(scores.recall).toBe(1);
    expect(scores.precision).toBe(0.5);
  });

  it("scores pairwise reading order", () => {
    expect(
      pairwiseOrderAccuracy(
        ["left column starts here", "right column later"],
        [["left column", "right column"]]
      )
    ).toBe(1);
    expect(
      pairwiseOrderAccuracy(["right first", "left later"], [["left", "right"]])
    ).toBe(0);
  });

  it("computes CER for OCR comparison", () => {
    expect(characterErrorRate("abc", "abc")).toBe(0);
    expect(characterErrorRate("axc", "abc")).toBeCloseTo(1 / 3);
  });

  it("reports precision for partially annotated structural labels", () => {
    expect(substringPrecision(["INTRODUCTION", "ordinary prose"], ["INTRODUCTION"])).toBe(0.5);
    expect(substringPrecision([], ["INTRODUCTION"])).toBe(1);
  });

  it("scores relation precision separately from annotated recall", () => {
    expect(relationPrecision([{ from: "A", to: "B" }, { from: "X", to: "Y" }], [{ from: "A", to: "B" }])).toBe(0.5);
  });
});

describe("title fusion", () => {
  it("keeps native text even when GROBID offers a different string", () => {
    const fused = fuseTitle(
      ["Interactive Jewellery: a design exploration"],
      [
        {
          source: "format-profile",
          label: "acm-title-region",
          confidence: 0.88,
        },
      ],
      "A completely different GROBID title"
    );
    expect(fused.text).toBe("Interactive Jewellery: a design exploration");
    expect(fused.evidence.some((e) => e.source === "grobid")).toBe(true);
  });

  it("boosts the native candidate that GROBID agrees with", () => {
    const fused = fuseTitle(
      ["Workshop Notes", "Interactive Jewellery: a design exploration"],
      [],
      "Interactive Jewellery: a design exploration"
    );
    expect(fused.text).toMatch(/Interactive Jewellery/i);
  });
});
