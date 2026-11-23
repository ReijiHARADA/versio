import { normalizeSearchText } from "./normalizeSearchText";
import type { SearchVariant } from "./searchQuery";
import { ROLE, SynonymDictionary, entryWithNorm, type SynonymEntry, type SynonymLookup } from "./synonymDictionary";

const SHORT_FORM = /^[\p{Script=Latin}\p{N}-]{2,10}$/u;
const LATIN_ONLY = /^[\p{Script=Latin}\p{N}\s'-]+$/u;

/** Weight of a PLaMo translation of a term no dictionary knows. */
export const QUERY_TRANSLATION_WEIGHT = 0.7;

function entry(surface: string, role: number): SynonymEntry {
  return entryWithNorm([surface, 1, role, 1], normalizeSearchText(surface));
}

/**
 * Pairs the user's own papers define (`Human-Computer Interaction (HCI)`,
 * `認知負荷（cognitive load）`), as a dictionary: each pair is one lexeme.
 */
export function libraryTermsLookup(rows: ReadonlyArray<{ term: string; longForm: string }>): SynonymDictionary {
  return new SynonymDictionary({
    version: 1,
    sources: [
      { id: "library", name: "ライブラリの論文", version: "", license: "", url: "", synonymWeight: 0.75, crossWeight: 0.85 },
    ],
    concepts: rows.map(({ term, longForm }) => {
      const role = SHORT_FORM.test(term) && /\p{Lu}.*\p{Lu}|\p{Lu}{2}/u.test(term) ? ROLE.abbr : ROLE.translation;
      return [0, [entry(longForm, ROLE.base), entry(term, role)]];
    }),
  });
}

/** Translations of query terms (label by normalized term), used only where no dictionary knows the term. */
export function translationsLookup(translations: ReadonlyMap<string, string>): SynonymLookup {
  return {
    lookup(term) {
      const label = translations.get(term);
      if (!label) return null;
      const norm = normalizeSearchText(label);
      if (!norm || norm === term) return null;
      return [{ term: norm, label, weight: QUERY_TRANSLATION_WEIGHT, relation: "translation" }];
    },
  };
}

/** Union of several lookups (best weight per variant); unknown only when every lookup is. */
export function composeLookups(lookups: ReadonlyArray<SynonymLookup | null | undefined>): SynonymLookup {
  const present = lookups.filter((lookup): lookup is SynonymLookup => Boolean(lookup));
  return {
    lookup(term) {
      let known = false;
      const best = new Map<string, SearchVariant>();
      for (const lookup of present) {
        const variants = lookup.lookup(term);
        if (!variants) continue;
        known = true;
        for (const variant of variants) {
          const current = best.get(variant.term);
          if (!current || current.weight < variant.weight) best.set(variant.term, variant);
        }
      }
      return known ? [...best.values()].sort((a, b) => b.weight - a.weight) : null;
    },
  };
}

/** `fallback` answers only for terms `primary` does not know. */
export function withFallback(primary: SynonymLookup, fallback: SynonymLookup): SynonymLookup {
  return { lookup: (term) => primary.lookup(term) ?? fallback.lookup(term) };
}

/** Whether a typed term is worth asking PLaMo about (a word or short phrase). */
export function isTranslatableTerm(label: string): boolean {
  const trimmed = label.trim();
  if (trimmed.length < 2 || trimmed.length > 40) return false;
  return LATIN_ONLY.test(trimmed) ? trimmed.length >= 3 : true;
}
