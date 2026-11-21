import type { KeyboardEvent, ReactNode } from "react";
import { useDraggablePaper } from "./useDraggablePaper";

type DraggablePaperArticleProps = {
  paperId: string;
  label: string;
  className: string;
  enabled?: boolean;
  onOpen: () => void;
  children: ReactNode;
};

export function DraggablePaperArticle({
  paperId,
  label,
  className,
  enabled = true,
  onOpen,
  children,
}: DraggablePaperArticleProps) {
  const drag = useDraggablePaper(paperId, label, enabled);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <article
      className={className}
      onPointerDown={drag.onPointerDown}
      onDragStart={(event) => event.preventDefault()}
      onClick={() => {
        if (drag.consumeClickIfDragged()) return;
        onOpen();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => {
        // Right-click opens the paper's own "…" menu instead of WebKit's (image) menu.
        event.preventDefault();
        const trigger = event.currentTarget.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
        if (trigger?.getAttribute("aria-expanded") !== "true") trigger?.click();
      }}
      data-testid="paper-card"
      data-paper-id={paperId}
      aria-label={`論文 ${label}`}
    >
      {children}
    </article>
  );
}
