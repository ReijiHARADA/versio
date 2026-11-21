import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Inbox,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { WorkspaceNode } from "../../types/project";
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  useAppStore,
} from "../../stores/appStore";
import {
  INBOX_DROP_ID,
  usePaperDragStore,
} from "../../stores/paperDragStore";
import { setTranslationUiDeferReason } from "../../utils/batchBlockUpdates";
import { WorkspaceTree } from "./WorkspaceTree";
import styles from "./AppSidebar.module.css";

type AppSidebarProps = {
  workspaceNodes: WorkspaceNode[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewWorkspace: () => void;
  onNewChild: (node: WorkspaceNode) => void;
  onDeleteNode: (node: WorkspaceNode) => Promise<void>;
  onAddPaperToWorkspace: (node: WorkspaceNode) => void;
  activeNodeId?: string | null;
  inboxCount: number;
  /** Hide the settings footer (used by Settings GIF capture crop). */
  showSettings?: boolean;
  /** Folder ids that start collapsed (Settings GIF capture). */
  initialCollapsedIds?: readonly string[];
};

/** Below this window width the sidebar always collapses and opens on hover. */
const NARROW_WINDOW_QUERY = "(max-width: 1023px)";

function subscribeNarrow(onChange: () => void) {
  const query = window.matchMedia(NARROW_WINDOW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isNarrowWindow() {
  return window.matchMedia(NARROW_WINDOW_QUERY).matches;
}

export function AppSidebar({
  workspaceNodes,
  searchQuery,
  onSearchChange,
  onNewWorkspace,
  onNewChild,
  onDeleteNode,
  onAddPaperToWorkspace,
  activeNodeId,
  inboxCount,
  showSettings = true,
  initialCollapsedIds,
}: AppSidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const storedMode = useAppStore((state) => state.displaySettings.sidebarMode);
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrowWindow);
  // Hover-to-open only in narrow windows; a wide window is either pinned open or collapsed.
  const sidebarMode = narrow ? "auto" : storedMode === "expanded" ? "expanded" : "collapsed";
  const storedWidth = useAppStore((state) => state.displaySettings.sidebarWidth);
  const setDisplaySettings = useAppStore((state) => state.setDisplaySettings);
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  // HashRouter stores the entry index in history.state.idx; track the furthest one for "forward".
  const historyIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  const maxHistoryIdx = useRef(historyIdx);
  if (navigationType === "PUSH") maxHistoryIdx.current = historyIdx;
  else maxHistoryIdx.current = Math.max(maxHistoryIdx.current, historyIdx);
  void location; // re-render on every navigation so the idx above stays current
  const canGoBack = historyIdx > 0;
  const canGoForward = historyIdx < maxHistoryIdx.current;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
      if (e.key === "[") navigate(-1);
      else if (e.key === "]") navigate(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
  const draggingPaperId = usePaperDragStore((state) => state.draggingPaperId);
  const dropTargetId = usePaperDragStore((state) => state.dropTargetId);
  const pointerX = usePaperDragStore((state) => state.pointerX);
  const pointerY = usePaperDragStore((state) => state.pointerY);
  const [pointerOverSidebar, setPointerOverSidebar] = useState(false);
  const [draftWidth, setDraftWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const draftWidthRef = useRef<number | null>(null);

  const sidebarWidth = clampSidebarWidth(draftWidth ?? storedWidth ?? DEFAULT_SIDEBAR_WIDTH);
  draftWidthRef.current = draftWidth;

  useEffect(() => {
    if (!draggingPaperId) {
      setPointerOverSidebar(false);
      return;
    }
    const el = sidebarRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPointerOverSidebar(
      pointerX >= rect.left &&
        pointerX <= rect.right &&
        pointerY >= rect.top &&
        pointerY <= rect.bottom
    );
  }, [draggingPaperId, pointerX, pointerY]);

  // Defer streaming translation React patches while the user works in the shell
  // so sidebar open / folder create stay responsive during PLaMo translation.
  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    let idleTimer = 0;
    const deferUi = () => {
      setTranslationUiDeferReason("shell", true);
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        setTranslationUiDeferReason("shell", false);
      }, 220);
    };
    el.addEventListener("pointerdown", deferUi);
    el.addEventListener("keydown", deferUi);
    return () => {
      el.removeEventListener("pointerdown", deferUi);
      el.removeEventListener("keydown", deferUi);
      window.clearTimeout(idleTimer);
      setTranslationUiDeferReason("shell", false);
    };
  }, []);

  useEffect(() => {
    if (!resizing) return;

    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = clampSidebarWidth(drag.startWidth + (event.clientX - drag.startX));
      draftWidthRef.current = next;
      setDraftWidth(next);
    };

    const onUp = () => {
      const width = draftWidthRef.current;
      dragRef.current = null;
      setResizing(false);
      if (width != null) {
        setDisplaySettings({ sidebarWidth: clampSidebarWidth(width) });
        setDraftWidth(null);
      }
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [resizing, setDisplaySettings]);

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = { startX: event.clientX, startWidth: sidebarWidth };
      draftWidthRef.current = sidebarWidth;
      setDraftWidth(sidebarWidth);
      setResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [sidebarWidth]
  );

  const onResizeDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDraftWidth(null);
      setDisplaySettings({ sidebarWidth: DEFAULT_SIDEBAR_WIDTH });
    },
    [setDisplaySettings]
  );

  const modeClass =
    sidebarMode === "expanded" ? styles.sidebarExpanded : sidebarMode === "auto" ? styles.sidebarAuto : "";

  return (
    <div
      ref={sidebarRef}
      className={styles.rail}
      data-sidebar-mode={sidebarMode}
      data-sidebar-drop-ready={pointerOverSidebar || undefined}
      data-sidebar-resizing={resizing || undefined}
      style={
        {
          "--sidebar-expanded-w": `${sidebarWidth}px`,
        } as React.CSSProperties
      }
    >
      <div
        className={`${styles.shell} ${modeClass} ${pointerOverSidebar ? styles.sidebarDropReady : ""} ${resizing ? styles.sidebarResizing : ""}`}
      >
        <aside className={styles.sidebar}>
          <div
            className={styles.resizeHandle}
            role="separator"
            aria-orientation="vertical"
            aria-label="サイドバーの幅を変更"
            title="ドラッグで幅を変更 · ダブルクリックで戻す"
            onPointerDown={onResizePointerDown}
            onDoubleClick={onResizeDoubleClick}
          />

          {/* Title bar controls, portaled above the drag band and outside the rail stacking context. */}
          {createPortal(
            <>
              <div
                className={`${styles.titleControls} ${sidebarMode === "expanded" ? styles.titleControlsEnd : ""}`}
                style={{ "--sidebar-expanded-w": `${sidebarWidth}px` } as React.CSSProperties}
              >
              {!narrow && (
                <button
                  type="button"
                  className={styles.brandToggle}
                  onClick={() => {
                    setDisplaySettings({ sidebarMode: storedMode === "expanded" ? "auto" : "expanded" });
                  }}
                  title={storedMode === "expanded" ? "サイドバーを畳む" : "サイドバーを開く"}
                  aria-label={storedMode === "expanded" ? "サイドバーを畳む" : "サイドバーを開く"}
                >
                  {storedMode === "expanded" ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                </button>
              )}
                <button
                  type="button"
                  className={styles.historyButton}
                  onClick={() => navigate(-1)}
                  disabled={!canGoBack}
                  title="戻る (⌘[)"
                  aria-label="戻る"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  className={styles.historyButton}
                  onClick={() => navigate(1)}
                  disabled={!canGoForward}
                  title="進む (⌘])"
                  aria-label="進む"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <label className={`${styles.search} ${styles.titleSearch}`} title="ライブラリを検索 (⌘K)">
                <input
                  id="library-search"
                  type="search"
                  placeholder="ライブラリを検索"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className={styles.searchInput}
                  aria-label="ライブラリを検索"
                  data-testid="library-search"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className={styles.searchClear}
                    aria-label="検索をクリア"
                    // Keep focus in the input so the user can type again right away.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSearchChange("");
                      document.getElementById("library-search")?.focus();
                    }}
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <span className={styles.searchIcon} aria-hidden="true">
                    <Search size={14} />
                  </span>
                )}
              </label>
            </>,
            document.body
          )}

          <div className={styles.scroll}>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.label}>ワークスペース</span>
                <button
                  type="button"
                  className={styles.sectionAdd}
                  onClick={onNewWorkspace}
                  title="新規フォルダ"
                  aria-label="新規フォルダ"
                >
                  <Plus size={14} />
                </button>
              </h2>
              <WorkspaceTree
                nodes={workspaceNodes}
                activeNodeId={activeNodeId}
                dropTargetId={dropTargetId}
                draggingPaperId={draggingPaperId}
                onDelete={onDeleteNode}
                onNewChild={onNewChild}
                onAddPaper={onAddPaperToWorkspace}
                initialCollapsedIds={initialCollapsedIds}
              />
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.label}>ライブラリ</span>
              </h2>
              <nav className={styles.nav}>
                <LibItem to="/" end icon={<Library size={16} />} label="すべての論文" />
                <LibItem
                  to="/inbox"
                  icon={<Inbox size={16} />}
                  label="インボックス"
                  badge={inboxCount > 0 ? inboxCount : undefined}
                  inboxDrop
                  dropTarget={dropTargetId === INBOX_DROP_ID}
                  preventNav={Boolean(draggingPaperId)}
                />
                <LibItem to="/favorites" icon={<Star size={16} />} label="お気に入り" />
                <LibItem to="/recent" icon={<Clock size={16} />} label="最近読んだ論文" />
                <LibItem to="/trash" icon={<Trash2 size={16} />} label="ゴミ箱" />
              </nav>
            </section>
          </div>

          {showSettings ? (
            <div className={styles.footer}>
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `${styles.item} ${styles.footerButton} ${isActive ? styles.active : ""}`
                }
                title="設定"
                onClick={(event) => {
                  if (draggingPaperId) event.preventDefault();
                }}
              >
                <span className={styles.iconSlot}>
                  <Settings size={16} />
                </span>
                <span className={styles.itemLabel}>設定</span>
              </NavLink>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function LibItem({
  to,
  end,
  icon,
  label,
  badge,
  inboxDrop,
  dropTarget,
  preventNav,
}: {
  to: string;
  end?: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  inboxDrop?: boolean;
  dropTarget?: boolean;
  preventNav?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      data-inbox-drop={inboxDrop ? "" : undefined}
      className={({ isActive }) =>
        `${styles.item} ${isActive ? styles.active : ""} ${dropTarget ? styles.dropTarget : ""}`
      }
      title={label}
      onClick={(event) => {
        if (preventNav) event.preventDefault();
      }}
    >
      <span className={styles.iconSlot}>{icon}</span>
      <span className={styles.itemLabel}>{label}</span>
      {badge !== undefined && <span className={styles.badge}>{badge}</span>}
    </NavLink>
  );
}
