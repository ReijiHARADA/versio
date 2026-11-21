import { useEffect, useRef } from "react";
import { HardDriveDownload, Languages, Settings, WifiOff } from "lucide-react";
import styles from "./PlamoSetupScreen.module.css";

type Props = {
  onDownload: () => void;
  onClose: () => void;
};

/** Dedicated step after the intro animation: fetch the PLaMo model, or skip it for now. */
export function PlamoSetupScreen({ onDownload, onClose }: Props) {
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => primary.current?.focus(), []);

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

        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            あとで
          </button>
          <button ref={primary} type="button" className={styles.primary} onClick={onDownload}>
            ダウンロード
          </button>
        </div>
      </div>
    </section>
  );
}
