import { describe, expect, it, vi } from "vitest";
import { TranslationQueue } from "../../services/translation/translationQueue";
import type { TranslationEngine, TranslationResult } from "../../services/translation/types";

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

describe("TranslationQueue.cancelPaper", () => {
  it("settles queued tasks via onTaskCancelled and keeps in-flight completion", async () => {
    let release!: (value: TranslationResult) => void;
    const gate = new Promise<TranslationResult>((resolve) => {
      release = resolve;
    });
    const engine: TranslationEngine = {
      name: "test",
      async translate(text) {
        if (text === "in-flight") return gate;
        return result(`ja:${text}`);
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
      retryFailed: false,
    });

    let outstanding = 3;
    let settle!: () => void;
    const allDone = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const markDone = () => {
      outstanding = Math.max(0, outstanding - 1);
      if (outstanding === 0) settle();
    };

    const cancelled = vi.fn(() => markDone());
    const failed = vi.fn(() => markDone());
    const completed = vi.fn(() => markDone());
    queue.setOnTaskCancelled(cancelled);
    queue.setOnTaskFailed(failed);
    queue.setOnTaskCompleted(completed);
    queue.start();

    queue.enqueue("paper-a", "b1", "in-flight", 0);
    queue.enqueue("paper-a", "b2", "queued-1", 1);
    queue.enqueue("paper-a", "b3", "queued-2", 1);

    await vi.waitFor(() => expect(queue.getStatus().activeCount).toBe(1));

    queue.cancelPaper("paper-a");
    expect(cancelled).toHaveBeenCalledTimes(2);
    expect(failed).not.toHaveBeenCalled();

    release(result("ja:in-flight"));
    await allDone;
    await vi.waitFor(() => expect(queue.getStatus().activeCount).toBe(0));

    expect(completed).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
    expect(queue.getStatus().queueLength).toBe(0);
  });

  it("does not retry in-flight tasks after cancel", async () => {
    let rejectTranslate!: (error: Error) => void;
    const gate = new Promise<TranslationResult>((_resolve, reject) => {
      rejectTranslate = reject;
    });
    let attempts = 0;
    const engine: TranslationEngine = {
      name: "test",
      async translate() {
        attempts += 1;
        return gate;
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
    const cancelled = vi.fn();
    const failed = vi.fn();
    queue.setOnTaskCancelled(cancelled);
    queue.setOnTaskFailed(failed);
    queue.start();
    queue.enqueue("paper-b", "block", "Hello.", 1);

    await vi.waitFor(() => expect(queue.getStatus().activeCount).toBe(1));
    expect(attempts).toBe(1);
    queue.cancelPaper("paper-b");
    rejectTranslate(new Error("Translation server request timed out after 180000ms"));

    await vi.waitFor(() => expect(cancelled).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(attempts).toBe(1);
    expect(failed).not.toHaveBeenCalled();
  });
});
