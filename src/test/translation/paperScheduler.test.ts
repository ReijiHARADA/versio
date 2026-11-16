import { describe, expect, it } from "vitest";
import { TranslationManager } from "../../services/translation/translationManager";
import { TranslationQueue } from "../../services/translation/translationQueue";
import type { TranslationEngine, TranslationResult } from "../../services/translation/types";

function engine(log: string[]): TranslationEngine {
  return {
    name: "test",
    async translate(text) {
      log.push(text);
      return { text, sourceLanguage: "en", targetLanguage: "ja", model: "t", modelVersion: "t",
        inputChars: 1, outputChars: 1, translationTimeMs: 1, charsPerSec: 1 } as TranslationResult;
    },
    async translateBatch(texts) { return Promise.all(texts.map((t) => this.translate(t, "en", "ja"))); },
    async getStatus() { return { available: true, modelLoaded: true }; },
    async isReady() { return true; },
  };
}

function attach(m: TranslationManager, id: string, log: string[]) {
  const q = new TranslationQueue(engine(log), { concurrency: 2 });
  q.start();
  m.attach(id, q);
  return q;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("TranslationManager scheduling", () => {
  it("runs one paper's translation at a time in FIFO order", async () => {
    const m = new TranslationManager();
    const log: string[] = [];
    const a = attach(m, "A", log);
    const b = attach(m, "B", log);
    expect(a.isStarted()).toBe(true);
    expect(b.isStarted()).toBe(false);
    b.enqueue("B", "b1", "b1", 2);
    await flush();
    expect(log).toEqual([]);
    m.detach("A");
    await flush();
    expect(log).toEqual(["b1"]);
  });

  it("switches to the paper open in Reader and back", () => {
    const m = new TranslationManager();
    const a = attach(m, "A", []);
    const b = attach(m, "B", []);
    m.setReaderPaper("B");
    expect([a.isStarted(), b.isStarted()]).toEqual([false, true]);
    m.clearReaderPaper("B");
    expect([a.isStarted(), b.isStarted()]).toEqual([true, false]);
  });

  it("serializes extraction and pauses translation meanwhile", async () => {
    const m = new TranslationManager();
    const a = attach(m, "A", []);
    const r1 = await m.acquireExtractionSlot();
    expect(a.isStarted()).toBe(false);
    let second = false;
    const p2 = m.acquireExtractionSlot().then((r) => { second = true; return r; });
    await flush();
    expect(second).toBe(false);
    r1();
    const r2 = await p2;
    expect(a.isStarted()).toBe(false);
    r2();
    expect(a.isStarted()).toBe(true);
  });

  it("gives the Reader paper priority over waiting extractions", async () => {
    const m = new TranslationManager();
    const a = attach(m, "A", []);
    m.setReaderPaper("A");
    let granted = false;
    void m.acquireExtractionSlot().then(() => { granted = true; });
    await flush();
    expect(granted).toBe(false);
    expect(a.isStarted()).toBe(true);
    m.clearReaderPaper("A");
    await flush();
    expect(granted).toBe(true);
    expect(a.isStarted()).toBe(false);
  });

  it("rejects a waiting extraction on abort", async () => {
    const m = new TranslationManager();
    const r1 = await m.acquireExtractionSlot();
    const c = new AbortController();
    const p = m.acquireExtractionSlot(c.signal);
    c.abort();
    await expect(p).rejects.toBeDefined();
    r1();
    expect(m.isExtracting()).toBe(false);
  });
});
