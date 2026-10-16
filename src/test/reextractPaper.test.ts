import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import type { PaperBlock } from "../types/paper";
import { carryForwardExactTranslations } from "../services/reextractPaper";
import { reextractPaper } from "../services/reextractPaper";
import { resetStorageForTests, getStorage } from "../data/runtime";
import { extractPdfPages } from "./readingOrder/extractPdf";
import { extractFromPages } from "../services/pdfExtraction/pipeline/extractAcademicPdf";
import { projectionToPackage } from "../data/package/fromProjection";
import { persistPaperPackage, loadPaperPackage } from "../data/package/persist";
import { savePaper } from "../services/database";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const ozchiPdf = path.join(root, "test-data/real-papers/ozchi-finger-specific-touch.pdf");

function block(overrides: Partial<PaperBlock>): PaperBlock {
  return {
    id: "block-1",
    paperId: "paper-1",
    sectionId: null,
    type: "paragraph",
    order: 0,
    pageStart: 1,
    pageEnd: 1,
    boundingBoxes: [],
    original: "The original result is significant.",
    translated: null,
    extractionConfidence: 1,
    translationStatus: "pending",
    parentBlockId: null,
    metadata: {},
    ...overrides,
  };
}

describe("carryForwardExactTranslations", () => {
  beforeEach(async () => {
    await resetStorageForTests();
  });
  it("keeps a completed translation only when the re-extracted source is unchanged", () => {
    const previous = block({
      translated: "元の結果は有意です。",
      translationStatus: "completed",
      metadata: { captionTranslated: "訳されたキャプション" },
    });
    const [unchanged, changed] = carryForwardExactTranslations(
      [previous],
      [block({ id: "block-1", original: "The original result is significant." }), block({ id: "block-2", original: "The original result is not significant." })]
    );
    expect(unchanged.translated).toBe("元の結果は有意です。");
    expect(unchanged.translationStatus).toBe("completed");
    expect(unchanged.metadata.captionTranslated).toBe("訳されたキャプション");
    expect(changed.translated).toBeNull();
    expect(changed.translationStatus).toBe("pending");
  });

  it.skipIf(!fs.existsSync(ozchiPdf))("rebuilds an actual saved PDF package with source-only table cells when Canvas is unavailable", async () => {
    const pages = await extractPdfPages(ozchiPdf);
    const seed = extractFromPages({
      pages,
      paperId: "reextract-ozchi",
      filePath: path.basename(ozchiPdf),
      fileHash: "reextract-ozchi-hash",
      metadata: { pageCount: pages.length },
    });
    const sourcePdf = new Uint8Array(fs.readFileSync(ozchiPdf));
    const { fs: packageFs } = await getStorage();
    const seedPackage = projectionToPackage({
      paper: seed.paper,
      sections: seed.sections,
      blocks: seed.blocks,
      sourcePdf,
    });
    await persistPaperPackage(packageFs, seedPackage);
    await savePaper(seed.paper);

    const result = await reextractPaper(seed.paper.id);
    expect(result.paper.id).toBe(seed.paper.id);
    // Node has no Canvas backend, so extractFigureImages deliberately yields
    // zero crops here. The source-only fallback must still retain native cells
    // instead of regressing to a flattened table sentence.
    const table4 = result.blocks.find((block) =>
      block.type === "table" && block.original?.startsWith("Table 4.")
    );
    expect(table4?.type).toBe("table");
    expect((table4?.metadata.tableRows as Array<Array<{ text: string }>>)?.flat()
      .map((cell) => cell.text)).toEqual(expect.arrayContaining(["Finger", "Phonebook"]));
    const persisted = await loadPaperPackage(packageFs, seed.paper.id, {
      includeAssets: true,
      includeSourcePdf: true,
    });
    expect(persisted.sourcePdf?.byteLength).toBe(sourcePdf.byteLength);
    expect(persisted.structure.blocks[table4!.id]?.metadata.tableRows).toBeTruthy();
  }, 30_000);
});
