const MARKERS = /[*†‡§¶#‖⁎∗✉☆★✝]+/g;

/** NFKC, lowercase, join hyphenated line breaks, collapse whitespace, trim edge punctuation. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "");
}

function foldDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}+/gu, "").normalize("NFKC");
}

/**
 * Comparable author key. English: "family + first initial" (handles "J. Smith",
 * "Smith, Jane", footnote markers). Japanese: the whole name without spaces.
 */
export function normalizeName(s: string, language: "en" | "ja"): string {
  const cleaned = foldDiacritics(s.normalize("NFKC"))
    .replace(MARKERS, "")
    .replace(/[0-9⁰¹²³⁴⁵⁶⁷⁸⁹,]*$/u, "")
    .replace(/(?<=\p{L})[0-9⁰¹²³⁴⁵⁶⁷⁸⁹]+/gu, "")
    .trim()
    .toLowerCase();
  if (language === "ja" || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(cleaned)) {
    return cleaned.replace(/[\s・,.]/g, "");
  }
  let given: string;
  let family: string;
  if (cleaned.includes(",")) {
    const [f, g = ""] = cleaned.split(",", 2);
    family = f.trim();
    given = g.trim();
  } else {
    const parts = cleaned.split(/\s+/).filter(Boolean);
    family = parts.pop() ?? "";
    given = parts.join(" ");
  }
  family = family.replace(/[^\p{L}'-]/gu, "");
  const initial = given.replace(/[^\p{L}]/gu, "").charAt(0);
  return initial ? `${family} ${initial}` : family;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** 1 - levenshtein / max(len), after normalizeText. */
export function similarity(a: string, b: string): number {
  const x = normalizeText(a);
  const y = normalizeText(b);
  const max = Math.max(x.length, y.length);
  if (max === 0) return 1;
  return 1 - levenshtein(x, y) / max;
}

export function tokenJaccard(a: string, b: string): number {
  const ta = new Set(normalizeText(a).split(/[\s,;]+/).filter(Boolean));
  const tb = new Set(normalizeText(b).split(/[\s,;]+/).filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}
