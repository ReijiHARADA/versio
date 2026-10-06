import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import type { WorkspaceNode } from "../../types/project";
import type { Paper } from "../../types/paper";
import { buildWorkspaceTree } from "../../data/workspace/tree";
import { useProjectStore } from "../../stores/projectStore";
import { showToast } from "../../stores/toastStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { useDraggablePaper } from "../library/useDraggablePaper";
import { useWorkspaceDrag } from "./useWorkspaceDrag";
import { hoverExpandId, WORKSPACE_HOVER_EXPAND_MS } from "./workspaceHoverExpand";
import { renameWorkspaceItem } from "../../services/projectService";
import styles from "./AppSidebar.module.css";

const MENU_WIDTH = 190;
const MENU_GAP = 4;

type MenuAnchor = { top: number; left: number };

function clampMenuPosition(button: DOMRect): MenuAnchor {
  const estimatedHeight = 180;
  const left = Math.min(
    Math.max(8, button.right - MENU_WIDTH),
    window.innerWidth - MENU_WIDTH - 8
  );
  let top = button.bottom + MENU_GAP;
  if (top + estimatedHeight > window.innerHeight - 8) {
    top = Math.max(8, button.top - estimatedHeight - MENU_GAP);
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
  const menuButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

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

  useLayoutEffect(() => {
    if (!openMenuId) {
      setMenuAnchor(null);
      return;
    }
    const button = menuButtonRefs.current.get(openMenuId);
    if (!button) {
      setMenuAnchor(null);
      return;
    }
    const place = () => setMenuAnchor(clampMenuPosition(button.getBoundingClientRect()));
    place();
    window.addEventListener("resize", place);
    // Reposition if the sidebar scroll container moves.
    const scrollRoot = treeRef.current?.closest(`.${styles.scroll}`) ?? treeRef.current;
    scrollRoot?.addEventListener("scroll", place, { passive: true });
    return () => {
      window.removeEventListener("resize", place);
      scrollRoot?.removeEventListener("scroll", place);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (!openMenuId) return;
    const close = () => {
      setOpenMenuId(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRefs.current.get(openMenuId)?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuId]);

  const openNode = openMenuId ? nodes.find((node) => node.id === openMenuId) : null;

  const renderMenu = (node: WorkspaceNode) => {
    if (!menuAnchor) return null;
    return createPortal(
      <div
        ref={menuRef}
        className={styles.projectMenu}
        role="menu"
        data-workspace-menu=""
        style={{ top: menuAnchor.top, left: menuAnchor.left }}
      >
        <>
            <button
              type="button"
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
              role="menuitem"
              onClick={() => {
                setOpenMenuId(null);
                onAddPaper(node);
              }}
            >
              <FilePlus2 size={14} />
              論文ファイルを追加
            </button>
            {/* TODO(folder-export): 「このフォルダを書き出す…」等。ROADMAP A6 */}
            <div className={styles.projectMenuSeparator} />
            <button
              type="button"
              role="menuitem"
              className={styles.projectMenuDanger}
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
      </div>,
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
        >
          {hasNested ? (
            <button
              type="button"
              className={styles.chevron}
              aria-label={`${node.name}を${isOpen ? "折りたたむ" : "展開"}`}
              aria-expanded={isOpen}
              onClick={toggle}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : null}
          {editingId === node.id ? (
            <div className={`${styles.item} ${styles.treeLabel}`} data-workspace-editing>
              <span className={styles.icon}>
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
              onClick={(event) => {
                if (draggingPaperId) event.preventDefault();
                setOpenMenuId(null);
              }}
            >
              <span className={styles.icon}>
                {isOpen ? <FolderOpen size={16} /> : <Folder size={16} />}
              </span>
              <span className={styles.itemLabel}>{node.name}</span>
            </NavLink>
          )}
          <button
            type="button"
            ref={(element) => {
              if (element) menuButtonRefs.current.set(node.id, element);
              else menuButtonRefs.current.delete(node.id);
            }}
            className={`${styles.projectMenuButton} ${menuOpen ? styles.projectMenuButtonOpen : ""}`}
            aria-label={`「${node.name}」のメニュー`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.stopPropagation();
              setOpenMenuId(menuOpen ? null : node.id);
            }}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
        {isOpen && (
          <div className={styles.treeNested}>
            <div className={styles.treeNestedClip}>
              {node.children.map((child) => renderNode(child, depth + 1))}
              {links.map((link) => {
                const paper = papers.find((item) => item.id === link.paperId);
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
          </div>
        )}
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
      {openNode ? renderMenu(openNode) : null}
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
  return (
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
  );
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
      <input
        ref={input}
        aria-label="名称"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
        }}
      />
    </div>
  );
}
