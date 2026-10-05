import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Paper, PaperBlock } from "../types/paper";
import { getBlocksByPaper, getPaper, saveBlocks, savePaper } from "../services/database";
import { resumeIncompleteTranslation } from "../services/import/resume";
import { resetStorageForTests } from "../data/runtime";
import * as madladEngine from "../services/translation/madladEngine";
import {
  markTranslationServerReady,
  resetTranslationServerReadyForTests,
  subscribeTranslationServerReady,
} from "../utils/serverReady";

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
    resetTranslationServerReadyForTests();
    await resetStorageForTests();
  });

  it("retries a block that failed while the translation server was unavailable", async () => {
    const paper = basePaper("retry-failed-paper");
    const block = baseBlock(paper.id, "retry-failed-block");
    await savePaper(paper);
    await saveBlocks([block]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/health")) {
          return new Response(JSON.stringify({ status: "ok", model_loaded: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            text: "インタラクティブ・ジュエリーは、個人的な記憶とウェアラブル・コンピューティングを、意味のある日常的な相互作用を通じて結び付けます。",
            source_language: "en",
            target_language: "ja",
            model: "madlad400-3b-mt",
            model_version: "3b-mt-v4",
            input_chars: 100,
            output_chars: 60,
            translation_time_ms: 10,
            chars_per_sec: 100,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    await resumeIncompleteTranslation(paper.id, {}, { useCache: false });

    const [result] = await getBlocksByPaper(paper.id);
    expect(result.translationStatus).toBe("completed");
    expect(result.translated).toContain("インタラクティブ");
  });

  it("leaves pending work untouched when the translation server is still down", async () => {
    const paper = basePaper("pending-while-down");
    const block = { ...baseBlock(paper.id, "pending-while-down-block"), translationStatus: "pending" as const };
    await savePaper({ ...paper, processingStatus: "translating" });
    await saveBlocks([block]);
    vi.spyOn(madladEngine, "checkMADLADServer").mockResolvedValue({
      available: false,
      modelLoaded: false,
      error: "翻訳サーバーに接続できません",
    });

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
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/health")) {
          return new Response(JSON.stringify({ status: "ok", model_loaded: true }), { status: 200 });
        }
        return new Response(JSON.stringify({
          text: "前半の方法を説明する文。The second sentence is retained in English.",
          source_language: "en",
          target_language: "ja",
          model: "madlad400-3b-mt",
          model_version: "test",
          fallback_stage: "partial_unit_fallback",
          fallback_reason: "unit_1:translation_quality_rejected:ValueError",
          unit_fallback_indices: [1],
          translation_units: [
            "The first sentence describes the method.",
            "The second sentence is retained in English.",
          ],
          partial_unit_texts: [
            "前半の方法を説明する文。",
            "The second sentence is retained in English.",
          ],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );

    await resumeIncompleteTranslation(paper.id, {}, { useCache: false });

    const [result] = await getBlocksByPaper(paper.id);
    expect(result.translationStatus).toBe("completed");
    expect(result.translated).toContain("前半の方法を説明する文");
    expect(result.translated).toContain("The second sentence is retained in English.");
    expect(result.metadata?.translationOutcome).toBe("partial_source_preserved");
    expect(result.metadata?.partialFailedUnitIndices).toEqual([1]);
  });
});

describe("translation server ready signaling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetTranslationServerReadyForTests();
  });

  it("notifies subscribers once when marked ready", async () => {
    resetTranslationServerReadyForTests();
    let notified = 0;
    const unsubscribe = subscribeTranslationServerReady(() => {
      notified += 1;
    });
    // Browser mode treats the server as ready and may microtask-notify on subscribe.
    await Promise.resolve();
    const baseline = notified;

    markTranslationServerReady();
    markTranslationServerReady();
    expect(notified).toBe(baseline + 1);
    unsubscribe();
  });
});
