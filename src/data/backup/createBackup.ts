import type { FileSystem } from "../fs/types";
import { createBackupManifest, BACKUP_MANIFEST_NAME, BACKUP_PAPERS_DIR, BACKUP_SQLITE_NAME } from "./types";
import { validateLibraryBackup } from "./validateBackup";

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

async function copyTree(fs: FileSystem, fromPrefix: string, toPrefix: string): Promise<number> {
  const files = await fs.list(fromPrefix);
  let count = 0;
  const fromRoot = normalize(fromPrefix);
  for (const file of files) {
    const rel =
      file === fromRoot
        ? ""
        : file.startsWith(fromRoot + "/")
          ? file.slice(fromRoot.length + 1)
          : null;
    if (rel === null) continue;
    if (!rel) continue;
    await copyFile(fs, file, join(toPrefix, rel));
    count += 1;
  }
  return count;
}

export type CreateLibraryBackupResult = {
  stagingRoot: string;
  paperCount: number;
  manifestPath: string;
};

/**
 * Flush-ready snapshot into an app-data staging tree (caller must flush DB first).
 * Writes to temporary `stagingRoot`, validates, then atomically renames to `finalRoot`.
 */
export async function createLibraryBackupSnapshot(
  fs: FileSystem,
  options: {
    appVersion: string;
    stagingRoot: string;
    finalRoot: string;
    /** Injected failure for tests. */
    failAfter?: "copy" | "validate" | "promote";
  }
): Promise<CreateLibraryBackupResult> {
  const staging = normalize(options.stagingRoot);
  const finalRoot = normalize(options.finalRoot);

  await fs.remove(staging);
  await fs.remove(finalRoot);

  if (!(await fs.exists("library.sqlite"))) {
    throw new Error("library.sqlite がありません。先にライブラリを初期化してください");
  }

  await copyFile(fs, "library.sqlite", join(staging, BACKUP_SQLITE_NAME));

  let paperCount = 0;
  if (await fs.exists("papers")) {
    const paperFiles = await fs.list("papers");
    const ids = new Set<string>();
    for (const file of paperFiles) {
      const rel = file.startsWith("papers/") ? file.slice("papers/".length) : "";
      const id = rel.split("/")[0];
      if (id) ids.add(id);
    }
    paperCount = ids.size;
    await copyTree(fs, "papers", join(staging, BACKUP_PAPERS_DIR));
  }

  const manifest = createBackupManifest({
    appVersion: options.appVersion,
    paperCount,
  });
  await fs.writeText(join(staging, BACKUP_MANIFEST_NAME), JSON.stringify(manifest, null, 2));

  if (options.failAfter === "copy") {
    throw new Error("injected failure after copy");
  }

  const validation = await validateLibraryBackup(fs, staging);
  if (!validation.ok) {
    await fs.remove(staging);
    throw new Error(`backup validation failed: ${validation.errors.join("; ")}`);
  }

  if (options.failAfter === "validate") {
    throw new Error("injected failure after validate");
  }

  // Promote staging → final (rename tree by renaming files)
  await fs.remove(finalRoot);
  const stagedFiles = await fs.list(staging);
  for (const file of stagedFiles) {
    const rel = file.startsWith(staging + "/") ? file.slice(staging.length + 1) : "";
    if (!rel) continue;
    await copyFile(fs, file, join(finalRoot, rel));
  }
  await fs.remove(staging);

  if (options.failAfter === "promote") {
    await fs.remove(finalRoot);
    throw new Error("injected failure after promote");
  }

  const finalValidation = await validateLibraryBackup(fs, finalRoot);
  if (!finalValidation.ok) {
    await fs.remove(finalRoot);
    throw new Error(`final backup invalid: ${finalValidation.errors.join("; ")}`);
  }

  return {
    stagingRoot: finalRoot,
    paperCount,
    manifestPath: join(finalRoot, BACKUP_MANIFEST_NAME),
  };
}
