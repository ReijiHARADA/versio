import { isTauriApp } from "../utils/serverReady";
import { wrapFileSystemWithBackupBarrier } from "./backup/barrierFs";
import { createIdbFileSystem } from "./fs/idbFs";
import { createMemoryFileSystem } from "./fs/memoryFs";
import { createTauriFileSystem } from "./fs/tauriFs";
import type { FileSystem } from "./fs/types";
import { resetDocumentCache } from "./repositories/documentRepository";
import { openSqlite, type SqliteClient } from "./sqlite/client";
import { createTauriSearchIndex, setNativeSearchIndex } from "./sqlite/nativeSearchIndex";

export type StorageRuntime = {
  fs: FileSystem;
  db: SqliteClient;
};

let runtime: StorageRuntime | null = null;
let starting: Promise<StorageRuntime> | null = null;
let testFs: FileSystem | null = null;

export function setTestFileSystem(fs: FileSystem | null): void {
  testFs = fs ? wrapFileSystemWithBackupBarrier(fs) : null;
  runtime = null;
  starting = null;
}

export async function getStorage(): Promise<StorageRuntime> {
  if (runtime) return runtime;
  if (!starting) {
    starting = (async () => {
      const fs =
        testFs ??
        wrapFileSystemWithBackupBarrier(
          isTauriApp()
            ? createTauriFileSystem()
            : typeof window === "undefined"
              ? createMemoryFileSystem()
              : createIdbFileSystem()
        );
      // The desktop app keeps paper bodies for search in a native SQLite file.
      setNativeSearchIndex(!testFs && isTauriApp() ? createTauriSearchIndex() : null);
      const db = await openSqlite(fs);
      runtime = { fs, db };
      return runtime;
    })();
  }
  return starting;
}

export async function resetStorageForTests(): Promise<void> {
  if (runtime) {
    try {
      await runtime.db.close();
    } catch {
      // ignore
    }
  }
  runtime = null;
  starting = null;
  testFs = wrapFileSystemWithBackupBarrier(createMemoryFileSystem());
  resetDocumentCache();
  const { resetDatabaseMigrationFlagForTests } = await import("../services/database");
  resetDatabaseMigrationFlagForTests();
}

/** Close and reopen storage from the current FS (after restore swaps library.sqlite). */
export async function reopenStorage(): Promise<StorageRuntime> {
  if (runtime) {
    try {
      await runtime.db.close();
    } catch {
      // ignore
    }
  }
  runtime = null;
  starting = null;
  resetDocumentCache();
  const { resetDatabaseMigrationFlagForTests } = await import("../services/database");
  resetDatabaseMigrationFlagForTests();
  return getStorage();
}

export function peekStorage(): StorageRuntime | null {
  return runtime;
}
