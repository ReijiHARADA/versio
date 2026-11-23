import type { Paper } from "../types/paper";
import { normalizeIndexText, normalizeSearchText } from "./search/normalizeSearchText";
import { buildSearchQuery, scoreIndexText } from "./search/searchQuery";

export type LibrarySearchQuery = {
  query: string;
};

export type PaperSearchQuery = {
  paperId: string;
  query: string;
};

export function normalizeLibraryQuery(query: string): string {
  return normalizeSearchText(query);
}

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

export function matchesLibraryQuery(paper: Paper, query: string): boolean {
  const parsed = buildSearchQuery(query);
  if (parsed.groups.length === 0) return true;
  return scoreIndexText(paperIndexText(paper), parsed) > 0;
}

export function filterPapersByLibraryQuery(papers: Paper[], query: string): Paper[] {
  const needle = normalizeLibraryQuery(query);
  if (!needle) return papers;
  return papers.filter((paper) => matchesLibraryQuery(paper, query));
}
