import {
  FileTextIcon as FileText,
} from "@solar-icons/react/linear";
import { usePaperDragStore } from "../../stores/paperDragStore";
import styles from "./AppShell.module.css";

export function PaperDragPreview() {
  const draggingPaperId = usePaperDragStore((state) => state.draggingPaperId);
  const count = usePaperDragStore((state) => state.draggingPaperIds.length);
  const covers = usePaperDragStore((state) => state.dragCovers);
  const dragLabel = usePaperDragStore((state) => state.dragLabel);
  const pointerX = usePaperDragStore((state) => state.pointerX);
  const pointerY = usePaperDragStore((state) => state.pointerY);

  if (!draggingPaperId) return null;

  // Grid tiles drag as their covers (Finder): a small stack under the cursor with a count badge.
  if (covers.length > 0) {
    return (
      <div className={styles.dragCovers} style={{ transform: `translate(${pointerX - 36}px, ${pointerY - 30}px)` }}>
        {covers.map((src, index) => (
          <img
            key={src}
            src={src}
            alt=""
            className={styles.dragCover}
            style={{ transform: `translate(${index * 5}px, ${index * -4}px) rotate(${index * 3}deg)`, zIndex: covers.length - index }}
          />
        ))}
        {count > 1 && <span className={styles.dragCount}>{count}</span>}
      </div>
    );
  }

  return (
    <div
      className={styles.dragPreview}
      style={{ transform: `translate(${pointerX + 14}px, ${pointerY + 10}px)` }}
    >
      <FileText size={14} strokeWidth={1.8} />
      <span>{dragLabel || "論文"}</span>
      {count > 1 && <strong className={styles.dragMore}>ほか {count - 1} 件</strong>}
    </div>
  );
}
