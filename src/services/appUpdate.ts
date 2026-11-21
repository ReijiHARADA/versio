import { flushPersistence } from "./database";
import { showToast } from "../stores/toastStore";

async function invoke<T>(cmd: string): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd);
}

async function installUpdate(version: string): Promise<void> {
  showToast({ kind: "info", message: `Versio ${version} をダウンロードしています…` });
  try {
    // The relaunch skips the window close handler, so persist first.
    await flushPersistence();
    await invoke<void>("install_update");
  } catch (error) {
    console.error("Update install failed:", error);
    showToast({ kind: "error", message: "アップデートをインストールできませんでした" });
  }
}

/** `quiet`: the launch-time check stays silent unless an update exists. */
export async function checkForAppUpdate({ quiet }: { quiet: boolean }): Promise<void> {
  let version: string | null;
  try {
    version = await invoke<string | null>("check_for_update");
  } catch (error) {
    console.warn("Update check failed:", error);
    if (!quiet) showToast({ kind: "error", message: "アップデートを確認できませんでした" });
    return;
  }
  if (!version) {
    if (!quiet) showToast({ kind: "success", message: "Versio は最新の状態です" });
    return;
  }
  showToast({
    kind: "info",
    message: `Versio ${version} が利用できます`,
    actionLabel: "アップデートして再起動",
    onAction: () => void installUpdate(version),
  });
}
