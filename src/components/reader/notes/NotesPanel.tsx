import type { Annotation } from "../../../types/annotation";
import { AnnotationCard } from "./AnnotationCard";
import panelStyles from "../SidePanel.module.css";
import styles from "./NotesPanel.module.css";

type NotesPanelProps = {
  annotations: Annotation[];
  activeIds: string[];
  onSelect: (annotation: Annotation) => void;
  onDelete: (annotation: Annotation) => void;
  onClose: () => void;
};

export function NotesPanel({
  annotations,
  activeIds,
  onSelect,
  onDelete,
  onClose,
}: NotesPanelProps) {
  return (
    <aside className={panelStyles.panel} aria-label="メモ一覧">
      <header className={panelStyles.header}>
        <h2 className={panelStyles.title}>メモ</h2>
        <button type="button" className={panelStyles.close} onClick={onClose}>
          閉じる
        </button>
      </header>

      <p className={styles.hint}>一覧から選ぶと、本文の該当位置へ移動します。</p>

      <div className={styles.list}>
        {annotations.length === 0 ? (
          <p className={styles.empty}>この論文のメモはまだありません</p>
        ) : (
          annotations.map((annotation) => (
            <AnnotationCard
              key={annotation.id}
              annotation={annotation}
              active={activeIds.includes(annotation.id)}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </aside>
  );
}
