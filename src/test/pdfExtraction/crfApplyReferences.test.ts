import { beforeAll, describe, expect, it } from "vitest";
import { applyCrfReferences, wantsCrfReferences } from "../../services/pdfExtraction/crf/applyReferences";
import { loadNodeCrfRuntime } from "../../services/pdfExtraction/crf/nodeRuntime";
import type { PaperBlock, Section } from "../../types/paper";

beforeAll(async () => {
  await loadNodeCrfRuntime();
}, 60_000);

const item = (text: string, x: number, y: number) => ({ text, x, y, width: text.length * 4, height: 8, fontSize: 8, fontName: "x", page: 1 });
const section = { id: "s-ref", normalizedKind: "references" } as Section;
const block = (id: string, type: PaperBlock["type"], original: string, y: number, sectionId: string | null = "s-ref"): PaperBlock =>
  ({ id, paperId: "p", sectionId, type, order: 0, pageStart: 1, pageEnd: 1, boundingBoxes: [{ page: 1, x: 40, y, width: 300, height: 30 }], original, translated: null, extractionConfidence: null, translationStatus: "skipped", parentBlockId: null, metadata: {} }) as PaperBlock;

const REFS = [
  "[1] Jane Smith and Bo Chen. 2020. Deep models of reading. Nature 12, 3 (2020), 1-10.",
  "[2] Ann Lee. 2019. Another paper on jewellery design. In Proceedings of CHI. ACM, 1-12.",
];
const page = { pageNumber: 1, width: 600, height: 800, textItems: REFS.map((t, i) => item(t, 40, 100 + i * 12)) } as never;

describe("applyCrfReferences", () => {
  it("rebuilds one block per reference with parsed fields", () => {
    const blocks = [block("b-body", "paragraph", "Body text.", 40, "s-body"), block("b-ref", "reference", REFS.join(" "), 100)];
    const { blocks: out, outcome } = applyCrfReferences({ paperId: "p", pages: [page], blocks, sections: [section] });
    expect(outcome.applied).toBe(true);
    const refs = out.filter((b) => b.type === "reference");
    expect(refs).toHaveLength(2);
    expect((refs[0].metadata.citation as { year?: string }).year).toBe("2020");
    expect(out[0].id).toBe("b-body");
    expect(out.map((b) => b.order)).toEqual(out.map((_, i) => i));
  });

  it("skips Japanese reference lists", () => {
    const blocks = [block("b-ref", "reference", "山田太郎. 2020. 日本語の参考文献. 情報処理学会論文誌.", 100)];
    expect(wantsCrfReferences([page], blocks, [section])).toBe(false);
  });

  it("keeps the blocks when there is no references section", () => {
    const blocks = [block("b-body", "paragraph", "Body text.", 40, "s-body")];
    const { blocks: out, outcome } = applyCrfReferences({ paperId: "p", pages: [page], blocks, sections: [] });
    expect(outcome.applied).toBe(false);
    expect(out).toBe(blocks);
  });
});
