import { useCallback, useEffect, useState } from "react";
import { isTauriApp } from "../../utils/serverReady";
import { describePlamoError } from "../../services/translation/plamoReadiness";

type Progress = { present: boolean; downloadedBytes: number; totalBytes: number };
export type PlamoModelState = "unavailable" | "checking" | "absent" | "downloading" | "present" | "error";

/** PLaMo model presence + first-run download, driven by the Rust sidecar commands. */
export function usePlamoModel() {
  const [state, setState] = useState<PlamoModelState>(isTauriApp() ? "checking" : "unavailable");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriApp()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const [{ invoke }, { listen }] = await Promise.all([
        import("@tauri-apps/api/core"),
        import("@tauri-apps/api/event"),
      ]);
      unlisten = await listen<Progress>("plamo-model-progress", ({ payload }) => {
        setPercent(Math.floor((100 * payload.downloadedBytes) / Math.max(1, payload.totalBytes)));
      });
      const status = await invoke<Progress>("plamo_model_status").catch(() => null);
      if (cancelled) return;
      setState(status === null ? "error" : status.present ? "present" : "absent");
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const download = useCallback(async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    setState("downloading");
    setError(null);
    try {
      await invoke("download_plamo_model");
      setState("present");
    } catch (e) {
      setError(describePlamoError(e));
      setState("error");
    }
  }, []);

  return { state, percent, error, download };
}
