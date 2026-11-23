import { useEffect, useMemo, useState } from "react";
import type { Paper } from "../types/paper";
import { searchLibraryPapers } from "../domain/libraryFtsSearch";
import { filterPapersByLibraryQuery } from "../domain/librarySearch";
import { buildSearchQuery, type SearchQuery } from "../domain/search/searchQuery";
import type { SynonymDictionary } from "../domain/search/synonymDictionary";
import { loadSynonymDictionary } from "../services/search/synonymService";
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

/**
 * The library query as searched: typed terms plus the dictionary variants that
 * are on (the synonyms setting and per-search choices from the search popover).
 */
export function useLibrarySearchQuery(query: string): SearchQuery {
  const synonymsOn = useAppStore((state) => state.displaySettings.searchSynonyms !== false);
  const overrides = useProjectStore((state) => state.searchOverrides);
  const dictionary = useSynonymDictionary(synonymsOn && query.trim() !== "");
  return useMemo(
    () => buildSearchQuery(query, { dictionary, overrides: new Map(Object.entries(overrides)) }),
    [query, dictionary, overrides]
  );
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
