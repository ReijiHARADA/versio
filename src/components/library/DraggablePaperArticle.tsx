import type { KeyboardEvent, ReactNode } from "react";
import { rangeBetween, usePaperSelectionStore } from "../../stores/paperSelectionStore";
import { useDraggablePaper } from "./useDraggablePaper";

type DraggablePaperArticleProps = {
  paperId: string;
  label: string;
  className: string;
  enabled?: boolean;
  sourceNodeId?: string;
  /** Grid tiles drag as their cover; list rows as a label chip. Both join marquee / ⌘ / ⇧ selection. */
  layout?: "grid" | "list";
  onOpen: () => void;
  children: ReactNode;
};

export function DraggablePaperArticle({
  paperId,
  label,
  className,
  enabled = true,
  sourceNodeId,
  layout = "list",
  onOpen,
  children,
}: DraggablePaperArticleProps) {
  const drag = useDraggablePaper(paperId, label, enabled, sourceNodeId);
  const selected = usePaperSelectionStore((state) => state.ids.has(paperId));

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
        const selection = usePaperSelectionStore.getState();
        if (event.metaKey) {
          selection.toggle(paperId);
          return;
        }
        if (event.shiftKey) {
          const order = [...document.querySelectorAll<HTMLElement>("article[data-paper-id][data-layout]")].map((el) => el.dataset.paperId!);
          selection.select(rangeBetween(order, selection.anchor, paperId));
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
      data-layout={layout}
      data-selected={selected || undefined}
      aria-label={`論文 ${label}`}
    >
      {children}
    </article>
  );
}
