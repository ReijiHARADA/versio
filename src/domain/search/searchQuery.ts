import { normalizeSearchText } from "./normalizeSearchText";

/** How a variant relates to the typed term; the dictionary fills these in later. */
export type SearchRelation = "exact" | "variant" | "abbr" | "expansion" | "translation" | "synonym";

export type SearchVariant = {
  /** Normalized form (see `normalizeSearchText`). */
  term: string;
  /** 0–1; the typed term itself is 1. */
  weight: number;
  relation: SearchRelation;
};

/** Every group must match (AND); any variant inside a group may (OR). */
export type SearchQuery = { groups: SearchVariant[][] };

/** Returns extra variants for one normalized term. Empty until the synonym dictionary lands. */
export type SearchExpander = (term: string) => SearchVariant[];

export const MAX_VARIANTS_PER_TERM = 12;

const noExpansion: SearchExpander = () => [];

export function buildSearchQuery(query: string, expand: SearchExpander = noExpansion): SearchQuery {
  const groups: SearchVariant[][] = [];
  for (const raw of query.trim().split(/\s+/)) {
    const term = normalizeSearchText(raw);
    if (!term) continue;
    const variants: SearchVariant[] = [{ term, weight: 1, relation: "exact" }];
    const seen = new Set([term]);
    const extra = expand(term)
      .map((variant) => ({ ...variant, term: normalizeSearchText(variant.term) }))
      .sort((a, b) => b.weight - a.weight);
    for (const variant of extra) {
      if (variants.length >= MAX_VARIANTS_PER_TERM) break;
      if (!variant.term || seen.has(variant.term)) continue;
      seen.add(variant.term);
      variants.push(variant);
    }
    groups.push(variants);
  }
  return { groups };
}

/** A short Latin word (UI, AR, HCI) must match as a whole word, not inside BUILD or CHAIR. */
const SHORT_LATIN_WORD = /^[\p{Script=Latin}\p{N}]{1,3}$/u;

/**
 * Substrings to look for in index text (`normalizeIndexText`, padded with spaces).
 * Any one of them is a hit.
 */
export function variantNeedles(term: string): string[] {
  if (SHORT_LATIN_WORD.test(term)) return [` ${term} `, ` ${term}s `];
  return [term];
}

/** Metadata-side matcher; `haystack` must be index text. Returns 0 when a group misses. */
export function scoreIndexText(haystack: string, query: SearchQuery): number {
  let score = 0;
  for (const group of query.groups) {
    let best = 0;
    for (const variant of group) {
      if (variantNeedles(variant.term).some((needle) => haystack.includes(needle))) {
        best = Math.max(best, variant.weight);
      }
    }
    if (best === 0) return 0;
    score += best;
  }
  return score;
}
