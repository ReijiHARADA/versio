import { useRef } from "react";
import {
  completePaperDrop,
  paperDropTargetAtPoint,
  usePaperDragStore,
} from "../../stores/paperDragStore";
import { usePaperSelectionStore } from "../../stores/paperSelectionStore";

const DRAG_THRESHOLD_PX = 8;
const MAX_DRAG_COVERS = 3;

/**
 * Finder rule: dragging a selected card drags the whole selection; an unselected one becomes the selection.
 * Only grid tiles carry covers; list rows and sidebar tree rows drag as a label chip.
 */
function dragPayload(paperId: string, card: HTMLElement | null): { ids: string[]; covers: string[] } {
  if (!card) return { ids: [paperId], covers: [] };
  const selection = usePaperSelectionStore.getState();
  const ids = selection.ids.has(paperId) ? [paperId, ...[...selection.ids].filter((id) => id !== paperId)] : [paperId];
  if (!selection.ids.has(paperId)) selection.select(ids, paperId);
  if (card.dataset.layout !== "grid") return { ids, covers: [] };
  const covers = ids.slice(0, MAX_DRAG_COVERS).flatMap((id) => {
    const img = document.querySelector<HTMLImageElement>(`article[data-layout="grid"][data-paper-id="${CSS.escape(id)}"] img`);
    return img?.currentSrc || img?.src ? [img.currentSrc || img.src] : [];
  });
  return { ids, covers };
}

export function useDraggablePaper(
  paperId: string,
  label: string,
  enabled = true,
  sourceNodeId?: string
) {
  const skipClick = useRef(false);
  const paperIdRef = useRef(paperId);
  const labelRef = useRef(label);
  const enabledRef = useRef(enabled);
  const sourceNodeIdRef = useRef(sourceNodeId);
  paperIdRef.current = paperId;
  labelRef.current = label;
  enabledRef.current = enabled;
  sourceNodeIdRef.current = sourceNodeId;

  const beginDrag = usePaperDragStore((state) => state.beginDrag);
  const movePointer = usePaperDragStore((state) => state.movePointer);
  const endDrag = usePaperDragStore((state) => state.endDrag);

  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (!enabledRef.current || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) return;

      skipClick.current = false;
      const card = (event.currentTarget as HTMLElement).closest<HTMLElement>("article[data-paper-id][data-layout]");
      let draggedIds: string[] = [];
      const pointerId = event.pointerId;
      const originX = event.clientX;
      const originY = event.clientY;
      let dragging = false;

      const stop = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const dx = moveEvent.clientX - originX;
        const dy = moveEvent.clientY - originY;
        if (!dragging) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          dragging = true;
          const payload = dragPayload(paperIdRef.current, card);
          draggedIds = payload.ids;
          beginDrag(draggedIds, labelRef.current, moveEvent.clientX, moveEvent.clientY, sourceNodeIdRef.current, payload.covers);
        }
        moveEvent.preventDefault();
        movePointer(
          moveEvent.clientX,
          moveEvent.clientY,
          paperDropTargetAtPoint(moveEvent.clientX, moveEvent.clientY)
        );
      };

      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        stop();
        if (!dragging) return;
        skipClick.current = true;
        const targetId = paperDropTargetAtPoint(upEvent.clientX, upEvent.clientY);
        endDrag();
        if (targetId && upEvent.type !== "pointercancel") {
          void completePaperDrop(targetId, draggedIds, sourceNodeIdRef.current ?? null);
        }
      };

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    consumeClickIfDragged: () => {
      if (!skipClick.current) return false;
      skipClick.current = false;
      return true;
    },
  };
}
