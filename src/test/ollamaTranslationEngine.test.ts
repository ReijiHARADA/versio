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
    expect(provider.complete).toHaveBeenCalled();
  });

  it("scopes citation guidance to each alternate semantic unit", async () => {
    const provider = providerReturning("結果が報告された。参加者は条件下で改善した。");
    const engine = new OllamaTranslationEngine(primaryThatFails(), provider);
    await expect(engine.translate(
      "The result was reported by (Smith, 2020) in the primary analysis of the study. Participants improved under the condition during the follow-up comparison.",
      "en",
      "ja",
    )).rejects.toThrow("primary failed");
    const prompts = (provider.complete as ReturnType<typeof vi.fn>).mock.calls.map(([prompt]) => String(prompt));
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts[0]).toContain("(Smith, 2020)");
    const secondUnitPrompt = prompts.find((prompt) => prompt.includes("Participants improved under the condition"));
    expect(secondUnitPrompt).toBeDefined();
    expect(secondUnitPrompt).not.toContain("(Smith, 2020)");
  });

  it("tries the next opt-in provider when the first candidate fails the shared gate", async () => {
    const rejected = providerReturning("先行研究は評価の precedent を確立した。");
    const accepted = providerReturning("参加者は制御された条件で結果を比較した。");
    const engine = new OllamaTranslationEngine(primaryThatFails(), [rejected, accepted]);
    const translated = await engine.translate(
      "Participants compared the results under controlled conditions.",
      "en",
      "ja",
    );
    expect(translated.model).toBe("gemma2:9b");
    expect(rejected.complete).toHaveBeenCalled();
    expect(accepted.complete).toHaveBeenCalled();
  });

  it("does not send an incomplete extraction fragment to the alternate model", async () => {
    const provider = providerReturning("参加者は結果を比較した。");
    const engine = new OllamaTranslationEngine(primaryThatFails(), provider);
    await expect(engine.translate("The results were compared to", "en", "ja")).rejects.toThrow("primary failed");
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("does not send a lowercase continuation behind a dash to the alternate model", async () => {
    const provider = providerReturning("断片を翻訳した。");
    const engine = new OllamaTranslationEngine(primaryThatFails(), provider);
    await expect(engine.translate("– with a strong interrelation that continued from the previous block.", "en", "ja"))
      .rejects.toThrow("primary failed");
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
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it("rejects an alternate candidate with an untranslated multi-word phrase", async () => {
    const provider = providerReturning("システムの preliminary evaluation は完了した。");
    const engine = new OllamaTranslationEngine(primaryThatFails(), provider);
    await expect(engine.translate(
      "We completed a preliminary evaluation of the system and compared the resulting interaction measures with the baseline condition across all participants. The analysis included repeated observations from each session and a detailed comparison of the recorded outcomes.",
      "en",
      "ja",
    )).rejects.toThrow("primary failed");
    expect(provider.complete).toHaveBeenCalled();
  });

  it("rejects an alternate candidate that invents a numbered structural label", async () => {
    const provider = providerReturning("結果を確認した（Result 9）。参加者は改善した。");
    const engine = new OllamaTranslationEngine(primaryThatFails(), provider);
    await expect(engine.translate(
      "The participants improved after the intervention, and the result was consistent.",
      "en",
      "ja",
    )).rejects.toThrow("primary failed");
  });

  it("rejects an alternate candidate that drops an experimental condition", async () => {
    const provider = providerReturning("信号がない。参加者を分析から除外した。");
    const engine = new OllamaTranslationEngine(primaryThatFails(), provider);
    await expect(engine.translate(
      "If the signal is absent, the participant was excluded from analysis.",
      "en",
      "ja",
    )).rejects.toThrow("primary failed");
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it("rejects an alternate candidate that negates a positive equivalence result", async () => {
    const provider = providerReturning("絶縁布に匹敵する材料なし条件は存在しない。");
    const engine = new OllamaTranslationEngine(primaryThatFails(), provider);
    await expect(engine.translate(
      "The no-material condition performed comparably to the insulating fabric.",
      "en",
      "ja",
    )).rejects.toThrow("primary failed");
    expect(provider.complete).toHaveBeenCalledTimes(2);
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

  it("accepts an alternate candidate that preserves an unless qualifier", async () => {
    const primary = primaryThatFails();
    primary.translate = vi.fn(async () => ({
      ...result,
      text: "最も強力なモデルに焦点を当てた。",
    }));
    const provider = providerReturning(
      "特に断りのない限り、最も強力なモデルに焦点を当てた。",
    );
    const engine = new OllamaTranslationEngine(primary, provider);
    const translated = await engine.translate(
      "We focused on the most powerful model unless otherwise noted.",
      "en",
      "ja",
    );
    expect(translated.model).toBe("gemma2:9b");
    expect(translated.text).toContain("特に断りのない限り");
    expect(provider.complete).toHaveBeenCalledOnce();
  });

  it("splits long alternate rescue input into sentence units before generation", async () => {
    const primary = primaryThatFails();
    const provider = providerReturning("最初の実験では結果を測定した。");
    vi.mocked(provider.complete)
      .mockResolvedValueOnce({ text: "最初の実験では結果を測定した。", model: "gemma2:9b", completionTimeMs: 1 })
      .mockResolvedValueOnce({ text: "対照的に、2番目の実験では結果を再現した。", model: "gemma2:9b", completionTimeMs: 1 });
    const engine = new OllamaTranslationEngine(primary, provider);
    const translated = await engine.translate(
      "The first experiment measured the result under controlled laboratory conditions. In contrast, the second experiment replicated the result in a field setting.",
      "en",
      "ja",
    );
    expect(translated.text).toContain("最初の実験");
    expect(translated.text).toContain("対照的に");
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it("splits an overlong top-level clause without splitting citation groups", async () => {
    const primary = primaryThatFails();
    const provider = providerReturning("長い節を翻訳した。");
    const source = "The study examined a carefully controlled interaction pattern across multiple participant groups and recorded the resulting measures in a reproducible protocol. ".repeat(3)
      + "The final clause reports the observed comparison: the intervention improved the outcome while the control remained stable.";
    const engine = new OllamaTranslationEngine(primary, provider);
    await expect(engine.translate(source, "en", "ja")).rejects.toThrow("primary failed");
    expect(provider.complete).toHaveBeenCalled();
  });

  it("restores a dropped list marker without changing translated content", async () => {
    const provider = providerReturning("結果4-5を比較する方法を開発した。");
    const engine = new OllamaTranslationEngine(primaryThatFails(), provider);
    const translated = await engine.translate(
      "• Results 4-5. Develop a method to compare the results.",
      "en",
      "ja",
    );
    expect(translated.text).toMatch(/^• /u);
    expect(translated.text).toContain("結果4-5を比較する方法");
  });
});
