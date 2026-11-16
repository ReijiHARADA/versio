import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Paper, PaperBlock } from "../types/paper";
import { getBlocksByPaper, getPaper, saveBlocks, savePaper } from "../services/database";
import { resumeIncompleteTranslation } from "../services/import/resume";
import { resetStorageForTests } from "../data/runtime";
import * as createEngine from "../services/translation/createTranslationEngine";
import * as plamoReadiness from "../services/translation/plamoReadiness";
import type { TranslationEngine, TranslationResult } from "../services/translation/types";

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
    metadata: {},
  };
}

describe("resumeIncompleteTranslation", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await resetStorageForTests();
  });

  it("retries a failed block with PLaMo", async () => {
    const paper = basePaper("retry-failed-paper");
    const block = baseBlock(paper.id, "retry-failed-block");
    await savePaper(paper);
    await saveBlocks([block]);
    vi.spyOn(plamoReadiness, "isPlamoAvailable").mockResolvedValue(true);
    const engine = plamoEngine();
    const createSpy = vi.spyOn(createEngine, "createTranslationEngine").mockReturnValue(bundle(engine));
    await resumeIncompleteTranslation(paper.id, {}, { useCache: false });

    expect(createSpy).toHaveBeenCalled();
    expect(createSpy.mock.results[0]?.value.primaryEngine).toBe(engine);

    const [result] = await getBlocksByPaper(paper.id);
    expect(result.translationStatus).toBe("completed");
    expect(result.translated).toContain("インタラクティブ");
  });

  it("leaves pending work untouched when PLaMo is unavailable", async () => {
    const paper = basePaper("pending-while-down");
    const block = { ...baseBlock(paper.id, "pending-while-down-block"), translationStatus: "pending" as const };
    await savePaper({ ...paper, processingStatus: "translating" });
    await saveBlocks([block]);
    vi.spyOn(plamoReadiness, "isPlamoAvailable").mockResolvedValue(false);

    await resumeIncompleteTranslation(paper.id, {}, { useCache: false });

    const [result] = await getBlocksByPaper(paper.id);
    expect(result.translationStatus).toBe("pending");
    expect(result.translated).toBeNull();
    const savedPaper = await getPaper(paper.id);
    expect(savedPaper?.processingStatus).toBe("translating");
  });

  it("persists safe translated units while preserving failed source units", async () => {
    const paper = basePaper("partial-unit-paper");
    const block = {
      ...baseBlock(paper.id, "partial-unit-block"),
      original: "The first sentence describes the method. The second sentence is retained in English.",
    };
    await savePaper(paper);
    await saveBlocks([block]);
    vi.spyOn(plamoReadiness, "isPlamoAvailable").mockResolvedValue(true);
    const engine = plamoEngine({
      text: "前半の方法を説明する文。The second sentence is retained in English.",
      unitFallbackIndices: [1],
      translationUnits: [
        "The first sentence describes the method.",
        "The second sentence is retained in English.",
      ],
      partialUnitTexts: [
        "前半の方法を説明する文。",
        "The second sentence is retained in English.",
      ],
    });
    vi.spyOn(createEngine, "createTranslationEngine").mockReturnValue(bundle(engine));
    await resumeIncompleteTranslation(paper.id, {}, { useCache: false });

    const [result] = await getBlocksByPaper(paper.id);
    expect(result.translationStatus).toBe("completed");
    expect(result.translated).toContain("前半の方法を説明する文");
    expect(result.translated).toContain("The second sentence is retained in English.");
    expect(result.metadata?.translationOutcome).toBe("partial_source_preserved");
    expect(result.metadata?.partialFailedUnitIndices).toEqual([1]);
  });
});

function plamoEngine(overrides: Partial<TranslationResult> = {}): TranslationEngine {
  return {
    name: "plamo",
    translate: vi.fn(async (source: string) => ({
      text: "インタラクティブ・ジュエリーは、個人的な記憶とウェアラブル・コンピューティングを、意味のある日常的な相互作用を通じて結び付けます。",
      sourceLanguage: "en",
      targetLanguage: "ja",
      model: "plamo-3-translate-2b",
      modelVersion: "test",
      inputChars: source.length,
      outputChars: 60,
      translationTimeMs: 10,
      charsPerSec: 100,
      ...overrides,
    })),
    translateBatch: vi.fn(),
    getStatus: vi.fn(),
    loadModel: vi.fn(),
    unloadModel: vi.fn(),
  };
}

function bundle(engine: TranslationEngine) {
  return {
    engine,
    primaryEngine: engine,
    cacheModel: "plamo-3-translate-2b",
    cacheModelVersion: "test",
    llmProviders: [],
  };
}
