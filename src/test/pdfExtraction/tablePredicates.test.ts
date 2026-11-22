import { describe, expect, it } from "vitest";
import { hasStrongNativeTableRows, isChartDebrisFragment, looksLikeCitedProse } from "../../services/pdfExtraction/projection/tablePredicates";
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

describe("isShortFinishedSentence", () => {
  it("treats short finished prose as text, not a chart label", async () => {
    const { isShortFinishedSentence } = await import("../../services/pdfExtraction/projection/toPaper");
    expect(isShortFinishedSentence("where vmax(HR) denotes the maximum permitted translational velocity.")).toBe(true);
    expect(isShortFinishedSentence("Regression 16.2 (10.8) 34.8 (14.6) 17.4 27.2 (13.2) probability (11.2) (%)")).toBe(false);
    expect(isShortFinishedSentence("20190 2020 2021 2022 2023 2024")).toBe(false);
  });
});

describe("looksLikeCitedProse", () => {
  it("reads citation-heavy sentences as prose and header rows as a table", () => {
    expect(looksLikeCitedProse("Four articles were found to have been conducted in China (1, 3, 17, 18), 2 in Taiwan (6, 19), 1 in the UK (2), 1 in the Netherlands (20), 1 in Oman (4), 1 in the United States (5), 1 in South Korea (21), 1 in Brazil (13), 2 in Canada (22, 23), 1 in Denmark (24), and 1 in Jordania (25).")).toBe(true);
    expect(looksLikeCitedProse("significant differences (X2 (2, N = 49) = 46.082, p < 0.001, Friedman repeated-measures ANOVA on ranks), with the highest number of fixations for the war images (13.686 ± 2.397), followed by the text sections (9.746 ± 1.205), and the journalists’ images (7.509 ± 1.517) (see Figure 3).")).toBe(true);
    expect(looksLikeCitedProse("Condition Stress Working in settings not previously experienced Population Novice nurses/nurses Research question What are the stress factors of the nurses who are working in settings that they have not previously experienced and what are the coping strategies?")).toBe(false);
    expect(looksLikeCitedProse("• Older age (36, 41–43, 47, 59, 73) • Young age groups (20–40 years old) and the older adult (over 60 years old) of the population in the study")).toBe(false);
  });
});
