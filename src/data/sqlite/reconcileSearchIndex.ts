import type { FileSystem } from "../fs/types";
import type { SqliteClient } from "./client";
import { nativeSearchIndex, type NativePaperText } from "./nativeSearchIndex";
import { getAllPaperIndexes, getTrashedPaperIndexes, rebuildPaperSearchIndex } from "../repositories/paperRepository";

const COPY_BATCH = 25;

export type SearchIndexReconcileResult = { copied: number; rebuilt: number; removed: number; droppedSqlJs: boolean };

/**
 * Startup alignment of the native search index with library.sqlite (desktop app only):
 * - moves rows still in sql.js `papers_fts` / `paper_words` (libraries from before
 *   the native index), then deletes them there and VACUUMs so library.sqlite shrinks;
 * - re-indexes papers the native index is missing (lost write, deleted file) from
 *   their Paper Package Markdown;
 * - removes native rows whose paper is gone.
 */
export async function reconcileNativeSearchIndex(
  fs: FileSystem,
  db: SqliteClient
): Promise<SearchIndexReconcileResult | null> {
  const native = nativeSearchIndex();
  if (!native) return null;
  const papers = [...getAllPaperIndexes(db), ...getTrashedPaperIndexes(db)];
  const known = new Set(papers.map((paper) => paper.id));
  const indexed = new Set(await native.ids());
  const result: SearchIndexReconcileResult = { copied: 0, rebuilt: 0, removed: 0, droppedSqlJs: false };

  const legacyRows = Number(db.get("SELECT count(*) AS n FROM papers_fts")?.n ?? 0);
  if (legacyRows > 0) {
    const rows = db.query(
      `SELECT f.paper_id, f.title, f.authors, f.annotation, f.original, f.translation, w.words
       FROM papers_fts f LEFT JOIN paper_words w ON w.paper_id = f.paper_id`
    );
    let batch: NativePaperText[] = [];
    for (const row of rows) {
      const paperId = String(row.paper_id);
      if (!known.has(paperId) || indexed.has(paperId)) continue;
      batch.push({
        paperId,
        title: String(row.title ?? ""),
        authors: String(row.authors ?? ""),
        annotation: String(row.annotation ?? ""),
        original: String(row.original ?? ""),
        translation: String(row.translation ?? ""),
        words: String(row.words ?? ""),
      });
      if (batch.length >= COPY_BATCH) {
        await native.putMany(batch);
        result.copied += batch.length;
        batch.forEach((doc) => indexed.add(doc.paperId));
        batch = [];
      }
    }
    if (batch.length) {
      await native.putMany(batch);
      result.copied += batch.length;
      batch.forEach((doc) => indexed.add(doc.paperId));
    }
  }

  for (const paper of papers) {
    if (indexed.has(paper.id)) continue;
    try {
      const original = (await fs.readText(`papers/${paper.id}/original.md`)) ?? "";
      const translation = (await fs.readText(`papers/${paper.id}/ja.md`)) ?? "";
      rebuildPaperSearchIndex(db, paper, original, translation);
      result.rebuilt += 1;
    } catch (error) {
      console.warn("Failed to re-index paper for search:", paper.id, error);
    }
  }

  for (const id of indexed) {
    if (known.has(id)) continue;
    native.delete(id);
    result.removed += 1;
  }
  await native.flush();

  const legacyWords = Number(db.get("SELECT count(*) AS n FROM paper_words")?.n ?? 0);
  if (legacyRows > 0 || legacyWords > 0) {
    // Every row was written natively above (putMany rejects on failure), so the
    // sql.js copies can go; a paper that fails later is re-indexed from its package.
    db.exec("DELETE FROM papers_fts");
    db.exec("DELETE FROM paper_words");
    db.exec("VACUUM");
    await db.persist();
    result.droppedSqlJs = true;
  }
  return result;
}
