import { useEffect, useRef } from "react";
import { HardDriveDownload, Languages, Settings, WifiOff } from "lucide-react";
import type { PlamoModelState } from "../settings/usePlamoModel";
import styles from "./PlamoSetupScreen.module.css";

type Props = {
  state: PlamoModelState;
  percent: number;
  error: string | null;
  onDownload: () => void;
  onClose: () => void;
};

/** Dedicated step after the intro animation: fetch the PLaMo model, or skip it for now. */
export function PlamoSetupScreen({ state, percent, error, onDownload, onClose }: Props) {
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => primary.current?.focus(), [state]);

  const started = state === "downloading" || state === "present";

  return (
    <section className={styles.screen} aria-labelledby="plamo-setup-title" data-tauri-drag-region>
      <div className={styles.column}>
        <div className={styles.tile} aria-hidden>
          <Languages size={26} strokeWidth={1.75} />
        </div>
        <h1 id="plamo-setup-title" className={styles.title}>
          翻訳モデルを入れる
        </h1>
        <p className={styles.lead}>
          Versio は翻訳モデル PLaMo 3 Translate を使い、論文をこの Mac の中だけで翻訳します。論文がインターネットに送られることはありません。
        </p>

        <ul className={styles.facts}>
          <li>
            <HardDriveDownload size={16} aria-hidden />
            約 1.8 GB・ダウンロードは最初の 1 回だけ
          </li>
          <li>
            <WifiOff size={16} aria-hidden />
            入れたあとはオフラインでも翻訳できます
          </li>
          <li>
            <Settings size={16} aria-hidden />
            あとで「設定 → 翻訳」からも入れられます
          </li>
        </ul>

        {started ? (
          <div className={styles.progress} role="status">
            <div className={styles.bar}>
              <div className={styles.fill} style={{ width: `${state === "present" ? 100 : percent}%` }} />
            </div>
            <p className={styles.progressText}>
              {state === "present"
                ? "準備ができました"
                : `ダウンロード中… ${percent}%（このまま使い始めても裏で続きます）`}
            </p>
          </div>
        ) : null}
        {state === "error" && error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.actions}>
          {started ? (
            <button ref={primary} type="button" className={styles.primary} onClick={onClose}>
              Versio を使い始める
            </button>
          ) : (
            <>
              <button type="button" className={styles.secondary} onClick={onClose}>
                あとで
              </button>
              <button ref={primary} type="button" className={styles.primary} onClick={onDownload}>
                {state === "error" ? "もう一度ダウンロード" : "ダウンロード"}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
