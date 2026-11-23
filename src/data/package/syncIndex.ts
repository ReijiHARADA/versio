import type { Paper } from "../../types/paper";
import type { FileSystem } from "../fs/types";
import {
  deletePaperIndex,
  getAllPaperIndexes,
  getPaperIndex,
  getTrashedPaperIndexes,
  indexPaperText,
  indexPaperTerms,
  upsertPaperIndex,
  setPaperDoiIndex,
} from "../repositories/paperRepository";
import { rememberDocument } from "../repositories/documentRepository";
import type { SqliteClient } from "../sqlite/client";
import { LIBRARY_TERMS_BACKFILL_KEY } from "../sqlite/migrateSchema";
import { loadPaperPackage } from "./persist";
import { packageToProjection } from "./toProjection";

function stubIndexFromPackage(
  paperId: string,
  pkg: Awaited<ReturnType<typeof loadPaperPackage>>
): Paper {
  const now = new Date().toISOString();
  return {
    id: paperId,
    sourceFilePath: pkg.paper.sourceFileName ?? "",
    sourceFileName: pkg.paper.sourceFileName,
    sourceStoredPath: null,
    sourceFileHash: pkg.paper.sourceFileHash || `recovered-${paperId}`,
    titleOriginal: pkg.paper.title.original,
    titleTranslated: pkg.paper.title.translated,
    authors: pkg.paper.authors.map((author) => author.name),
    authorsStructured: pkg.paper.authors,
    affiliations: pkg.paper.affiliations,
    keywords: pkg.paper.keywords,
    publication: pkg.paper.publication,
    year: pkg.paper.year,
    doi: pkg.paper.doi,
    bibliography: pkg.paper.bibliography,
    pageCount: pkg.paper.pageCount,
    processingStatus: "ready",
    needsTranslationResume: false,
    lastReadBlockId: null,
    lastReadOffset: null,
    favorite: false,
    packageRevision: pkg.paper.revision,
    trashedAt: null,
    createdAt: pkg.paper.createdAt || now,
    updatedAt: pkg.paper.updatedAt || now,
  };
}

/** Paper package dirs under papers/, excluding .tmp / .bak leftovers. */
export function listPackagePaperIds(paths: string[]): string[] {
  const ids = new Set<string>();
  for (const path of paths) {
    const match = path.match(/^papers\/([^/]+)\/paper\.json$/);
    if (!match) continue;
    const id = match[1];
    if (id.endsWith(".tmp") || id.endsWith(".bak")) continue;
    ids.add(id);
  }
  return [...ids];
}

async function rebuildIndexFromPackage(
  fs: FileSystem,
  db: SqliteClient,
  paperId: string,
  existing?: Paper
): Promise<boolean> {
  try {
    const pkg = await loadPaperPackage(fs, paperId);
    const index = existing ?? stubIndexFromPackage(paperId, pkg);
    const projected = packageToProjection(pkg, index);
    const paper = { ...projected.paper, packageRevision: pkg.paper.revision };
    upsertPaperIndex(db, paper);
    indexPaperText(db, paper, pkg.originalMarkdown, pkg.translatedMarkdown);
    rememberDocument(paper, projected.sections, projected.blocks);
    return true;
  } catch (error) {
    console.warn("Failed to rebuild paper index from package:", paperId, error);
    return false;
  }
}

/**
 * Libraries from before schema v11 have no `library_terms`; the stored search
 * text is normalized (lowercase), so read the package Markdown once instead.
 */
async function backfillLibraryTerms(fs: FileSystem, db: SqliteClient): Promise<boolean> {
  const flag = db.get("SELECT value FROM meta WHERE key = ?", [LIBRARY_TERMS_BACKFILL_KEY]);
  if (!flag) return false;
  for (const index of [...getAllPaperIndexes(db), ...getTrashedPaperIndexes(db)]) {
    try {
      const original = (await fs.readText(`papers/${index.id}/original.md`)) ?? "";
      const translation = (await fs.readText(`papers/${index.id}/ja.md`)) ?? "";
      indexPaperTerms(db, index.id, original, translation);
    } catch (error) {
      console.warn("Failed to backfill library terms:", index.id, error);
    }
  }
  db.exec("DELETE FROM meta WHERE key = ?", [LIBRARY_TERMS_BACKFILL_KEY]);
  return true;
}

/**
 * Keep SQLite paper rows aligned with on-disk Paper Packages.
 * Also re-index packages that exist on disk but are missing from library.sqlite
 * (e.g. after a truncated/corrupt index write on quit).
 * Index rows whose package dir is gone are marked failed so the library does
 * not look openable.
 */
export async function syncPaperIndexesFromPackages(
  fs: FileSystem,
  db: SqliteClient
): Promise<number> {
  let rebuilt = 0;
  let backfilled = false;

  const known = [...getAllPaperIndexes(db), ...getTrashedPaperIndexes(db)];
  for (const index of known) {
    const hasPrimary = await fs.exists(`papers/${index.id}/paper.json`);
    if (!hasPrimary) {
      // Drop non-trash orphans (including stuck *.tmp writes) so UNIQUE hash
      // cannot block re-import. Do not treat .bak/.tmp alone as a live package.
      if (!index.trashedAt) {
        deletePaperIndex(db, index.id);
        await fs.remove(`papers/${index.id}`);
        await fs.remove(`papers/${index.id}.bak`);
        await fs.remove(`papers/${index.id}.tmp`);
        rebuilt += 1;
      }
      continue;
    }
    const paperText = await fs.readText(`papers/${index.id}/paper.json`);
    if (!paperText) continue;
    let revision = 0;
    let doi: string | null = null;
    try {
      const parsed = JSON.parse(paperText) as { revision?: number; doi?: string | null };
      revision = Number(parsed.revision ?? 0);
      doi = parsed.doi?.trim().toLowerCase() || null;
    } catch {
      continue;
    }
    // Libraries from before schema v9 have no DOI column values yet.
    if (doi !== (index.doi ?? null)) {
      setPaperDoiIndex(db, index.id, doi);
      backfilled = true;
    }
    if (revision === (index.packageRevision ?? 0)) continue;
    if (await rebuildIndexFromPackage(fs, db, index.id, index)) rebuilt += 1;
  }

  const paths = (await fs.exists("papers")) ? await fs.list("papers") : [];
  for (const paperId of listPackagePaperIds(paths)) {
    if (getPaperIndex(db, paperId)) continue;
    if (await rebuildIndexFromPackage(fs, db, paperId)) rebuilt += 1;
  }

  if (await backfillLibraryTerms(fs, db)) backfilled = true;

  if (rebuilt > 0 || backfilled) {
    await db.persist();
  }
  return rebuilt;
}
