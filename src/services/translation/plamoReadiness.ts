import { PlamoEngine } from "./plamoEngine";

type Progress = { downloadedBytes: number; totalBytes: number };

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
  } catch {
    return false;
  } finally {
    unlisten();
  }
}

/** Model present on disk (the server itself starts lazily on first request). */
export async function isPlamoAvailable(): Promise<boolean> {
  return (await new PlamoEngine().getStatus()).available;
}
