import type { Database } from "sql.js";
import type { SqliteClient } from "./client";
import { normalizeIndexText } from "../../domain/search/normalizeSearchText";
import { singleCharWords } from "../../domain/search/singleCharWords";
import { buildSearchQuery, scoreFields, type SearchQuery } from "../../domain/search/searchQuery";

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
  db.exec("INSERT OR REPLACE INTO paper_words (paper_id, words) VALUES (?, ?)", [
    paperId,
    singleCharWords([input.title, input.authors, input.original, input.translation, input.annotation].join("\n")),
  ]);
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
const FIELD_WEIGHTS = { title: 4, authors: 3, annotation: 2, original: 1, translation: 1 } as const;

const SCORE_FUNCTION = "versio_search_score";

/**
 * Registers the scoring function `searchPapersFts` uses. Scoring in one call per
 * row reads each long body once; one SQL `LIKE` / `instr` per variant and field
 * re-read the body for every variant and took ~0.6–0.9 s for a 13-variant query
 * over 300 papers (~40 MB).
 */
export function registerSearchFunctions(db: Database): void {
  let cachedJson = "";
  let cached: SearchQuery = { groups: [] };
  db.create_function(
    SCORE_FUNCTION,
    (
      title: unknown,
      authors: unknown,
      annotation: unknown,
      original: unknown,
      translation: unknown,
      words: unknown,
      queryJson: unknown
    ) => {
      if (queryJson !== cachedJson) {
        cachedJson = String(queryJson);
        cached = JSON.parse(cachedJson) as SearchQuery;
      }
      return scoreFields(
        [
          { text: String(title ?? ""), weight: FIELD_WEIGHTS.title },
          { text: String(authors ?? ""), weight: FIELD_WEIGHTS.authors },
          { text: String(annotation ?? ""), weight: FIELD_WEIGHTS.annotation },
          { text: String(original ?? ""), weight: FIELD_WEIGHTS.original },
          { text: String(translation ?? ""), weight: FIELD_WEIGHTS.translation },
          { text: String(words ?? ""), weight: 1, words: true },
        ],
        cached
      );
    }
  );
}

/** Only what scoring needs, so the per-row JSON stays small. */
function scoringJson(query: SearchQuery): string {
  return JSON.stringify({
    groups: query.groups.map((group) => ({
      variants: group.variants.map(({ term, weight, relation }) => ({ term, weight, relation })),
    })),
  });
}

/**
 * Ranked paper ids for a library query: substring search over normalized text
 * (see `scoreFields`), on both the FTS5 table and the plain fallback table. The
 * shipped sql.js has no FTS5, and substring matching is what Japanese text
 * without spaces needs.
 */
export function searchPapersFts(db: SqliteClient, query: string | SearchQuery): string[] {
  const parsed = typeof query === "string" ? buildSearchQuery(query) : query;
  if (parsed.groups.length === 0) return [];
  // `LIMIT -1` keeps SQLite from flattening the subquery and scoring every row twice.
  const sql = `SELECT paper_id FROM (
      SELECT f.paper_id AS paper_id,
        ${SCORE_FUNCTION}(f.title, f.authors, f.annotation, f.original, f.translation, w.words, ?) AS score
      FROM papers_fts f JOIN papers p ON p.id = f.paper_id
      LEFT JOIN paper_words w ON w.paper_id = f.paper_id
      WHERE p.trashed_at IS NULL
      LIMIT -1
    )
    WHERE score > 0
    ORDER BY score DESC
    LIMIT 50`;
  return db.query<{ paper_id: string }>(sql, [scoringJson(parsed)]).map((row) => String(row.paper_id));
}
