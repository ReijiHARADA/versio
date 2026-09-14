import type { FileSystem } from "../fs/types";
import { loadPaperPackage } from "../package/persist";
import { validatePaperPackage } from "../package/validate";
import {
  PACKAGE_SCHEMA_VERSION,
  SQLITE_SCHEMA_VERSION,
} from "../schemaVersion";
import { validateSqliteBackupBytes } from "./sqliteIntegrity";
import {
  BACKUP_MANIFEST_NAME,
  BACKUP_PAPERS_DIR,
  BACKUP_SQLITE_NAME,
  LIBRARY_BACKUP_FORMAT_VERSION,
  type LibraryBackupManifest,
} from "./types";

export type BackupValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  manifest: LibraryBackupManifest | null;
};

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function join(root: string, ...parts: string[]): string {
  return [normalize(root), ...parts.map((p) => p.replace(/^\/+/, ""))].filter(Boolean).join("/");
}

function isSafeRel(rel: string): boolean {
  if (!rel || rel.startsWith("/") || rel.includes("\\") || rel.includes("\0")) return false;
  return !rel.split("/").some((part) => part === ".." || part === "");
}

export async function readBackupManifest(
  fs: FileSystem,
  backupRoot: string
): Promise<LibraryBackupManifest | null> {
  const text = await fs.readText(join(backupRoot, BACKUP_MANIFEST_NAME));
  if (!text) return null;
  try {
    return JSON.parse(text) as LibraryBackupManifest;
  } catch {
    return null;
  }
}

/**
 * Validate a backup tree rooted at `backupRoot` (relative paths on FileSystem).
 * Does not mutate the live library.
 */
export async function validateLibraryBackup(
  fs: FileSystem,
  backupRoot: string,
  options?: { skipPackageBodies?: boolean; skipSqliteIntegrity?: boolean }
): Promise<BackupValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const root = normalize(backupRoot);

  if (!isSafeRel(root) && root !== "." && !root.startsWith("_")) {
    // allow staging roots like _restore_staging/...
  }
  if (root.includes("..")) {
    errors.push("backup path contains traversal");
    return { ok: false, errors, warnings, manifest: null };
  }

  const manifest = await readBackupManifest(fs, root);
  if (!manifest) {
    errors.push("backup.json が無い、または JSON として不正です");
    return { ok: false, errors, warnings, manifest: null };
  }

  if (manifest.formatVersion !== LIBRARY_BACKUP_FORMAT_VERSION) {
    errors.push(
      `未対応の backup formatVersion: ${manifest.formatVersion}（対応: ${LIBRARY_BACKUP_FORMAT_VERSION}）`
    );
  }
  if (manifest.sqliteSchemaVersion > SQLITE_SCHEMA_VERSION) {
    errors.push(
      `SQLite schema ${manifest.sqliteSchemaVersion} はこのアプリ（${SQLITE_SCHEMA_VERSION}）より新しいため復元できません`
    );
  }
  if (manifest.sqliteSchemaVersion < 1) {
    errors.push(`不正な sqliteSchemaVersion: ${manifest.sqliteSchemaVersion}`);
  }
  if (manifest.packageSchemaVersion > PACKAGE_SCHEMA_VERSION) {
    errors.push(
      `Paper Package schema ${manifest.packageSchemaVersion} はこのアプリ（${PACKAGE_SCHEMA_VERSION}）より新しいため復元できません`
    );
  }

  const sqlitePath = join(root, BACKUP_SQLITE_NAME);
  if (!(await fs.exists(sqlitePath))) {
    errors.push("library.sqlite がありません");
  } else if (!options?.skipSqliteIntegrity) {
    const bytes = await fs.readBytes(sqlitePath);
    if (!bytes) {
      errors.push("library.sqlite を読めません");
    } else {
      const integrity = await validateSqliteBackupBytes(bytes);
      errors.push(...integrity.errors);
      warnings.push(...integrity.warnings);
      if (
        integrity.schemaVersion != null &&
        manifest.sqliteSchemaVersion !== integrity.schemaVersion
      ) {
        if (integrity.schemaVersion > manifest.sqliteSchemaVersion) {
          errors.push(
            `backup.json sqliteSchemaVersion=${manifest.sqliteSchemaVersion} と DB meta=${integrity.schemaVersion} が不一致です`
          );
        } else {
          warnings.push(
            `backup.json sqliteSchemaVersion=${manifest.sqliteSchemaVersion} / DB meta=${integrity.schemaVersion}（migration 想定）`
          );
        }
      }
    }
  } else {
    const bytes = await fs.readBytes(sqlitePath);
    if (!bytes || bytes.byteLength < 100) {
      errors.push("library.sqlite が空または破損している可能性があります");
    } else {
      const header = new TextDecoder().decode(bytes.slice(0, 16));
      if (!header.startsWith("SQLite format 3")) {
        errors.push("library.sqlite が SQLite 形式ではありません");
      }
    }
  }

  const papersPrefix = join(root, BACKUP_PAPERS_DIR);
  const files = await fs.list(papersPrefix);
  const paperIds = new Set<string>();
  for (const file of files) {
    const rel = file.startsWith(papersPrefix + "/")
      ? file.slice(papersPrefix.length + 1)
      : file.startsWith(BACKUP_PAPERS_DIR + "/")
        ? file.slice(BACKUP_PAPERS_DIR.length + 1)
        : null;
    if (!rel) continue;
    const [paperId, ...rest] = rel.split("/");
    if (!paperId || paperId.includes("..")) {
      errors.push(`不正な papers パス: ${file}`);
      continue;
    }
    paperIds.add(paperId);
    if (rest.some((part) => part === "..")) {
      errors.push(`path traversal in backup: ${file}`);
    }
  }

  if (manifest.paperCount !== paperIds.size) {
    const msg = `backup.json の paperCount=${manifest.paperCount} と papers/ 内 ${paperIds.size} 件が一致しません`;
    if (manifest.paperCount > paperIds.size) {
      errors.push(msg);
    } else {
      warnings.push(msg);
    }
  }

  if (!options?.skipPackageBodies) {
    for (const paperId of paperIds) {
      try {
        const pkg = await loadPaperPackage(prefixFileSystem(fs, root), paperId, {
          includeSourcePdf: false,
          includeAssets: false,
          includeLayout: false,
        });
        if (pkg.paper.paperId !== paperId) {
          errors.push(`package ID mismatch: dir=${paperId} paper.json=${pkg.paper.paperId}`);
        }
        const validation = validatePaperPackage(pkg);
        if (!validation.ok) {
          for (const d of validation.diagnostics.filter((item) => item.level === "error")) {
            errors.push(`${paperId}: ${d.message}`);
          }
        }
      } catch (error) {
        errors.push(
          `${paperId}: package を読めません（${error instanceof Error ? error.message : String(error)}）`
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    manifest,
  };
}

/** Restrict FS operations to paths under `prefix`. */
export function prefixFileSystem(base: FileSystem, prefix: string): FileSystem {
  const root = normalize(prefix);
  const map = (path: string) => join(root, path);
  return {
    readBytes: (path) => base.readBytes(map(path)),
    writeBytes: (path, data) => base.writeBytes(map(path), data),
    readText: (path) => base.readText(map(path)),
    writeText: (path, text) => base.writeText(map(path), text),
    exists: (path) => base.exists(map(path)),
    remove: (path) => base.remove(map(path)),
    rename: (from, to) => base.rename(map(from), map(to)),
    list: async (listPrefix) => {
      const full = map(listPrefix);
      const listed = await base.list(full);
      const cut = full.endsWith("/") ? full : `${full}/`;
      return listed
        .map((name) => {
          if (name === full) return listPrefix.replace(/\/+$/, "") || ".";
          if (name.startsWith(cut)) {
            const rest = name.slice(cut.length);
            const basePrefix = listPrefix.replace(/\/+$/, "");
            return basePrefix ? `${basePrefix}/${rest}` : rest;
          }
          return null;
        })
        .filter((name): name is string => Boolean(name));
    },
  };
}
