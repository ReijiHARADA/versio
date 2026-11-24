import type { Paper } from "../types/paper";
import { normalizeIndexText } from "./search/normalizeSearchText";
import { buildSearchQuery, scoreFields, type ScoredField, type SearchQuery } from "./search/searchQuery";
import { singleCharWords } from "./search/singleCharWords";

export type LibrarySearchQuery = {
  query: string;
};

export type PaperSearchQuery = {
  paperId: string;
  query: string;
};

function paperFields(paper: Paper): ScoredField[] {
  const raw = [paper.titleOriginal, paper.titleTranslated, paper.sourceFileName, paper.publication, paper.authors.join(" ")]
    .filter(Boolean)
    .join(" ");
  return [
    { text: normalizeIndexText(raw), weight: 1 },
    { text: singleCharWords(raw), weight: 1, words: true },
  ];
}

export function matchesLibraryQuery(paper: Paper, query: string | SearchQuery): boolean {
  const parsed = typeof query === "string" ? buildSearchQuery(query) : query;
  if (parsed.groups.length === 0) return true;
  return scoreFields(paperFields(paper), parsed) > 0;
}

export function filterPapersByLibraryQuery(papers: Paper[], query: string | SearchQuery): Paper[] {
  const parsed = typeof query === "string" ? buildSearchQuery(query) : query;
  if (parsed.groups.length === 0) return papers;
  return papers.filter((paper) => matchesLibraryQuery(paper, parsed));
}
