import type { LLMProvider } from "../llm/types";
import {
  evaluateJaTranslation,
  isPlausibleJaTranslation,
  shouldTranslateParagraph,
  unsafeParagraphStructureReason,
} from "./quality";
import type { EngineStatus, TranslationEngine, TranslationResult } from "./types";

/**
 * Audit/opt-in translation fallback for blocks rejected by MADLAD.
 *
 * The alternate model is deliberately behind a source-integrity gate and the
 * same invariant/quality checks as the primary path. It must never turn a
 * malformed PDF fragment into a fluent guess. Production callers should
 * enable it only after evaluating the selected model on held-out fixtures.
 */
export class OllamaTranslationEngine implements TranslationEngine {
  readonly name = "ollama-translation";
  private readonly provider: LLMProvider;
  private readonly primary: TranslationEngine;

  constructor(primary: TranslationEngine, provider: LLMProvider) {
    this.primary = primary;
    this.provider = provider;
  }

  async translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<TranslationResult> {
    try {
      return await this.primary.translate(text, sourceLanguage, targetLanguage);
    } catch (primaryError) {
      if (sourceLanguage !== "en" || targetLanguage !== "ja" || !this.isSafeSource(text)) {
        throw primaryError;
      }

      const started = Date.now();
      const completion = await this.provider.complete(
        `Translate the following academic English into precise Japanese. Preserve every number, citation, acronym, statistical notation, negation, comparison, and causal relation. Output only the Japanese translation.\n\nSOURCE:\n${text}`,
        "You are a conservative academic translator. Never add facts or omit source facts. Do not explain your answer.",
        { temperature: 0, maxTokens: Math.max(512, Math.ceil(text.length * 2.5)) },
      );
      const translated = completion.text.trim();
      const quality = evaluateJaTranslation(translated, text);
      if (!isPlausibleJaTranslation(translated, text) || quality.reasons.length > 0) {
        throw primaryError;
      }
      return {
        text: translated,
        sourceLanguage,
        targetLanguage,
        model: completion.model,
        modelVersion: `ollama-${completion.model}-selective-v1`,
        inputChars: text.length,
        outputChars: translated.length,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        translationTimeMs: Date.now() - started,
        charsPerSec: translated.length / Math.max((Date.now() - started) / 1000, 0.001),
        tokensPerSec: completion.outputTokens
          ? completion.outputTokens / Math.max((Date.now() - started) / 1000, 0.001)
          : undefined,
      };
    }
  }

  async translateBatch(texts: string[], sourceLanguage: string, targetLanguage: string): Promise<TranslationResult[]> {
    return Promise.all(texts.map((text) => this.translate(text, sourceLanguage, targetLanguage)));
  }

  async getStatus(): Promise<EngineStatus> {
    const primary = await this.primary.getStatus();
    const alternate = await this.provider.getStatus();
    return {
      available: primary.available || alternate.available,
      modelLoaded: primary.modelLoaded,
      modelName: alternate.currentModel ?? primary.modelName,
      modelVersion: `${primary.modelVersion}+ollama-selective-v1`,
      device: primary.device,
      error: primary.available || alternate.available ? undefined : `${primary.error ?? "MADLAD unavailable"}; ${alternate.error ?? "Ollama unavailable"}`,
    };
  }

  async loadModel(): Promise<void> {
    await this.primary.loadModel();
  }

  async unloadModel(): Promise<void> {
    await this.primary.unloadModel();
  }

  private isSafeSource(text: string): boolean {
    return Boolean(text.trim()) && shouldTranslateParagraph(text) && unsafeParagraphStructureReason(text) === null;
  }
}
