import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import styles from "./Figure.module.css";

/** Figure/table caption: label, translated text, and a toggle for the original caption. */
export function MediaCaption({
  label,
  text,
  captionOriginal,
  canToggleOriginal,
}: {
  label: string;
  text: string;
  captionOriginal?: string;
  canToggleOriginal: boolean;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  return (
    <figcaption className={styles.caption}>
      <span className={styles.figureNumber}>{label}</span>
      {text && <span className={styles.captionText}>{text}</span>}

      {canToggleOriginal && (
        <button
          type="button"
          className={styles.toggleOriginal}
          onClick={() => setShowOriginal(!showOriginal)}
          title={showOriginal ? "原文キャプションを隠す" : "原文キャプションを表示"}
        >
          {showOriginal ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      )}

      {showOriginal && captionOriginal && (
        <p className={styles.originalCaption}>{captionOriginal}</p>
      )}
    </figcaption>
  );
}
