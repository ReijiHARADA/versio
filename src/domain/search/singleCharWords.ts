/**
 * One-character Japanese words (蚊, 数, め). As a substring they hit nearly every
 * paper (数 inside 関数, め inside ため), so they are matched only where the text
 * uses them as a word: the index keeps the set of one-character word segments
 * (`Intl.Segmenter`, dictionary-based for Japanese).
 */
const SINGLE_CJK = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々〆]$/u;

let segmenter: Intl.Segmenter | null | undefined;

function wordSegmenter(): Intl.Segmenter | null {
  if (segmenter === undefined) {
    segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("ja", { granularity: "word" }) : null;
  }
  return segmenter;
}

/** Whether a normalized query term is a one-character Japanese word. */
export function isSingleCharTerm(term: string): boolean {
  return SINGLE_CJK.test(term);
}

/**
 * The distinct one-character Japanese words in `text`, space-padded
 * (` 蚊 数 め `) so a word is found as ` 蚊 `. Empty when there are none or the
 * runtime has no `Intl.Segmenter`.
 */
export function singleCharWords(text: string): string {
  const segment = wordSegmenter();
  if (!segment || !text) return "";
  const words = new Set<string>();
  for (const part of segment.segment(text.normalize("NFKC"))) {
    if (part.isWordLike && SINGLE_CJK.test(part.segment)) words.add(part.segment);
  }
  return words.size ? ` ${[...words].join(" ")} ` : "";
}
