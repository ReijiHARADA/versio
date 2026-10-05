import type { WorkspaceNode, WorkspacePaper } from "../types/project";
import type { Paper } from "../types/paper";

const t = "2024-01-01T00:00:00.000Z";

/**
 * Fixed workspace tree for Settings behavior GIF capture.
 * Mirrors a typical nested reading setup (path + selected folder + paper).
 */
export const SIDEBAR_PREVIEW_WORKSPACE: WorkspaceNode[] = [
  {
    id: "ws-masters",
    parentId: null,
    name: "修士研究",
    order: 0,
    createdAt: t,
    updatedAt: t,
  },
  {
    id: "ws-aa",
    parentId: null,
    name: "ああ",
    order: 1,
    createdAt: t,
    updatedAt: t,
  },
  {
    id: "ws-m1",
    parentId: null,
    name: "M1",
    order: 2,
    createdAt: t,
    updatedAt: t,
  },
  {
    id: "ws-jewelry",
    parentId: "ws-masters",
    name: "Interactive jewelry",
    order: 0,
    createdAt: t,
    updatedAt: t,
  },
];

/** Folder ids that start collapsed in the capture mount. */
export const SIDEBAR_PREVIEW_COLLAPSED_IDS = ["ws-aa", "ws-m1"] as const;

export const SIDEBAR_PREVIEW_ACTIVE_NODE_ID = "ws-jewelry";

export const SIDEBAR_PREVIEW_PAPERS: Paper[] = [
  {
    id: "paper-interactive-jewelry",
    sourceFilePath: "fixture/interactive-jewelry.pdf",
    sourceFileHash: "fixture-hash-interactive-jewelry",
    titleOriginal: "Interactive Jewelry",
    titleTranslated: "インタラクティブジュエリー",
    authors: ["Fixture"],
    publication: null,
    year: 2024,
    pageCount: 12,
    processingStatus: "ready",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: t,
    updatedAt: t,
  },
];

export const SIDEBAR_PREVIEW_MEMBERSHIPS: WorkspacePaper[] = [
  {
    nodeId: "ws-jewelry",
    paperId: "paper-interactive-jewelry",
    order: 0,
    createdAt: t,
    updatedAt: t,
  },
];

/** Top-left crop frame: right/bottom edges clip chrome (no settings footer). */
export const SIDEBAR_CAPTURE_VIEWPORT = { width: 680, height: 340 } as const;

/** One hover expand/collapse (or cursor wander) cycle ≈ this long. */
export const SIDEBAR_CAPTURE_CYCLE_MS = 4000;
