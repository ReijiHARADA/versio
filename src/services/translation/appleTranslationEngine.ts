import { isTauriApp } from "../../utils/serverReady";
import { isPlausibleJaTranslation } from "./quality";
import type { EngineStatus, TranslationEngine, TranslationResult } from "./types";

export const APPLE_TRANSLATION_VERSION = "apple-translation-macos-v1";

/** Conservative eligibility: only complete, prose-like ordinary blocks reach Apple. */
export function isAppleEligibleSource(text: string): boolean {
  const s = text.trim();
  if (s.length < 40 || s.length > 700) return false;
  if (/[@]|https?:\/\/|\b(?:doi|references|bibliography)\b/i.test(s)) return false;
  if (/^[\d\s.:-]+$/.test(s) || /^(?:fig(?:ure)?|table)\s*\d+/i.test(s)) return false;
  if (/^[•●▪◦\-*]\s/.test(s) || /\n\s*[•●▪◦\-*]\s/.test(s)) return false;
  if ((s.match(/[.!?]/g) ?? []).length === 0 && !/[,:;]$/.test(s)) return false;
  const words = s.match(/[A-Za-z]{2,}/g) ?? [];
  return words.length >= 8 && !/^(?:abstract|introduction|method|results|discussion|conclusion)\b/i.test(s);
}

export class AppleTranslationEngine implements TranslationEngine {
  readonly name = "apple-translation";

  async translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<TranslationResult> {
    const started = performance.now();
    if (!isTauriApp() || !isAppleEligibleSource(text)) throw new Error("Apple Translation source is not eligible");
    const { invoke } = await import("@tauri-apps/api/core");
    const translated = await invoke<string>("translate_with_apple", { text, sourceLanguage, targetLanguage });
    if (!isPlausibleJaTranslation(translated, text)) throw new Error("Apple Translation failed quality gate");
    const elapsed = performance.now() - started;
    return {
      text: translated,
      sourceLanguage,
      targetLanguage,
      model: "Apple Translation",
      modelVersion: APPLE_TRANSLATION_VERSION,
      inputChars: text.length,
      outputChars: translated.length,
      translationTimeMs: elapsed,
      charsPerSec: translated.length / Math.max(elapsed / 1000, 0.001),
    };
  }

  async translateBatch(texts: string[], sourceLanguage: string, targetLanguage: string): Promise<TranslationResult[]> {
    return Promise.all(texts.map((text) => this.translate(text, sourceLanguage, targetLanguage)));
  }

  async getStatus(): Promise<EngineStatus> {
    return { available: isTauriApp(), modelLoaded: isTauriApp(), modelName: "Apple Translation", modelVersion: APPLE_TRANSLATION_VERSION, device: "macOS on-device" };
  }
  async loadModel(): Promise<void> {}
  async unloadModel(): Promise<void> {}
}

/** Routes only eligible clean prose to Apple and safely falls back to MADLAD. */
export class SelectiveAppleTranslationEngine implements TranslationEngine {
  readonly name = "selective-apple";
  private readonly apple: AppleTranslationEngine;
  private readonly madlad: TranslationEngine;
  private eligibleSources: ReadonlySet<string> | null = null;
  constructor(apple: AppleTranslationEngine, madlad: TranslationEngine) {
    this.apple = apple;
    this.madlad = madlad;
  }
  setEligibleSources(sources: ReadonlySet<string>): void { this.eligibleSources = sources; }
  async translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<TranslationResult> {
    if (isAppleEligibleSource(text) && (this.eligibleSources === null || this.eligibleSources.has(text))) {
      try { return await this.apple.translate(text, sourceLanguage, targetLanguage); } catch { /* safe fallback */ }
    }
    return this.madlad.translate(text, sourceLanguage, targetLanguage);
  }
  async translateBatch(texts: string[], sourceLanguage: string, targetLanguage: string) { return Promise.all(texts.map((t) => this.translate(t, sourceLanguage, targetLanguage))); }
  async getStatus() { return this.madlad.getStatus(); }
  async loadModel() { await this.madlad.loadModel(); }
  async unloadModel() { await this.madlad.unloadModel(); }
}
