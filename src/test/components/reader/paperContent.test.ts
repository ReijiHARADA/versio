import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaperContent } from "../../../components/reader/PaperContent";
import {
  introductionBlocks,
  introductionPaper,
  introductionSections,
} from "../../../data/introductionPaper";
import type { Annotation } from "../../../types/annotation";
import type { PaperBlock } from "../../../types/paper";

// Characterization: PaperContent's rendered markup must not change during refactors.
const firstSection = introductionSections[0].id;
const base = introductionBlocks[0];
const extra = (id: string, order: number, fields: Partial<PaperBlock>): PaperBlock => ({
  ...base,
  id,
  order,
  translated: null,
  metadata: {},
  ...fields,
});

const blocks: PaperBlock[] = [
  ...introductionBlocks,
  extra("x-figure", 1000, {
    sectionId: firstSection,
    type: "figure",
    metadata: { figureNumber: "Figure 1", captionOriginal: "Figure 1: A figure", captionTranslated: "図1: 図" },
  }),
  extra("x-table", 1001, {
    sectionId: firstSection,
    type: "table",
    metadata: { tableNumber: "Table 1", captionOriginal: "Table 1: A table", captionTranslated: null },
  }),
  extra("x-equation", 1002, { sectionId: firstSection, type: "equation", original: "E = mc^2", metadata: { latex: "E = mc^2" } }),
  extra("x-footnote", 1003, { sectionId: firstSection, type: "footnote", original: "1 A footnote." }),
  extra("x-page-number", 1004, { sectionId: firstSection, type: "footnote", original: "12" }),
  extra("x-orphan", 1005, { sectionId: null, type: "paragraph", original: "Orphan paragraph.", translated: "孤立した段落。" }),
  extra("x-ref-url", 1006, {
    sectionId: introductionSections[introductionSections.length - 1].id,
    type: "reference",
    original: "[9] Example. 2020. See https://example.org/paper and doi:10.1000/xyz.",
    metadata: { referenceNumber: 9, referenceId: "ref-9" },
  }),
];

const annotations = [
  {
    id: "a1",
    paperId: base.paperId,
    blockId: introductionBlocks[1].id,
    type: "highlight",
    color: "yellow",
    selectedText: introductionBlocks[1].translated?.slice(0, 6) ?? "",
    note: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
] as unknown as Annotation[];

describe("PaperContent markup", () => {
  it("renders the introduction paper with every block kind", () => {
    const html = renderToStaticMarkup(
      createElement(PaperContent, {
        paper: introductionPaper,
        sections: introductionSections,
        blocks,
        annotations,
        onSectionVisible: () => {},
      })
    );
    expect(html.length).toBeGreaterThan(1000);
    expect(html).toMatchSnapshot();
  });
});
