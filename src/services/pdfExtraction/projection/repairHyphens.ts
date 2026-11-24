import type { PaperBlock } from "../../../types/paper";

/**
 * Line-end hyphens that survived line joining ("experi-enced", "support-ive").
 *
 * joinHyphenated keeps the hyphen of `word-` + `lowercase` because it cannot tell
 * a broken word from a compound broken at its hyphen (`decision-` + `support`).
 * With the whole document in hand the two can be told apart: the hyphen goes
 * when the joined word is written elsewhere in the document, or when the tail
 * is a suffix fragment that is never a word of its own. Compounds whose parts
 * are words ("well-being", "self-report") keep their hyphen.
 */
const SUFFIX_FRAGMENT =
  /^(?:tions?|sions?|ations?|itions?|ments?|ness|ity|ities|ive|ives|ively|ances?|ences?|enced|ency|encies|ancy|ancies|ated|ating|ical|ically|ous|ously|ably|ibly|ism|ized|izing|ised|ising|ial|ially|ular|ures?|ogy|ings?|ed|ly|ers?|est|ics?|al|ies|ipants?|ists?)$/;
const TEXT_TYPES = new Set<PaperBlock["type"]>(["paragraph", "heading", "footnote"]);
const HYPHENATED = /\b([A-Za-z]{2,})-([a-z]{2,})\b/g;

export function repairLineBreakHyphens(blocks: PaperBlock[]): PaperBlock[] {
  // Words written whole (hyphenated tokens are excluded by the boundary rules),
  // and how often each hyphenated form occurs.
  const vocabulary = new Map<string, number>();
  const hyphenated = new Map<string, number>();
  for (const b of blocks) {
    if (!TEXT_TYPES.has(b.type)) continue;
    const text = b.original ?? "";
    for (const w of text.matchAll(/(?<![-\w])[A-Za-z]{5,}(?![-\w])/g)) vocabulary.set(w[0].toLowerCase(), (vocabulary.get(w[0].toLowerCase()) ?? 0) + 1);
    for (const w of text.matchAll(HYPHENATED)) hyphenated.set(`${w[1]}${w[2]}`.toLowerCase(), (hyphenated.get(`${w[1]}${w[2]}`.toLowerCase()) ?? 0) + 1);
  }
  return blocks.map((b) => {
    if (b.type !== "paragraph" || !b.original || !b.original.includes("-")) return b;
    const repaired = b.original.replace(HYPHENATED, (whole, head: string, tail: string) => {
      const joined = `${head}${tail}`.toLowerCase();
      // A prefix compound (`pre-processing`, `multi-modal`, `over-sampling`) is spelled both ways, often within one
      // paper; the hyphen the line break kept is as likely the author's as not, so it stays.
      if (/^(?:anti|co|counter|cross|inter|intra|micro|macro|multi|non|over|post|pre|re|self|semi|sub|super|under)$/i.test(head)) return whole;
      // "co-occurrence" written with its hyphen as often as without is a real compound.
      if (head.length >= 2 && (vocabulary.get(joined) ?? 0) >= Math.max(1, hyphenated.get(joined) ?? 0)) return `${head}${tail}`;
      if (head.length >= 3 && SUFFIX_FRAGMENT.test(tail) && !vocabulary.has(tail)) return `${head}${tail}`;
      return whole;
    });
    return repaired === b.original ? b : { ...b, original: repaired };
  });
}
