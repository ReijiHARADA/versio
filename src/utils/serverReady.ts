/**
 * 翻訳サーバーが起動・モデル準備完了するまでポーリングする。
 * 固定秒数のタイムアウトに依存しない（初回ダウンロードは数十分かかり得る）。
 */
import { resolveMadladServerUrl } from "../services/translation/madladEngine";

export const SERVER_URL = resolveMadladServerUrl();
const HEALTH_ENDPOINT = `${SERVER_URL}/health`;

export type TranslationServerPhase =
  | "starting"
  | "model_missing"
  | "downloading"
  | "loading"
  | "warming_up"
  | "ready"
  | "error"
  | "unknown";

export type TranslationServerHealth = {
  status?: string;
  model_loaded?: boolean;
  phase?: TranslationServerPhase;
  progress?: number | null;
  message?: string | null;
  error?: string | null;
};

type ReadyListener = () => void;
type StatusListener = (health: TranslationServerHealth, attempt: number) => void;

const readyListeners = new Set<ReadyListener>();
let translationServerReady = false;
let lastHealth: TranslationServerHealth | null = null;

/** Test-only: clear ready flag and listeners between cases. */
export function resetTranslationServerReadyForTests(): void {
  translationServerReady = false;
  readyListeners.clear();
  lastHealth = null;
}

export function isTauriApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isTranslationServerReady(): boolean {
  if (!isTauriApp()) return true;
  return translationServerReady;
}

export function getLastTranslationServerHealth(): TranslationServerHealth | null {
  return lastHealth;
}

/** Notify importers / readers that MADLAD model is ready. */
export function markTranslationServerReady(): void {
  if (translationServerReady) return;
  translationServerReady = true;
  for (const listener of [...readyListeners]) {
    try {
      listener();
    } catch (error) {
      console.error("Translation server ready listener failed:", error);
    }
  }
}

export function subscribeTranslationServerReady(listener: ReadyListener): () => void {
  readyListeners.add(listener);
  if (isTranslationServerReady()) {
    queueMicrotask(listener);
  }
  return () => {
    readyListeners.delete(listener);
  };
}

function isModelReady(data: TranslationServerHealth | null): boolean {
  if (!data) return false;
  if (data.phase === "ready") return true;
  if (data.phase === "error") return false;
  return data.model_loaded === true;
}

export async function fetchTranslationServerHealth(
  signal?: AbortSignal
): Promise<TranslationServerHealth | null> {
  try {
    const res = await fetch(HEALTH_ENDPOINT, {
      signal: signal ?? AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as TranslationServerHealth | null;
    if (data) lastHealth = data;
    return data;
  } catch {
    return null;
  }
}

export type WaitForServerOptions = {
  /** Max poll attempts. Default: effectively unbounded for first-time download. */
  maxAttempts?: number;
  intervalMs?: number;
  /** Resolve when HTTP answers even if model is still loading. */
  requireModelReady?: boolean;
  onProgress?: (attempt: number, health: TranslationServerHealth | null) => void;
  signal?: AbortSignal;
};

/**
 * Poll /health until the server is usable.
 * Default: wait until model is ready (phase=ready or model_loaded).
 * Pass requireModelReady:false to wait only for HTTP liveness.
 */
export async function waitForServer(
  onProgress?: (attempt: number, health?: TranslationServerHealth | null) => void,
  maxAttempts = 60 * 60,
  intervalMs = 1000
): Promise<void> {
  return waitForTranslationServer({
    maxAttempts,
    intervalMs,
    requireModelReady: true,
    onProgress: (attempt, health) => onProgress?.(attempt, health),
  });
}

export async function waitForTranslationServer(
  options: WaitForServerOptions = {}
): Promise<TranslationServerHealth> {
  const {
    maxAttempts = 60 * 60,
    intervalMs = 1000,
    requireModelReady = true,
    onProgress,
    signal,
  } = options;

  for (let i = 0; i < maxAttempts; i++) {
    if (signal?.aborted) throw new Error("Aborted while waiting for translation server.");
    const data = await fetchTranslationServerHealth(signal);
    onProgress?.(i + 1, data);

    if (data) {
      if (data.phase === "error") {
        throw new Error(data.error || data.message || "Translation server reported an error.");
      }
      if (requireModelReady) {
        if (isModelReady(data)) {
          markTranslationServerReady();
          return data;
        }
      } else {
        // Any successful health JSON means the process is listening.
        return data;
      }
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Translation server did not become ready in time.");
}

/** @deprecated Prefer waitForTranslationServer; kept for call-site compatibility. */
export type { StatusListener };
