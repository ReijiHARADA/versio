import { useEffect, useState } from "react";
import type { Paper } from "../types/paper";
import { searchLibraryPapers } from "../domain/libraryFtsSearch";
import { filterPapersByLibraryQuery } from "../domain/librarySearch";

/**
 * Debounced library search: FTS + metadata, without loading paper bodies.
 */
export function useLibraryPaperSearch(papers: Paper[], query: string): Paper[] {
  const [results, setResults] = useState(() => filterPapersByLibraryQuery(papers, query));
  const empty = !query.trim();
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
      void searchLibraryPapers(papers, query).then((next) => {
        if (!cancelled) setResults(next);
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [empty, papers, query]);

  // Keep immediate metadata filter while FTS is in flight for empty→typed UX.
  if (empty) return papers;
  return results;
}
