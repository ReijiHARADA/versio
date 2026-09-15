import type { FileSystem } from "../fs/types";
import { parsePaperMarkdown } from "../markdown/parse";
import { loadPaperPackage } from "../package/persist";
import { validatePaperPackage } from "../package/validate";
import {
  getStorageGeneration,
  withBackupWriteBarrier,
} from "./snapshotBarrier";
import {
  collectPaperPackageDirNames,
  isUnderTransientPaperDir,
} from "./paperDirs";
import { createBackupManifest, BACKUP_MANIFEST_NAME, BACKUP_PAPERS_DIR, BACKUP_SQLITE_NAME } from "./types";
import { prefixFileSystem, validateLibraryBackup } from "./validateBackup";

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

async function copyTree(
  fs: FileSystem,
  fromPrefix: string,
  toPrefix: string,
  options?: { skipRel?: (rel: string) => boolean }
): Promise<number> {
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
    if (options?.skipRel?.(rel)) continue;
    await copyFile(fs, file, join(toPrefix, rel));
    count += 1;
  }
  return count;
}

export type CreateLibraryBackupResult = {
  stagingRoot: string;
  paperCount: number;
  manifestPath: string;
  snapshotGeneration: number;
  warnings: string[];
};

/**
 * Consistent snapshot:
 * 1. short write barrier
 * 2. copy live library.sqlite + papers/ into immutable snapshotRoot
 * 3. release barrier (live mutations may resume)
 * 4. build/validate/promote backup from the immutable snapshot (long work)
 *
 * Caller should flush DB before invoking.
 */
export async function createLibraryBackupSnapshot(
  fs: FileSystem,
  options: {
    appVersion: string;
    stagingRoot: string;
    finalRoot: string;
    /** Injected failure for tests. */
    failAfter?: "copy" | "validate" | "promote" | "snapshot";
    /** Optional immutable snapshot directory (defaults under staging). */
    consistentSnapshotRoot?: string;
  }
): Promise<CreateLibraryBackupResult> {
  const staging = normalize(options.stagingRoot);
  const finalRoot = normalize(options.finalRoot);
  const snapshotRoot = normalize(
    options.consistentSnapshotRoot ?? `${staging}__consistent`
  );
  const warnings: string[] = [];

  await fs.remove(staging);
  await fs.remove(finalRoot);
  await fs.remove(snapshotRoot);

  if (!(await fs.exists("library.sqlite"))) {
    throw new Error("library.sqlite がありません。先にライブラリを初期化してください");
  }

  let snapshotGeneration = 0;
  await withBackupWriteBarrier(async () => {
    snapshotGeneration = getStorageGeneration();
    await copyFile(fs, "library.sqlite", join(snapshotRoot, BACKUP_SQLITE_NAME));
    if (await fs.exists("papers")) {
      await copyTree(fs, "papers", join(snapshotRoot, BACKUP_PAPERS_DIR), {
        skipRel: isUnderTransientPaperDir,
      });
    }
    if (getStorageGeneration() !== snapshotGeneration) {
      throw new Error("backup snapshot became inconsistent during copy (concurrent mutation)");
    }
    if (options.failAfter === "snapshot") {
      throw new Error("injected failure after snapshot");
    }
  });

  // Long phase outside the barrier: assemble backup from immutable snapshot.
  const snapshotPapers = join(snapshotRoot, BACKUP_PAPERS_DIR);
  if (await fs.exists(snapshotPapers)) {
    await copyTree(fs, snapshotPapers, join(staging, BACKUP_PAPERS_DIR), {
      skipRel: isUnderTransientPaperDir,
    });
  }

  await copyFile(
    fs,
    join(snapshotRoot, BACKUP_SQLITE_NAME),
    join(staging, BACKUP_SQLITE_NAME)
  );

  // Drop incomplete / unreadable packages so a few broken papers don't block backup.
  const stagedPapers = join(staging, BACKUP_PAPERS_DIR);
  const stagedFs = prefixFileSystem(fs, staging);
  let paperIds = (await fs.exists(stagedPapers))
    ? collectPaperPackageDirNames(await fs.list(stagedPapers), stagedPapers)
    : [];

  for (const paperId of [...paperIds]) {
    try {
      const pkg = await loadPaperPackage(stagedFs, paperId, {
        includeSourcePdf: false,
        includeAssets: false,
        includeLayout: false,
      });
      if (pkg.paper.paperId !== paperId) {
        throw new Error(`package ID mismatch: dir=${paperId} paper.json=${pkg.paper.paperId}`);
      }
      const validation = validatePaperPackage(pkg, { requireAssetBytes: false });
      if (!validation.ok) {
        const detail = validation.diagnostics
          .filter((item) => item.level === "error")
          .map((item) => item.message)
          .join("; ");
        throw new Error(detail || "validation failed");
      }
      // Spot-check referenced assets exist on disk (bytes not loaded above).
      const original = parsePaperMarkdown(pkg.originalMarkdown, paperId);
      for (const node of original.nodes) {
        if (
          (node.type === "figure" || node.type === "table") &&
          node.src?.startsWith("assets/")
        ) {
          if (!(await fs.exists(join(stagedPapers, paperId, node.src)))) {
            throw new Error(`assets がありません: ${node.src}`);
          }
        }
      }
    } catch (error) {
      warnings.push(
        `${paperId}: 不完全なためバックアップから除外（${
          error instanceof Error ? error.message : String(error)
        }）`
      );
      await fs.remove(join(stagedPapers, paperId));
    }
  }

  paperIds = (await fs.exists(stagedPapers))
    ? collectPaperPackageDirNames(await fs.list(stagedPapers), stagedPapers)
    : [];
  const paperCount = paperIds.length;

  const manifest = createBackupManifest({
    appVersion: options.appVersion,
    paperCount,
  });
  await fs.writeText(join(staging, BACKUP_MANIFEST_NAME), JSON.stringify(manifest, null, 2));

  if (options.failAfter === "copy") {
    throw new Error("injected failure after copy");
  }

  const validation = await validateLibraryBackup(fs, staging);
  warnings.push(...validation.warnings);
  if (!validation.ok) {
    await fs.remove(staging);
    await fs.remove(snapshotRoot);
    throw new Error(`backup validation failed: ${validation.errors.join("; ")}`);
  }

  if (options.failAfter === "validate") {
    throw new Error("injected failure after validate");
  }

  await fs.remove(finalRoot);
  const stagedFiles = await fs.list(staging);
  for (const file of stagedFiles) {
    const rel = file.startsWith(staging + "/") ? file.slice(staging.length + 1) : "";
    if (!rel) continue;
    await copyFile(fs, file, join(finalRoot, rel));
  }
  await fs.remove(staging);
  await fs.remove(snapshotRoot);

  if (options.failAfter === "promote") {
    await fs.remove(finalRoot);
    throw new Error("injected failure after promote");
  }

  const finalValidation = await validateLibraryBackup(fs, finalRoot);
  warnings.push(...finalValidation.warnings);
  if (!finalValidation.ok) {
    await fs.remove(finalRoot);
    throw new Error(`final backup invalid: ${finalValidation.errors.join("; ")}`);
  }

  return {
    stagingRoot: finalRoot,
    paperCount,
    manifestPath: join(finalRoot, BACKUP_MANIFEST_NAME),
    snapshotGeneration,
    warnings,
  };
}
