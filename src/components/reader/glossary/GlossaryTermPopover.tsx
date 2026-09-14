import { InfoPopover } from "../InfoPopover";
import styles from "../InfoPopover.module.css";
import type { GlossaryEntry } from "../../../services/llm/types";
import type { AnchorBox } from "../memo/popoverPosition";

type GlossaryTermPopoverProps = {
  entry: GlossaryEntry;
  anchor: AnchorBox;
  onClose: () => void;
  onOpenInspector?: () => void;
};

export function GlossaryTermPopover({
  entry,
  anchor,
  onClose,
  onOpenInspector,
}: GlossaryTermPopoverProps) {
  return (
    <InfoPopover
      anchor={anchor}
      title="用語"
      onClose={onClose}
      footer={
        onOpenInspector ? (
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              onOpenInspector();
              onClose();
            }}
          >
            用語集を開く
          </button>
        ) : null
      }
    >
      <p className={styles.term}>{entry.term}</p>
      <p className={styles.translation}>{entry.translation}</p>
      {entry.definition ? <p className={styles.definition}>{entry.definition}</p> : null}
    </InfoPopover>
  );
}
