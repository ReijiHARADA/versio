import type { KeyboardEvent, ReactNode } from "react";
import { usePaperSelectionStore } from "../../stores/paperSelectionStore";
import { useDraggablePaper } from "./useDraggablePaper";

type DraggablePaperArticleProps = {
  paperId: string;
  label: string;
  className: string;
  enabled?: boolean;
  sourceNodeId?: string;
  /** Grid tile: joins marquee / ⌘-click selection and drags as a cover. */
  selectable?: boolean;
  onOpen: () => void;
  children: ReactNode;
};

export function DraggablePaperArticle({
  paperId,
  label,
  className,
  enabled = true,
  sourceNodeId,
  selectable = false,
  onOpen,
  children,
}: DraggablePaperArticleProps) {
  const drag = useDraggablePaper(paperId, label, enabled, sourceNodeId);
  const selected = usePaperSelectionStore((state) => selectable && state.ids.has(paperId));

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Keys typed in menus / sheets / popovers rendered inside the card (even via portal) bubble here.
    if (event.target !== event.currentTarget) return;
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
      onClick={(event) => {
        if (drag.consumeClickIfDragged()) return;
        if (selectable && event.metaKey) {
          usePaperSelectionStore.getState().toggle(paperId);
          return;
        }
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
      data-layout={selectable ? "grid" : undefined}
      data-selected={selected || undefined}
      aria-label={`論文 ${label}`}
    >
      {children}
    </article>
  );
}
