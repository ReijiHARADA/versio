import { isTauriApp } from "../../utils/serverReady";
import {
  AppleShortPackScheduler,
  isAppleContaminatedSource,
  isApplePackableShort,
  shouldCoalesceForApple,
} from "./appleShortPack";
import { isPlausibleJaTranslation } from "./quality";
import type { EngineStatus, TranslationEngine, TranslationResult } from "./types";

export const APPLE_TRANSLATION_VERSION = "apple-translation-macos-v2";

export {
  isAppleContaminatedSource,
  isApplePackableShort,
  packAppleSources,
  shouldCoalesceForApple,
  unpackAppleSources,
} from "./appleShortPack";

/** Conservative eligibility: only complete, prose-like ordinary blocks reach Apple solo. */
export function isAppleEligibleSource(text: string): boolean {
  const s = text.trim();
  if (s.length < 20 || s.length > 2000) return false;
  if (isAppleContaminatedSource(s)) return false;
  const words = s.match(/[A-Za-z]{2,}/g) ?? [];
  const singleListItem = /^[•●▪◦\-*]\s+[^\n]+$/u.test(s);
  if (singleListItem) return words.length >= 3;
  // Academic titles with a subtitle are short but semantically complete.
  // Let Apple see both halves so a fallback model cannot silently discard the
  // subtitle after the colon.
  const titleWithSubtitle = /^[^.!?：:]{4,120}[:：]\s*[^.!?]{4,160}$/u.test(s);
  if (titleWithSubtitle) return words.length >= 4;
  if (s.length < 40) return false;
  if ((s.match(/[.!?]/g) ?? []).length === 0 && !/[,:;]$/.test(s)) return false;
  return words.length >= 8;
}

export class AppleTranslationEngine implements TranslationEngine {
  readonly name = "apple-translation";

  async translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    options?: { skipEligibility?: boolean }
  ): Promise<TranslationResult> {
    const started = performance.now();
    if (!isTauriApp()) throw new Error("Apple Translation requires the desktop app");
    if (!options?.skipEligibility && !isAppleEligibleSource(text)) {
      throw new Error("Apple Translation source is not eligible");
    }
    const { invoke } = await import("@tauri-apps/api/core");
    const translated = await invoke<string>("translate_with_apple", {
      text,
      sourceLanguage,
      targetLanguage,
    });
    if (!isPlausibleJaTranslation(translated, text)) {
      throw new Error("Apple Translation failed quality gate");
    }
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

  async translateBatch(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<TranslationResult[]> {
    return Promise.all(texts.map((text) => this.translate(text, sourceLanguage, targetLanguage)));
  }

  async getStatus(): Promise<EngineStatus> {
    return {
      available: isTauriApp(),
      modelLoaded: isTauriApp(),
      modelName: "Apple Translation",
      modelVersion: APPLE_TRANSLATION_VERSION,
      device: "macOS on-device",
    };
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
  private readonly shortPack: AppleShortPackScheduler;

  constructor(apple: AppleTranslationEngine, madlad: TranslationEngine) {
    this.apple = apple;
    this.madlad = madlad;
    this.shortPack = new AppleShortPackScheduler({
      translateOne: (text, sourceLanguage, targetLanguage) =>
        this.translateOne(text, sourceLanguage, targetLanguage),
      translatePacked: async (packed, sourceLanguage, targetLanguage) => {
        // Packed payloads carry <<n>> markers and are long enough for Apple;
        // skip solo eligibility so marker lines are not rejected as chrome.
        return this.apple.translate(packed, sourceLanguage, targetLanguage, {
          skipEligibility: true,
        });
      },
    });
  }

  setEligibleSources(sources: ReadonlySet<string>): void {
    this.eligibleSources = sources;
  }

  private isRegistered(text: string): boolean {
    return this.eligibleSources === null || this.eligibleSources.has(text);
  }

  private async translateOne(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<TranslationResult> {
    if (
      (isAppleEligibleSource(text) || isApplePackableShort(text)) &&
      this.isRegistered(text)
    ) {
      try {
        // Packable shorts that miss solo eligibility still try Apple once
        // (e.g. after a pack unpack failure) before MADLAD.
        return await this.apple.translate(text, sourceLanguage, targetLanguage, {
          skipEligibility: !isAppleEligibleSource(text),
        });
      } catch {
        /* safe fallback */
      }
    }
    return this.madlad.translate(text, sourceLanguage, targetLanguage);
  }

  async translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<TranslationResult> {
    const soloEligible = isAppleEligibleSource(text);
    if (
      shouldCoalesceForApple(text, soloEligible) &&
      this.isRegistered(text)
    ) {
      return this.shortPack.translate(text, sourceLanguage, targetLanguage);
    }
    return this.translateOne(text, sourceLanguage, targetLanguage);
  }

  async translateBatch(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<TranslationResult[]> {
    return Promise.all(
      texts.map((text) => this.translate(text, sourceLanguage, targetLanguage))
    );
  }

  async getStatus() {
    return this.madlad.getStatus();
  }
  async loadModel() {
    await this.madlad.loadModel();
  }
  async unloadModel() {
    await this.madlad.unloadModel();
  }
}
