import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Paper, PaperBlock } from "../../types/paper";
import { getBlocksByPaper, saveBlocks, savePaper } from "../../services/database";
import { retryBlockTranslation } from "../../services/import/retryBlockTranslation";
import { resetStorageForTests } from "../../data/runtime";
import * as createEngine from "../../services/translation/createTranslationEngine";
import { TranslationQualityError } from "../../services/translation/retryPolicy";
import type { TranslationEngine, TranslationResult } from "../../services/translation/types";

function basePaper(id: string): Paper {
  return {
    id,
    sourceFilePath: `/tmp/${id}.pdf`,
    sourceFileHash: `${id}-hash`,
    titleOriginal: null,
    titleTranslated: null,
    authors: [],
    publication: null,
    year: null,
    pageCount: 1,
    processingStatus: "partial",
    lastReadBlockId: null,
    lastReadOffset: null,
    favorite: false,
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
  };
}

function baseBlock(paperId: string, blockId: string): PaperBlock {
  return {
    id: blockId,
    paperId,
    sectionId: null,
    type: "paragraph",
    order: 0,
    pageStart: 1,
    pageEnd: 1,
    boundingBoxes: [],
    original:
      "Interactive jewellery connects personal memories with wearable computing through meaningful daily interactions.",
    translated: null,
    extractionConfidence: 1,
    translationStatus: "failed",
    parentBlockId: null,
    metadata: { translationOutcome: "request_failed" },
  };
}

function jaResult(text: string, source: string): TranslationResult {
  return {
    text,
    sourceLanguage: "en",
    targetLanguage: "ja",
    model: "plamo-3-translate-2b",
    modelVersion: "test",
    inputChars: source.length,
    outputChars: text.length,
    translationTimeMs: 1,
    charsPerSec: 100,
  };
}

describe("retryBlockTranslation", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await resetStorageForTests();
  });

  it("uses the shared PLaMo engine stack", async () => {
    const paper = basePaper("retry-engine-paper");
    const block = baseBlock(paper.id, "retry-engine-block");
    await savePaper(paper);
    await saveBlocks([block]);

    const translate = vi.fn(async (text: string) =>
      jaResult("インタラクティブなジュエリーは日常の相互作用を結び付けます。", text)
    );
    const engine = {
      name: "plamo",
      translate,
      translateBatch: vi.fn(),
      getStatus: vi.fn(),
      loadModel: vi.fn(),
      unloadModel: vi.fn(),
    } as unknown as TranslationEngine;

    vi.spyOn(createEngine, "createTranslationEngine").mockReturnValue({
      engine,
      primaryEngine: engine,
      cacheModel: "plamo-3-translate-2b",
      cacheModelVersion: "test",
      llmProviders: [],
    });

    await retryBlockTranslation(block);

    expect(createEngine.createTranslationEngine).toHaveBeenCalled();
    expect(translate).toHaveBeenCalledWith(block.original, "en", "ja");

    const [saved] = await getBlocksByPaper(paper.id);
    expect(saved.translationStatus).toBe("completed");
    expect(saved.translated).toContain("インタラクティブ");
  });

  it("preserves source on quality rejection instead of leaving the block failed", async () => {
    const paper = basePaper("retry-quality-paper");
    const block = baseBlock(paper.id, "retry-quality-block");
    await savePaper(paper);
    await saveBlocks([block]);

    const engine = {
      name: "plamo",
      translate: vi.fn(async () => {
        throw new TranslationQualityError();
      }),
      translateBatch: vi.fn(),
      getStatus: vi.fn(),
      loadModel: vi.fn(),
      unloadModel: vi.fn(),
    } as unknown as TranslationEngine;

    vi.spyOn(createEngine, "createTranslationEngine").mockReturnValue({
      engine,
      primaryEngine: engine,
      cacheModel: "plamo-3-translate-2b",
      cacheModelVersion: "test",
      llmProviders: [],
    });

    await retryBlockTranslation(block);

    const [saved] = await getBlocksByPaper(paper.id);
    expect(saved.translationStatus).toBe("completed");
    expect(saved.translated).toBeNull();
    expect(saved.metadata?.translationOutcome).toBe("source_fallback");
  });
});
