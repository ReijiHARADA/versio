import { X } from "lucide-react";
import { DisplaySettingsControls } from "./DisplaySettingsControls";
import styles from "./DisplaySettingsPanel.module.css";

type DisplaySettingsPanelProps = {
  /** Toolbar button the popover hangs from; null falls back to the top-right corner. */
  anchor: DOMRect | null;
  onClose: () => void;
};

export function DisplaySettingsPanel({ anchor, onClose }: DisplaySettingsPanelProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.panel}
        style={
          anchor
            ? {
                top: anchor.bottom + 8,
                // Right-align with the button, but never past the window edge.
                right: Math.max(16, window.innerWidth - anchor.right),
              }
            : undefined
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>表示設定</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className={styles.body}>
          <DisplaySettingsControls />
        </div>
      </div>
    </div>
  );
}
