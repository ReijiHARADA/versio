import type { WorkspaceNode, WorkspacePaper } from "../types/project";
import type { Paper } from "../types/paper";

const t = "2024-01-01T00:00:00.000Z";

/** Fixed workspace tree for Settings behavior GIF capture (same for OFF/ON). */
export const SIDEBAR_PREVIEW_WORKSPACE: WorkspaceNode[] = [
  {
    id: "ws-root",
    parentId: null,
    name: "感性工学",
    order: 0,
    createdAt: t,
    updatedAt: t,
  },
  {
    id: "ws-child",
    parentId: "ws-root",
    name: "注意研究",
    order: 0,
    createdAt: t,
    updatedAt: t,
  },
  {
    id: "ws-sibling",
    parentId: null,
    name: "機械学習",
    order: 1,
    createdAt: t,
    updatedAt: t,
  },
];

export const SIDEBAR_PREVIEW_PAPERS: Paper[] = [
  {
    id: "paper-attention",
    sourceFilePath: "fixture/attention.pdf",
    sourceFileHash: "fixture-hash",
    titleOriginal: "Attention Is All You Need",
    titleTranslated: "注意機構があれば十分である",
    authors: ["Vaswani et al."],
    publication: null,
    year: 2017,
    pageCount: 15,
    processingStatus: "ready",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: t,
    updatedAt: t,
  },
];

export const SIDEBAR_PREVIEW_MEMBERSHIPS: WorkspacePaper[] = [
  {
    nodeId: "ws-child",
    paperId: "paper-attention",
    order: 0,
    createdAt: t,
    updatedAt: t,
  },
];

/** Pull-back frame: more chrome visible, content clipped at the right edge. */
export const SIDEBAR_CAPTURE_VIEWPORT = { width: 640, height: 360 } as const;

/** One auto hover cycle ≈ this long (used by ReplayablePreview). */
export const SIDEBAR_CAPTURE_CYCLE_MS = 3800;
