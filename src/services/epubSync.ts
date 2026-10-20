import { getSetting, saveSetting } from "./database";
import {
  useEpubSyncStore,
  type EpubSyncEntry,
} from "../stores/epubSyncStore";
import { isTauriApp } from "../utils/serverReady";

export const EPUB_SYNC_FOLDER_SETTING = "epubSyncFolder";
export const EPUB_SYNC_STATUS_SETTING = "epubSyncByPaper";

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

function asSyncMap(value: unknown): Record<string, EpubSyncEntry> {
  if (!value || typeof value !== "object") return {};
  const next: Record<string, EpubSyncEntry> = {};
  for (const [paperId, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Partial<EpubSyncEntry>;
    if (
      typeof record.syncedAt !== "string" ||
      typeof record.fileName !== "string" ||
      typeof record.folderPath !== "string"
    ) {
      continue;
    }
    next[paperId] = {
      syncedAt: record.syncedAt,
      fileName: record.fileName,
      folderPath: record.folderPath,
    };
  }
  return next;
}

export async function getEpubSyncFolder(): Promise<string | null> {
  const value = await getSetting<string>(EPUB_SYNC_FOLDER_SETTING);
  return value?.trim() || null;
}

export async function chooseEpubSyncFolder(): Promise<string | null> {
  if (!isTauriApp()) return null;
  const folder = await invoke<string | null>("choose_epub_sync_folder", {});
  if (!folder) return null;
  await saveSetting(EPUB_SYNC_FOLDER_SETTING, folder);
  useEpubSyncStore.getState().clearForFolder(folder);
  return folder;
}

export async function clearEpubSyncFolder(): Promise<void> {
  await saveSetting(EPUB_SYNC_FOLDER_SETTING, "");
  useEpubSyncStore.getState().clearForFolder(null);
}

/** Load persisted per-paper sync marks into the in-memory store (once). */
export async function hydrateEpubSyncStatus(): Promise<void> {
  if (useEpubSyncStore.getState().hydrated) return;
  const raw = await getSetting<Record<string, EpubSyncEntry>>(EPUB_SYNC_STATUS_SETTING);
  const folder = await getEpubSyncFolder();
  const map = asSyncMap(raw);
  if (!folder) {
    useEpubSyncStore.getState().setHydrated({});
    return;
  }
  const filtered: Record<string, EpubSyncEntry> = {};
  for (const [id, entry] of Object.entries(map)) {
    if (entry.folderPath === folder) filtered[id] = entry;
  }
  useEpubSyncStore.getState().setHydrated(filtered);
}

export async function markPaperEpubSynced(
  paperId: string,
  entry: Omit<EpubSyncEntry, "syncedAt"> & { syncedAt?: string }
): Promise<void> {
  const full: EpubSyncEntry = {
    syncedAt: entry.syncedAt ?? new Date().toISOString(),
    fileName: entry.fileName,
    folderPath: entry.folderPath,
  };
  useEpubSyncStore.getState().markSynced(paperId, full);
  const current = asSyncMap(
    await getSetting<Record<string, EpubSyncEntry>>(EPUB_SYNC_STATUS_SETTING)
  );
  current[paperId] = full;
  await saveSetting(EPUB_SYNC_STATUS_SETTING, current);
}

export function isPaperEpubSynced(
  paperId: string,
  folderPath: string | null | undefined
): boolean {
  if (!folderPath) return false;
  const entry = useEpubSyncStore.getState().byPaperId[paperId];
  return Boolean(entry && entry.folderPath === folderPath);
}

export async function syncEpubFile(
  folderPath: string,
  fileName: string,
  epub: Uint8Array
): Promise<string> {
  if (!isTauriApp()) {
    throw new Error("EPUB同期はmacOSアプリで利用できます");
  }
  return invoke<string>("sync_epub_file", {
    folderPath,
    fileName,
    data: Array.from(epub),
  });
}

export type PushPaperEpubResult =
  | { synced: false; reason: "not_tauri" | "no_folder" }
  | { synced: true; path: string; fileName: string };

/**
 * Build a mobile EPUB and copy it into the configured sync folder.
 * Used by favorite-on (one-tap) and by the explicit export checkbox path.
 */
export async function pushPaperEpubToSyncFolder(
  paperId: string,
  options: { includeFailedTranslations?: boolean; folderPath?: string | null } = {}
): Promise<PushPaperEpubResult> {
  if (!isTauriApp()) {
    return { synced: false, reason: "not_tauri" };
  }
  const folderPath = options.folderPath ?? (await getEpubSyncFolder());
  if (!folderPath) {
    return { synced: false, reason: "no_folder" };
  }

  const { getStorage } = await import("../data/runtime");
  const { exportPaperEpub } = await import("../data/export/epubExport");
  const { fs } = await getStorage();
  const result = await exportPaperEpub(fs, paperId, {
    includeFailedTranslations: options.includeFailedTranslations ?? false,
  });
  const fileName = `${result.fileName}.epub`;
  const path = await syncEpubFile(folderPath, fileName, result.epub);
  await markPaperEpubSynced(paperId, { fileName, folderPath });
  return { synced: true, path, fileName };
}
