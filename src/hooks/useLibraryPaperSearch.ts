import { useEffect, useState } from "react";
import type { Paper } from "../types/paper";
import { searchLibraryPapers } from "../domain/libraryFtsSearch";
import { filterPapersByLibraryQuery } from "../domain/librarySearch";

/**
 * Debounced library search: FTS + metadata, without loading paper bodies.
 */
export function useLibraryPaperSearch(papers: Paper[], query: string): Paper[] {
  const [results, setResults] = useState(() => filterPapersByLibraryQuery(papers, query));

  useEffect(() => {
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
  }, [papers, query]);

  // Keep immediate metadata filter while FTS is in flight for empty→typed UX.
  if (!query.trim()) return papers;
  return results;
}
