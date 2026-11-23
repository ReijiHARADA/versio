import type { Paper } from "../types/paper";
import { normalizeIndexText } from "./search/normalizeSearchText";
import { buildSearchQuery, scoreIndexText, type SearchQuery } from "./search/searchQuery";

export type LibrarySearchQuery = {
  query: string;
};

export type PaperSearchQuery = {
  paperId: string;
  query: string;
};

function paperIndexText(paper: Paper): string {
  return normalizeIndexText(
    [
      paper.titleOriginal,
      paper.titleTranslated,
      paper.sourceFileName,
      paper.publication,
      paper.authors.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

export function matchesLibraryQuery(paper: Paper, query: string | SearchQuery): boolean {
  const parsed = typeof query === "string" ? buildSearchQuery(query) : query;
  if (parsed.groups.length === 0) return true;
  return scoreIndexText(paperIndexText(paper), parsed) > 0;
}

export function filterPapersByLibraryQuery(papers: Paper[], query: string | SearchQuery): Paper[] {
  const parsed = typeof query === "string" ? buildSearchQuery(query) : query;
  if (parsed.groups.length === 0) return papers;
  return papers.filter((paper) => matchesLibraryQuery(paper, parsed));
}
