import { create } from "zustand";
import { showToast as showAppToast } from "./toastStore";
import { suppressTextSelection } from "../utils/dragSelection";

type PaperDropToast = {
  kind: "duplicate" | "added" | "error";
  message: string;
};

let releaseSelection: (() => void) | null = null;

export const INBOX_DROP_ID = "inbox";
const PROJECT_DROP_ATTR = "data-project-drop-id";
const INBOX_DROP_ATTR = "data-inbox-drop";

type PaperDropHandler = (
  targetId: string,
  paperId: string,
  sourceNodeId: string | null
) => void | Promise<void>;

type PaperDragState = {
  /** First dragged paper; non-null while any drag is active. */
  draggingPaperId: string | null;
  draggingPaperIds: string[];
  /** Cover image URLs of grid tiles being dragged (empty for list rows). */
  dragCovers: string[];
  sourceNodeId: string | null;
  dragLabel: string;
  pointerX: number;
  pointerY: number;
  dropTargetId: string | null;
  beginDrag: (paperIds: string[], label: string, x: number, y: number, sourceNodeId?: string, covers?: string[]) => void;
  movePointer: (x: number, y: number, dropTargetId: string | null) => void;
  endDrag: () => void;
  showToast: (toast: PaperDropToast) => void;
};

let paperDropHandler: PaperDropHandler | null = null;

export function setPaperDropHandler(handler: PaperDropHandler | null): void {
  paperDropHandler = handler;
}

export function paperDropTargetAtPoint(x: number, y: number): string | null {
  const node = document.elementFromPoint(x, y);
  if (!(node instanceof Element)) return null;
  if (node.closest("[data-paper-drop-invalid]")) return null;
  if (node.closest(`[${INBOX_DROP_ATTR}]`)) return INBOX_DROP_ID;
  return node.closest(`[${PROJECT_DROP_ATTR}]`)?.getAttribute(PROJECT_DROP_ATTR) ?? null;
}

export async function completePaperDrop(
  targetId: string,
  paperIds: string[],
  sourceNodeId: string | null
): Promise<void> {
  // Sequential so SQLite writes and membership updates stay ordered; the last toast wins.
  for (const paperId of paperIds) await paperDropHandler?.(targetId, paperId, sourceNodeId);
}

export const usePaperDragStore = create<PaperDragState>((set) => ({
  draggingPaperId: null,
  draggingPaperIds: [],
  dragCovers: [],
  sourceNodeId: null,
  dragLabel: "",
  pointerX: 0,
  pointerY: 0,
  dropTargetId: null,

  beginDrag: (paperIds, label, x, y, sourceNodeId, covers = []) => {
    document.body.classList.add("paper-dragging");
    releaseSelection?.();
    releaseSelection = suppressTextSelection();
    set({
      draggingPaperId: paperIds[0] ?? null,
      draggingPaperIds: paperIds,
      dragCovers: covers,
      sourceNodeId: sourceNodeId ?? null,
      dragLabel: label,
      pointerX: x,
      pointerY: y,
      dropTargetId: paperDropTargetAtPoint(x, y),
    });
  },

  movePointer: (x, y, dropTargetId) =>
    set({ pointerX: x, pointerY: y, dropTargetId }),

  endDrag: () => {
    document.body.classList.remove("paper-dragging");
    releaseSelection?.();
    releaseSelection = null;
    set({
      draggingPaperId: null,
      draggingPaperIds: [],
      dragCovers: [],
      sourceNodeId: null,
      dragLabel: "",
      dropTargetId: null,
    });
  },

  showToast: (toast) => {
    showAppToast({
      kind: toast.kind === "added" ? "success" : toast.kind === "duplicate" ? "info" : "error",
      message: toast.message,
    });
  },
}));
