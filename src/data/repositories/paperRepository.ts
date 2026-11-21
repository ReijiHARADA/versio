import type { Paper, PaperReadStatus } from "../../types/paper";

const READ_STATUSES = new Set<string>(["unread", "reading", "read"]);
import { listAnnotationsByPaper } from "./annotationRepository";
import { rebuildPaperFts } from "../sqlite/fts";
import type { SqliteClient } from "../sqlite/client";
import { computeNeedsTranslationResume } from "../../services/import/resumeFlag";

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToPaper(row: Record<string, unknown>): Paper {
  const processingStatus = String(row.processing_status) as Paper["processingStatus"];
  const resumeRaw = row.needs_translation_resume;
  const needsTranslationResume =
    resumeRaw == null
      ? computeNeedsTranslationResume(processingStatus)
      : Number(resumeRaw) === 1;
  return {
    id: String(row.id),
    sourceFilePath: String(row.source_file_name ?? ""),
    sourceFileName: row.source_file_name ? String(row.source_file_name) : undefined,
    sourceStoredPath: row.source_stored_path ? String(row.source_stored_path) : null,
    sourceFileHash: String(row.source_file_hash),
    titleOriginal: row.title_original == null ? null : String(row.title_original),
    titleTranslated: row.title_translated == null ? null : String(row.title_translated),
    authors: parseJson<string[]>(row.authors_json, []),
    publication: row.publication == null ? null : String(row.publication),
    year: row.year == null ? null : Number(row.year),
    pageCount: Number(row.page_count ?? 0),
    processingStatus,
    needsTranslationResume,
    lastReadBlockId: row.last_read_block_id == null ? null : String(row.last_read_block_id),
    lastReadOffset: row.last_read_offset == null ? null : Number(row.last_read_offset),
    favorite: Number(row.favorite ?? 0) === 1,
    readStatus: READ_STATUSES.has(String(row.read_status))
      ? (String(row.read_status) as PaperReadStatus)
      : "unread",
    tags: parseJson<string[]>(row.tags_json, []),
    doi: row.doi == null ? null : String(row.doi),
    lastOpenedAt: row.last_opened_at ? String(row.last_opened_at) : undefined,
    packageRevision: Number(row.package_revision ?? 0),
    trashedAt: row.trashed_at == null ? null : String(row.trashed_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function doiParam(doi: string | null | undefined): string | null {
  if (doi === undefined) return null;
  return doi?.trim().toLowerCase() ?? "";
}

export function upsertPaperIndex(db: SqliteClient, paper: Paper): void {
  const needsResume = computeNeedsTranslationResume(
    paper.processingStatus,
    paper.needsTranslationResume
  );
  db.exec(
    `INSERT INTO papers (
      id, source_file_hash, title_original, title_translated, authors_json,
      publication, year, page_count, processing_status, favorite, last_opened_at,
      last_read_block_id, last_read_offset, source_file_name, source_stored_path,
      package_revision, needs_translation_resume, trashed_at, created_at, updated_at,
      read_status, tags_json, doi
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'unread'), COALESCE(?, '[]'), NULLIF(?, ''))
    ON CONFLICT(id) DO UPDATE SET
      source_file_hash=excluded.source_file_hash,
      title_original=excluded.title_original,
      title_translated=excluded.title_translated,
      authors_json=excluded.authors_json,
      publication=excluded.publication,
      year=excluded.year,
      page_count=excluded.page_count,
      processing_status=excluded.processing_status,
      favorite=excluded.favorite,
      last_opened_at=excluded.last_opened_at,
      last_read_block_id=excluded.last_read_block_id,
      last_read_offset=excluded.last_read_offset,
      source_file_name=excluded.source_file_name,
      source_stored_path=excluded.source_stored_path,
      package_revision=excluded.package_revision,
      needs_translation_resume=excluded.needs_translation_resume,
      trashed_at=excluded.trashed_at,
      updated_at=excluded.updated_at,
      -- Papers rebuilt from a package carry no library state; keep the stored one.
      read_status=COALESCE(?, papers.read_status),
      tags_json=COALESCE(?, papers.tags_json),
      -- undefined DOI (index-only Paper) keeps the stored one; null / "" clears it.
      doi=CASE WHEN ? IS NULL THEN papers.doi ELSE NULLIF(?, '') END`,
    [
      paper.id,
      paper.sourceFileHash,
      paper.titleOriginal,
      paper.titleTranslated,
      JSON.stringify(paper.authors),
      paper.publication,
      paper.year,
      paper.pageCount,
      paper.processingStatus,
      paper.favorite ? 1 : 0,
      paper.lastOpenedAt ?? null,
      paper.lastReadBlockId,
      paper.lastReadOffset,
      paper.sourceFileName ?? paper.sourceFilePath,
      paper.sourceStoredPath ?? null,
      paper.packageRevision ?? 0,
      needsResume ? 1 : 0,
      paper.trashedAt ?? null,
      paper.createdAt,
      paper.updatedAt,
      paper.readStatus ?? null,
      paper.tags ? JSON.stringify(paper.tags) : null,
      doiParam(paper.doi),
      paper.readStatus ?? null,
      paper.tags ? JSON.stringify(paper.tags) : null,
      doiParam(paper.doi),
      doiParam(paper.doi),
    ]
  );
}

export function setPaperDoiIndex(db: SqliteClient, paperId: string, doi: string | null): void {
  db.exec("UPDATE papers SET doi = NULLIF(?, '') WHERE id = ?", [doi?.trim().toLowerCase() ?? "", paperId]);
}

export function getPaperIndex(db: SqliteClient, id: string): Paper | undefined {
  const row = db.get("SELECT * FROM papers WHERE id = ?", [id]);
  return row ? rowToPaper(row) : undefined;
}

export function getAllPaperIndexes(db: SqliteClient): Paper[] {
  return db
    // `importing-<uuid>` is a provisional duplicate-guard hash. The index is
    // written before the atomic Paper Package so cancellation/retry can be
    // recovered, but it must not become a Reader card yet: selecting it would
    // race `paper.json` / markdown / structure creation.
    .query("SELECT * FROM papers WHERE trashed_at IS NULL AND source_file_hash NOT LIKE 'importing-%' ORDER BY updated_at DESC")
    .map(rowToPaper);
}

export function getTrashedPaperIndexes(db: SqliteClient): Paper[] {
  return db
    .query("SELECT * FROM papers WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC")
    .map(rowToPaper);
}

export function getExpiredTrashedPaperIndexes(db: SqliteClient, cutoffIso: string): Paper[] {
  return db
    .query(
      "SELECT * FROM papers WHERE trashed_at IS NOT NULL AND trashed_at <= ? ORDER BY trashed_at ASC",
      [cutoffIso]
    )
    .map(rowToPaper);
}

export function setPaperTrashedAt(db: SqliteClient, paperId: string, trashedAt: string | null): void {
  const now = new Date().toISOString();
  db.exec("UPDATE papers SET trashed_at = ?, updated_at = ? WHERE id = ?", [
    trashedAt,
    now,
    paperId,
  ]);
}

export function getPaperIndexByHash(db: SqliteClient, hash: string): Paper | undefined {
  const row = db.get("SELECT * FROM papers WHERE source_file_hash = ?", [hash]);
  return row ? rowToPaper(row) : undefined;
}

export function listResumeCandidatePaperIds(db: SqliteClient): string[] {
  return db
    .query(
      `SELECT id FROM papers
       WHERE trashed_at IS NULL
         AND (needs_translation_resume = 1
          OR processing_status IN ('queued','extracting','structuring','glossary','translating','partial','failed'))`
    )
    .map((row) => String(row.id));
}

export function deletePaperIndex(db: SqliteClient, id: string): void {
  db.exec("DELETE FROM papers_fts WHERE paper_id = ?", [id]);
  db.exec("DELETE FROM papers WHERE id = ?", [id]);
  db.exec("DELETE FROM workspace_papers WHERE paper_id = ?", [id]);
  db.exec("DELETE FROM annotations WHERE paper_id = ?", [id]);
  db.exec("DELETE FROM reading_positions WHERE paper_id = ?", [id]);
  db.exec("DELETE FROM glossaries WHERE paper_id = ?", [id]);
  db.exec("DELETE FROM translation_jobs WHERE paper_id = ?", [id]);
  db.exec("DELETE FROM benchmarks WHERE paper_id = ?", [id]);
}

export function saveReadingPositionRow(
  db: SqliteClient,
  paperId: string,
  blockId: string,
  offset: number
): void {
  const now = new Date().toISOString();
  db.exec(
    `INSERT INTO reading_positions (paper_id, block_id, offset, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(paper_id) DO UPDATE SET block_id=excluded.block_id, offset=excluded.offset, updated_at=excluded.updated_at`,
    [paperId, blockId, offset, now]
  );
  db.exec(
    "UPDATE papers SET last_read_block_id = ?, last_read_offset = ?, updated_at = ? WHERE id = ?",
    [blockId, offset, now, paperId]
  );
}

export function rebuildPaperSearchIndex(
  db: SqliteClient,
  paper: Paper,
  original: string,
  translation: string
): void {
  const annotation = listAnnotationsByPaper(db, paper.id)
    .map((item) => [item.note, item.selectedText].filter(Boolean).join(" "))
    .join(" ");
  rebuildPaperFts(db, paper.id, {
    title: [paper.titleOriginal, paper.titleTranslated].filter(Boolean).join(" "),
    authors: paper.authors.join(" "),
    original,
    translation,
    annotation,
  });
}

/** Refresh FTS annotation column for one paper without rewriting package files. */
export function refreshPaperAnnotationFts(db: SqliteClient, paperId: string): void {
  const paper = getPaperIndex(db, paperId);
  if (!paper) return;
  const row = db.get("SELECT original, translation FROM papers_fts WHERE paper_id = ?", [paperId]);
  const original = row ? String(row.original ?? "") : "";
  const translation = row ? String(row.translation ?? "") : "";
  rebuildPaperSearchIndex(db, paper, original, translation);
}

export function indexPaperText(
  db: SqliteClient,
  paper: Paper,
  original: string,
  translation: string
): void {
  rebuildPaperSearchIndex(db, paper, original, translation);
}
