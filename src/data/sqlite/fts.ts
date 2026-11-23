import type { SqliteClient } from "./client";
import { normalizeIndexText } from "../../domain/search/normalizeSearchText";
import {
  buildSearchQuery,
  variantNeedles,
  type SearchExpander,
  type SearchQuery,
} from "../../domain/search/searchQuery";

/**
 * `papers_fts` is a search-only cache. Every column holds `normalizeIndexText`
 * output, never display text.
 */
export function rebuildPaperFts(
  db: SqliteClient,
  paperId: string,
  input: {
    title: string;
    authors: string;
    original: string;
    translation: string;
    annotation: string;
  }
): void {
  db.exec("DELETE FROM papers_fts WHERE paper_id = ?", [paperId]);
  db.exec(
    "INSERT INTO papers_fts (paper_id, title, authors, original, translation, annotation) VALUES (?, ?, ?, ?, ?, ?)",
    [
      paperId,
      normalizeIndexText(input.title),
      normalizeIndexText(input.authors),
      normalizeIndexText(input.original),
      normalizeIndexText(input.translation),
      normalizeIndexText(input.annotation),
    ]
  );
}

/** A hit in the title outranks one in the body. */
const FIELD_WEIGHTS = [
  ["title", 4],
  ["authors", 3],
  ["annotation", 2],
  ["original", 1],
  ["translation", 1],
] as const;

/** Same `?` order for the WHERE and the score, so one params list serves both. */
function groupSql(group: SearchQuery["groups"][number]): { where: string; score: string; params: string[] } {
  const hits: string[] = [];
  const terms: string[] = [];
  const params: string[] = [];
  for (const variant of group) {
    for (const needle of variantNeedles(variant.term)) {
      for (const [field, fieldWeight] of FIELD_WEIGHTS) {
        hits.push(`f.${field} LIKE ?`);
        terms.push(`(f.${field} LIKE ?) * ${fieldWeight * variant.weight}`);
        params.push(`%${needle}%`);
      }
    }
  }
  return { where: `(${hits.join(" OR ")})`, score: `max(0, ${terms.join(", ")})`, params };
}

/**
 * Ranked paper ids for a library query. Runs on `LIKE` over normalized text on
 * both the FTS5 table and the plain fallback table: the shipped sql.js has no
 * FTS5, and substring matching is what Japanese text without spaces needs.
 */
export function searchPapersFts(
  db: SqliteClient,
  query: string,
  expand?: SearchExpander
): string[] {
  const parsed = buildSearchQuery(query, expand);
  if (parsed.groups.length === 0) return [];
  const parts = parsed.groups.map(groupSql);
  const sql = `SELECT f.paper_id AS paper_id, (${parts.map((part) => part.score).join(" + ")}) AS score
    FROM papers_fts f JOIN papers p ON p.id = f.paper_id
    WHERE p.trashed_at IS NULL AND ${parts.map((part) => part.where).join(" AND ")}
    ORDER BY score DESC
    LIMIT 50`;
  const params = [...parts.flatMap((part) => part.params), ...parts.flatMap((part) => part.params)];
  return db.query<{ paper_id: string }>(sql, params).map((row) => String(row.paper_id));
}
