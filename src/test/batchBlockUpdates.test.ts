import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BLOCK_UPDATE_COALESCE_MS,
  createBlockUpdateBatcher,
  setTranslationUiScrollPaused,
} from "../utils/batchBlockUpdates";
import type { PaperBlock } from "../types/paper";

function block(id: string, paperId = "p1"): PaperBlock {
  return {
    id,
    paperId,
    type: "paragraph",
    sectionId: null,
    order: 0,
    pageStart: 1,
    pageEnd: 1,
    boundingBoxes: [],
    original: "Hello world from a body paragraph here.",
    translated: "こんにちは",
    extractionConfidence: 1,
    translationStatus: "completed",
    parentBlockId: null,
    metadata: {},
  };
}

describe("createBlockUpdateBatcher", () => {
  afterEach(() => {
    setTranslationUiScrollPaused(false);
    vi.useRealTimers();
  });

  it("coalesces rapid pushes into one apply", () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    const batcher = createBlockUpdateBatcher(apply);
    batcher.push(block("a"));
    batcher.push(block("b"));
    expect(apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BLOCK_UPDATE_COALESCE_MS);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][1].map((item: PaperBlock) => item.id).sort()).toEqual([
      "a",
      "b",
    ]);
    batcher.dispose();
  });

  it("holds patches while scroll is paused and flushes on resume", () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    const batcher = createBlockUpdateBatcher(apply);
    setTranslationUiScrollPaused(true);
    batcher.push(block("a"));
    vi.advanceTimersByTime(BLOCK_UPDATE_COALESCE_MS * 3);
    expect(apply).not.toHaveBeenCalled();
    setTranslationUiScrollPaused(false);
    expect(apply).toHaveBeenCalledTimes(1);
    batcher.dispose();
  });
});
