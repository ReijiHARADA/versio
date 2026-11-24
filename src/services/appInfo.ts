import { isTauriApp } from "../utils/serverReady";

export type StorageUsage = {
  path: string;
  papersBytes: number;
  modelsBytes: number;
  totalBytes: number;
};

async function invoke<T>(cmd: string): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd);
}

/** Bundle version from tauri.conf.json; `null` in the browser dev build. */
export async function getAppVersion(): Promise<string | null> {
  if (isTauriApp()) {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      return await getVersion();
    } catch {
      /* fall through */
    }
  }
  return null;
}

export async function getStorageUsage(): Promise<StorageUsage | null> {
  if (!isTauriApp()) return null;
  return invoke<StorageUsage>("app_storage_usage");
}

export async function revealAppDataFolder(): Promise<void> {
  await invoke<void>("reveal_app_data_dir");
}

export async function revealTranslationLog(): Promise<void> {
  await invoke<void>("reveal_translation_log");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
