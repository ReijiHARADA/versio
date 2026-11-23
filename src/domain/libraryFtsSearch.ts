import type { Paper } from "../types/paper";
import { filterPapersByLibraryQuery } from "./librarySearch";
import { buildSearchQuery, type SearchQuery } from "./search/searchQuery";
import { searchLibraryPaperIds } from "../services/database";

/**
 * Prefer FTS hits; always OR with metadata matches so short titles still work
 * when the FTS row is stale or empty.
 */
export async function searchLibraryPapers(
  papers: Paper[],
  query: string | SearchQuery
): Promise<Paper[]> {
  const parsed = typeof query === "string" ? buildSearchQuery(query) : query;
  if (parsed.groups.length === 0) return papers;

  const metaHits = filterPapersByLibraryQuery(papers, parsed);
  let ftsIds: string[] = [];
  try {
    ftsIds = await searchLibraryPaperIds(parsed);
  } catch (error) {
    console.warn("FTS library search failed; using metadata only:", error);
  }

  if (ftsIds.length === 0) return metaHits;

  const byId = new Map(papers.map((paper) => [paper.id, paper]));
  const ordered: Paper[] = [];
  const seen = new Set<string>();
  for (const id of ftsIds) {
    const paper = byId.get(id);
    if (paper && !seen.has(id)) {
      ordered.push(paper);
      seen.add(id);
    }
  }
  for (const paper of metaHits) {
    if (!seen.has(paper.id)) {
      ordered.push(paper);
      seen.add(paper.id);
    }
  }
  return ordered;
}
