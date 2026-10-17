import { getSetting, saveSetting } from "./database";
import { isTauriApp } from "../utils/serverReady";

export const EPUB_SYNC_FOLDER_SETTING = "epubSyncFolder";

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
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
  return folder;
}

export async function clearEpubSyncFolder(): Promise<void> {
  await saveSetting(EPUB_SYNC_FOLDER_SETTING, "");
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
