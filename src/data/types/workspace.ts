export type WorkspaceNode = {
  id: string;
  parentId: string | null;
  name: string;
  order: number;
  description?: string;
  researchQuestion?: string;
  keywords?: string[];
  /** ISO timestamp when moved to Trash; null/undefined means active. */
  trashedAt?: string | null;
  /** Top-level folder id for a trash operation (shared by subtree). */
  trashRootId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceTreeNode = WorkspaceNode & {
  children: WorkspaceTreeNode[];
};
