import type { Annotation } from "../../../types/annotation";
import { AnnotationCard } from "./AnnotationCard";
import styles from "./NotesPanel.module.css";

type NotesPanelProps = {
  annotations: Annotation[];
  activeIds: string[];
  onSelect: (annotation: Annotation) => void;
  onDelete: (annotation: Annotation) => void;
};

export function NotesPanel({
  annotations,
  activeIds,
  onSelect,
  onDelete,
}: NotesPanelProps) {
  return (
    <>

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
    </>
  );
}
