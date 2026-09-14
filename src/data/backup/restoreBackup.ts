import type { FileSystem } from "../fs/types";
import { validateLibraryBackup } from "./validateBackup";
import { BACKUP_MANIFEST_NAME, BACKUP_PAPERS_DIR, BACKUP_SQLITE_NAME } from "./types";

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function join(root: string, ...parts: string[]): string {
  return [normalize(root), ...parts.map((p) => p.replace(/^\/+/, ""))].filter(Boolean).join("/");
}

async function copyFile(fs: FileSystem, from: string, to: string): Promise<void> {
  const bytes = await fs.readBytes(from);
  if (!bytes) throw new Error(`missing file: ${from}`);
  await fs.writeBytes(to, bytes);
}

async function copyTree(fs: FileSystem, fromPrefix: string, toPrefix: string): Promise<void> {
  const files = await fs.list(fromPrefix);
  const fromRoot = normalize(fromPrefix);
  for (const file of files) {
    const rel =
      file === fromRoot
        ? ""
        : file.startsWith(fromRoot + "/")
          ? file.slice(fromRoot.length + 1)
          : null;
    if (!rel) continue;
    await copyFile(fs, file, join(toPrefix, rel));
  }
}

export type RestoreLibraryBackupResult = {
  safetyRoot: string;
  restoredPaperCount: number;
};

/**
 * Safe restore:
 * 1. Validate candidate (no live mutation)
 * 2. Snapshot current library → safetyRoot
 * 3. Stage candidate → restoreStaging
 * 4. Swap into live paths
 * 5. On failure, roll back from safetyRoot
 */
export async function restoreLibraryBackup(
  fs: FileSystem,
  options: {
    /** Backup tree already on this FS (e.g. _restore_incoming/...) */
    candidateRoot: string;
    safetyRoot: string;
    restoreStagingRoot: string;
    failAfter?: "validate" | "safety" | "stage" | "swap";
  }
): Promise<RestoreLibraryBackupResult> {
  const candidate = normalize(options.candidateRoot);
  const safety = normalize(options.safetyRoot);
  const staging = normalize(options.restoreStagingRoot);

  const validation = await validateLibraryBackup(fs, candidate);
  if (!validation.ok) {
    throw new Error(`invalid backup: ${validation.errors.join("; ")}`);
  }
  if (options.failAfter === "validate") {
    throw new Error("injected failure after validate");
  }

  await fs.remove(safety);
  await fs.remove(staging);

  // Safety snapshot of current live data
  if (await fs.exists("library.sqlite")) {
    await copyFile(fs, "library.sqlite", join(safety, BACKUP_SQLITE_NAME));
  }
  if (await fs.exists("papers")) {
    await copyTree(fs, "papers", join(safety, BACKUP_PAPERS_DIR));
  }
  // Minimal manifest so safety itself is a restoreable tree if needed
  await fs.writeText(
    join(safety, BACKUP_MANIFEST_NAME),
    JSON.stringify(
      {
        formatVersion: validation.manifest!.formatVersion,
        appVersion: validation.manifest!.appVersion,
        sqliteSchemaVersion: validation.manifest!.sqliteSchemaVersion,
        packageSchemaVersion: validation.manifest!.packageSchemaVersion,
        createdAt: new Date().toISOString(),
        paperCount: validation.manifest!.paperCount,
        kind: "pre-restore-safety",
      },
      null,
      2
    )
  );

  if (options.failAfter === "safety") {
    throw new Error("injected failure after safety");
  }

  // Stage candidate
  await copyTree(fs, candidate, staging);
  const staged = await validateLibraryBackup(fs, staging);
  if (!staged.ok) {
    await fs.remove(staging);
    throw new Error(`staged backup invalid: ${staged.errors.join("; ")}`);
  }
  if (options.failAfter === "stage") {
    await fs.remove(staging);
    throw new Error("injected failure after stage");
  }

  try {
    // Swap: clear live papers + sqlite, then copy from staging
    if (options.failAfter === "swap") {
      throw new Error("injected failure during swap");
    }

    await fs.remove("library.sqlite");
    await fs.remove("papers");

    await copyFile(fs, join(staging, BACKUP_SQLITE_NAME), "library.sqlite");
    if (await fs.exists(join(staging, BACKUP_PAPERS_DIR))) {
      await copyTree(fs, join(staging, BACKUP_PAPERS_DIR), "papers");
    }
    await fs.remove(staging);
  } catch (error) {
    // Rollback from safety
    try {
      await fs.remove("library.sqlite");
      await fs.remove("papers");
      if (await fs.exists(join(safety, BACKUP_SQLITE_NAME))) {
        await copyFile(fs, join(safety, BACKUP_SQLITE_NAME), "library.sqlite");
      }
      if (await fs.exists(join(safety, BACKUP_PAPERS_DIR))) {
        await copyTree(fs, join(safety, BACKUP_PAPERS_DIR), "papers");
      }
    } catch (rollbackError) {
      throw new Error(
        `restore failed and rollback failed: ${error instanceof Error ? error.message : error}; rollback: ${rollbackError instanceof Error ? rollbackError.message : rollbackError}`
      );
    }
    await fs.remove(staging);
    throw error instanceof Error ? error : new Error(String(error));
  }

  return {
    safetyRoot: safety,
    restoredPaperCount: validation.manifest!.paperCount,
  };
}
