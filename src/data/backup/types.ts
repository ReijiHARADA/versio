import {
  PACKAGE_SCHEMA_VERSION,
  SQLITE_SCHEMA_VERSION,
} from "../schemaVersion";

/** On-disk backup format (not SQLite schema). */
export const LIBRARY_BACKUP_FORMAT_VERSION = 1;

export type LibraryBackupManifest = {
  formatVersion: number;
  appVersion: string;
  sqliteSchemaVersion: number;
  packageSchemaVersion: number;
  createdAt: string;
  paperCount: number;
};

export const BACKUP_MANIFEST_NAME = "backup.json";
export const BACKUP_SQLITE_NAME = "library.sqlite";
export const BACKUP_PAPERS_DIR = "papers";

export function createBackupManifest(input: {
  appVersion: string;
  paperCount: number;
  createdAt?: string;
}): LibraryBackupManifest {
  return {
    formatVersion: LIBRARY_BACKUP_FORMAT_VERSION,
    appVersion: input.appVersion,
    sqliteSchemaVersion: SQLITE_SCHEMA_VERSION,
    packageSchemaVersion: PACKAGE_SCHEMA_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    paperCount: input.paperCount,
  };
}
