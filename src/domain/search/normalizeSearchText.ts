/**
 * Search-only text normalization, applied to both the index and the query so
 * spelling variants meet on the same string.
 *
 * - NFKC + lowercase (full-width / half-width, ligatures like `ﬁ`).
 * - Katakana long vowel `ー` after katakana is dropped
 *   (インターフェース / インタフェース, コンピューター / コンピュータ).
 * - `ヴァ ヴィ ヴ ヴェ ヴォ` → `バ ビ ブ ベ ボ`.
 * - Anything that is not a letter or digit is a separator (punctuation, `・`,
 *   hyphens). Separators between two non-Latin characters vanish, so
 *   `ユーザ・インタフェース` and PDF-split `認知 負荷` join up.
 * - Latin/digit runs are separated from other scripts by one space, so a short
 *   Latin word can be matched with its boundaries (`% ui %`).
 *
 * The result is idempotent: normalizing it again returns the same string,
 * which `refreshPaperAnnotationFts` relies on when it re-indexes stored text.
 */

const VU_MAP: Record<string, string> = { ァ: "バ", ィ: "ビ", ェ: "ベ", ォ: "ボ" };
const LATIN = /[\p{Script=Latin}\p{N}]/u;

export function normalizeSearchText(input: string): string {
  let text = input.normalize("NFKC").toLowerCase();
  text = text.replace(/ヴ([ァィェォ])/g, (_, small: string) => VU_MAP[small]);
  text = text.replace(/ヴ/g, "ブ");
  text = text.replace(/(?<=[ァ-ヺ])ー+/g, "");
  text = text.replace(/[^\p{L}\p{N}]+/gu, " ");

  let out = "";
  let pendingSpace = false;
  let prev = "";
  for (const char of text) {
    if (char === " ") {
      pendingSpace = out.length > 0;
      continue;
    }
    const latin = LATIN.test(char);
    const prevLatin = prev !== "" && LATIN.test(prev);
    if (prev !== "" && (latin !== prevLatin || (pendingSpace && latin))) out += " ";
    out += char;
    prev = char;
    pendingSpace = false;
  }
  return out;
}

/** Index form: normalized and padded so every word has a space on both sides. */
export function normalizeIndexText(input: string): string {
  const normalized = normalizeSearchText(input);
  return normalized ? ` ${normalized} ` : "";
}
