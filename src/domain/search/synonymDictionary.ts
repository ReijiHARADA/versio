import type { SearchRelation, SearchVariant } from "./searchQuery";

/**
 * Role of a form inside its lexeme (a lexeme is one word with its spellings,
 * translations and short forms; a concept groups lexemes that mean the same).
 */
export const ROLE = {
  /** Representative form. */
  base: 0,
  /** Other spelling of the same word (インタフェース / インターフェイス). */
  spelling: 1,
  /** Original-language spelling or direct translation (usability). */
  translation: 2,
  /** Abbreviation or short name (HCI, インフル). */
  abbr: 3,
  /** Alias or popular name. */
  alias: 4,
  /** Former name. */
  former: 5,
  /** Common misuse or misspelling. */
  misuse: 6,
} as const;

export type SynonymSource = {
  id: string;
  name: string;
  version: string;
  license: string;
  url: string;
  /** Weight for two different lexemes in the same language. */
  synonymWeight: number;
  /** Weight for two different lexemes in different languages. */
  crossWeight: number;
};

/**
 * [surface, lexeme number inside the concept, ROLE, 1 = may trigger expansion / 0 = target only,
 *  normalized form when it differs from `surface`]
 */
export type SynonymEntry = [string, number, number, number] | [string, number, number, number, string];

/** [source index, entries] */
export type SynonymConcept = [number, SynonymEntry[]];

export type SynonymDictionaryData = {
  version: number;
  sources: SynonymSource[];
  concepts: SynonymConcept[];
};

export type SynonymLookup = {
  /** Variants for a normalized term, or null when the dictionary does not know it. */
  lookup(term: string): SearchVariant[] | null;
};

const LATIN_ONLY = /^[\p{Script=Latin}\p{N}\s-]+$/u;

function language(surface: string): "latin" | "other" {
  return LATIN_ONLY.test(surface) ? "latin" : "other";
}

/**
 * Two-letter abbreviations (AR, MR, SD) match too much unrelated text (`Mr.`,
 * autoregressive) to be added to a query that did not use them.
 */
const MIN_ABBR_TARGET_LENGTH = 3;

function relate(
  source: SynonymSource,
  from: SynonymEntry,
  to: SynonymEntry,
  toNorm: string
): { relation: SearchRelation; weight: number } | null {
  const crossLanguage = language(from[0]) !== language(to[0]);
  if (from[1] !== to[1]) {
    return crossLanguage
      ? { relation: "translation", weight: source.crossWeight }
      : { relation: "synonym", weight: source.synonymWeight };
  }
  if (to[2] === ROLE.abbr) {
    return toNorm.length < MIN_ABBR_TARGET_LENGTH ? null : { relation: "abbr", weight: 0.9 };
  }
  if (from[2] === ROLE.abbr) return { relation: "expansion", weight: 0.9 };
  if (crossLanguage || to[2] === ROLE.translation) return { relation: "translation", weight: 0.9 };
  if (to[2] === ROLE.alias || to[2] === ROLE.former) return { relation: "synonym", weight: 0.85 };
  if (to[2] === ROLE.misuse) return { relation: "variant", weight: 0.8 };
  return { relation: "variant", weight: 1 };
}

type Posting = { concept: number; entry: number };

/** Normalized form of an entry as the build writes it. */
export function entryWithNorm(entry: SynonymEntry, norm: string): SynonymEntry {
  const [surface, lexeme, role, trigger] = entry;
  return norm === surface ? [surface, lexeme, role, trigger] : [surface, lexeme, role, trigger, norm];
}

export class SynonymDictionary implements SynonymLookup {
  private readonly index = new Map<string, Posting[]>();
  private readonly norms: string[][];
  private readonly data: SynonymDictionaryData;

  constructor(data: SynonymDictionaryData) {
    this.data = data;
    // The build stores the normalized form whenever it differs, so loading does no normalization.
    this.norms = data.concepts.map(([, entries]) => entries.map((entry) => entry[4] ?? entry[0]));
    data.concepts.forEach(([, entries], concept) => {
      entries.forEach((entry, index) => {
        if (entry[3] !== 1) return;
        const norm = this.norms[concept][index];
        if (!norm) return;
        const postings = this.index.get(norm);
        if (postings) postings.push({ concept, entry: index });
        else this.index.set(norm, [{ concept, entry: index }]);
      });
    });
  }

  get sources(): SynonymSource[] {
    return this.data.sources;
  }

  has(term: string): boolean {
    return this.index.has(term);
  }

  lookup(term: string): SearchVariant[] | null {
    const postings = this.index.get(term);
    if (!postings) return null;
    const best = new Map<string, SearchVariant>();
    for (const { concept, entry } of postings) {
      const [sourceIndex, entries] = this.data.concepts[concept];
      const source = this.data.sources[sourceIndex];
      const from = entries[entry];
      entries.forEach((to, index) => {
        const norm = this.norms[concept][index];
        if (!norm || norm === term) return;
        const related = relate(source, from, to, norm);
        if (!related) return;
        const { relation, weight } = related;
        const current = best.get(norm);
        if (!current || current.weight < weight) best.set(norm, { term: norm, label: to[0], weight, relation });
      });
    }
    return [...best.values()].sort((a, b) => b.weight - a.weight);
  }
}
