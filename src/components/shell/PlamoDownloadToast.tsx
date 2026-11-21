import { useEffect, useState } from "react";
import { currentPlamoDownload, usePlamoDownloadStore } from "../settings/plamoDownload";
import { describePlamoError } from "../../services/translation/plamoReadiness";
import { showToast } from "../../stores/toastStore";
import styles from "./PlamoDownloadToast.module.css";

type Progress = { downloadedBytes: number; totalBytes: number };

/** Background PLaMo install, wherever it was started: stays at the bottom until done, then hands off to a normal toast. */
export function PlamoDownloadToast({ raised }: { raised: boolean }) {
  const downloading = usePlamoDownloadStore((state) => state.downloading);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const run = currentPlamoDownload();
    if (!downloading || !run) return;
    setPercent(0);
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<Progress>("plamo-model-progress", ({ payload }) => {
        setPercent(Math.floor((100 * payload.downloadedBytes) / Math.max(1, payload.totalBytes)));
      }).then((fn) => (cancelled ? fn() : (unlisten = fn)))
    );
    run.then(
      () => showToast({ kind: "success", message: "翻訳モデルの準備ができました" }),
      (e: unknown) => showToast({ kind: "error", message: `翻訳モデルを入れられませんでした（${describePlamoError(e)}）。設定 → 翻訳 から再試行できます` })
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [downloading]);

  if (!downloading) return null;
  return (
    <div className={styles.toast} data-raised={raised} role="status" aria-live="polite">
      <div className={styles.row}>
        <span>翻訳モデルをインストール中</span>
        <span className={styles.percent}>{percent}%</span>
      </div>
      <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="翻訳モデルのインストール">
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
