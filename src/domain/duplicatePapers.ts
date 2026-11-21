import type { Paper } from "../types/paper";

/** Short or generic titles ("Introduction") would match unrelated papers. */
const MIN_TITLE_KEY_LENGTH = 16;

export function normalizeDoi(doi: string | null | undefined): string | null {
  const value = doi
    ?.trim()
    .toLowerCase()
    .replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:)/, "");
  return value || null;
}

export function titleKey(title: string | null | undefined): string | null {
  const key = (title ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
  return key.length >= MIN_TITLE_KEY_LENGTH ? key : null;
}

function keysOf(paper: Paper): string[] {
  const keys: string[] = [];
  const doi = normalizeDoi(paper.doi);
  if (doi) keys.push(`doi:${doi}`);
  const title = titleKey(paper.titleOriginal);
  if (title) keys.push(`title:${title}`);
  return keys;
}

/**
 * Active papers that share a DOI or a normalized original title with another one,
 * mapped to a group key so a list can keep each group together.
 */
export function findDuplicatePaperIds(papers: Paper[]): Map<string, string> {
  const byKey = new Map<string, string[]>();
  for (const paper of papers) {
    if (paper.trashedAt) continue;
    for (const key of keysOf(paper)) byKey.set(key, [...(byKey.get(key) ?? []), paper.id]);
  }
  const ids = new Map<string, string>();
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    // A paper in two groups (DOI and title) keeps the first group it joined.
    for (const id of group) if (!ids.has(id)) ids.set(id, ids.get(group[0]) ?? key);
  }
  return ids;
}

/** An existing active paper that looks like the same work as `paper` (not itself). */
export function findSimilarPaper(paper: Paper, papers: Paper[]): Paper | undefined {
  const keys = new Set(keysOf(paper));
  if (keys.size === 0) return undefined;
  return papers.find(
    (other) => other.id !== paper.id && !other.trashedAt && keysOf(other).some((key) => keys.has(key))
  );
}
