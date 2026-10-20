/**
 * One-tap push of a paper EPUB into the configured sync folder.
 * Separate from favorite / star. UI owns presentation via the returned status.
 */

import {
  getEpubSyncFolder,
  hydrateEpubSyncStatus,
  pushPaperEpubToSyncFolder,
} from "./epubSync";
import { showToast } from "../stores/toastStore";
import { isTauriApp } from "../utils/serverReady";

export type SendPaperEpubStatus =
  | { status: "not_tauri" }
  | { status: "needs_folder" }
  | { status: "ok"; path: string; fileName: string }
  | { status: "error"; message: string };

export async function sendPaperEpubToSyncFolder(
  paperId: string
): Promise<SendPaperEpubStatus> {
  if (!isTauriApp()) {
    return { status: "not_tauri" };
  }

  const folder = await getEpubSyncFolder();
  if (!folder) {
    return { status: "needs_folder" };
  }

  try {
    const result = await pushPaperEpubToSyncFolder(paperId, { folderPath: folder });
    if (!result.synced) {
      return { status: "needs_folder" };
    }
    return { status: "ok", path: result.path, fileName: result.fileName };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "EPUB 同期に失敗しました",
    };
  }
}

export function presentEpubSyncFeedback(
  result: SendPaperEpubStatus,
  options: { onOpenSettings?: () => void; alreadySaved?: boolean } = {}
): void {
  switch (result.status) {
    case "not_tauri":
      showToast({
        kind: "info",
        message: "EPUB 同期は macOS アプリで利用できます",
      });
      return;
    case "needs_folder":
      showToast({
        kind: "info",
        message: "先に同期先フォルダを設定してください",
        actionLabel: options.onOpenSettings ? "設定を開く" : undefined,
        onAction: options.onOpenSettings,
      });
      return;
    case "ok":
      showToast({
        kind: "success",
        message: options.alreadySaved
          ? "同期先の EPUB を更新しました"
          : "同期先へ EPUB を保存しました",
      });
      return;
    case "error":
      showToast({
        kind: "error",
        message: `EPUB 同期に失敗しました: ${result.message}`,
      });
  }
}

export { hydrateEpubSyncStatus };
