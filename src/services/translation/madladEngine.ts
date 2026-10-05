/**
 * MADLAD Translation Engine Client.
 * 
 * Connects to the local MADLAD translation server.
 */

import { isPlausibleJaTranslation, restoreUtf8ByteEscapes } from "./quality";
import { projectSafeUnitTranslation } from "./partialProjection";
import type { TranslationEngine, TranslationResult, EngineStatus } from "./types";

// Bump whenever the server-side protection or semantic-unit pipeline changes.
// It is part of the cache identity, so stale translations produced before the
// current source-preservation rules are never silently reused.
export const MADLAD_MODEL_VERSION =
  `3b-mt-v6-transformers-4.57.6-semantic-v84-source-protect-v29-space-footnote-citation-bracket-author-year-tail-restore-strict-restore-v28-quality-v36-relation-condition-beam-v8-section-marker-contextual-number-citation-group-foreign-script-hangul-supplementary-ref-inventory-long-claim-quoted-boundary-repeat-token-dense-citation-claim-compression-beam-v2-identifier-glue-simplified-cjk-rescue-quoted-label-policy-client-quality-v36`;

const DEFAULT_SERVER_URL = "http://127.0.0.1:8765";

let cachedServerToken: string | null | undefined;

const TRANSLATION_REQUEST_ATTEMPTS = 3;
// Prevent a single MPS graph compilation or dead request from blocking an
// entire import queue indefinitely. The timeout is deliberately generous for
// long academic paragraphs and applies per attempt.
const TRANSLATION_REQUEST_TIMEOUT_MS = 180_000;

async function fetchTranslation(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < TRANSLATION_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TRANSLATION_REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      // A sidecar can be briefly unavailable while the model is loading or
      // restarting. Retry only transient gateway/service responses; preserve
      // deterministic client errors for the caller's failure classification.
      if (![502, 503, 504].includes(response.status) || attempt === TRANSLATION_REQUEST_ATTEMPTS - 1) {
        return response;
      }
      lastError = new Error(`Translation server temporary error: ${response.status}`);
    } catch (error) {
      lastError = error instanceof DOMException && error.name === "AbortError"
        ? new Error(`Translation server request timed out after ${TRANSLATION_REQUEST_TIMEOUT_MS}ms`)
        : error;
      if (attempt === TRANSLATION_REQUEST_ATTEMPTS - 1) throw lastError;
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error("Translation request failed");
}

async function translationAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return headers;
  }
  if (cachedServerToken === undefined) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      cachedServerToken = await invoke<string>("get_translation_server_token");
    } catch {
      cachedServerToken = null;
    }
  }
  if (cachedServerToken) {
    headers["X-Paper-Reader-Token"] = cachedServerToken;
  }
  return headers;
}

export function resolveMadladServerUrl(url?: string): string {
  const trimmed = (url ?? "").trim().replace(/\/$/, "");
  if (!trimmed) {
    return DEFAULT_SERVER_URL;
  }
  return trimmed;
}

/**
 * Client for the MADLAD translation server.
 */
export class MADLADEngine implements TranslationEngine {
  readonly name = "madlad";
  private serverUrl: string;

  constructor(serverUrl: string = DEFAULT_SERVER_URL) {
    this.serverUrl = resolveMadladServerUrl(serverUrl);
  }

  async translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<TranslationResult> {
    const response = await fetchTranslation(`${this.serverUrl}/translate`, {
      method: "POST",
      headers: await translationAuthHeaders(),
      body: JSON.stringify({
        text,
        source_language: sourceLanguage,
        target_language: targetLanguage,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Translation failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const translatedText = restoreUtf8ByteEscapes(
      (typeof data.text === "string" && data.text) ||
      (typeof data.translated_text === "string" && data.translated_text) ||
      ""
    );

    const translationUnits = Array.isArray(data.translation_units)
      ? data.translation_units.filter((value: unknown): value is string => typeof value === "string")
      : undefined;
    const partialUnitTexts = Array.isArray(data.partial_unit_texts)
      ? data.partial_unit_texts.filter((value: unknown): value is string => typeof value === "string")
      : undefined;
    const safePartial = projectSafeUnitTranslation({ translationUnits, partialUnitTexts }, text);
    const effectiveText = !isPlausibleJaTranslation(translatedText, text) && safePartial
      ? safePartial.text
      : translatedText;
    if (!effectiveText) {
      throw new Error("Translation server returned empty text");
    }
    if (targetLanguage === "ja" && !isPlausibleJaTranslation(effectiveText, text) && !safePartial) {
      throw new Error("Translation output looked degenerate and was discarded");
    }

    return {
      text: effectiveText,
      sourceLanguage: data.source_language,
      targetLanguage: data.target_language,
      model: data.model,
      modelVersion: data.model_version,
      inputChars: data.input_chars,
      outputChars: data.output_chars,
      inputTokens: data.input_tokens ?? undefined,
      outputTokens: data.output_tokens ?? undefined,
      translationTimeMs: data.translation_time_ms,
      charsPerSec: data.chars_per_sec,
      tokensPerSec: data.tokens_per_sec ?? undefined,
      fallbackStage: typeof data.fallback_stage === "string" ? data.fallback_stage : undefined,
      fallbackReason: typeof data.fallback_reason === "string" ? data.fallback_reason : undefined,
      unitFallbackIndices: Array.isArray(data.unit_fallback_indices) ? data.unit_fallback_indices.filter((value: unknown): value is number => typeof value === "number") : undefined,
      partialText: typeof data.partial_text === "string" ? restoreUtf8ByteEscapes(data.partial_text) : undefined,
      partialSourceUnits: Array.isArray(data.partial_source_units) ? data.partial_source_units.filter((value: unknown): value is string => typeof value === "string") : undefined,
      partialUnitTexts: Array.isArray(data.partial_unit_texts) ? data.partial_unit_texts.filter((value: unknown): value is string => typeof value === "string") : undefined,
      translationUnits,
    };
  }

  async translateBatch(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<TranslationResult[]> {
    const response = await fetchTranslation(`${this.serverUrl}/translate/batch`, {
      method: "POST",
      headers: await translationAuthHeaders(),
      body: JSON.stringify({
        texts,
        source_language: sourceLanguage,
        target_language: targetLanguage,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Batch translation failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    if (!Array.isArray(data.results) || data.results.length !== texts.length) {
      throw new Error(
        `Batch translation result count mismatch: expected ${texts.length}, got ${Array.isArray(data.results) ? data.results.length : "non-array"}`
      );
    }

    return data.results.map((r: Record<string, unknown>, index: number) => {
      const translatedText = restoreUtf8ByteEscapes(r.text as string);
      const translationUnits = Array.isArray(r.translation_units)
        ? r.translation_units.filter((value): value is string => typeof value === "string")
        : undefined;
      const partialUnitTexts = Array.isArray(r.partial_unit_texts)
        ? r.partial_unit_texts.filter((value): value is string => typeof value === "string")
        : undefined;
      const safePartial = projectSafeUnitTranslation({ translationUnits, partialUnitTexts }, texts[index] ?? "");
      const effectiveText = targetLanguage === "ja"
        && !isPlausibleJaTranslation(translatedText, texts[index] ?? "")
        && safePartial
        ? safePartial.text
        : translatedText;
      // Keep single and batch APIs semantically identical.  The server may
      // return its source as a safe per-unit fallback; it must never be
      // treated as a completed Japanese translation by a future batch caller.
      if (targetLanguage === "ja" && !isPlausibleJaTranslation(effectiveText, texts[index] ?? "") && !safePartial) {
        throw new Error("Translation output looked degenerate and was discarded");
      }
      return {
        text: effectiveText,
        sourceLanguage: r.source_language as string,
        targetLanguage: r.target_language as string,
        model: r.model as string,
        modelVersion: r.model_version as string,
        inputChars: r.input_chars as number,
        outputChars: r.output_chars as number,
        inputTokens: (r.input_tokens as number) ?? undefined,
        outputTokens: (r.output_tokens as number) ?? undefined,
        translationTimeMs: r.translation_time_ms as number,
        charsPerSec: r.chars_per_sec as number,
        tokensPerSec: (r.tokens_per_sec as number) ?? undefined,
        fallbackStage: typeof r.fallback_stage === "string" ? r.fallback_stage : undefined,
        fallbackReason: typeof r.fallback_reason === "string" ? r.fallback_reason : undefined,
        unitFallbackIndices: Array.isArray(r.unit_fallback_indices) ? r.unit_fallback_indices.filter((value): value is number => typeof value === "number") : undefined,
        partialText: typeof r.partial_text === "string" ? restoreUtf8ByteEscapes(r.partial_text) : undefined,
        partialSourceUnits: Array.isArray(r.partial_source_units) ? r.partial_source_units.filter((value): value is string => typeof value === "string") : undefined,
        partialUnitTexts,
        translationUnits,
      };
    });
  }

  async getStatus(): Promise<EngineStatus> {
    try {
      const response = await fetchTranslation(`${this.serverUrl}/status`, { method: "GET" });

      if (!response.ok) {
        return {
          available: false,
          modelLoaded: false,
          modelName: "madlad400-3b-mt",
          modelVersion: MADLAD_MODEL_VERSION,
          device: "unknown",
          error: `Server error: ${response.status}`,
        };
      }

      const data = await response.json();

      return {
        available: data.available,
        modelLoaded: data.model_loaded,
        modelName: data.model_name,
        modelVersion: data.model_version,
        device: data.device,
        error: data.error ?? undefined,
      };
    } catch {
      return {
        available: false,
        modelLoaded: false,
        modelName: "madlad400-3b-mt",
        modelVersion: MADLAD_MODEL_VERSION,
        device: "unknown",
        error: "翻訳サーバーに接続できません。サーバーが起動しているか確認してください。",
      };
    }
  }

  async loadModel(): Promise<void> {
    const response = await fetch(`${this.serverUrl}/load`, {
      method: "POST",
      headers: await translationAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to load model: ${response.status} ${errorText}`);
    }
  }

  async unloadModel(): Promise<void> {
    const response = await fetch(`${this.serverUrl}/unload`, {
      method: "POST",
      headers: await translationAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to unload model: ${response.status} ${errorText}`);
    }
  }
}

/**
 * Check if the MADLAD server is available.
 */
export async function checkMADLADServer(
  serverUrl: string = DEFAULT_SERVER_URL
): Promise<{ available: boolean; modelLoaded: boolean; error?: string }> {
  const resolved = resolveMadladServerUrl(serverUrl);
  try {
    const response = await fetch(`${resolved}/health`);

    if (!response.ok) {
      return {
        available: false,
        modelLoaded: false,
        error: `Server returned ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      available: true,
      modelLoaded: data.model_loaded,
    };
  } catch {
    return {
      available: false,
      modelLoaded: false,
      error: "翻訳サーバーに接続できません",
    };
  }
}
