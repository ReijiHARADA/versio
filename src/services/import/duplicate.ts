import type { Paper } from "../../types/paper";
import { paperPackageExists } from "../../data/package/persist";
import { getStorage } from "../../data/runtime";
import { deletePaper, getPaperByHash } from "../database";

/**
 * Return an existing paper for this PDF hash, if import should be blocked.
 * Index rows left without a Paper Package (failed persist / wiped packages)
 * are removed so the same PDF can be imported again.
 */
export async function findDuplicatePaper(fileHash: string): Promise<Paper | undefined> {
  const existing = await getPaperByHash(fileHash);
  if (!existing) return undefined;

  // Soft-deleted papers still occupy the hash; import UI offers restore.
  if (existing.trashedAt) return existing;

  const { fs, db } = await getStorage();
  if (await paperPackageExists(fs, existing.id)) {
    return existing;
  }

  // Orphan index: package dir is gone, but UNIQUE(source_file_hash) still blocks.
  await deletePaper(existing.id);
  await db.persist();
  return undefined;
}
