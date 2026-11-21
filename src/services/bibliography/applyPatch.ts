import type { Paper, PaperAuthor, PaperBibliography } from "../../types/paper";

export type PaperMetadataPatch = {
  titleOriginal?: string | null;
  authors?: string[];
  publication?: string | null;
  year?: number | null;
  doi?: string | null;
  bibliography?: PaperBibliography;
};

/**
 * Keeps existing author ids/affiliations by position so annotations and
 * affiliation links survive a name fix; only extra authors get new ids.
 */
function mergeAuthors(previous: PaperAuthor[] | undefined, names: string[]): PaperAuthor[] {
  const used = new Set((previous ?? []).map((author) => author.id));
  let next = 1;
  const freshId = () => {
    while (used.has(`author-${next}`)) next += 1;
    used.add(`author-${next}`);
    return `author-${next}`;
  };
  return names.map((name, index) => {
    const existing = previous?.[index];
    return existing ? { ...existing, name } : { id: freshId(), name, affiliationIds: [] };
  });
}

export function applyMetadataPatch(paper: Paper, patch: PaperMetadataPatch, now: string): Paper {
  const next: Paper = { ...paper, updatedAt: now };
  if (patch.titleOriginal !== undefined) next.titleOriginal = patch.titleOriginal;
  if (patch.publication !== undefined) next.publication = patch.publication;
  if (patch.year !== undefined) next.year = patch.year;
  if (patch.doi !== undefined) next.doi = patch.doi;
  if (patch.bibliography !== undefined) next.bibliography = patch.bibliography;
  if (patch.authors !== undefined) {
    const names = patch.authors.map((name) => name.trim()).filter(Boolean);
    next.authors = names;
    next.authorsStructured = mergeAuthors(paper.authorsStructured, names);
  }
  return next;
}
