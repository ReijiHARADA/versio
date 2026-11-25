import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import {
  UploadIcon as Upload,
  FileAddIcon as FilePlus2,
  FileTextIcon as FileText,
  FolderIcon as Folder,
  FolderOpenIcon as FolderOpen,
  AddFolderIcon as FolderPlus,
  PenIcon as Pencil,
  QuoteIcon as Quote,
  TrashBinMinimalisticIcon as Trash2,
} from "@solar-icons/react/linear";
import type { WorkspaceNode, WorkspacePaper } from "../../types/project";
import type { Paper } from "../../types/paper";
import { buildWorkspaceTree, collectDescendantIds } from "../../data/workspace/tree";
import { useProjectStore } from "../../stores/projectStore";
import { showToast } from "../../stores/toastStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { useFolderExport } from "../../hooks/useFolderExport";
import { useDraggablePaper } from "../library/useDraggablePaper";
import { ExportDialog } from "../reader/ExportDialog";
import { useWorkspaceDrag } from "./useWorkspaceDrag";
import { hoverExpandId, WORKSPACE_HOVER_EXPAND_MS } from "./workspaceHoverExpand";
import { isWorkspaceRenameDoubleClick } from "./workspaceRenameGesture";
import { listPapersForWorkspace, renameWorkspaceItem, updateWorkspaceNodeItem } from "../../services/projectService";
import { LabelColorPicker } from "../ui/LabelColorPicker";
import { labelColorVar, type LabelColor } from "../../domain/labelColors";
import { isImeComposing } from "../../utils/ime";
import styles from "./AppSidebar.module.css";
import { Presence, MotionDiv, MOTION_EXIT_PANE_MS } from "../ui/Presence";
import motion from "../../styles/motion.module.css";

async function exportFolderCitations(node: WorkspaceNode, format: "bibtex" | "ris"): Promise<void> {
  try {
    const { exportCitations } = await import("../../services/bibliography/exportCitations");
    const papers = await listPapersForWorkspace(node.id);
    const saved = await exportCitations(papers, format, node.name);
    if (saved) showToast({ kind: "success", message: `${papers.length} 件の参考文献を書き出しました` });
  } catch (error) {
    showToast({
      kind: "error",
      message: error instanceof Error ? error.message : "参考文献の書き出しに失敗しました",
    });
  }
}

const MENU_WIDTH = 220;
const MENU_GAP = 4;

type MenuAnchor = { top: number; left: number };

function subtreePaperCount(
  nodeId: string,
  nodes: WorkspaceNode[],
  memberships: WorkspacePaper[]
): number {
  const ids = new Set([nodeId, ...collectDescendantIds(nodes, nodeId)]);
  return new Set(
    memberships.filter((link) => ids.has(link.nodeId)).map((link) => link.paperId)
  ).size;
}

function clampMenuPosition(x: number, y: number): MenuAnchor {
  const estimatedHeight = 220;
  const left = Math.min(Math.max(8, x), window.innerWidth - MENU_WIDTH - 8);
  let top = y + MENU_GAP;
  if (top + estimatedHeight > window.innerHeight - 8) {
    top = Math.max(8, y - estimatedHeight - MENU_GAP);
  }
  return { top, left };
}

export function WorkspaceTree({
  nodes,
  activeNodeId,
  dropTargetId,
  draggingPaperId,
  onDelete,
  onNewChild,
  onAddPaper,
  initialCollapsedIds,
}: {
  nodes: WorkspaceNode[];
  activeNodeId?: string | null;
  dropTargetId?: string | null;
  draggingPaperId?: string | null;
  onDelete: (node: WorkspaceNode) => Promise<void>;
  onNewChild: (node: WorkspaceNode) => void;
  onAddPaper: (node: WorkspaceNode) => void;
  /** Folder ids that start collapsed (capture fixtures / demos). */
  initialCollapsedIds?: readonly string[];
}) {
  const tree = useMemo(() => buildWorkspaceTree(nodes), [nodes]);
  const memberships = useProjectStore((state) => state.memberships);
  const papers = useLibraryCache((state) => state.papers);
  const papersById = useMemo(() => new Map(papers.map((paper) => [paper.id, paper])), [papers]);
  const folderExport = useFolderExport();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const id of initialCollapsedIds ?? []) initial[id] = true;
    return initial;
  });
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const treeRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastNodeClick = useRef<{ nodeId: string; at: number; toggled?: boolean } | null>(null);

  const drag = useWorkspaceDrag(nodes, (id) => {
    if (id) setCollapsed((current) => ({ ...current, [id]: false }));
  });
  const hoverId = draggingPaperId
    ? dropTargetId
    : drag.drop?.edge === "inside"
      ? drag.drop.id
      : null;
  const expandId = hoverExpandId(hoverId, collapsed);

  useEffect(() => {
    if (!expandId) return;
    const timer = window.setTimeout(() => {
      setCollapsed((current) => ({ ...current, [expandId]: false }));
    }, WORKSPACE_HOVER_EXPAND_MS);
    return () => window.clearTimeout(timer);
  }, [expandId]);

  useEffect(() => {
    if (!openMenuId) return;
    const close = () => {
      setOpenMenuId(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    // Fixed-position menu: close instead of following the sidebar scroll.
    const scrollRoot = treeRef.current?.closest(`.${styles.scroll}`) ?? treeRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    scrollRoot?.addEventListener("scroll", close, { passive: true });
    return () => {
      window.removeEventListener("resize", close);
      scrollRoot?.removeEventListener("scroll", close);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuId]);

  const openNode = openMenuId ? nodes.find((node) => node.id === openMenuId) : null;

  const renderMenu = (node: WorkspaceNode) => {
    if (!menuAnchor) return null;
    return createPortal(
      <MotionDiv
        ref={menuRef}
        className={`${styles.projectMenu} ${motion.popover}`}
        role="menu"
        data-workspace-menu=""
        style={{ top: menuAnchor.top, left: menuAnchor.left }}
      >
        <>
            <div className={styles.projectMenuColors}>
              <LabelColorPicker label="フォルダの色" value={node.color} onChange={(color) => void setFolderColor(node, color)} />
            </div>
            <div className={styles.projectMenuSeparator} role="separator" />
            <button
              type="button"
              className={styles.projectMenuItem}
              role="menuitem"
              onClick={() => {
                setOpenMenuId(null);
                onNewChild(node);
                setCollapsed((current) => ({ ...current, [node.id]: false }));
              }}
            >
              <FolderPlus size={14} />
              サブフォルダーを追加
            </button>
            <button
              type="button"
              className={styles.projectMenuItem}
              role="menuitem"
              onClick={() => {
                setOpenMenuId(null);
                setEditingId(node.id);
              }}
            >
              <Pencil size={14} />
              名称を変更
            </button>
            <button
              type="button"
              className={styles.projectMenuItem}
              role="menuitem"
              onClick={() => {
                setOpenMenuId(null);
                onAddPaper(node);
              }}
            >
              <FilePlus2 size={14} />
              論文ファイルを追加
            </button>
            <button
              type="button"
              className={styles.projectMenuItem}
              role="menuitem"
              disabled={subtreePaperCount(node.id, nodes, memberships) === 0}
              onClick={() => {
                setOpenMenuId(null);
                folderExport.openExport(node);
              }}
            >
              <Upload size={14} />
              このフォルダを書き出す…
            </button>
            {(["bibtex", "ris"] as const).map((format) => (
              <button
                key={format}
                type="button"
                className={styles.projectMenuItem}
                role="menuitem"
                disabled={subtreePaperCount(node.id, nodes, memberships) === 0}
                onClick={() => {
                  setOpenMenuId(null);
                  void exportFolderCitations(node, format);
                }}
              >
                <Quote size={14} />
                {format === "bibtex" ? "BibTeX" : "RIS"} を書き出す…
              </button>
            ))}
            <div className={styles.projectMenuSeparator} />
            <button
              type="button"
              role="menuitem"
              className={`${styles.projectMenuItem} ${styles.projectMenuDanger}`}
              disabled={deleting}
              onClick={() => {
                setDeleting(true);
                void onDelete(node)
                  .then(() => setOpenMenuId(null))
                  .catch((error: unknown) =>
                    showToast({
                      kind: "error",
                      message: error instanceof Error ? error.message : "削除に失敗しました",
                    })
                  )
                  .finally(() => setDeleting(false));
              }}
            >
              <Trash2 size={14} />
              {deleting ? "移動中…" : "削除"}
            </button>
          </>
      </MotionDiv>,
      document.body
    );
  };

  const renderNode = (node: ReturnType<typeof buildWorkspaceTree>[number], depth: number) => {
    const isOpen = !collapsed[node.id];
    const menuOpen = openMenuId === node.id;
    const target = drag.drop?.id === node.id ? drag.drop : null;
    const links = memberships
      .filter((link) => link.nodeId === node.id)
      .sort((a, b) => a.order - b.order);
    const hasNested = node.children.length > 0 || links.length > 0;
    const toggle = () =>
      setCollapsed((current) => ({ ...current, [node.id]: !current[node.id] }));

    return (
      <div key={node.id}>
        <div
          className={`${styles.projectRow} ${styles.treeRow} ${menuOpen ? styles.treeRowMenuOpen : ""} ${target?.error ? styles.invalidDrop : ""} ${target ? styles["drop" + target.edge] : ""} ${dropTargetId === node.id ? styles.dropinside : ""}`}
          data-workspace-id={node.id}
          data-project-drop-id={node.id}
          style={{ "--tree-indent": `${depth * 16}px` } as React.CSSProperties}
          onPointerDown={(event) => drag.onPointerDown(event, node.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            setEditingId(null);
            setMenuAnchor(clampMenuPosition(event.clientX, event.clientY));
            setOpenMenuId(node.id);
          }}
        >
          {editingId === node.id ? (
            <div className={`${styles.item} ${styles.treeLabel}`} data-workspace-editing>
              <span className={styles.icon} style={folderIconStyle(node)}>
                {isOpen ? <FolderOpen size={16} /> : <Folder size={16} />}
              </span>
              <InlineName node={node} onClose={() => setEditingId(null)} />
            </div>
          ) : (
            <NavLink
              to={`/project/${node.id}`}
              draggable={false}
              className={`${styles.item} ${styles.treeLabel} ${activeNodeId === node.id ? styles.active : ""}`}
              title={node.name}
              aria-expanded={hasNested ? isOpen : undefined}
              onClick={(event) => {
                if (draggingPaperId) {
                  event.preventDefault();
                  return;
                }
                // Navigating to a folder only expands it; clicking the folder you are already in toggles it.
                const rename = isWorkspaceRenameDoubleClick(lastNodeClick.current, node.id, event.timeStamp);
                const toggled = hasNested && activeNodeId === node.id;
                // A rename double-click undoes the fold its first click caused.
                if (rename ? lastNodeClick.current?.toggled : toggled) toggle();
                else if (hasNested && !rename) setCollapsed((current) => ({ ...current, [node.id]: false }));
                lastNodeClick.current = rename ? null : { nodeId: node.id, at: event.timeStamp, toggled };
                setOpenMenuId(null);
                if (rename) setEditingId(node.id);
              }}
            >
              <span className={styles.icon} style={folderIconStyle(node)}>
                {isOpen ? <FolderOpen size={16} /> : <Folder size={16} />}
              </span>
              <span className={styles.itemLabel}>{node.name}</span>
            </NavLink>
          )}
        </div>
        <Presence initial={false} exitMs={MOTION_EXIT_PANE_MS}>{isOpen && (
          <MotionDiv className={styles.treeNested}>
            <div
              className={styles.treeNestedClip}
              // Guide line runs 7px left of the children's indent, outside
              // the row backgrounds.
              style={{ "--tree-line-x": `${(depth + 1) * 16 - 7}px` } as React.CSSProperties}
            >
              {node.children.map((child) => renderNode(child, depth + 1))}
              {links.map((link) => {
                const paper = papersById.get(link.paperId);
                return paper ? (
                  <PaperItem
                    key={`${node.id}-${paper.id}`}
                    paper={paper}
                    depth={depth + 1}
                    sourceNodeId={node.id}
                  />
                ) : null;
              })}
            </div>
          </MotionDiv>
        )}</Presence>
      </div>
    );
  };

  return (
    <nav
      ref={treeRef}
      className={styles.nav}
      aria-label="ワークスペース"
      onClickCapture={drag.onClickCapture}
    >
      {tree.length ? (
        tree.map((node) => renderNode(node, 0))
      ) : (
        <p className={`${styles.empty} ${styles.label}`}>フォルダを追加</p>
      )}
      <div
        data-workspace-id="root"
        className={`${styles.rootDrop} ${drag.dragging ? styles.rootDropVisible : ""} ${drag.drop?.id === "root" ? styles.dropinside : ""}`}
      >
        ルートへ移動
      </div>
      <Presence>{openNode ? renderMenu(openNode) : null}</Presence>
      <ExportDialog
        open={folderExport.showExport}
        busy={folderExport.exportBusy}
        status={folderExport.exportStatus}
        error={folderExport.exportError}
        title="フォルダを書き出す"
        scopeNote={
          folderExport.target
            ? `「${folderExport.target.name}」とその子フォルダの論文 ${subtreePaperCount(folderExport.target.id, nodes, memberships)} 件を、フォルダ階層つき ZIP にまとめます。失敗した論文はスキップし report に残します。`
            : null
        }
        allowEpubSync={false}
        onClose={folderExport.closeExport}
        onExport={(values) => {
          void folderExport.handleExport(values);
        }}
      />
    </nav>
  );
}

function PaperItem({
  paper,
  depth,
  sourceNodeId,
}: {
  paper: Paper;
  depth: number;
  sourceNodeId: string;
}) {
  const label = paper.titleTranslated || paper.titleOriginal || "無題の論文";
  const drag = useDraggablePaper(paper.id, label, true, sourceNodeId);
  // Wrapper owns the tree-guide pseudo-elements; the NavLink's own are the squircle fill.
  return (
    <div>
      <NavLink
        to={`/reader/${paper.id}`}
        title={label}
        draggable={false}
        className={({ isActive }) =>
          `${styles.item} ${styles.treePaper} ${isActive ? styles.active : ""}`
        }
        style={{ "--tree-indent": `${depth * 16}px` } as React.CSSProperties}
        onPointerDown={drag.onPointerDown}
        onDragStart={(event) => event.preventDefault()}
        onClick={(event) => {
          if (drag.consumeClickIfDragged()) event.preventDefault();
        }}
      >
        <span className={styles.icon}>
          <FileText size={14} />
        </span>
        <span className={styles.itemLabel}>{label}</span>
      </NavLink>
    </div>
  );
}

const folderIconStyle = (node: WorkspaceNode): React.CSSProperties | undefined =>
  node.color ? { color: labelColorVar(node.color) } : undefined;

async function setFolderColor(node: WorkspaceNode, color: LabelColor | null) {
  try {
    const next = await updateWorkspaceNodeItem(node.id, { color });
    useProjectStore.getState().upsertWorkspaceNode(next);
  } catch (error) {
    showToast({ kind: "error", message: error instanceof Error ? error.message : "変更に失敗しました" });
  }
}

function InlineName({ node, onClose }: { node: WorkspaceNode; onClose: () => void }) {
  const [value, setValue] = useState(node.name);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const save = async () => {
    if (!value.trim()) return;
    try {
      await renameWorkspaceItem(node.id, value);
      useProjectStore.getState().upsertWorkspaceNode({ ...node, name: value.trim() });
      onClose();
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "変更に失敗しました",
      });
    }
  };
  return (
    <div className={styles.inlineName}>
      <div className={styles.inlineField}>
        <input
          ref={input}
          aria-label="名称"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (isImeComposing(event)) return;
            if (event.key === "Escape") onClose();
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
          }}
        />
      </div>
    </div>
  );
}
