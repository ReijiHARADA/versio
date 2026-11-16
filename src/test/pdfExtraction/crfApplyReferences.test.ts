import { beforeAll, describe, expect, it } from "vitest";
import { applyCrfReferences, referencesEnd, wantsCrfReferences } from "../../services/pdfExtraction/crf/applyReferences";
import { loadNodeCrfRuntime } from "../../services/pdfExtraction/crf/nodeRuntime";
import { trimZone } from "../../services/pdfExtraction/crf/referenceZone";
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
    const ja = "山田太郎. 2020. 日本語の参考文献. 情報処理学会論文誌.";
    const jaPage = { pageNumber: 1, width: 600, height: 800, textItems: [item("参考文献", 40, 80), item(ja, 40, 100)] } as never;
    expect(wantsCrfReferences([jaPage], [block("b-ref", "reference", ja, 100)], [section])).toBe(false);
  });

  it("reads the zone after a References heading on the page even when the blocks lost it", () => {
    const zonePage = { pageNumber: 1, width: 600, height: 800, textItems: [item("Body text ends here.", 40, 60), item("References", 40, 84), ...REFS.map((t, i) => item(t, 40, 100 + i * 12))] } as never;
    const blocks = [block("b-body", "paragraph", "Body text ends here.", 56, "s-body")];
    const { blocks: out, outcome } = applyCrfReferences({ paperId: "p", pages: [zonePage], blocks, sections: [] });
    expect(outcome.applied).toBe(true);
    expect(out.map((b) => b.type)).toEqual(["paragraph", "reference", "reference"]);
    expect(out[0].id).toBe("b-body");
  });

  it("keeps the blocks when there is no references section", () => {
    const blocks = [block("b-body", "paragraph", "Body text.", 40, "s-body")];
    const { blocks: out, outcome } = applyCrfReferences({ paperId: "p", pages: [page], blocks, sections: [] });
    expect(outcome.applied).toBe(false);
    expect(out).toBe(blocks);
  });
});

describe("referencesEnd", () => {
  const ref = { year: "2020", authors: "A. B." };
  const prose = {};
  it("cuts an absorbed appendix after the last run of references", () => {
    expect(referencesEnd([ref, ref, ref, prose, ref, prose, prose, prose, prose])).toBe(5);
  });
  it("keeps one or two trailing entries without fields", () => {
    expect(referencesEnd([ref, ref, ref, prose, prose])).toBe(5);
  });
  it("does not cut when references continue after a few odd entries", () => {
    expect(referencesEnd([ref, prose, prose, ref, ref, ref])).toBe(6);
  });
});

describe("referencesEnd with web references", () => {
  it("keeps numbered entries that only carry a URL", () => {
    const web = (n: number) => ({ raw: `${n}. GitHub - tool [https://github.com/x/y]` });
    expect(referencesEnd([{ raw: "1. A B. Title. 2020.", year: "2020" }, web(2), web(3), web(4), web(5)])).toBe(5);
  });
});

describe("trimZone", () => {
  const l = (text: string, fontSize = 8) => ({ text, fontSize });
  it("ends at a larger numbered section heading but not at a numbered reference", () => {
    const lines = [l("1. Smith J, Lee K. Title. 2020."), l("2. Doe A. Other title. 2019."), l("3. Roe B, Poe C. Third. 2018.", 9), l("4. Kim D. Fourth. 2017."), l("A Tool Module", 10), l("Body of the appendix.")];
    expect(trimZone(lines).map((x) => x.text)).toEqual(lines.slice(0, 4).filter((x) => x.fontSize === 8).map((x) => x.text));
  });
});
