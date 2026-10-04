/** Output-shape checks shared by translation quality gates. */

const THAI = /[\u0E00-\u0E7F]/;
const HANGUL = /[\uAC00-\uD7AF]/;
const UNEXPECTED_FOREIGN_SCRIPT = /[\u0900-\u097F\u0400-\u04FF\u0600-\u06FF\u0B80-\u0BFF]/;
const BYTE_ESCAPE = /<0x[0-9a-f]{2}>/i;
const LEFTOVER_PLACEHOLDER = /[zζΖ][zζЗ][cсϲц][^\s]{0,8}(?=[^\s]{0,8}\d)(?=[^\s]{0,8}[itτтц])[^\s]{1,8}[zζΖ][zζЗ]/i;

/** Restore valid UTF-8 byte tokens if an older bundled server emitted them. */
export function restoreUtf8ByteEscapes(text: string): string {
  return text.replace(/(?:<0x[0-9a-f]{2}>)+/gi, (run) => {
    const bytes = [...run.matchAll(/<0x([0-9a-f]{2})>/gi)].map((m) => Number.parseInt(m[1], 16));
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    } catch {
      return run;
    }
  });
}

/** Detect fluent-looking decoder loops without relying on domain vocabulary. */
export function hasAbnormalPhraseRepetition(text: string): boolean {
  const compact = text.replace(/[^\p{L}\p{N}]/gu, "");
  if (compact.length < 36) return false;
  const counts = new Map<string, number>();
  for (let index = 0; index <= compact.length - 5; index += 1) {
    const phrase = compact.slice(index, index + 5);
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  return [...counts.entries()].some(([phrase, count]) =>
    count >= 3
    && phrase.length * count / compact.length >= 0.16
    && !(/^[\u30a0-\u30ff]+$/.test(phrase) && (text.match(/[,、]/g) ?? []).length >= 2)
  );
}

function hasFragmentedJapaneseSpacing(text: string): boolean {
  const spacedJapaneseTokens = text.match(/(?:^|\s)[\u3040-\u30ff\u4e00-\u9fff]{1,2}(?=\s|$)/g) ?? [];
  if (spacedJapaneseTokens.length < 14) return false;
  const japaneseChars = (text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) ?? []).length;
  if (japaneseChars < 40) return false;
  const compactLength = text.replace(/\s+/g, "").length;
  const whitespaceCount = (text.match(/\s/g) ?? []).length;
  return spacedJapaneseTokens.length / Math.max(japaneseChars, 1) > 0.18
    && whitespaceCount / Math.max(compactLength, 1) > 0.12;
}

export function toHalfwidthAscii(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .replace(/([,;:])(?=[\u3040-\u30FF\u4E00-\u9FFF])/g, "$1 ");
}

export function explainDegenerateTranslation(text: string): string[] {
  const reasons: string[] = [];
  const compact = text.replace(/\s+/g, "");
  if (!compact) reasons.push("empty output");
  if (BYTE_ESCAPE.test(text)) reasons.push("byte escape");
  if (LEFTOVER_PLACEHOLDER.test(toHalfwidthAscii(text))) reasons.push("leftover placeholder");
  if (/(.)\1{7,}/u.test(compact)) reasons.push("character repetition");
  if (THAI.test(text) || HANGUL.test(text) || UNEXPECTED_FOREIGN_SCRIPT.test(text)) reasons.push("foreign script contamination");
  if (!compact) return reasons;
  const counts = new Map<string, number>();
  for (const ch of compact) counts.set(ch, (counts.get(ch) || 0) + 1);
  const max = Math.max(...counts.values());
  if (compact.length >= 16 && max / compact.length > 0.4) reasons.push("character concentration");
  const uniqueRatio = counts.size / compact.length;
  if (compact.length >= 40 && uniqueRatio < 0.08) reasons.push("low character diversity");
  if (hasAbnormalPhraseRepetition(text)) reasons.push("phrase repetition");
  if (hasFragmentedJapaneseSpacing(text)) reasons.push("fragmented Japanese spacing");
  return reasons;
}

export function isDegenerateTranslation(text: string): boolean {
  return explainDegenerateTranslation(text).length > 0;
}
