import type { Database } from "sql.js";
import type { SqliteClient } from "./client";
import { normalizeIndexText } from "../../domain/search/normalizeSearchText";
import { singleCharWords } from "../../domain/search/singleCharWords";
import { isSingleCharTerm } from "../../domain/search/singleCharWords";
import { buildSearchQuery, scoreFields, variantNeedles, type SearchQuery } from "../../domain/search/searchQuery";
import { nativeSearchIndex, type NativeSearchGroup } from "./nativeSearchIndex";

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
  const words = singleCharWords([input.title, input.authors, input.original, input.translation, input.annotation].join("\n"));
  const fields = {
    title: normalizeIndexText(input.title),
    authors: normalizeIndexText(input.authors),
    original: normalizeIndexText(input.original),
    translation: normalizeIndexText(input.translation),
    annotation: normalizeIndexText(input.annotation),
  };
  const native = nativeSearchIndex();
  if (native) {
    native.put({ paperId, ...fields, words });
    return;
  }
  db.exec("DELETE FROM papers_fts WHERE paper_id = ?", [paperId]);
  db.exec("INSERT OR REPLACE INTO paper_words (paper_id, words) VALUES (?, ?)", [paperId, words]);
  db.exec(
    "INSERT INTO papers_fts (paper_id, title, authors, original, translation, annotation) VALUES (?, ?, ?, ?, ?, ?)",
    [paperId, fields.title, fields.authors, fields.original, fields.translation, fields.annotation]
  );
}

/**
 * Title / authors / annotation changed but not the body. Returns false when the
 * caller must rewrite the whole row (sql.js path).
 */
export function refreshPaperFtsMeta(
  paperId: string,
  input: { title: string; authors: string; annotation: string }
): boolean {
  const native = nativeSearchIndex();
  if (!native) return false;
  native.setMeta({
    paperId,
    title: normalizeIndexText(input.title),
    authors: normalizeIndexText(input.authors),
    annotation: normalizeIndexText(input.annotation),
  });
  return true;
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

/** The query as `search_index_search` takes it; needles as `scoreFields` uses them. */
export function nativeSearchGroups(query: SearchQuery): NativeSearchGroup[] {
  return query.groups.map((group) => ({
    variants: group.variants.map((variant) => {
      const single = isSingleCharTerm(variant.term);
      return {
        term: variant.term,
        weight: variant.weight,
        single,
        needles: single ? [variant.term] : variantNeedles(variant),
      };
    }),
  }));
}

/** Ranked ids (at most 50, no trashed papers) from the native index or sql.js. */
export async function searchPaperIds(db: SqliteClient, query: string | SearchQuery): Promise<string[]> {
  const native = nativeSearchIndex();
  if (!native) return searchPapersFts(db, query);
  const parsed = typeof query === "string" ? buildSearchQuery(query) : query;
  if (parsed.groups.length === 0) return [];
  const ranked = await native.search(nativeSearchGroups(parsed));
  const live = new Set(
    db.query<{ id: string }>("SELECT id FROM papers WHERE trashed_at IS NULL").map((row) => String(row.id))
  );
  return ranked.filter((id) => live.has(id)).slice(0, 50);
}
