import { useEffect, useMemo, useRef, useState } from "react";
import type { Paper } from "../types/paper";
import { searchLibraryPapers } from "../domain/libraryFtsSearch";
import { filterPapersByLibraryQuery } from "../domain/librarySearch";
import { buildSearchQuery, type SearchQuery } from "../domain/search/searchQuery";
import type { SynonymDictionary, SynonymLookup } from "../domain/search/synonymDictionary";
import {
  composeLookups,
  isTranslatableTerm,
  libraryTermsLookup,
  translationsLookup,
  withFallback,
} from "../domain/search/lookups";
import { listLibrarySearchTerms } from "../services/database";
import { translateQueryTerm } from "../services/search/queryTranslation";
import { loadSynonymDictionary } from "../services/search/synonymService";
import { useLibraryCache } from "../stores/libraryCache";
import { useAppStore } from "../stores/appStore";
import { useProjectStore } from "../stores/projectStore";

/** The bundled dictionary once loaded (starts loading when a search begins). */
function useSynonymDictionary(enabled: boolean): SynonymDictionary | null {
  const [dictionary, setDictionary] = useState<SynonymDictionary | null>(null);
  useEffect(() => {
    if (!enabled || dictionary) return;
    let cancelled = false;
    void loadSynonymDictionary().then((loaded) => {
      if (!cancelled) setDictionary(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, dictionary]);
  return enabled ? dictionary : null;
}

/** Terms the library's papers define, reloaded when a search starts or papers are added. */
function useLibraryTerms(enabled: boolean): SynonymLookup | null {
  const paperCount = useLibraryCache((state) => state.papers.length);
  const [lookup, setLookup] = useState<SynonymLookup | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void listLibrarySearchTerms()
      .then((rows) => {
        if (!cancelled) setLookup(libraryTermsLookup(rows));
      })
      .catch((error: unknown) => console.warn("Library search terms unavailable:", error));
    return () => {
      cancelled = true;
    };
  }, [enabled, paperCount]);
  return enabled ? lookup : null;
}

/** Wait this long after typing stops before asking PLaMo. */
const TRANSLATE_DELAY_MS = 500;

/**
 * The library query as searched: typed terms plus the dictionary variants that
 * are on (the synonyms setting and per-search choices from the search popover).
 * Variants come from the bundled dictionary and the library's own papers; a
 * term neither knows gets a PLaMo translation when the sidecar is running.
 */
export function useLibrarySearchQuery(query: string): SearchQuery {
  const synonymsOn = useAppStore((state) => state.displaySettings.searchSynonyms !== false);
  const overrides = useProjectStore((state) => state.searchOverrides);
  const active = synonymsOn && query.trim() !== "";
  const dictionary = useSynonymDictionary(active);
  const libraryTerms = useLibraryTerms(active);
  const [translations, setTranslations] = useState<ReadonlyMap<string, string>>(() => new Map());
  const asked = useRef(new Set<string>());

  const searchQuery = useMemo(() => {
    if (!active) return buildSearchQuery(query);
    const lookup = withFallback(composeLookups([dictionary, libraryTerms]), translationsLookup(translations));
    return buildSearchQuery(query, { dictionary: lookup, overrides: new Map(Object.entries(overrides)) });
  }, [active, query, dictionary, libraryTerms, translations, overrides]);

  useEffect(() => {
    // Ask only once the dictionary is in, so known terms never reach PLaMo.
    if (!active || !dictionary) return;
    const unknown = searchQuery.groups.filter(
      (group) =>
        group.suggestions.length === 0 &&
        !asked.current.has(group.term) &&
        isTranslatableTerm(group.variants[0].label)
    );
    if (unknown.length === 0) return;
    const handle = window.setTimeout(() => {
      for (const group of unknown) {
        asked.current.add(group.term);
        void translateQueryTerm(group.variants[0].label).then((translation) => {
          if (!translation) {
            asked.current.delete(group.term);
            return;
          }
          // Not gated on this effect: the first answer re-runs it, and later ones must still land.
          setTranslations((current) => new Map(current).set(group.term, translation));
        });
      }
    }, TRANSLATE_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [active, dictionary, searchQuery]);

  return searchQuery;
}

/**
 * Debounced library search: FTS + metadata, without loading paper bodies.
 */
export function useLibraryPaperSearch(papers: Paper[], query: string): Paper[] {
  const searchQuery = useLibrarySearchQuery(query);
  const [results, setResults] = useState(() => filterPapersByLibraryQuery(papers, searchQuery));
  const empty = searchQuery.groups.length === 0;
  const [wasEmpty, setWasEmpty] = useState(empty);
  if (empty !== wasEmpty) {
    setWasEmpty(empty);
    // Clearing the query resets to the full list, so retyping narrows from it as before.
    if (empty) setResults(papers);
  }

  useEffect(() => {
    // An empty query shows `papers` as-is; don't re-run search on every paper update.
    if (empty) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void searchLibraryPapers(papers, searchQuery).then((next) => {
        if (!cancelled) setResults(next);
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [empty, papers, searchQuery]);

  // Keep immediate metadata filter while FTS is in flight for empty→typed UX.
  if (empty) return papers;
  return results;
}
