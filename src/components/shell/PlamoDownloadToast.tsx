import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { currentPlamoDownload, usePlamoDownloadStore } from "../settings/plamoDownload";
import { describePlamoError } from "../../services/translation/plamoReadiness";
import styles from "./PlamoDownloadToast.module.css";

type Progress = { downloadedBytes: number; totalBytes: number };
type Phase = { kind: "idle" } | { kind: "done" } | { kind: "failed"; message: string };

/** Background PLaMo install, wherever it was started. One toast that turns into the result when the install ends. */
export function PlamoDownloadToast({ raised }: { raised: boolean }) {
  const downloading = usePlamoDownloadStore((state) => state.downloading);
  const percent = usePlamoDownloadStore((state) => state.percent);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  useEffect(() => {
    const run = currentPlamoDownload();
    if (!downloading || !run) return;
    setPhase({ kind: "idle" });
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<Progress>("plamo-model-progress", ({ payload }) => {
          usePlamoDownloadStore.setState({ percent: Math.floor((100 * payload.downloadedBytes) / Math.max(1, payload.totalBytes)) });
        })
      )
      .then((fn) => (cancelled ? fn() : (unlisten = fn)))
      .catch(() => {}); // browser dev: no Tauri events
    run.then(
      () => setPhase({ kind: "done" }),
      (e: unknown) => setPhase({ kind: "failed", message: describePlamoError(e) })
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [downloading]);

  // the result stays as long as a regular toast, then the same toast fades away
  useEffect(() => {
    if (phase.kind === "idle") return;
    const timer = window.setTimeout(() => setPhase({ kind: "idle" }), phase.kind === "done" ? 3200 : 8000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (!downloading && phase.kind === "idle") return null;
  const state = phase.kind === "idle" ? "downloading" : phase.kind;
  return (
    <div className={styles.toast} data-state={state} data-raised={raised} role="status" aria-live="polite">
      {state === "downloading" ? (
        <span key="downloading" className={styles.message}>
          翻訳モデルをインストール中
          <span className={styles.percent}>{percent}%</span>
        </span>
      ) : state === "done" ? (
        <span key="done" className={styles.message}>
          <Check size={16} aria-hidden />
          翻訳モデルの準備ができました
        </span>
      ) : (
        <span key="failed" className={styles.message}>
          翻訳モデルを入れられませんでした（{phase.kind === "failed" ? phase.message : ""}）。設定 → 翻訳 から再試行できます
        </span>
      )}
      <span
        className={styles.bar}
        role="progressbar"
        aria-label="翻訳モデルのインストール"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state === "downloading" ? percent : 100}
      >
        <span className={styles.fill} style={{ width: `${state === "downloading" ? percent : 100}%` }} />
      </span>
    </div>
  );
}
