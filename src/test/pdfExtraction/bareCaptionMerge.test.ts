import { describe, expect, it } from "vitest";
import type { CanonicalNode } from "../../services/pdfExtraction/canonical/types";
import {
  demoteRepeatedBareCaptions,
  mergeFigureCaptionContinuations,
  mergeTableCaptionContinuations,
} from "../../services/pdfExtraction/resolver/documentResolver";

function node(
  role: CanonicalNode["role"],
  text: string,
  opts: { id?: string; page?: number; y?: number } = {},
): CanonicalNode {
  const page = opts.page ?? 1;
  const y = opts.y ?? 100;
  return {
    id: opts.id ?? `n-${role}-${page}-${y}`,
    role,
    text,
    pageStart: page,
    pageEnd: page,
    confidence: 0.9,
    evidence: [],
    boundingBoxes: [{ page, x: 60, y, width: 80, height: 12 }],
    sourceAnchor: { page, boundingBoxes: [], normalizedTextHash: text },
  } as CanonicalNode;
}

describe("demoteRepeatedBareCaptions", () => {
  it("keeps the first bare Table N and demotes later page repeats", () => {
    const nodes = demoteRepeatedBareCaptions([
      node("caption", "Table 5", { id: "c1", page: 25, y: 731 }),
      node("table", "Author scores …", { id: "t1", page: 25, y: 400 }),
      node("caption", "Table 5", { id: "c2", page: 26, y: 731 }),
      node("caption", "Table 5", { id: "c3", page: 27, y: 730 }),
    ]);
    expect(nodes.find((n) => n.id === "c1")?.role).toBe("caption");
    expect(nodes.find((n) => n.id === "c2")?.role).toBe("other");
    expect(nodes.find((n) => n.id === "c3")?.role).toBe("other");
  });

  it("does not demote a different table number", () => {
    const nodes = demoteRepeatedBareCaptions([
      node("caption", "Table 5", { id: "c1", page: 25, y: 731 }),
      node("caption", "Table 6", { id: "c2", page: 26, y: 731 }),
    ]);
    expect(nodes.every((n) => n.role === "caption")).toBe(true);
  });

  it("demotes a bare Figure N callout sitting on top of a full figure legend", () => {
    const nodes = demoteRepeatedBareCaptions([
      {
        ...node("caption", "Figure 2", { id: "bare", page: 23, y: 647 }),
        boundingBoxes: [{ page: 23, x: 27.7, y: 647.2, width: 43.7, height: 14 }],
      },
      {
        ...node(
          "caption",
          "Figure 1 A‒C | Clinicians’ reported data collection methods: A) number of clinicians using each method.",
          { id: "full", page: 23, y: 681 },
        ),
        boundingBoxes: [{ page: 23, x: 27.7, y: 681.0, width: 554.4, height: 40 }],
      },
    ]);
    expect(nodes.find((n) => n.id === "bare")?.role).toBe("other");
    expect(nodes.find((n) => n.id === "full")?.role).toBe("caption");
  });

  it("keeps a bare FIGURE N when no full legend sits directly below", () => {
    const nodes = demoteRepeatedBareCaptions([
      {
        ...node("caption", "FIGURE 3", { id: "bare", page: 6, y: 311 }),
        boundingBoxes: [{ page: 6, x: 60, y: 311.6, width: 50, height: 10 }],
      },
      {
        ...node("heading", "2.4 Signal acquisition", { id: "h", page: 6, y: 570 }),
        boundingBoxes: [{ page: 6, x: 60, y: 570.5, width: 200, height: 14 }],
      },
    ]);
    expect(nodes.find((n) => n.id === "bare")?.role).toBe("caption");
  });

  it("demotes bare FIGURE N with a same-page period-only Figure N. twin", () => {
    const nodes = demoteRepeatedBareCaptions([
      {
        ...node("caption", "FIGURE 2", { id: "bare", page: 5, y: 214 }),
        boundingBoxes: [{ page: 5, x: 60, y: 214, width: 50, height: 10 }],
      },
      {
        ...node("caption", "Figure 2.", { id: "dot", page: 5, y: 495 }),
        boundingBoxes: [{ page: 5, x: 50, y: 495, width: 60, height: 10 }],
      },
    ]);
    expect(nodes.find((n) => n.id === "bare")?.role).toBe("other");
    expect(nodes.find((n) => n.id === "dot")?.role).toBe("other");
  });

  it("demotes right-rail bare Table N beside a same-baseline results grid", () => {
    const nodes = demoteRepeatedBareCaptions([
      {
        ...node(
          "table",
          "S1 Real dataset Real dataset Evaluate baseline model performance using only real data",
          { id: "grid", page: 15, y: 685 },
        ),
        boundingBoxes: [{ page: 15, x: 64.7, y: 685.1, width: 8.4, height: 12 }],
      },
      {
        ...node("caption", "Table 9", { id: "bare", page: 15, y: 685 }),
        boundingBoxes: [{ page: 15, x: 512.8, y: 685.1, width: 40, height: 10 }],
      },
    ]);
    expect(nodes.find((n) => n.id === "bare")?.role).toBe("other");
  });

  it("demotes bare Table N sandwiched in mid-sentence column fragments", () => {
    const nodes = demoteRepeatedBareCaptions([
      {
        ...node("paragraph", "= 2), and failure to record any data (n =", {
          id: "left",
          page: 11,
          y: 570,
        }),
        boundingBoxes: [{ page: 11, x: 179.5, y: 570.6, width: 150, height: 12 }],
      },
      {
        ...node("caption", "Table 4", { id: "bare", page: 11, y: 584 }),
        boundingBoxes: [{ page: 11, x: 341.1, y: 584.6, width: 40, height: 10 }],
      },
      {
        ...node("paragraph", "2). Their educational levels ranged from illiteracy", {
          id: "right",
          page: 11,
          y: 570,
        }),
        boundingBoxes: [{ page: 11, x: 351.2, y: 570.6, width: 200, height: 12 }],
      },
    ]);
    expect(nodes.find((n) => n.id === "bare")?.role).toBe("other");
  });
});

describe("mergeTableCaptionContinuations legend verbs", () => {
  it("merges bare Table N with same-baseline shows-the… legend", () => {
    const merged = mergeTableCaptionContinuations([
      {
        ...node("caption", "Table 2", { id: "c", page: 7, y: 696 }),
        boundingBoxes: [{ page: 7, x: 440.5, y: 696.4, width: 28, height: 10 }],
      },
      {
        ...node(
          "table",
          "shows the codes Information Analysis stage. considered for each of the research questions.",
          { id: "t", page: 7, y: 696 },
        ),
        boundingBoxes: [{ page: 7, x: 472.3, y: 696.4, width: 200, height: 10 }],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.role).toBe("caption");
    expect(merged[0]?.text).toMatch(/^Table 2 shows the codes/);
  });
});

describe("mergeFigureCaptionContinuations page-boundary bare legend", () => {
  it("merges bare Figure N at page foot with next-page top legend", () => {
    const merged = mergeFigureCaptionContinuations([
      {
        ...node("caption", "Figure 3", { id: "c3", page: 19, y: 729 }),
        boundingBoxes: [{ page: 19, x: 27.7, y: 729.0, width: 50, height: 12 }],
      },
      {
        ...node(
          "paragraph",
          "β-diversity of Pipeline Refinement and Final Results Relative to Theoretical Sample Content at Genus Level",
          { id: "leg", page: 20, y: 48 },
        ),
        boundingBoxes: [{ page: 20, x: 27.7, y: 48.7, width: 500, height: 24 }],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.text).toMatch(/^Figure 3 β-diversity of Pipeline/);
  });
});

describe("mergeFigureCaptionContinuations", () => {
  it("merges a bare FIGURE N with a long panel-legend paragraph", () => {
    const merged = mergeFigureCaptionContinuations([
      {
        ...node("caption", "FIGURE 2", { id: "c1", page: 9, y: 519.1 }),
        boundingBoxes: [{ page: 9, x: 61.6, y: 519.1, width: 24.1, height: 5.5 }],
      },
      {
        ...node(
          "paragraph",
          "Wav2Vec2 XLSR-53: (a, c, e, g) Show training/validation loss curves, and (b, d, f, h) Show WER/CER curves.",
          { id: "p1", page: 9, y: 528 },
        ),
        boundingBoxes: [{ page: 9, x: 61.6, y: 528, width: 454, height: 7 }],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.role).toBe("caption");
    expect(merged[0]?.text).toMatch(/^FIGURE 2 Wav2Vec2/);
  });

  it("merges a bare FIGURE N with a short Results-of… heading legend", () => {
    const merged = mergeFigureCaptionContinuations([
      {
        ...node("caption", "FIGURE 1", { id: "c1", page: 4, y: 100 }),
        boundingBoxes: [{ page: 4, x: 60, y: 100, width: 70, height: 14 }],
      },
      {
        ...node("heading", "Results of FC analysis for Task A", { id: "h1", page: 4, y: 120 }),
        boundingBoxes: [{ page: 4, x: 60, y: 120, width: 220, height: 14 }],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.role).toBe("caption");
    expect(merged[0]?.text).toMatch(/^FIGURE 1 Results of FC analysis/);
  });

  it("does not merge a bare section heading Results into FIGURE N", () => {
    const merged = mergeFigureCaptionContinuations([
      {
        ...node("caption", "FIGURE 1", { id: "c1", page: 4, y: 100 }),
        boundingBoxes: [{ page: 4, x: 60, y: 100, width: 70, height: 14 }],
      },
      {
        ...node("heading", "Results", { id: "h1", page: 4, y: 120 }),
        boundingBoxes: [{ page: 4, x: 60, y: 120, width: 80, height: 14 }],
      },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.role).toBe("heading");
    expect(merged[1]?.text).toBe("Results");
  });

  it("merges a legend onto the geometrically nearest bare FIGURE N when order is scrambled", () => {
    // Two-column pages can emit FIGURE 4, intervening prose, FIGURE 5, then
    // the FIGURE 4 legend — array-last caption would wrongly own the legend.
    const legend =
      "Linear coupling analysis of the DIP-PIP joints for the index, middle, ring, and pinky fingers.";
    const merged = mergeFigureCaptionContinuations([
      {
        ...node("caption", "FIGURE 4", { id: "c4", page: 6, y: 420 }),
        boundingBoxes: [{ page: 6, x: 60, y: 420, width: 50, height: 8 }],
      },
      {
        ...node("paragraph", "PCA of the joint-angle space shows orthogonal components.", {
          id: "p-inter",
          page: 6,
          y: 200,
        }),
        boundingBoxes: [{ page: 6, x: 300, y: 200, width: 200, height: 40 }],
      },
      {
        ...node("caption", "FIGURE 5 DIP-PIP joint coupling analysis for the thumb.", {
          id: "c5",
          page: 6,
          y: 100,
        }),
        boundingBoxes: [{ page: 6, x: 60, y: 100, width: 400, height: 20 }],
      },
      {
        ...node("paragraph", legend, { id: "p-leg", page: 6, y: 432 }),
        boundingBoxes: [{ page: 6, x: 60, y: 432, width: 400, height: 24 }],
      },
    ]);
    const fig4 = merged.find((n) => n.id === "c4");
    expect(fig4?.text).toMatch(/^FIGURE 4 Linear coupling analysis/);
    expect(merged.find((n) => n.id === "c5")?.text).toMatch(/^FIGURE 5 DIP-PIP/);
    expect(merged.some((n) => n.id === "p-leg")).toBe(false);
    expect(merged.some((n) => n.id === "p-inter")).toBe(true);
  });

  it("merges a bare FIGURE N with a Methods-of… panel legend paragraph", () => {
    const legend =
      "Methods of analysis of neuronal network activity as revealed by in vivo AD mouse models. (A) Workflow overview.";
    const merged = mergeFigureCaptionContinuations([
      {
        ...node("caption", "FIGURE 2", { id: "c1", page: 4, y: 382.9 }),
        boundingBoxes: [{ page: 4, x: 61.5, y: 382.9, width: 40, height: 6 }],
      },
      {
        ...node("paragraph", legend, { id: "p1", page: 4, y: 392.8 }),
        boundingBoxes: [{ page: 4, x: 61.5, y: 392.8, width: 450, height: 40 }],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.role).toBe("caption");
    expect(merged[0]?.text).toMatch(/^FIGURE 2 Methods of analysis/);
  });

  it("does not merge a bare Methods section heading into FIGURE N", () => {
    const merged = mergeFigureCaptionContinuations([
      {
        ...node("caption", "FIGURE 2", { id: "c1", page: 4, y: 100 }),
        boundingBoxes: [{ page: 4, x: 60, y: 100, width: 70, height: 14 }],
      },
      {
        ...node("heading", "Methods", { id: "h1", page: 4, y: 120 }),
        boundingBoxes: [{ page: 4, x: 60, y: 120, width: 80, height: 14 }],
      },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.role).toBe("heading");
    expect(merged[1]?.text).toBe("Methods");
  });

  it("merges bare Figure N: with a same-number Figure N) legend caption", () => {
    const merged = mergeFigureCaptionContinuations([
      {
        ...node("caption", "Figure 4:", { id: "c1", page: 23, y: 149.4 }),
        boundingBoxes: [{ page: 23, x: 70, y: 149.4, width: 50, height: 12 }],
      },
      {
        ...node(
          "caption",
          "Figure 4) Age distribution of the >3.2 Ga zircons analyzed, indicating whether the SVM indexed these zircons.",
          { id: "c2", page: 23, y: 514.2 },
        ),
        boundingBoxes: [{ page: 23, x: 70, y: 514.2, width: 400, height: 40 }],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.text).toMatch(/^Figure 4: Figure 4\) Age distribution/);
  });

  it("merges a bare FIGURE N with a Figure-depicting… legend paragraph", () => {
    const merged = mergeFigureCaptionContinuations([
      {
        ...node("caption", "FIGURE 1", { id: "c1", page: 3, y: 200 }),
        boundingBoxes: [{ page: 3, x: 60, y: 200, width: 40, height: 6 }],
      },
      {
        ...node(
          "paragraph",
          "Figure depicting the BERT model architecture. The figure is adapted from the original publication.",
          { id: "p1", page: 3, y: 210 },
        ),
        boundingBoxes: [{ page: 3, x: 60, y: 210, width: 400, height: 20 }],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.text).toMatch(/^FIGURE 1 Figure depicting the BERT/);
  });

  it("does not merge a second numbered Figure N caption into FIGURE N", () => {
    const merged = mergeFigureCaptionContinuations([
      {
        ...node("caption", "FIGURE 1", { id: "c1", page: 3, y: 200 }),
        boundingBoxes: [{ page: 3, x: 60, y: 200, width: 40, height: 6 }],
      },
      {
        ...node("paragraph", "Figure 2 Overview of the evaluation pipeline.", {
          id: "p1",
          page: 3,
          y: 210,
        }),
        boundingBoxes: [{ page: 3, x: 60, y: 210, width: 400, height: 20 }],
      },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("merges a long panel legend (>220 words) onto bare FIGURE N", () => {
    const panel =
      "Subregion-specific functional connectivity alterations in successful cognitive aging and their associations with episodic memory. " +
      "(A) Parcellation of the posterior cingulate cortex based on the connectivity. ".repeat(20) +
      "(B) Group differences across aging cohorts with multiple comparisons.";
    expect(panel.split(/\s+/).filter(Boolean).length).toBeGreaterThan(220);
    const merged = mergeFigureCaptionContinuations([
      {
        ...node("caption", "FIGURE 1", { id: "c1", page: 5, y: 325.2 }),
        boundingBoxes: [{ page: 5, x: 61.8, y: 325.2, width: 24, height: 5.5 }],
      },
      {
        ...node("paragraph", panel, { id: "p1", page: 5, y: 335.2 }),
        boundingBoxes: [{ page: 5, x: 61.8, y: 335.2, width: 450, height: 7 }],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.text).toMatch(/^FIGURE 1 Subregion-specific/);
  });

  it("merges a This-figure legend that precedes a bare Fig. N", () => {
    const legend =
      ": This figure illustrates the central mechanics of the tracking algorithm for scenario S1 for 2D images";
    const merged = mergeFigureCaptionContinuations([
      {
        ...node("paragraph", legend, { id: "p1", page: 5, y: 592.1 }),
        boundingBoxes: [{ page: 5, x: 422.3, y: 592.1, width: 515, height: 10 }],
      },
      {
        ...node("caption", "Fig. 2", { id: "c1", page: 5, y: 621.1 }),
        boundingBoxes: [{ page: 5, x: 422.3, y: 621.1, width: 29, height: 10 }],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.role).toBe("caption");
    expect(merged[0]?.text).toMatch(/^Fig\. 2 This figure illustrates/);
  });

  it("does not merge unrelated body prose preceding a bare Fig. N", () => {
    const merged = mergeFigureCaptionContinuations([
      {
        ...node(
          "paragraph",
          "The primary goal of our instance tracking algorithm is to accurately track the object instances over time.",
          { id: "p1", page: 5, y: 560 },
        ),
        boundingBoxes: [{ page: 5, x: 422.3, y: 560, width: 400, height: 10 }],
      },
      {
        ...node("caption", "Fig. 2", { id: "c1", page: 5, y: 621 }),
        boundingBoxes: [{ page: 5, x: 422.3, y: 621, width: 29, height: 10 }],
      },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.text).toBe("Fig. 2");
  });
});

describe("mergeTableCaptionContinuations", () => {
  it("merges a Title-Case legend that precedes a bare Table N on the same baseline", () => {
    const merged = mergeTableCaptionContinuations([
      {
        ...node(
          "paragraph",
          "Results of question 9: Total counts of classification of related technologies in the context of",
          { id: "p1", page: 12, y: 90 },
        ),
        boundingBoxes: [{ page: 12, x: 73, y: 90, width: 400, height: 12 }],
      },
      {
        ...node("caption", "Table 5", { id: "c1", page: 12, y: 90 }),
        boundingBoxes: [{ page: 12, x: 50, y: 90, width: 40, height: 12 }],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.role).toBe("caption");
    expect(merged[0]?.text).toMatch(/^Table 5 Results of question 9/);
  });

  it("merges a long same-baseline Title-Case legend after bare Table N", () => {
    const legend =
      "New sentence split for the reader-specific Eyettention IIreaderBERT. demb denotes the size of the reader-specific embedding. MAE is reported for fixation duration (ms) and landing position (normalized).";
    const merged = mergeTableCaptionContinuations([
      {
        ...node("caption", "Table 7", { id: "c1", page: 14, y: 492.5 }),
        boundingBoxes: [{ page: 14, x: 51, y: 492.5, width: 24.5, height: 8.5 }],
      },
      {
        ...node("paragraph", legend, { id: "p1", page: 14, y: 492.5 }),
        boundingBoxes: [{ page: 14, x: 81.5, y: 492.5, width: 207, height: 8.5 }],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.role).toBe("caption");
    expect(merged[0]?.text).toMatch(/^Table 7 New sentence split/);
  });
});
