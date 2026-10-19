import { isPlausibleJaTranslation } from "./quality";
import type { TranslationResult } from "./types";

/** Soft size below which solo Apple calls are unreliable; coalesce instead. */
export const APPLE_SHORT_PACK_SOFT_MAX_CHARS = 80;
/** Hard upper bound for a single unit that may enter a pack. */
export const APPLE_SHORT_PACK_UNIT_MAX_CHARS = 160;
export const APPLE_SHORT_PACK_WINDOW_MS = 30;
export const APPLE_SHORT_PACK_MAX_ITEMS = 8;
export const APPLE_SHORT_PACK_MAX_CHARS = 1600;

const UNIT_MARK = (index: number) => `<<${index}>>`;
const UNIT_MARK_RE = /<<(\d+)>>\s*/g;

/**
 * Shared reject list for Apple routing (solo or packed).
 * Keep structural chrome and contact rows off the on-device path.
 */
export function isAppleContaminatedSource(text: string): boolean {
  const s = text.trim();
  if (!s) return true;
  if (/[@]|https?:\/\/|\b(?:doi|references|bibliography)\b/i.test(s)) return true;
  if (/^\s*\d+\s+.*\b(?:University|College|Institute|School|Department|Faculty)\b.*\b\d+\s+[A-Z]/i.test(s)) {
    return true;
  }
  if (/^[\d\s.:-]+$/.test(s) || /^(?:fig(?:ure)?|table)\s*\d+/i.test(s)) return true;
  // Bare section labels only — do not reject body sentences that start with
  // "Results were …" / "Methods included …".
  if (/^(?:abstract|introduction|methods?|results?|discussion|conclusions?)\.?$/i.test(s)) {
    return true;
  }
  // Flattened bullet lists stay on MADLAD; a single bullet can be packed.
  if (/\n\s*[•●▪◦\-*]\s/u.test(s)) return true;
  return false;
}

/** Short but complete prose that benefits from being packed with peers. */
export function isApplePackableShort(text: string): boolean {
  const s = text.trim();
  if (s.length < 8 || s.length > APPLE_SHORT_PACK_UNIT_MAX_CHARS) return false;
  if (isAppleContaminatedSource(s)) return false;
  const words = s.match(/[A-Za-z]{2,}/g) ?? [];
  const singleListItem = /^[•●▪◦\-*]\s+[^\n]+$/u.test(s);
  if (singleListItem) return words.length >= 3;
  const titleWithSubtitle = /^[^.!?：:]{4,120}[:：]\s*[^.!?]{4,160}$/u.test(s);
  if (titleWithSubtitle) return words.length >= 4;
  if (words.length < 3) return false;
  // Prefer a finished clause; allow short titles without terminal punctuation.
  if ((s.match(/[.!?]/g) ?? []).length === 0 && !/[,:;]$/.test(s) && s.length < 24) {
    return false;
  }
  return true;
}

/** Whether this unit should wait for a short-pack flush instead of a solo Apple call. */
export function shouldCoalesceForApple(text: string, isSoloEligible: boolean): boolean {
  if (!isApplePackableShort(text)) return false;
  // Solo Apple is already reliable for longer eligible prose.
  if (isSoloEligible && text.trim().length >= APPLE_SHORT_PACK_SOFT_MAX_CHARS) return false;
  return true;
}

export function packAppleSources(texts: string[]): string {
  return texts.map((text, index) => `${UNIT_MARK(index)} ${text.trim()}`).join("\n");
}

/**
 * Split a packed Apple translation back into per-unit strings.
 * Returns null when markers are missing, reordered beyond recovery, or empty.
 */
export function unpackAppleSources(translated: string, count: number): string[] | null {
  if (count <= 0) return [];
  const matches: Array<{ index: number; markEnd: number; start: number }> = [];
  UNIT_MARK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = UNIT_MARK_RE.exec(translated)) !== null) {
    matches.push({
      index: Number(match[1]),
      start: match.index,
      markEnd: match.index + match[0].length,
    });
  }
  if (matches.length !== count) return null;
  const seen = new Set<number>();
  for (const item of matches) {
    if (!Number.isInteger(item.index) || item.index < 0 || item.index >= count) return null;
    if (seen.has(item.index)) return null;
    seen.add(item.index);
  }
  if (seen.size !== count) return null;

  matches.sort((a, b) => a.start - b.start);
  const out: string[] = Array.from({ length: count }, () => "");
  for (let i = 0; i < matches.length; i++) {
    const from = matches[i].markEnd;
    const to = i + 1 < matches.length ? matches[i + 1].start : translated.length;
    const piece = translated.slice(from, to).trim();
    if (!piece) return null;
    out[matches[i].index] = piece;
  }
  return out;
}

type Pending = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  resolve: (result: TranslationResult) => void;
  reject: (error: unknown) => void;
};

export type AppleShortPackSchedulerOptions = {
  windowMs?: number;
  maxItems?: number;
  maxChars?: number;
  /** Translate one unit (Apple when possible, else fallback). */
  translateOne: (
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ) => Promise<TranslationResult>;
  /** Translate a packed multi-unit payload via Apple. */
  translatePacked: (
    packed: string,
    sourceLanguage: string,
    targetLanguage: string
  ) => Promise<TranslationResult>;
};

/**
 * Coalesce short Apple-bound units across concurrent queue calls so on-device
 * Translation sees enough context. Unpacks marker-delimited results; units that
 * fail quality fall back individually.
 */
export class AppleShortPackScheduler {
  private queue: Pending[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly windowMs: number;
  private readonly maxItems: number;
  private readonly maxChars: number;
  private readonly translateOne: AppleShortPackSchedulerOptions["translateOne"];
  private readonly translatePacked: AppleShortPackSchedulerOptions["translatePacked"];
  private flushing: Promise<void> = Promise.resolve();

  constructor(options: AppleShortPackSchedulerOptions) {
    this.windowMs = options.windowMs ?? APPLE_SHORT_PACK_WINDOW_MS;
    this.maxItems = options.maxItems ?? APPLE_SHORT_PACK_MAX_ITEMS;
    this.maxChars = options.maxChars ?? APPLE_SHORT_PACK_MAX_CHARS;
    this.translateOne = options.translateOne;
    this.translatePacked = options.translatePacked;
  }

  translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<TranslationResult> {
    return new Promise<TranslationResult>((resolve, reject) => {
      this.queue.push({ text, sourceLanguage, targetLanguage, resolve, reject });
      const chars = this.queue.reduce((sum, item) => sum + item.text.length, 0);
      if (this.queue.length >= this.maxItems || chars >= this.maxChars) {
        void this.scheduleFlush(0);
      } else if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.scheduleFlush(0);
        }, this.windowMs);
      }
    });
  }

  /** Drain immediately (tests / shutdown). */
  async flushNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.scheduleFlush(0);
  }

  private scheduleFlush(_delay: number): Promise<void> {
    this.flushing = this.flushing.then(() => this.flushQueue());
    return this.flushing;
  }

  private async flushQueue(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batch = this.queue;
    this.queue = [];
    if (batch.length === 0) return;

    const groups = new Map<string, Pending[]>();
    for (const item of batch) {
      const key = `${item.sourceLanguage}→${item.targetLanguage}`;
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }

    for (const group of groups.values()) {
      await this.flushGroup(group);
    }
  }

  private async flushGroup(group: Pending[]): Promise<void> {
    if (group.length === 1) {
      const item = group[0];
      try {
        item.resolve(
          await this.translateOne(item.text, item.sourceLanguage, item.targetLanguage)
        );
      } catch (error) {
        item.reject(error);
      }
      return;
    }

    const packed = packAppleSources(group.map((item) => item.text));
    try {
      const packedResult = await this.translatePacked(
        packed,
        group[0].sourceLanguage,
        group[0].targetLanguage
      );
      const parts = unpackAppleSources(packedResult.text, group.length);
      if (!parts) {
        await this.translateGroupIndividually(group);
        return;
      }
      await Promise.all(
        group.map(async (item, index) => {
          const piece = parts[index] ?? "";
          if (piece && isPlausibleJaTranslation(piece, item.text)) {
            item.resolve({
              ...packedResult,
              text: piece,
              inputChars: item.text.length,
              outputChars: piece.length,
            });
            return;
          }
          try {
            item.resolve(
              await this.translateOne(item.text, item.sourceLanguage, item.targetLanguage)
            );
          } catch (error) {
            item.reject(error);
          }
        })
      );
    } catch {
      await this.translateGroupIndividually(group);
    }
  }

  private async translateGroupIndividually(group: Pending[]): Promise<void> {
    await Promise.all(
      group.map(async (item) => {
        try {
          item.resolve(
            await this.translateOne(item.text, item.sourceLanguage, item.targetLanguage)
          );
        } catch (error) {
          item.reject(error);
        }
      })
    );
  }
}
