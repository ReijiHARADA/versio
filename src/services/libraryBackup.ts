import { flushPersistence, getSetting, saveSetting } from "./database";
import { getStorage, reopenStorage } from "../data/runtime";
import { isTauriApp } from "../utils/serverReady";
import { createLibraryBackupSnapshot } from "../data/backup/createBackup";
import { restoreLibraryBackup } from "../data/backup/restoreBackup";
import { validateLibraryBackup } from "../data/backup/validateBackup";
import type { LibraryBackupManifest } from "../data/backup/types";

const LAST_BACKUP_SETTING = "libraryBackupMeta";

export type LibraryBackupMeta = {
  lastBackupAt: string | null;
  lastBackupPaperCount: number | null;
  lastMessage: string | null;
};

export async function getLibraryBackupMeta(): Promise<LibraryBackupMeta> {
  const saved = await getSetting<LibraryBackupMeta>(LAST_BACKUP_SETTING);
  return {
    lastBackupAt: saved?.lastBackupAt ?? null,
    lastBackupPaperCount: saved?.lastBackupPaperCount ?? null,
    lastMessage: saved?.lastMessage ?? null,
  };
}

async function setMeta(patch: Partial<LibraryBackupMeta>): Promise<void> {
  const current = await getLibraryBackupMeta();
  await saveSetting(LAST_BACKUP_SETTING, { ...current, ...patch });
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

/**
 * Create a validated backup snapshot and export it to a user-chosen folder (Tauri)
 * or keep it under app-data `_library_backups/` (browser / tests).
 */
export async function runLibraryBackup(appVersion: string): Promise<{
  paperCount: number;
  exportedTo: string | null;
  warnings: string[];
}> {
  await flushPersistence();
  const { fs } = await getStorage();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const staging = `_library_backups/staging-${stamp}`;
  const finalRoot = `_library_backups/backup-${stamp}`;
  const consistentSnapshotRoot = `_library_backups/consistent-${stamp}`;

  const result = await createLibraryBackupSnapshot(fs, {
    appVersion,
    stagingRoot: staging,
    finalRoot,
    consistentSnapshotRoot,
  });

  const skipNote =
    result.warnings.length > 0
      ? `（不完全な論文 ${result.warnings.length} 件は除外）`
      : "";

  let exportedTo: string | null = null;
  if (isTauriApp()) {
    const dest = await invoke<string | null>("export_app_directory", {
      relativePath: finalRoot,
      dialogTitle: "バックアップフォルダの名前と場所を選択",
      defaultName: `Versio-Backup-${stamp}`,
    });
    if (!dest) {
      await setMeta({
        lastMessage:
          `バックアップは作成しましたが、保存先選択がキャンセルされました（アプリ内に保持）${skipNote}`,
      });
      exportedTo = finalRoot;
    } else {
      exportedTo = dest;
      await setMeta({
        lastBackupAt: new Date().toISOString(),
        lastBackupPaperCount: result.paperCount,
        lastMessage: `バックアップを保存しました（${result.paperCount}件）${skipNote}`,
      });
    }
  } else {
    exportedTo = finalRoot;
    await setMeta({
      lastBackupAt: new Date().toISOString(),
      lastBackupPaperCount: result.paperCount,
      lastMessage: `バックアップを作成しました（${result.paperCount}件）${skipNote}`,
    });
  }

  return {
    paperCount: result.paperCount,
    exportedTo,
    warnings: result.warnings,
  };
}

/**
 * Import a user-selected backup folder (Tauri) or an in-app candidate path (tests).
 */
export async function runLibraryRestore(options?: {
  /** Test-only: candidate already on app FS */
  candidateRoot?: string;
}): Promise<{ paperCount: number; manifest: LibraryBackupManifest }> {
  await flushPersistence();
  const { fs } = await getStorage();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let candidate = options?.candidateRoot;

  if (!candidate) {
    if (!isTauriApp()) {
      throw new Error("ブラウザ版ではフォルダ選択による復元は未対応です");
    }
    const incoming = `_restore_incoming/${stamp}`;
    const imported = await invoke<string | null>("import_directory_to_app", {
      relativePath: incoming,
      dialogTitle: "復元するバックアップフォルダを選択",
    });
    if (!imported) {
      throw new Error("復元がキャンセルされました");
    }
    candidate = incoming;
  }

  const validation = await validateLibraryBackup(fs, candidate);
  if (!validation.ok || !validation.manifest) {
    throw new Error(`バックアップが不正です: ${validation.errors.join("; ")}`);
  }

  await restoreLibraryBackup(fs, {
    candidateRoot: candidate,
    safetyRoot: `_restore_safety/${stamp}`,
    restoreStagingRoot: `_restore_staging/${stamp}`,
  });

  // Force storage reopen so sql.js reloads library.sqlite from disk.
  await reopenStorage();

  await setMeta({
    lastMessage: `バックアップから復元しました（${validation.manifest.paperCount}件）`,
  });

  return { paperCount: validation.manifest.paperCount, manifest: validation.manifest };
}
