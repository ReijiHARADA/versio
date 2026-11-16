/**
 * PLaMo 3 Translate engine over the bundled llama-server sidecar (OpenAI-compatible API).
 * Design: docs/superpowers/specs/2026-11-16-plamo-translation-engine-design.md
 */

import { TranslationQualityError } from "./retryPolicy";
import { checkTranslation } from "./translationCheck";
import type { GlossaryEntry } from "../llm/types";
import type { EngineStatus, TranslationEngine, TranslationResult } from "./types";

export const PLAMO_MODEL = "plamo-3-translate-2b";
// Bump when request options change output (form, glossary handling) so translation_cache does not mix them.
export const PLAMO_MODEL_VERSION = "q4_k_m-1ffd9073-plain";

export type PlamoServerInfo = { baseUrl: string; token: string };
type PlamoModelStatus = { present: boolean; downloadedBytes: number; totalBytes: number };

type ChatReply = {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

async function tauriInvoke<T>(cmd: string): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd);
}

class AuthError extends Error {}

type PlamoGlossaryTerm = { source: string; target: string };
const MAX_GLOSSARY_TERMS = 30;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Glossary terms that occur in `text`, keyed by their surface form there. A hyphen may
 * appear between any two letters (PDF line-break hyphenation, e.g. "neuroim-aging"), and
 * PLaMo matches glossary sources literally, so the surface form is what gets sent.
 */
export function glossaryForText(text: string, entries: GlossaryEntry[]): PlamoGlossaryTerm[] {
  const out: PlamoGlossaryTerm[] = [];
  const seen = new Set<string>();
  for (const { term, translation } of entries) {
    const source = term?.trim();
    const target = translation?.trim();
    if (!source || !target || source.includes("<|plamo:") || target.includes("<|plamo:")) continue;
    const pattern = [...source].map(escapeRe).join("-?");
    const match = new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "iu").exec(text);
    if (!match || seen.has(match[0])) continue;
    seen.add(match[0]);
    out.push({ source: match[0], target });
    if (out.length >= MAX_GLOSSARY_TERMS) break;
  }
  return out;
}

export class PlamoEngine implements TranslationEngine {
  readonly name = "plamo";
  private server: PlamoServerInfo | null = null;
  private glossary: GlossaryEntry[] = [];
  private readonly getServer: () => Promise<PlamoServerInfo>;
  private readonly fetchImpl: typeof fetch;

  constructor(deps: { getServer?: () => Promise<PlamoServerInfo>; fetchImpl?: typeof fetch } = {}) {
    this.getServer = deps.getServer ?? (() => tauriInvoke<PlamoServerInfo>("ensure_plamo_server"));
    this.fetchImpl = deps.fetchImpl ?? ((...args) => fetch(...args));
  }

  /** Paper glossary; terms found in each block are passed to PLaMo as hard term constraints. */
  setGlossary(entries: GlossaryEntry[]): void {
    this.glossary = entries;
  }

  private async request(text: string): Promise<ChatReply> {
    const glossary = glossaryForText(text, this.glossary);
    this.server ??= await this.getServer();
    const res = await this.fetchImpl(`${this.server.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.server.token}` },
      body: JSON.stringify({
        messages: [{ role: "user", content: text }],
        temperature: 0,
        max_tokens: 4096,
        // "plain" = だ・である調, the register of Japanese papers (blind MQM: 7 better / 1 worse).
        chat_template_kwargs: {
          source_lang: "en",
          target_lang: "ja",
          form: "plain",
          ...(glossary.length ? { glossary } : {}),
        },
        stop: ["<|plamo:tag|>", "<|plamo:bos|>"],
      }),
    });
    if (res.status === 401) throw new AuthError("unauthorized");
    if (!res.ok) throw new Error(`PLaMo server error ${res.status}`);
    return (await res.json()) as ChatReply;
  }

  /** One request; on 401 or network failure, refetch server info (sidecar may have restarted) and retry once. */
  private async requestWithReconnect(text: string): Promise<ChatReply> {
    try {
      return await this.request(text);
    } catch (error) {
      if (!(error instanceof AuthError || error instanceof TypeError)) throw error;
      this.server = null;
      return this.request(text);
    }
  }

  async translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<TranslationResult> {
    const started = performance.now();
    let reply = await this.requestWithReconnect(text);
    let out = reply.choices?.[0]?.message?.content?.trim() ?? "";
    if (!checkTranslation(text, out).ok) {
      reply = await this.requestWithReconnect(text);
      out = reply.choices?.[0]?.message?.content?.trim() ?? "";
      const check = checkTranslation(text, out);
      if (!check.ok) {
        throw new TranslationQualityError(
          `PLaMo output failed check: ${[...check.breakdown, ...check.lostFacts].join(", ")}`
        );
      }
    }
    const translationTimeMs = performance.now() - started;
    return {
      text: out,
      sourceLanguage,
      targetLanguage,
      model: PLAMO_MODEL,
      modelVersion: PLAMO_MODEL_VERSION,
      inputChars: text.length,
      outputChars: out.length,
      inputTokens: reply.usage?.prompt_tokens,
      outputTokens: reply.usage?.completion_tokens,
      translationTimeMs,
      charsPerSec: text.length / Math.max(translationTimeMs / 1000, 1e-3),
    };
  }

  translateBatch(texts: string[], sourceLanguage: string, targetLanguage: string): Promise<TranslationResult[]> {
    return Promise.all(texts.map((t) => this.translate(t, sourceLanguage, targetLanguage)));
  }

  async getStatus(): Promise<EngineStatus> {
    const base = { modelName: PLAMO_MODEL, modelVersion: PLAMO_MODEL_VERSION, device: "metal" };
    try {
      const model = await tauriInvoke<PlamoModelStatus>("plamo_model_status");
      if (!model.present) return { ...base, available: false, modelLoaded: false, error: "model_not_downloaded" };
      return { ...base, available: true, modelLoaded: this.server !== null };
    } catch (error) {
      return { ...base, available: false, modelLoaded: false, error: String(error) };
    }
  }

  async loadModel(): Promise<void> {
    const model = await tauriInvoke<PlamoModelStatus>("plamo_model_status");
    if (!model.present) await tauriInvoke<void>("download_plamo_model");
    this.server = await this.getServer();
  }

  async unloadModel(): Promise<void> {
    // The sidecar stops with the app window.
  }
}
