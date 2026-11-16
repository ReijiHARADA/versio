import { describe, expect, it } from "vitest";
import { stitchParagraphContinuations } from "../../services/pdfExtraction/projection/stitchParagraphs";
import type { PaperBlock } from "../../types/paper";

const block = (id: string, type: PaperBlock["type"], original: string, page = 1, metadata: Record<string, unknown> = {}): PaperBlock =>
  ({
    id,
    paperId: "p",
    sectionId: "s-body",
    type,
    order: 0,
    pageStart: page,
    pageEnd: page,
    boundingBoxes: [{ page, x: 40, y: 100, width: 300, height: 40 }],
    original,
    translated: null,
    extractionConfidence: null,
    translationStatus: "pending",
    parentBlockId: null,
    metadata,
  }) as PaperBlock;

const sections = [{ id: "s-body", normalizedKind: "body" }, { id: "s-ref", normalizedKind: "references" }];
const OPEN = "Search for relevant papers was conducted in four main databases. This was done to enhance efficiency in";
const CONTINUATION = "the screening process, and two reviewers resolved every disagreement by discussion.";

describe("stitchParagraphContinuations", () => {
  it("rejoins a paragraph interrupted by a figure, its caption and a running head", () => {
    const blocks = [
      block("a", "paragraph", OPEN, 2, { translationInputWarning: "段落の末尾が欠けている可能性があります" }),
      block("fig", "figure", "", 3),
      block("head", "paragraph", "Amoadu et al. BMC Psychology", 3),
      block("b", "paragraph", CONTINUATION, 3, { translationInputWarning: "段落の先頭が前段から続いている可能性があります" }),
    ];
    const out = stitchParagraphContinuations(blocks, sections);
    expect(out.map((b) => b.id)).toEqual(["a", "fig", "head"]);
    expect(out[0].original).toBe(`${OPEN} ${CONTINUATION}`);
    expect(out[0].pageEnd).toBe(3);
    expect(out[0].metadata.translationInputWarning).toBeUndefined();
    expect(out.map((b) => b.order)).toEqual([0, 1, 2]);
  });

  it("does not jump over a complete prose paragraph or an equation", () => {
    const complete = "Data extraction was handled independently by two researchers, who compared their tables and settled every difference before the synthesis began.";
    expect(stitchParagraphContinuations([block("a", "paragraph", OPEN), block("c", "paragraph", complete), block("b", "paragraph", CONTINUATION)], sections)).toHaveLength(3);
    expect(stitchParagraphContinuations([block("a", "paragraph", OPEN), block("eq", "equation", "x = y + z"), block("b", "paragraph", CONTINUATION)], sections)).toHaveLength(3);
  });

  it("keeps finished sentences, colon introductions, lists and references apart", () => {
    const finished = "Search for relevant papers was conducted in four main databases and in two registries.";
    expect(stitchParagraphContinuations([block("a", "paragraph", finished), block("b", "paragraph", CONTINUATION)], sections)).toHaveLength(2);
    expect(stitchParagraphContinuations([block("a", "paragraph", "The inclusion criteria for the review were the following:"), block("b", "paragraph", CONTINUATION)], sections)).toHaveLength(2);
    expect(stitchParagraphContinuations([block("a", "paragraph", OPEN, 1, { listRole: "item" }), block("b", "paragraph", CONTINUATION)], sections)).toHaveLength(2);
    const ref = { ...block("a", "paragraph", OPEN), sectionId: "s-ref" };
    expect(stitchParagraphContinuations([ref, block("b", "paragraph", CONTINUATION)], sections)).toHaveLength(2);
  });

  it("joins a word broken at a line-end hyphen and keeps compound hyphens", () => {
    const out = stitchParagraphContinuations([block("a", "paragraph", "The models were trained with a carefully designed pre-"), block("b", "paragraph", "processing step for every dataset.")], sections);
    expect(out[0].original).toBe("The models were trained with a carefully designed preprocessing step for every dataset.");
    const compound = stitchParagraphContinuations([block("a", "paragraph", "We compare the results with several state-of-the-"), block("b", "paragraph", "art baselines on four benchmarks.")], sections);
    expect(compound[0].original).toBe("We compare the results with several state-of-the-art baselines on four benchmarks.");
  });

  it("does not reach beyond the next page", () => {
    expect(stitchParagraphContinuations([block("a", "paragraph", OPEN, 2), block("b", "paragraph", CONTINUATION, 4)], sections)).toHaveLength(2);
  });
});
