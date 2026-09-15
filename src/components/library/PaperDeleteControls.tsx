import type { MouseEvent } from "react";
import { Trash2 } from "lucide-react";
import styles from "./PaperCard.module.css";

type PaperDeleteControlsProps = {
  paperId: string;
  busy: boolean;
  onRequest: (event: MouseEvent, paperId: string) => void;
};

export function PaperDeleteControls({
  paperId,
  busy,
  onRequest,
}: PaperDeleteControlsProps) {
  return (
    <button
      type="button"
      className={styles.actionButton}
      title="ライブラリから削除"
      aria-label="ライブラリから削除"
      disabled={busy}
      onClick={(event) => onRequest(event, paperId)}
    >
      <Trash2 size={16} />
    </button>
  );
}
