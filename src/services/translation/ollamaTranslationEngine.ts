import type { LLMProvider } from "../llm/types";
import {
  evaluateJaTranslation,
  isCascadeQualityAcceptable,
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
      const primary = await this.primary.translate(text, sourceLanguage, targetLanguage);
      // A primary response can be syntactically valid while violating a
      // high-impact source relation (negation, condition, comparison, or a
      // scientific invariant). Give the opt-in alternate model one chance on
      // those evidence-backed risks. Ordinary successful translations stay on
      // the fast path and never contact Ollama.
      if (
        sourceLanguage === "en"
        && targetLanguage === "ja"
        && this.shouldCascadeRiskyPrimary(primary.text, text)
        && this.isSafeSource(text)
      ) {
        try {
          return await this.translateWithAlternate(text, sourceLanguage, targetLanguage);
        } catch {
          // Preserve the primary result when the alternate is unavailable or
          // fails its stricter checks; a cascade must not turn a usable primary
          // response into a hard failure.
        }
      }
      return primary;
    } catch (primaryError) {
      if (sourceLanguage !== "en" || targetLanguage !== "ja" || !this.isSafeSource(text)) {
        throw primaryError;
      }

      return await this.translateWithAlternate(text, sourceLanguage, targetLanguage, primaryError);
    }
  }

  private async translateWithAlternate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    primaryError?: unknown,
  ): Promise<TranslationResult> {
      const started = Date.now();
      const completion = await this.provider.complete(
        `Translate the following academic English into precise Japanese. Preserve every number, citation, acronym, statistical notation, negation, comparison, and causal relation. Output only the Japanese translation.\n\nSOURCE:\n${text}`,
        "You are a conservative academic translator. Never add facts or omit source facts. Do not explain your answer.",
        { temperature: 0, maxTokens: Math.max(512, Math.ceil(text.length * 2.5)) },
      );
      const translated = completion.text.trim();
      const quality = evaluateJaTranslation(translated, text);
      if (!isCascadeQualityAcceptable(translated, text) || (quality.reasons.length > 0 && !quality.reasons.every((reason) => / relation missing$/.test(reason)))) {
        throw primaryError ?? new Error("alternate translation failed quality checks");
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

  private shouldCascadeRiskyPrimary(output: string, source: string): boolean {
    const quality = evaluateJaTranslation(output, source);
    return quality.reasons.some((reason) =>
      /negation|condition|comparison|relation missing|invariant|citation|acronym|statistical|implausibly shortened|source fragment/i.test(reason),
    );
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
