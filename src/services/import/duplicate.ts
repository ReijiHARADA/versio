import type { Paper } from "../../types/paper";
import {
  paperBackupDir,
  paperDir,
  paperTmpDir,
} from "../../data/package/persist";
import { forgetDocument } from "../../data/repositories/documentRepository";
import {
  deletePaperIndex,
  getPaperIndexByHash,
} from "../../data/repositories/paperRepository";
import { getStorage } from "../../data/runtime";

/**
 * Return an existing paper for this PDF hash, if import should be blocked.
 *
 * Only a finished primary package (`papers/<id>/paper.json`) counts as
 * "already imported". Index rows left after a wiped papers/ dir, a failed
 * first persist, or a stuck `*.tmp` write are reclaimed so the same PDF can
 * be imported again. Trashed papers still block (restore UI).
 *
 * Implemented against getStorage/repos directly to avoid a circular import
 * through database.ts ↔ this chunk that could leave deletePaper unbound.
 */
export async function findDuplicatePaper(fileHash: string): Promise<Paper | undefined> {
  const { fs, db } = await getStorage();
  const existing = getPaperIndexByHash(db, fileHash);
  if (!existing) return undefined;
  if (existing.trashedAt) return existing;

  const primaryPath = `${paperDir(existing.id)}/paper.json`;
  if (await fs.exists(primaryPath)) {
    return existing;
  }

  db.transaction(() => {
    deletePaperIndex(db, existing.id);
  });
  forgetDocument(existing.id);
  await fs.remove(paperDir(existing.id));
  await fs.remove(paperBackupDir(existing.id));
  await fs.remove(paperTmpDir(existing.id));
  await db.persist();
  return undefined;
}
