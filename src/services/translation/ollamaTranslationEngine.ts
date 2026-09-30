import type { LLMProvider } from "../llm/types";
import {
  evaluateJaTranslation,
  diagnoseIncompleteSource,
  getCascadeQualityReasons,
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
  private readonly providers: LLMProvider[];
  private readonly primary: TranslationEngine;

  /** Audit-only deadline; unset keeps the historical unbounded behavior. */
  private readonly requestTimeoutMs = readOllamaTimeoutMs();
  private readonly think = readOllamaThinkSetting();
  private readonly maxAttempts = readOllamaMaxAttempts();

  constructor(primary: TranslationEngine, provider: LLMProvider | LLMProvider[]) {
    this.primary = primary;
    this.providers = Array.isArray(provider) ? provider : [provider];
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
      const units = splitAlternateUnits(text);
      let lastError: unknown;
      for (const provider of this.providers) {
        const prompts = [
          `Translate the following academic English into precise Japanese. Translate ordinary English words into Japanese; retain Latin text only for proper names, acronyms, citations, and necessary technical terms. Preserve every number, citation, acronym, statistical notation, negation, comparison, and causal relation. Do not replace a technical term with a different concept; when a domain term has no high-confidence Japanese equivalent, retain the original term in parentheses rather than guessing. Output only the Japanese translation.${statisticalLiteralInstruction(text)}${factLiteralInstruction(text)}${citationLiteralInstruction(text)}${comparisonLiteralInstruction(text)}`,
          `Correction retry: translate every ordinary English word and do not leave mixed English-Japanese words. Recheck every claim, comparison, exclusivity condition, negation, number, citation, named method, causal relation, and sentence ending. Output only the Japanese translation.${statisticalLiteralInstruction(text)}${factLiteralInstruction(text)}${citationLiteralInstruction(text)}${comparisonLiteralInstruction(text)}`,
        ];
        for (const [attempt, instruction] of prompts.slice(0, this.maxAttempts).entries()) {
          try {
            const completions = [];
            for (const unit of units) {
              // Each semantic unit gets only the literal citation guidance
              // present in that unit. Supplying every paragraph citation to
              // every unit encourages small local models to repeat author-year
              // references as standalone sentences.
              const unitInstruction = instruction.replace(
                citationLiteralInstruction(text),
                citationLiteralInstruction(unit),
              );
              completions.push(await provider.complete(
                `${unitInstruction}\n\nSOURCE:\n${unit}`,
                "You are a conservative academic translator. Never add facts or omit source facts. Do not explain your answer.",
                {
                  temperature: 0,
                  maxTokens: Math.max(256, Math.ceil(unit.length * 2.5)),
                  timeoutMs: this.requestTimeoutMs,
                  think: this.think,
                },
              ));
            }
            const completion = {
              text: completions.map((item) => item.text.trim()).join(" ").trim(),
              model: completions[0]?.model ?? "ollama",
              inputTokens: completions.reduce((sum, item) => sum + (item.inputTokens ?? 0), 0),
              outputTokens: completions.reduce((sum, item) => sum + (item.outputTokens ?? 0), 0),
            };
            const translated = restoreListBoundary(text, completion.text);
            const quality = evaluateJaTranslation(translated, text);
            const cascadeReasons = getCascadeQualityReasons(translated, text);
            const acceptable = isCascadeQualityAcceptable(translated, text)
              && (quality.reasons.length === 0 || quality.reasons.every((reason) => / relation missing$/.test(reason)));
            if (acceptable) {
              return {
                text: translated, sourceLanguage, targetLanguage, model: completion.model,
                modelVersion: `ollama-${completion.model}-selective-v5-correction-retry-${attempt + 1}`,
                inputChars: text.length, outputChars: translated.length,
                inputTokens: completion.inputTokens, outputTokens: completion.outputTokens,
                translationTimeMs: Date.now() - started,
                charsPerSec: translated.length / Math.max((Date.now() - started) / 1000, 0.001),
                tokensPerSec: completion.outputTokens ? completion.outputTokens / Math.max((Date.now() - started) / 1000, 0.001) : undefined,
              };
            }
            const primaryDetail = primaryError instanceof Error ? `: ${primaryError.message}` : primaryError ? `: ${String(primaryError)}` : "";
            const diagnosticQuality = cascadeReasons.length > 0
              ? { ...quality, reasons: [...new Set([...quality.reasons, ...cascadeReasons])] }
              : quality;
            const diagnostic = new AlternateTranslationQualityError(`alternate translation failed quality checks${primaryDetail}`, translated, diagnosticQuality);
            if (primaryError) diagnostic.cause = primaryError;
            lastError = diagnostic;
          } catch (error) {
            lastError = error;
          }
        }
      }
      if (lastError) throw lastError;
      throw new Error("No alternate translation provider configured");
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
    const alternates = await Promise.all(this.providers.map((provider) => provider.getStatus()));
    const alternate = alternates.find((status) => status.available) ?? alternates[0];
    return {
      available: primary.available || alternates.some((status) => status.available),
      modelLoaded: primary.modelLoaded,
      modelName: alternate.currentModel ?? primary.modelName,
      modelVersion: `${primary.modelVersion}+ollama-selective-v4-multi-candidate-semantic-units`,
      device: primary.device,
      error: primary.available || alternates.some((status) => status.available) ? undefined : `${primary.error ?? "MADLAD unavailable"}; ${alternates.map((status) => status.error ?? "Ollama unavailable").join("; ")}`,
    };
  }

  async loadModel(): Promise<void> {
    await this.primary.loadModel();
  }

  async unloadModel(): Promise<void> {
    await this.primary.unloadModel();
  }

  private isSafeSource(text: string): boolean {
    if (!text.trim() || !shouldTranslateParagraph(text) || unsafeParagraphStructureReason(text) !== null) return false;
    // Keep the audit-only long-terminal-mark heuristic out of production
    // routing, but never send a high-confidence lowercase continuation behind
    // a dash to an alternate model as if it were a complete paragraph.
    return diagnoseIncompleteSource(text).reason !== "source begins with a continuation dash";
  }
}

function readOllamaTimeoutMs(): number | undefined {
  const raw = typeof process !== "undefined" ? process.env.OLLAMA_REQUEST_TIMEOUT_MS : undefined;
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function readOllamaThinkSetting(): boolean | undefined {
  const raw = typeof process !== "undefined" ? process.env.OLLAMA_THINK : undefined;
  if (raw === undefined) return undefined;
  if (/^(false|0|off)$/i.test(raw.trim())) return false;
  if (/^(true|1|on)$/i.test(raw.trim())) return true;
  return undefined;
}

function readOllamaMaxAttempts(): number {
  const raw = typeof process !== "undefined" ? process.env.OLLAMA_MAX_ATTEMPTS : undefined;
  const value = raw ? Number(raw) : NaN;
  return Number.isInteger(value) && value > 0 ? Math.min(value, 2) : 2;
}

export class AlternateTranslationQualityError extends Error {
  constructor(
    message: string,
    readonly translation: string,
    readonly quality: ReturnType<typeof evaluateJaTranslation>,
  ) {
    super(message);
    this.name = "AlternateTranslationQualityError";
  }
}

/** Split alternate-model input at semantic sentence boundaries. This is a
 * deliberately conservative rescue splitter: it never splits inside balanced
 * citation/parenthesis spans, and keeps short fragments attached to the next
 * unit. The primary MADLAD path remains the canonical segmenter. */
function splitAlternateUnits(text: string): string[] {
  const units: string[] = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if ("([{".includes(ch)) depth += 1;
    else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
    if (depth !== 0 || !".!?".includes(ch)) continue;
    const next = text[i + 1] ?? "";
    if (ch === "." && /\d/.test(text[i - 1] ?? "") && /\d/.test(next)) continue;
    if (next && !/[\s)\]}"']/u.test(next)) continue;
    const candidate = text.slice(start, i + 1).trim();
    if (candidate.length >= 48) {
      units.push(candidate);
      start = i + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) units.push(tail);
  const expanded: string[] = [];
  for (const unit of units.length > 0 ? units : [text.trim()]) {
    if (unit.length <= 420) {
      expanded.push(unit);
      continue;
    }
    // Long single sentences can still drift in small local models. Split only
    // at a top-level clause delimiter, never inside citation/parenthesis
    // groups, and only when both sides retain enough context to stand alone.
    let depth = 0;
    let splitAt = -1;
    for (let i = 0; i < unit.length; i += 1) {
      const ch = unit[i];
      if ("([{".includes(ch)) depth += 1;
      else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
      if (depth === 0 && (ch === ";" || ch === ":") && i >= 120 && unit.length - i >= 120) {
        splitAt = i + 1;
        break;
      }
    }
    if (splitAt > 0) {
      expanded.push(unit.slice(0, splitAt).trim(), unit.slice(splitAt).trim());
    } else {
      expanded.push(unit);
    }
  }
  return expanded.filter(Boolean);
}

/** Preserve list structure deterministically when a model drops the marker. */
function restoreListBoundary(source: string, translated: string): string {
  const marker = source.match(/^\s*((?:[-–—•‣∙]|\([a-z]\)|\d+[.)])\s+)/i)?.[1];
  if (!marker || /^\s*(?:[-–—•‣∙]|\([a-z]\)|\d+[.)])\s+/i.test(translated)) return translated;
  return `${marker}${translated.trim()}`;
}

function statisticalLiteralInstruction(source: string): string {
  const literals = [...source.matchAll(/(?:[χΧxX](?:²|2)?|[FfTtZz]|[UWHV])\s*\([^)]{1,16}\)\s*(?:=|<|>|≤|≥)\s*[-+]?\d+(?:\.\d+)?|\bp\s*(?:=|<|>|≤|≥)\s*\.?\d+(?:\.\d+)?/g)]
    .map((match) => match[0].replace(/\s+/g, " ").trim());
  if (literals.length === 0) return "";
  return ` Preserve these statistical expressions exactly, including the comparison operator: ${[...new Set(literals)].join("; ")}.`;
}

function factLiteralInstruction(source: string): string {
  const facts = [
    ...(source.match(/\b(?:1[5-9]\d{2}|20\d{2})\b/g) ?? []),
    ...(source.match(/\b[A-Z]{2,}(?:[A-Z0-9-]*[A-Z0-9])?\b/g) ?? []),
  ];
  const unique = [...new Set(facts)];
  if (unique.length === 0) return "";
  return ` Preserve these source facts exactly (do not change or invent them): ${unique.join(", ")}.`;
}

function citationLiteralInstruction(source: string): string {
  const groups = [
    ...(source.match(/\([^()]{2,140}?\b(?:19\d{2}|20\d{2})\b[^()]{0,140}?\)/g) ?? []),
    ...(source.match(/\[[0-9]{1,3}(?:\s*[,;]\s*[0-9]{1,3})*\]/g) ?? []),
  ].map((value) => value.replace(/\s+/g, " ").trim());
  const unique = [...new Set(groups)].filter((value) => /\b(?:19\d{2}|20\d{2})\b|\[\d/.test(value));
  if (unique.length === 0) return "";
  return ` Copy these citation groups exactly as written (do not translate, reorder, or omit them). Emit each citation group once, attached directly to the sentence or clause where it occurs; place it before that sentence's final punctuation and never repeat a citation after a Japanese full stop or as a standalone sentence: ${unique.join(" | ")}.`;
}

function comparisonLiteralInstruction(source: string): string {
  if (!/\b(?:more|less|fewer|greater|lower|higher|better|worse|likely|unlikely)\b[\s\S]{0,100}\b(?:than|compared with|compared to|relative to)\b/i.test(source)) return "";
  return " Preserve both sides and the direction of every comparison; explicitly translate the comparison target after than/compared with/relative to, and do not collapse it into a one-sided claim.";
}
