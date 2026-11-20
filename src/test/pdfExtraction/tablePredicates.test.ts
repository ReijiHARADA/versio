import { describe, expect, it } from "vitest";
import { hasStrongNativeTableRows, isChartDebrisFragment } from "../../services/pdfExtraction/projection/tablePredicates";
import type { CanonicalNode } from "../../services/pdfExtraction/canonical/types";
import type { LayoutBlock, LayoutLine } from "../../services/pdfLayout";

const prose = [
  "A meta-review requires a critical appraisal of the methodological quality of systematic reviews and meta-analyses.",
  "For this review, the guidelines of Preferred Reporting Items for Systematic Reviews and Meta-Analyses were followed.",
  "ROBIS was used to assess the bias in the search selection and synthesis of the included reviews.",
];

const statisticalProse = [
  "mental rotation accuracy increased, imitation accuracy increased (B = 0.3). See Figure 4.",
  "For the mental rotation RT analysis, we first removed trials that were incorrect (586 trials), had RTs less than 500 ms (18 trials).",
  "There were significant effects of mental rotation RT and condition, but no significant interaction on imitation accuracy.",
];

const line = (text: string, y: number): LayoutLine => ({
  text,
  items: [{}, {}] as LayoutLine["items"],
  page: 2,
  column: "right",
  x: 305,
  y,
  width: 241,
  height: 10,
  fontSize: 9,
  bbox: { page: 2, x: 305, y, width: 241, height: 10 },
});

const layout = (lines: LayoutLine[], text = lines.map((entry) => entry.text).join(" ")): LayoutBlock => ({
  role: "paragraph",
  text,
  lines,
  pageStart: 2,
  pageEnd: 2,
  column: "right",
  bbox: { page: 2, x: 305, y: lines[0].y, width: 241, height: lines.length * 12 },
});

const node = (text: string): CanonicalNode => ({
  id: "body-beside-table",
  role: "paragraph",
  text,
  pageStart: 2,
  pageEnd: 2,
  boundingBoxes: [],
  confidence: 0.86,
  evidence: [{ source: "geometry", label: "table-row-geometry", confidence: 0.96, page: 2, bbox: { page: 2, x: 305, y: 375, width: 241, height: 36 } }],
  sourceAnchor: { page: 2, boundingBoxes: [] },
});

describe("hasStrongNativeTableRows", () => {
  it("keeps running prose beside captioned table rows out of a recovered table", () => {
    const lines = prose.map((text, index) => line(text, 375 + index * 12));
    expect(hasStrongNativeTableRows(node(prose.join(" ")), layout(lines))).toBe(false);
  });

  it("keeps statistical body prose beside captioned rows out of a recovered table", () => {
    const lines = statisticalProse.map((text, index) => line(text, 375 + index * 12));
    expect(hasStrongNativeTableRows(node(statisticalProse.join(" ")), layout(lines))).toBe(false);
  });

  it("keeps compact multi-cell rows recoverable as a table", () => {
    const lines = ["Measure Value", "Accuracy 0.91", "Recall 0.84"].map((text, index) => line(text, 375 + index * 12));
    expect(hasStrongNativeTableRows(node(lines.map((entry) => entry.text).join(" ")), layout(lines))).toBe(true);
  });
});

describe("isChartDebrisFragment", () => {
  it("keeps a short capitalised sentence and drops lower-case label crumbs", () => {
    expect(isChartDebrisFragment("The SHAP explainability framework was employed to analyze the feature")).toBe(false);
    expect(isChartDebrisFragment("of the selected models")).toBe(true);
    expect(isChartDebrisFragment("Bolded values are the best")).toBe(true);
  });
});
