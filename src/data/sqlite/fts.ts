import type { SqliteClient } from "./client";

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
    [paperId, input.title, input.authors, input.original, input.translation, input.annotation]
  );
}

/** Turn free-text into a safe FTS5 MATCH query (AND of quoted tokens). */
export function buildFtsMatchQuery(query: string): string | null {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/["'*^:]/g, "").trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `"${token}"`).join(" ");
}

export function searchPapersFts(db: SqliteClient, query: string): string[] {
  if (!query.trim()) return [];
  if (db.hasFts5) {
    const match = buildFtsMatchQuery(query);
    if (!match) return [];
    try {
      return db
        .query<{ paper_id: string }>(
          "SELECT paper_id FROM papers_fts WHERE papers_fts MATCH ? LIMIT 50",
          [match]
        )
        .map((row) => row.paper_id);
    } catch {
      // Malformed MATCH — fall through to LIKE.
    }
  }
  const like = `%${query.replace(/[%_]/g, "")}%`;
  return db
    .query<{ paper_id: string }>(
      `SELECT paper_id FROM papers_fts
       WHERE title LIKE ? OR authors LIKE ? OR original LIKE ? OR translation LIKE ? OR annotation LIKE ?
       LIMIT 50`,
      [like, like, like, like, like]
    )
    .map((row) => row.paper_id);
}
