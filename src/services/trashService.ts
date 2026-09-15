import type { Paper } from "../types/paper";
import type { WorkspaceNode } from "../types/project";
import { getStorage } from "../data/runtime";
import {
  getExpiredTrashedPaperIndexes,
  getPaperIndex,
  getTrashedPaperIndexes,
  setPaperTrashedAt,
} from "../data/repositories/paperRepository";
import {
  getExpiredTrashedWorkspaceRoots,
  listTrashedWorkspaceNodes,
  permanentlyDeleteWorkspaceSubtree,
  restoreWorkspaceTrashRoot,
  trashWorkspaceSubtree,
} from "../data/repositories/workspaceRepository";
import { deletePaperEverywhere } from "./paperDelete";
import { translationManager } from "./translation";
import {
  getTrashRetentionDays,
  isTrashAutoDeleteEnabled,
  trashExpiryCutoffIso,
} from "./trashRetention";

export type TrashPaperItem = {
  kind: "paper";
  id: string;
  name: string;
  trashedAt: string;
  paper: Paper;
};

export type TrashFolderItem = {
  kind: "folder";
  id: string;
  name: string;
  trashedAt: string;
  node: WorkspaceNode;
  childFolderCount: number;
};

export type TrashItem = TrashPaperItem | TrashFolderItem;

function paperDisplayName(paper: Paper): string {
  return (
    paper.titleTranslated?.trim() ||
    paper.titleOriginal?.trim() ||
    paper.sourceFileName?.trim() ||
    "無題の論文"
  );
}

export async function movePaperToTrash(paperId: string): Promise<Paper> {
  const { db } = await getStorage();
  const paper = getPaperIndex(db, paperId);
  if (!paper) throw new Error("論文が見つかりません");
  if (paper.trashedAt) return paper;
  const trashedAt = new Date().toISOString();
  translationManager.cancel(paperId);
  setPaperTrashedAt(db, paperId, trashedAt);
  const next = getPaperIndex(db, paperId);
  if (!next) throw new Error("ゴミ箱への移動に失敗しました");
  return next;
}

export async function restorePaperFromTrash(paperId: string): Promise<Paper> {
  const { db } = await getStorage();
  const paper = getPaperIndex(db, paperId);
  if (!paper) throw new Error("論文が見つかりません");
  if (!paper.trashedAt) return paper;
  setPaperTrashedAt(db, paperId, null);
  const next = getPaperIndex(db, paperId);
  if (!next) throw new Error("復元に失敗しました");
  return next;
}

export async function permanentlyDeletePaper(paperId: string): Promise<void> {
  await deletePaperEverywhere(paperId);
}

export async function moveWorkspaceFolderToTrash(nodeId: string): Promise<{
  removedIds: string[];
  root: WorkspaceNode;
}> {
  const { db } = await getStorage();
  const trashedAt = new Date().toISOString();
  const removedIds = trashWorkspaceSubtree(db, nodeId, trashedAt);
  const root = listTrashedWorkspaceNodes(db).find((node) => node.id === nodeId);
  if (!root) throw new Error("フォルダのゴミ箱移動に失敗しました");
  return { removedIds, root };
}

export async function restoreWorkspaceFolderFromTrash(
  trashRootId: string
): Promise<WorkspaceNode[]> {
  const { db } = await getStorage();
  return restoreWorkspaceTrashRoot(db, trashRootId);
}

export async function permanentlyDeleteWorkspaceFolder(trashRootId: string): Promise<string[]> {
  const { db } = await getStorage();
  return permanentlyDeleteWorkspaceSubtree(db, trashRootId);
}

export async function listTrashItems(): Promise<TrashItem[]> {
  const { db } = await getStorage();
  const papers = getTrashedPaperIndexes(db).map((paper): TrashPaperItem => ({
    kind: "paper",
    id: paper.id,
    name: paperDisplayName(paper),
    trashedAt: paper.trashedAt!,
    paper,
  }));

  const nodes = listTrashedWorkspaceNodes(db);
  const roots = nodes.filter(
    (node) => !node.trashRootId || node.trashRootId === node.id
  );
  const folders = roots.map((node): TrashFolderItem => {
    const children = nodes.filter(
      (item) => item.trashRootId === node.id && item.id !== node.id
    );
    return {
      kind: "folder",
      id: node.id,
      name: node.name,
      trashedAt: node.trashedAt!,
      node,
      childFolderCount: children.length,
    };
  });

  return [...papers, ...folders].sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
}

export async function purgeExpiredTrash(now = new Date()): Promise<{
  papers: number;
  folders: number;
}> {
  const retentionDays = await getTrashRetentionDays();
  if (!isTrashAutoDeleteEnabled(retentionDays)) {
    return { papers: 0, folders: 0 };
  }
  const cutoff = trashExpiryCutoffIso(retentionDays, now);
  const { db } = await getStorage();

  const expiredPapers = getExpiredTrashedPaperIndexes(db, cutoff);
  for (const paper of expiredPapers) {
    await deletePaperEverywhere(paper.id);
  }

  const expiredRoots = getExpiredTrashedWorkspaceRoots(db, cutoff);
  for (const rootId of expiredRoots) {
    permanentlyDeleteWorkspaceSubtree(db, rootId);
  }

  return { papers: expiredPapers.length, folders: expiredRoots.length };
}

export async function emptyTrash(): Promise<{ papers: number; folders: number }> {
  const { db } = await getStorage();
  const papers = getTrashedPaperIndexes(db);
  for (const paper of papers) {
    await deletePaperEverywhere(paper.id);
  }
  const nodes = listTrashedWorkspaceNodes(db);
  const roots = nodes.filter(
    (node) => !node.trashRootId || node.trashRootId === node.id
  );
  for (const root of roots) {
    permanentlyDeleteWorkspaceSubtree(db, root.id);
  }
  return { papers: papers.length, folders: roots.length };
}
