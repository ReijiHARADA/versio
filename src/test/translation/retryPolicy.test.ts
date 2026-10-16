import { describe, expect, it, vi } from "vitest";
import {
  TranslationQualityError,
  isRetryableTranslationError,
  isTranslationQualityError,
} from "../../services/translation/retryPolicy";
import { TranslationQueue } from "../../services/translation/translationQueue";
import type { TranslationEngine, TranslationResult } from "../../services/translation/types";
import { localizeNamedFigureCaption } from "../../services/translation/quality";

function result(text: string): TranslationResult {
  return {
    text,
    sourceLanguage: "en",
    targetLanguage: "ja",
    model: "test",
    modelVersion: "test",
    inputChars: text.length,
    outputChars: text.length,
    translationTimeMs: 1,
    charsPerSec: 1,
  };
}

describe("translation retry policy", () => {
  it("retries transient timeouts but not quality rejects", () => {
    expect(isRetryableTranslationError(new Error("Translation server request timed out after 180000ms"))).toBe(true);
    expect(isRetryableTranslationError(new Error("Translation server temporary error: 503"))).toBe(true);
    expect(isRetryableTranslationError(new TranslationQualityError())).toBe(false);
    expect(isTranslationQualityError(new TranslationQualityError())).toBe(true);
  });

  it("does not surface onTaskFailed until retries are exhausted", async () => {
    let attempts = 0;
    const engine: TranslationEngine = {
      name: "test",
      async translate() {
        attempts += 1;
        if (attempts < 3) throw new Error("Translation server request timed out after 180000ms");
        return result("これは翻訳です。");
      },
      async translateBatch(texts) {
        return Promise.all(texts.map((text) => this.translate(text, "en", "ja")));
      },
      async getStatus() {
        return { available: true, modelLoaded: true };
      },
      async isReady() {
        return true;
      },
    };
    const queue = new TranslationQueue(engine, {
      concurrency: 1,
      retryFailed: true,
      maxRetries: 2,
      retryDelayMs: 10,
    });
    const failed = vi.fn();
    const completed = vi.fn();
    queue.setOnTaskFailed(failed);
    queue.setOnTaskCompleted(completed);
    queue.start();
    queue.enqueue("paper", "block-1", "Hello world.", 1);

    await vi.waitFor(() => expect(completed).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(attempts).toBe(3);
    expect(failed).not.toHaveBeenCalled();
  });

  it("localizes plain figure captions without a creator clause", () => {
    expect(localizeNamedFigureCaption("Figure 1. Finger specific input concept")).toBe(
      "図1. Finger specific input concept"
    );
  });
});
