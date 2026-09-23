import { describe, expect, it, vi } from "vitest";
import { OllamaTranslationEngine } from "../services/translation/ollamaTranslationEngine";
import type { LLMProvider } from "../services/llm/types";
import type { TranslationEngine, TranslationResult } from "../services/translation/types";

const result: TranslationResult = {
  text: "参加者は制御された条件で結果を比較した。",
  sourceLanguage: "en",
  targetLanguage: "ja",
  model: "madlad",
  modelVersion: "test",
  inputChars: 10,
  outputChars: 20,
  translationTimeMs: 1,
  charsPerSec: 20,
};

function primaryThatFails(): TranslationEngine {
  return {
    name: "primary",
    translate: vi.fn(async () => { throw new Error("primary failed"); }),
    translateBatch: vi.fn(),
    getStatus: vi.fn(async () => ({ available: false, modelLoaded: false, modelName: "primary", modelVersion: "v1", device: "test" })),
    loadModel: vi.fn(async () => {}),
    unloadModel: vi.fn(async () => {}),
  };
}

function providerReturning(text: string): LLMProvider {
  return {
    name: "ollama",
    model: "gemma2:9b",
    complete: vi.fn(async () => ({ text, model: "gemma2:9b", completionTimeMs: 1 })),
    getStatus: vi.fn(async () => ({ available: true, models: ["gemma2:9b"], currentModel: "gemma2:9b" })),
    listModels: vi.fn(async () => ["gemma2:9b"]),
    setModel: vi.fn(),
  };
}

describe("OllamaTranslationEngine", () => {
  it("uses the alternate model only for a structurally complete source", async () => {
    const provider = providerReturning("参加者は制御された条件で結果を比較した。");
    const engine = new OllamaTranslationEngine(primaryThatFails(), provider);
    const translated = await engine.translate(
      "Participants compared the results under controlled conditions.",
      "en",
      "ja",
    );
    expect(translated.model).toBe("gemma2:9b");
    expect(provider.complete).toHaveBeenCalledOnce();
  });

  it("does not send an incomplete extraction fragment to the alternate model", async () => {
    const provider = providerReturning("参加者は結果を比較した。");
    const engine = new OllamaTranslationEngine(primaryThatFails(), provider);
    await expect(engine.translate("The results were compared to", "en", "ja")).rejects.toThrow("primary failed");
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("rejects an alternate candidate with an untranslated ordinary lexeme", async () => {
    const provider = providerReturning("先行研究は評価の precedent を確立した。");
    const engine = new OllamaTranslationEngine(primaryThatFails(), provider);
    await expect(engine.translate(
      "Prior work established a precedent for evaluating the interaction.",
      "en",
      "ja",
    )).rejects.toThrow("primary failed");
    expect(provider.complete).toHaveBeenCalledOnce();
  });

  it("rejects an alternate candidate that drops an experimental condition", async () => {
    const provider = providerReturning("信号がない。参加者を分析から除外した。");
    const engine = new OllamaTranslationEngine(primaryThatFails(), provider);
    await expect(engine.translate(
      "If the signal is absent, the participant was excluded from analysis.",
      "en",
      "ja",
    )).rejects.toThrow("primary failed");
    expect(provider.complete).toHaveBeenCalledOnce();
  });

  it("keeps a successful primary result without contacting Ollama", async () => {
    const primary = primaryThatFails();
    primary.translate = vi.fn(async () => result);
    const provider = providerReturning("不要な代替");
    const engine = new OllamaTranslationEngine(primary, provider);
    await expect(engine.translate("Participants compared the results.", "en", "ja")).resolves.toEqual(result);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("selectively retries a primary result with a high-impact relation risk", async () => {
    const primary = primaryThatFails();
    primary.translate = vi.fn(async () => ({
      ...result,
      text: "参加者を分析した。",
    }));
    const provider = providerReturning("信号がない場合,参加者を分析から除外した。");
    const engine = new OllamaTranslationEngine(primary, provider);
    const translated = await engine.translate(
      "If the signal is absent, the participant was excluded from analysis.",
      "en",
      "ja",
    );
    expect(translated.model).toBe("gemma2:9b");
    expect(provider.complete).toHaveBeenCalledOnce();
  });
});
