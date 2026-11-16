import { PlamoEngine } from "./plamoEngine";

type Progress = { downloadedBytes: number; totalBytes: number };

const ERROR_TEXT: Record<string, string> = {
  checksum_mismatch: "ダウンロードしたモデルが壊れていました。再試行してください。",
  size_mismatch: "ダウンロードしたモデルが壊れていました。再試行してください。",
  download_failed: "ネットワークに接続できませんでした。接続を確認して再試行してください。",
  download_cancelled: "ダウンロードが中断されました。再試行してください。",
  model_not_downloaded: "翻訳モデルがまだダウンロードされていません。",
  server_start_timeout: "翻訳エンジンを起動できませんでした。",
  server_exited: "翻訳エンジンを起動できませんでした。",
};

/** User-facing Japanese text for a sidecar error code (Tauri rejects with the bare string). */
export function describePlamoError(error: unknown): string {
  const code = (error instanceof Error ? error.message : String(error)).trim();
  return ERROR_TEXT[code] ?? `翻訳モデルの準備に失敗しました（${code}）`;
}

/**
 * Make the PLaMo sidecar usable: download the pinned model if missing (reporting progress)
 * and start llama-server. Returns false outside Tauri or on failure.
 */
export async function ensurePlamoReady(onMessage: (message: string) => void): Promise<boolean> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return false;
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<Progress>("plamo-model-progress", ({ payload }) => {
    const pct = Math.floor((100 * payload.downloadedBytes) / Math.max(1, payload.totalBytes));
    onMessage(`翻訳モデルをダウンロードしています…（${pct}%）`);
  });
  try {
    onMessage("翻訳モデルを準備しています...");
    await new PlamoEngine().loadModel();
    return true;
  } catch (error) {
    console.warn("PLaMo readiness failed:", error);
    onMessage(describePlamoError(error));
    return false;
  } finally {
    unlisten();
  }
}

/** Model present on disk (the server itself starts lazily on first request). */
export async function isPlamoAvailable(): Promise<boolean> {
  return (await new PlamoEngine().getStatus()).available;
}
