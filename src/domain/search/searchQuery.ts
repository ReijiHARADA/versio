import { normalizeSearchText } from "./normalizeSearchText";
import { isSingleCharTerm } from "./singleCharWords";
import type { SynonymLookup } from "./synonymDictionary";

/** How a variant relates to the typed term; the dictionary fills these in later. */
export type SearchRelation = "exact" | "variant" | "abbr" | "expansion" | "translation" | "synonym";

export type SearchVariant = {
  /** Normalized form (see `normalizeSearchText`). */
  term: string;
  /** How to show it (the dictionary or typed spelling). */
  label: string;
  /** 0–1; the typed term itself is 1. */
  weight: number;
  relation: SearchRelation;
};

/**
 * One typed term (or a phrase the dictionary knows). `variants` are searched;
 * `variants[0]` is the term itself. `suggestions` are every dictionary variant
 * with whether it is on, for the UI.
 */
export type SearchGroup = {
  term: string;
  variants: SearchVariant[];
  suggestions: Array<SearchVariant & { active: boolean }>;
};

/** Every group must match (AND); any variant inside a group may (OR). */
export type SearchQuery = { groups: SearchGroup[] };

export type SearchOptions = {
  dictionary?: SynonymLookup | null;
  /** Per-variant choices by normalized term; unset variants follow `DEFAULT_ON_WEIGHT`. */
  overrides?: ReadonlyMap<string, boolean>;
};

/** Variants at least this strong are on unless the user turns them off; weaker ones are offered. */
export const DEFAULT_ON_WEIGHT = 0.65;
/** How many dictionary variants the UI offers per term. */
const MAX_SUGGESTIONS = 24;

export const MAX_VARIANTS_PER_TERM = 12;
/** Longest run of typed words looked up as one dictionary phrase (`cognitive load`). */
const MAX_PHRASE_WORDS = 4;

function group(
  term: string,
  label: string,
  extra: SearchVariant[],
  overrides: ReadonlyMap<string, boolean> | undefined
): SearchGroup {
  const variants: SearchVariant[] = [{ term, label, weight: 1, relation: "exact" }];
  const suggestions: SearchGroup["suggestions"] = [];
  const seen = new Set([term]);
  for (const variant of [...extra].sort((a, b) => b.weight - a.weight)) {
    if (!variant.term || seen.has(variant.term)) continue;
    seen.add(variant.term);
    const active =
      (overrides?.get(variant.term) ?? variant.weight >= DEFAULT_ON_WEIGHT) &&
      variants.length < MAX_VARIANTS_PER_TERM;
    if (active) variants.push(variant);
    if (suggestions.length < MAX_SUGGESTIONS) suggestions.push({ ...variant, active });
  }
  return { term, variants, suggestions };
}

export function buildSearchQuery(query: string, options: SearchOptions = {}): SearchQuery {
  const { dictionary, overrides } = options;
  const words = query.trim().split(/\s+/).filter((word) => normalizeSearchText(word));
  const groups: SearchGroup[] = [];
  let i = 0;
  while (i < words.length) {
    let matched = false;
    if (dictionary) {
      for (let size = Math.min(MAX_PHRASE_WORDS, words.length - i); size >= 2; size -= 1) {
        const label = words.slice(i, i + size).join(" ");
        const phrase = normalizeSearchText(label);
        const variants = dictionary.lookup(phrase);
        if (variants) {
          groups.push(group(phrase, label, variants, overrides));
          i += size;
          matched = true;
          break;
        }
      }
    }
    if (matched) continue;
    const term = normalizeSearchText(words[i]);
    groups.push(group(term, words[i], dictionary?.lookup(term) ?? [], overrides));
    i += 1;
  }
  return { groups };
}

/** A short Latin word (UI, AR, HCI) must match as a whole word, not inside BUILD or CHAIR. */
const SHORT_LATIN_WORD = /^[\p{Script=Latin}\p{N}]{1,3}$/u;

const LATIN_START = /^[\p{Script=Latin}\p{N}]/u;

/**
 * Substrings to look for in index text (`normalizeIndexText`, padded with spaces).
 * Any one of them is a hit. What the user typed may match inside a word; an
 * English word the dictionary added must start a word, so `load` does not hit
 * `download` (inflections like `loads` / `loading` still do).
 */
export function variantNeedles(variant: Pick<SearchVariant, "term" | "relation">): string[] {
  const { term } = variant;
  if (SHORT_LATIN_WORD.test(term)) return [` ${term} `, ` ${term}s `];
  if (variant.relation !== "exact" && LATIN_START.test(term)) return [` ${term}`];
  return [term];
}

/**
 * Index text (`normalizeIndexText`) of one field and how much a hit in it
 * counts. A `words` field holds `singleCharWords` output instead: where a
 * one-character Japanese term is found as a word.
 */
export type ScoredField = { text: string; weight: number; words?: boolean };

/**
 * A one-character Japanese term found only inside longer words (目 in 目鼻, 数 in
 * 関数) still matches, but scaled so it ranks below every paper that uses it as a
 * word: the strongest such hit (title, 4 × 0.2) stays under a word hit (1).
 */
export const INSIDE_WORD_FACTOR = 0.2;

/**
 * Sum over groups of the best field weight × variant weight that hits; 0 when
 * any group misses (every typed term must match somewhere).
 */
export function scoreFields(fields: readonly ScoredField[], query: SearchQuery): number {
  let score = 0;
  for (const group of query.groups) {
    let best = 0;
    for (const variant of group.variants) {
      const single = isSingleCharTerm(variant.term);
      const needles = single ? [variant.term] : variantNeedles(variant);
      for (const field of fields) {
        if (field.words && !single) continue;
        let value = field.weight * variant.weight;
        if (single && !field.words) value *= INSIDE_WORD_FACTOR;
        const fieldNeedles = field.words ? [` ${variant.term} `] : needles;
        if (value > best && field.text && fieldNeedles.some((needle) => field.text.includes(needle))) best = value;
      }
    }
    if (best === 0) return 0;
    score += best;
  }
  return score;
}

/** Metadata-side matcher; `haystack` must be index text. Returns 0 when a group misses. */
export function scoreIndexText(haystack: string, query: SearchQuery): number {
  return scoreFields([{ text: haystack, weight: 1 }], query);
}
