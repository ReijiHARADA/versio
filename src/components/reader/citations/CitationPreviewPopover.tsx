import { InfoPopover, anchorFromEventTarget } from "../InfoPopover";
import styles from "../InfoPopover.module.css";
import type { CitationPreviewModel } from "./citationPreview";
import type { AnchorBox } from "../memo/popoverPosition";
import { openExternalUrl } from "../../../services/openExternalUrl";

type CitationPreviewPopoverProps = {
  model: CitationPreviewModel;
  anchor: AnchorBox;
  onClose: () => void;
  onJump: (targetId: string) => void;
};

export function CitationPreviewPopover({
  model,
  anchor,
  onClose,
  onJump,
}: CitationPreviewPopoverProps) {
  const hasStructured = Boolean(model.title || model.authors || model.year);
  return (
    <InfoPopover
      anchor={anchor}
      title={`参考文献 [${model.key}]`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              onJump(model.targetId);
              onClose();
            }}
          >
            参考文献へ移動
          </button>
          {model.doiUrl ? (
            <button
              type="button"
              className={styles.action}
              onClick={() => void openExternalUrl(model.doiUrl!)}
            >
              DOIを開く
            </button>
          ) : null}
          {model.externalUrl && model.externalUrl !== model.doiUrl ? (
            <button
              type="button"
              className={styles.action}
              onClick={() => void openExternalUrl(model.externalUrl!)}
            >
              リンクを開く
            </button>
          ) : null}
        </>
      }
    >
      {hasStructured ? (
        <>
          {model.title ? <p className={styles.term}>{model.title}</p> : null}
          {model.authors ? <p className={styles.meta}>{model.authors}</p> : null}
          {model.year ? <p className={styles.meta}>{model.year}</p> : null}
        </>
      ) : (
        <p className={styles.raw}>{model.rawText}</p>
      )}
    </InfoPopover>
  );
}

export { anchorFromEventTarget };
