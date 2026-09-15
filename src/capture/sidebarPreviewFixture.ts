import type { WorkspaceNode, WorkspacePaper } from "../types/project";
import type { Paper } from "../types/paper";

const t = "2024-01-01T00:00:00.000Z";

/**
 * Fixed workspace tree for Settings behavior GIF capture.
 * Top: M1 → 感性工学 → two papers; bottom: B4 (collapsed).
 */
export const SIDEBAR_PREVIEW_WORKSPACE: WorkspaceNode[] = [
  {
    id: "ws-m1",
    parentId: null,
    name: "M1",
    order: 0,
    createdAt: t,
    updatedAt: t,
  },
  {
    id: "ws-b4",
    parentId: null,
    name: "B4",
    order: 1,
    createdAt: t,
    updatedAt: t,
  },
  {
    id: "ws-kansei",
    parentId: "ws-m1",
    name: "感性工学",
    order: 0,
    createdAt: t,
    updatedAt: t,
  },
];

/** Folder ids that start collapsed in the capture mount. */
export const SIDEBAR_PREVIEW_COLLAPSED_IDS = ["ws-b4"] as const;

export const SIDEBAR_PREVIEW_PAPERS: Paper[] = [
  {
    id: "paper-social-proof",
    sourceFilePath: "fixture/social-proof.pdf",
    sourceFileHash: "fixture-hash-social-proof",
    titleOriginal:
      "The Effect of Similarity to Others on User Cognition and Purchase-Related Behavior: Focusing on the Information Representation of Social Proof",
    titleTranslated:
      "他者との類似性がユーザーの認知と購買関連行動に与える影響：ソーシャルプルーフの情報表現に着目して",
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
  {
    id: "paper-ux-writing",
    sourceFilePath: "fixture/ux-writing.pdf",
    sourceFileHash: "fixture-hash-ux-writing",
    titleOriginal:
      "The Effect of UX Writing on User Kansei: Framing Effects from Tone and Style Changes",
    titleTranslated:
      "UX ライティングがユーザーの感性に与える影響：語調・文体の変化によるフレーミング効果",
    authors: ["Fixture"],
    publication: null,
    year: 2024,
    pageCount: 10,
    processingStatus: "ready",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: t,
    updatedAt: t,
  },
];

export const SIDEBAR_PREVIEW_MEMBERSHIPS: WorkspacePaper[] = [
  {
    nodeId: "ws-kansei",
    paperId: "paper-social-proof",
    order: 0,
    createdAt: t,
    updatedAt: t,
  },
  {
    nodeId: "ws-kansei",
    paperId: "paper-ux-writing",
    order: 1,
    createdAt: t,
    updatedAt: t,
  },
];

/** Top-left crop frame: right/bottom edges clip chrome (no settings footer). */
export const SIDEBAR_CAPTURE_VIEWPORT = { width: 640, height: 300 } as const;

/** One hover expand/collapse (or cursor wander) cycle ≈ this long. */
export const SIDEBAR_CAPTURE_CYCLE_MS = 4000;
