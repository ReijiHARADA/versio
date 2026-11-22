import { useState } from "react";
import { Folder } from "lucide-react";
import type { WorkspaceNode } from "../../types/project";
import { PaperCover } from "../library/PaperCover";
import styles from "./WorkspaceFolderCard.module.css";

// Folder back with clothoid corners (r=6, clothoidCorner() in scripts/generate-squircle-css.mjs); the tab notch keeps its curves.
const FOLDER_BACK_PATH =
  "M0 9.17L0 8.21L0.03 7.26L0.11 6.3L0.27 5.36L0.52 4.43L0.89 3.55L1.39 2.74L2.01 2.01L2.74 1.39L3.55 0.89L4.43 0.52L5.36 0.27L6.3 0.11L7.26 0.03L8.21 0L9.17 0H42Q46 0 48.5 3L53 8.5Q55 11 59 11H120.83L121.79 11L122.74 11.03L123.7 11.11L124.64 11.27L125.57 11.52L126.45 11.89L127.26 12.39L127.99 13.01L128.61 13.74L129.11 14.55L129.48 15.43L129.73 16.36L129.89 17.3L129.97 18.26L130 19.21L130 20.17V90.83L130 91.79L129.97 92.74L129.89 93.7L129.73 94.64L129.48 95.57L129.11 96.45L128.61 97.26L127.99 97.99L127.26 98.61L126.45 99.11L125.57 99.48L124.64 99.73L123.7 99.89L122.74 99.97L121.79 100L120.83 100H9.17L8.21 100L7.26 99.97L6.3 99.89L5.36 99.73L4.43 99.48L3.55 99.11L2.74 98.61L2.01 97.99L1.39 97.26L0.89 96.45L0.52 95.57L0.27 94.64L0.11 93.7L0.03 92.74L0 91.79L0 90.83Z";

type WorkspaceFolderCardProps = {
  node: WorkspaceNode;
  childFolderCount: number;
  paperCount: number;
  dropTarget?: boolean;
  onOpen: () => void;
  layout?: "list" | "grid";
  /** Papers shown peeking out of the folder in grid layout (first two are used). */
  coverPaperIds?: string[];
};

const FLAP_OPEN_MS = 220;

export function WorkspaceFolderCard({
  node,
  childFolderCount,
  paperCount,
  dropTarget = false,
  onOpen,
  layout = "list",
  coverPaperIds = [],
}: WorkspaceFolderCardProps) {
  const meta = [
    "フォルダ",
    childFolderCount > 0 ? `子フォルダ ${childFolderCount}` : null,
    `論文 ${paperCount}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const [opening, setOpening] = useState(false);
  // Grid tiles swing the front flap open before navigating; list rows open at once.
  const activate = () => {
    if (layout !== "grid" || opening) return onOpen();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onOpen();
    setOpening(true);
    window.setTimeout(() => {
      setOpening(false);
      onOpen();
    }, FLAP_OPEN_MS);
  };

  const open = {
    "data-project-drop-id": node.id,
    role: "button",
    tabIndex: 0,
    onClick: activate,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    },
  } as const;

  if (layout === "grid") {
    return (
      <article className={`${styles.tile} ${dropTarget ? styles.dropTarget : ""} ${opening ? styles.opening : ""}`} {...open}>
        <div className={styles.folderArt} aria-hidden="true">
          <svg className={styles.folderBack} viewBox="0 0 130 100">
            <path d={FOLDER_BACK_PATH} />
          </svg>
          {coverPaperIds.slice(0, 2).map((paperId, index) => (
            <PaperCover
              key={paperId}
              paperId={paperId}
              className={index === 0 ? styles.coverA : styles.coverB}
            />
          ))}
          <div className={styles.folderFront} />
        </div>
        <h3 className={styles.tileTitle} title={node.name}>
          {node.name}
        </h3>
        <p className={styles.tileMeta}>論文 {paperCount} 件</p>
      </article>
    );
  }

  return (
    <article
      className={`${styles.card} ${dropTarget ? styles.dropTarget : ""}`}
      {...open}
    >
      <div className={styles.icon}>
        <Folder size={22} strokeWidth={1.5} />
      </div>
      <div className={styles.info}>
        <h3 className={styles.title}>{node.name}</h3>
        {node.description && <p className={styles.description}>{node.description}</p>}
        <p className={styles.meta}>{meta}</p>
      </div>
    </article>
  );
}
