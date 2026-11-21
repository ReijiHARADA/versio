import { v4 as uuidv4 } from "uuid";
import type { WorkspacePaper } from "../../types/project";
import type { SqliteClient } from "../sqlite/client";
import type { WorkspaceNode } from "../types/workspace";
import { assertMoveAllowed, nextSiblingOrder, reorderSiblings } from "../workspace/tree";

const nowIso = () => new Date().toISOString();
const json = <T>(value: unknown): T | undefined => {
  if (typeof value !== "string" || !value) return undefined;
  try { return JSON.parse(value) as T; } catch { return undefined; }
};

function rowToNode(row: Record<string, unknown>): WorkspaceNode {
  return {
    id: String(row.id),
    parentId: row.parent_id == null ? null : String(row.parent_id),
    name: String(row.name),
    order: Number(row.sort_order),
    description: row.description == null ? undefined : String(row.description),
    researchQuestion: row.research_question == null ? undefined : String(row.research_question),
    keywords: json<string[]>(row.keywords_json),
    trashedAt: row.trashed_at == null ? null : String(row.trashed_at),
    trashRootId: row.trash_root_id == null ? null : String(row.trash_root_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
function rowToPaper(row: Record<string, unknown>): WorkspacePaper {
  return {
    nodeId: String(row.node_id), paperId: String(row.paper_id), order: Number(row.sort_order),
    note: row.note == null ? undefined : String(row.note), relevance: row.relevance == null ? undefined : Number(row.relevance),
    status: row.status == null ? undefined : row.status as WorkspacePaper["status"], decision: row.decision == null ? undefined : row.decision as WorkspacePaper["decision"],
    tags: json<string[]>(row.tags_json), quotes: json<string[]>(row.quotes_json), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}
export const listWorkspaceNodes = (db: SqliteClient) =>
  db.query("SELECT * FROM workspace_nodes WHERE trashed_at IS NULL").map(rowToNode);

export const listAllWorkspaceNodesIncludingTrashed = (db: SqliteClient) =>
  db.query("SELECT * FROM workspace_nodes").map(rowToNode);

export const listTrashedWorkspaceNodes = (db: SqliteClient) =>
  db
    .query("SELECT * FROM workspace_nodes WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC")
    .map(rowToNode);

export const getWorkspaceNode = (db: SqliteClient, id: string) => {
  const row = db.get("SELECT * FROM workspace_nodes WHERE id = ?", [id]);
  return row ? rowToNode(row) : undefined;
};

function writeNode(db: SqliteClient, node: WorkspaceNode): void {
  db.exec(
    `INSERT INTO workspace_nodes (id, parent_id, name, sort_order, description, research_question, keywords_json, trashed_at, trash_root_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id, name=excluded.name,
    sort_order=excluded.sort_order, description=excluded.description, research_question=excluded.research_question,
    keywords_json=excluded.keywords_json, trashed_at=excluded.trashed_at, trash_root_id=excluded.trash_root_id, updated_at=excluded.updated_at`,
    [
      node.id,
      node.parentId,
      node.name,
      node.order,
      node.description ?? null,
      node.researchQuestion ?? null,
      node.keywords ? JSON.stringify(node.keywords) : null,
      node.trashedAt ?? null,
      node.trashRootId ?? null,
      node.createdAt,
      node.updatedAt,
    ]
  );
}

export function createWorkspaceNode(
  db: SqliteClient,
  input: Omit<Partial<WorkspaceNode>, "order"> & { name: string }
): WorkspaceNode {
  const nodes = listWorkspaceNodes(db);
  const stamp = nowIso();
  const node: WorkspaceNode = {
    id: input.id ?? uuidv4(),
    parentId: input.parentId ?? null,
    name: input.name.trim(),
    order: nextSiblingOrder(nodes, input.parentId ?? null),
    description: input.description?.trim() || undefined,
    researchQuestion: input.researchQuestion?.trim() || undefined,
    keywords: input.keywords?.filter(Boolean),
    trashedAt: null,
    trashRootId: null,
    createdAt: input.createdAt ?? stamp,
    updatedAt: input.updatedAt ?? stamp,
  };
  if (!node.name) throw new Error("名前を入力してください");
  if (nodes.some((item) => item.id === node.id)) throw new Error("Workspace node already exists");
  assertMoveAllowed([...nodes, { ...node, parentId: null }], node.id, node.parentId);
  writeNode(db, node);
  return node;
}

function descendants(nodes: WorkspaceNode[], id: string): string[] {
  return nodes
    .filter((node) => node.parentId === id)
    .flatMap((child) => [child.id, ...descendants(nodes, child.id)]);
}

export function trashWorkspaceSubtree(db: SqliteClient, rootId: string, trashedAt: string): string[] {
  const nodes = listAllWorkspaceNodesIncludingTrashed(db);
  const root = nodes.find((node) => node.id === rootId);
  if (!root) throw new Error("Workspace node not found");
  if (root.trashedAt) throw new Error("Workspace node already in trash");
  const removed = [rootId, ...descendants(nodes, rootId)];
  db.transaction(() => {
    for (const nodeId of removed) {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node || node.trashedAt) continue;
      writeNode(db, {
        ...node,
        trashedAt,
        trashRootId: rootId,
        updatedAt: trashedAt,
      });
    }
  });
  return removed;
}

export function restoreWorkspaceTrashRoot(db: SqliteClient, trashRootId: string): WorkspaceNode[] {
  const nodes = listAllWorkspaceNodesIncludingTrashed(db);
  const group = nodes.filter((node) => node.trashRootId === trashRootId || node.id === trashRootId);
  if (group.length === 0) throw new Error("Trash folder not found");
  const stamp = nowIso();
  const active = nodes.filter((node) => !node.trashedAt);
  const restored: WorkspaceNode[] = [];
  db.transaction(() => {
    for (const node of group) {
      let parentId = node.parentId;
      if (parentId) {
        const parent = nodes.find((item) => item.id === parentId);
        const parentStillTrashed =
          parent &&
          parent.trashedAt &&
          parent.trashRootId !== trashRootId &&
          parent.id !== trashRootId;
        if (!parent || parentStillTrashed) {
          parentId = null;
        }
      }
      if (parentId) {
        const parentActive =
          active.find((item) => item.id === parentId) ??
          restored.find((item) => item.id === parentId);
        if (!parentActive && !group.some((item) => item.id === parentId)) {
          parentId = null;
        }
      }
      const next: WorkspaceNode = {
        ...node,
        parentId,
        trashedAt: null,
        trashRootId: null,
        updatedAt: stamp,
      };
      writeNode(db, next);
      restored.push(next);
    }
  });
  return restored;
}

export function permanentlyDeleteWorkspaceSubtree(db: SqliteClient, trashRootId: string): string[] {
  const nodes = listAllWorkspaceNodesIncludingTrashed(db);
  const group = nodes.filter(
    (node) => node.trashRootId === trashRootId || (node.id === trashRootId && node.trashedAt)
  );
  if (group.length === 0) {
    return deleteWorkspaceNode(db, trashRootId);
  }
  const removed = group.map((node) => node.id);
  db.transaction(() => {
    removed.forEach((nodeId) => db.exec("DELETE FROM workspace_nodes WHERE id = ?", [nodeId]));
  });
  return removed;
}

export function getExpiredTrashedWorkspaceRoots(db: SqliteClient, cutoffIso: string): string[] {
  return db
    .query<{ id: string }>(
      `SELECT id FROM workspace_nodes
       WHERE trashed_at IS NOT NULL
         AND trashed_at <= ?
         AND (trash_root_id IS NULL OR trash_root_id = id)
       ORDER BY trashed_at ASC`,
      [cutoffIso]
    )
    .map((row) => String(row.id));
}

/** Push trashed_at forward for a trash root + its members (retention grace after setting change). */
export function renewWorkspaceTrashRootTimestamps(
  db: SqliteClient,
  trashRootId: string,
  trashedAt: string
): number {
  const nodes = listAllWorkspaceNodesIncludingTrashed(db);
  const group = nodes.filter(
    (node) => node.trashRootId === trashRootId || (node.id === trashRootId && node.trashedAt)
  );
  if (group.length === 0) return 0;
  db.transaction(() => {
    for (const node of group) {
      writeNode(db, {
        ...node,
        trashedAt,
        trashRootId: node.trashRootId ?? trashRootId,
        updatedAt: trashedAt,
      });
    }
  });
  return group.length;
}

/** Hard-delete node + descendants (permanent). Prefer permanentlyDeleteWorkspaceSubtree for trash. */
export function deleteWorkspaceNode(db: SqliteClient, id: string): string[] {
  const nodes = listAllWorkspaceNodesIncludingTrashed(db);
  if (!nodes.some((node) => node.id === id)) throw new Error("Workspace node not found");
  const removed = [id, ...descendants(nodes, id)];
  db.transaction(() =>
    removed.forEach((nodeId) => db.exec("DELETE FROM workspace_nodes WHERE id = ?", [nodeId]))
  );
  return removed;
}

export function updateWorkspaceNode(
  db: SqliteClient,
  id: string,
  updates: Partial<Omit<WorkspaceNode, "id" | "parentId" | "order" | "createdAt" | "updatedAt">>
): WorkspaceNode {
  const node = getWorkspaceNode(db, id);
  if (!node) throw new Error("Workspace node not found");
  const name = updates.name === undefined ? node.name : updates.name.trim();
  if (!name) throw new Error("名前を入力してください");
  const next = { ...node, ...updates, name, updatedAt: nowIso() };
  writeNode(db, next);
  return next;
}
export const renameWorkspaceNode = (db: SqliteClient, id: string, name: string) =>
  updateWorkspaceNode(db, id, { name });
export function moveWorkspaceNode(
  db: SqliteClient,
  id: string,
  parentId: string | null,
  order?: number
): WorkspaceNode {
  const nodes = listWorkspaceNodes(db);
  assertMoveAllowed(nodes, id, parentId);
  const node = nodes.find((item) => item.id === id);
  if (!node) throw new Error("Workspace node not found");
  const siblings = nodes
    .filter((item) => item.parentId === parentId && item.id !== id)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const index =
    order === undefined ? siblings.length : Math.max(0, Math.min(siblings.length, Math.trunc(order)));
  if (!Number.isFinite(index)) throw new Error("Invalid order");
  const next = { ...node, parentId, order: index, updatedAt: nowIso() };
  siblings.splice(index, 0, next);
  db.transaction(() => siblings.forEach((item, position) => writeNode(db, { ...item, order: position })));
  return next;
}
export function reorderWorkspaceSiblings(
  db: SqliteClient,
  parentId: string | null,
  orderedIds: string[]
): void {
  for (const node of reorderSiblings(listWorkspaceNodes(db), parentId, orderedIds).filter(
    (item) => item.parentId === parentId
  )) {
    writeNode(db, { ...node, updatedAt: nowIso() });
  }
}

export const listAllWorkspacePapers = (db: SqliteClient) => db.query("SELECT * FROM workspace_papers").map(rowToPaper);
export const listWorkspacePapersByNode = (db: SqliteClient, nodeId: string) => db.query("SELECT * FROM workspace_papers WHERE node_id = ? ORDER BY sort_order", [nodeId]).map(rowToPaper);
export const listWorkspacePapersByPaper = (db: SqliteClient, paperId: string) => db.query("SELECT * FROM workspace_papers WHERE paper_id = ?", [paperId]).map(rowToPaper);
export const getWorkspacePaper = (db: SqliteClient, nodeId: string, paperId: string) => { const row = db.get("SELECT * FROM workspace_papers WHERE node_id = ? AND paper_id = ?", [nodeId, paperId]); return row ? rowToPaper(row) : undefined; };
export function saveWorkspacePaper(db: SqliteClient, link: WorkspacePaper): void {
  const node = getWorkspaceNode(db, link.nodeId);
  if (!node || node.trashedAt) throw new Error("Workspace node not found");
  db.exec(`INSERT INTO workspace_papers (node_id, paper_id, sort_order, note, relevance, status, decision, tags_json, quotes_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(node_id, paper_id) DO UPDATE SET sort_order=excluded.sort_order, note=excluded.note,
    relevance=excluded.relevance, status=excluded.status, decision=excluded.decision, tags_json=excluded.tags_json, quotes_json=excluded.quotes_json, updated_at=excluded.updated_at`,
    [link.nodeId, link.paperId, link.order, link.note ?? null, link.relevance ?? null, link.status ?? null, link.decision ?? null, link.tags ? JSON.stringify(link.tags) : null, link.quotes ? JSON.stringify(link.quotes) : null, link.createdAt, link.updatedAt]);
}
export function addPaperToWorkspace(db: SqliteClient, input: Omit<WorkspacePaper, "order" | "createdAt" | "updatedAt">): WorkspacePaper {
  if (getWorkspacePaper(db, input.nodeId, input.paperId)) throw new Error("この場所にはすでに入っています"); const stamp = nowIso();
  const link = { ...input, order: listWorkspacePapersByNode(db, input.nodeId).length, createdAt: stamp, updatedAt: stamp }; saveWorkspacePaper(db, link); return link;
}
export function movePaperInWorkspace(db: SqliteClient, paperId: string, sourceNodeId: string, targetNodeId: string): WorkspacePaper {
  const source = getWorkspacePaper(db, sourceNodeId, paperId); if (!source) throw new Error("Workspace paper not found"); if (sourceNodeId === targetNodeId) throw new Error("この場所にはすでに入っています");
  // Already placed at the target: the move just drops the source placement.
  const existing = getWorkspacePaper(db, targetNodeId, paperId); if (existing) { deleteWorkspacePaper(db, sourceNodeId, paperId); return existing; }
  const next = { ...source, nodeId: targetNodeId, order: listWorkspacePapersByNode(db, targetNodeId).length, updatedAt: nowIso() };
  db.transaction(() => { db.exec("DELETE FROM workspace_papers WHERE node_id = ? AND paper_id = ?", [sourceNodeId, paperId]); saveWorkspacePaper(db, next); }); return next;
}
export const deleteWorkspacePaper = (db: SqliteClient, nodeId: string, paperId: string) => db.exec("DELETE FROM workspace_papers WHERE node_id = ? AND paper_id = ?", [nodeId, paperId]);
