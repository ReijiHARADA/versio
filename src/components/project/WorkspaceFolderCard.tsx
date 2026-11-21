import { useState } from "react";
import { Folder } from "lucide-react";
import type { WorkspaceNode } from "../../types/project";
import { PaperCover } from "../library/PaperCover";
import styles from "./WorkspaceFolderCard.module.css";

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
            <path d="M0 6Q0 0 6 0H42Q46 0 48.5 3L53 8.5Q55 11 59 11H124Q130 11 130 17V94Q130 100 124 100H6Q0 100 0 94Z" />
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
