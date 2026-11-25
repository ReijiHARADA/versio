import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FileTextIcon as FileText,
  FolderIcon as Folder,
  CloseIcon as X,
} from "@solar-icons/react/linear";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { releasePaperBody } from "../../services/paperBodyRelease";
import { parseTab, tabForPath, tabPath, usePaperTabs, type TabKey } from "../../stores/paperTabsStore";
import { useSplitView } from "../../stores/splitViewStore";
import { displayPaperTitle } from "../../services/translation/quality";
import type { Paper } from "../../types/paper";
import {
  TAB_CAP_LEFT_FILL,
  TAB_CAP_LEFT_STROKE,
  TAB_CAP_RIGHT_FILL,
  TAB_CAP_RIGHT_STROKE,
  TAB_CAP_WIDTH,
  TAB_FLARE,
  TAB_FLUSH_CAP_WIDTH,
  TAB_FLUSH_DROP,
  TAB_FLUSH_LEFT_FILL,
  TAB_FLUSH_LEFT_STROKE,
  TAB_HEIGHT,
} from "./paperTabShape";
import styles from "./PaperTabBar.module.css";

const DRAG_THRESHOLD = 4;
/** How far below the strip a paper tab must be pulled before it becomes a split-view drop. */
const SPLIT_PULL = 24;
const SETTLE_MS = 180;

type TabDrag = {
  id: TabKey;
  startX: number;
  startY: number;
  moved: boolean;
  /** Tab order and slot rects frozen at drag start; neighbours are shifted by transforms only. */
  keys: TabKey[];
  slots: { left: number; width: number }[];
  from: number;
  to: number;
  dx: number;
  shift: number;
  mode: "reorder" | "split";
  overSplit: boolean;
};
type DragView = Pick<TabDrag, "id" | "from" | "to" | "dx" | "shift" | "keys" | "mode" | "overSplit"> & { x: number; y: number };
/** Keeps the outer flares on the card's straight top edge, clear of its rounded corners. */
const EDGE_PAD = 24;
const isTranslating = (paper: Paper) =>
  paper.processingStatus === "translating" || paper.processingStatus === "glossary";

/** Chrome-style paper / folder tabs in the title bar strip above the main card. */
export function PaperTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const tabs = usePaperTabs((state) => state.tabs);
  const papers = useLibraryCache((state) => state.papers);
  const workspaceNodes = useProjectStore((state) => state.workspaceNodes);
  const workspaceLoaded = useProjectStore((state) => state.loaded);
  const activeId = tabForPath(location.pathname);
  const splitPaperId = useSplitView((state) => state.paperId);
  const lastActiveRef = useRef<TabKey | null>(null);
  const lastPagePathRef = useRef("/");
  const barRef = useRef<HTMLDivElement>(null);
  const [inset, setInset] = useState({ left: 0, right: 0 });
  // Tabs restored at launch appear in place; tabs opened later grow in (see .entering).
  const settledRef = useRef<Set<string> | null>(null);
  if (settledRef.current === null) settledRef.current = new Set(tabs);
  const [, setSettledVersion] = useState(0);
  const settle = (key: TabKey) => {
    if (settledRef.current?.has(key)) return;
    settledRef.current?.add(key);
    setSettledVersion((v) => v + 1);
  };

  // The route decides the active tab; opening a paper or folder anywhere opens (or focuses) its tab.
  useEffect(() => {
    if (activeId) {
      usePaperTabs.getState().openTab(activeId, lastActiveRef.current);
      lastActiveRef.current = activeId;
    } else {
      lastPagePathRef.current = location.pathname + location.search;
    }
  }, [activeId, location.pathname, location.search]);

  // Drop tabs of trashed or deleted papers / folders once each list has loaded.
  useEffect(() => {
    const livePapers = papers.length > 0 ? new Set(papers.filter((paper) => !paper.trashedAt).map((paper) => paper.id)) : null;
    const liveFolders = workspaceLoaded ? new Set(workspaceNodes.map((node) => node.id)) : null;
    const before = usePaperTabs.getState().tabs;
    usePaperTabs.getState().retainTabs((key) => {
      if (key === activeId) return true;
      const { kind, id } = parseTab(key);
      const live = kind === "paper" ? livePapers : liveFolders;
      return !live || live.has(id);
    });
    const after = new Set(usePaperTabs.getState().tabs);
    for (const key of before) {
      const { kind, id } = parseTab(key);
      if (kind === "paper" && !after.has(key)) releasePaperBody(id);
    }
  }, [papers, workspaceNodes, workspaceLoaded, activeId]);

  // Keep clear of the fixed title bar controls (back/forward) and the search field.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => {
      const rect = bar.getBoundingClientRect();
      const leftEdge = document.querySelector("[data-titlebar-left]")?.getBoundingClientRect().right ?? 0;
      const rightEdge = document.querySelector("[data-titlebar-right]")?.getBoundingClientRect().left ?? Infinity;
      const left = Math.max(0, Math.ceil(leftEdge + 8 - rect.left));
      const right = Math.max(0, Math.ceil(rect.right - (rightEdge - 8)));
      setInset((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const closeTab = useCallback(
    (key: TabKey) => {
      const next = usePaperTabs.getState().closeTab(key);
      const { kind: closedKind, id: closedId } = parseTab(key);
      if (closedKind === "paper" && useSplitView.getState().paperId === closedId) useSplitView.getState().closeSplit();
      // A closed paper no longer needs its body kept warm (see useReaderDocument).
      const { kind, id } = parseTab(key);
      if (kind === "paper" && key !== activeId) releasePaperBody(id);
      if (key !== activeId) return;
      lastActiveRef.current = null;
      navigate(next ? tabPath(next) : lastPagePathRef.current);
    },
    [activeId, navigate]
  );

  const openTab = useCallback(
    (key: TabKey) => {
      // The paper in the split pane is already on screen; its tab only marks it.
      if (key === activeId || parseTab(key).id === useSplitView.getState().paperId) return;
      navigate(tabPath(key));
    },
    [activeId, navigate]
  );

  // ⌘1–9 jumps to a tab (⌘9 = last), ⌃Tab / ⌃⇧Tab cycles.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { tabs: list } = usePaperTabs.getState();
      if (list.length === 0) return;
      if (event.metaKey && !event.ctrlKey && !event.altKey && /^[1-9]$/.test(event.key)) {
        const n = Number(event.key);
        const target = n === 9 ? list[list.length - 1] : list[n - 1];
        if (!target) return;
        event.preventDefault();
        openTab(target);
      } else if (event.ctrlKey && !event.metaKey && event.key === "Tab") {
        event.preventDefault();
        const index = activeId ? list.indexOf(activeId) : -1;
        const step = event.shiftKey ? -1 : 1;
        const next = index < 0 ? (step > 0 ? 0 : list.length - 1) : (index + step + list.length) % list.length;
        openTab(list[next]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, openTab]);

  // ⌘W (menu "close-tab"): close the active tab; elsewhere close the window.
  useEffect(() => {
    const onCloseTab = (event: Event) => {
      if (!activeId) return;
      event.preventDefault();
      closeTab(activeId);
    };
    window.addEventListener("versio:close-tab", onCloseTab);
    return () => window.removeEventListener("versio:close-tab", onCloseTab);
  }, [activeId, closeTab]);

  // Chrome-style pointer drag (HTML5 drag-and-drop is unreliable in WKWebView). The dragged tab
  // follows the pointer while its neighbours glide aside; the order is committed on release, then
  // the tab settles into its slot. Pulled down onto the card's left half, a paper tab opens there
  // as a split pane.
  const dragRef = useRef<TabDrag | null>(null);
  const [drag, setDrag] = useState<DragView | null>(null);
  const settleRef = useRef<{ id: TabKey; offset: number } | null>(null);
  const onPointerDown = (event: React.PointerEvent, key: TabKey) => {
    if (event.button !== 0) return;
    dragRef.current = { id: key, startX: event.clientX, startY: event.clientY, moved: false, from: -1, keys: [], slots: [], shift: 0, to: -1, dx: 0, mode: "reorder", overSplit: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < DRAG_THRESHOLD) return;
      const items = [...(barRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? [])];
      d.keys = items.map((item) => item.dataset.tabId as TabKey);
      d.slots = items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { left: rect.left, width: rect.width };
      });
      d.from = d.keys.indexOf(d.id);
      if (d.from < 0) return;
      const next = d.slots[d.from + 1] ?? d.slots[d.from - 1];
      const own = d.slots[d.from];
      // Neighbours move by the dragged tab's width plus the gap between tabs.
      const gap = next ? Math.abs(next.left - own.left) - (next.left > own.left ? own.width : next.width) : 0;
      d.shift = own.width + Math.max(0, gap);
      d.to = d.from;
      d.moved = true;
    }
    const barRect = barRef.current?.getBoundingClientRect();
    const canSplit = parseTab(d.id).kind === "paper";
    const pulledDown = canSplit && barRect != null && event.clientY > barRect.bottom + SPLIT_PULL;
    if (pulledDown) {
      const card = document.querySelector("[data-main-pane]")?.getBoundingClientRect();
      d.mode = "split";
      d.overSplit = card != null && event.clientX >= card.left && event.clientX < card.left + card.width / 2 && event.clientY >= card.top && event.clientY <= card.bottom;
      d.dx = 0;
      d.to = d.from;
    } else {
      d.mode = "reorder";
      d.overSplit = false;
      const own = d.slots[d.from];
      const first = d.slots[0];
      const last = d.slots[d.slots.length - 1];
      const dx = event.clientX - d.startX;
      d.dx = Math.min(last.left + last.width - (own.left + own.width), Math.max(first.left - own.left, dx));
      const center = own.left + own.width / 2 + d.dx;
      let to = d.from;
      for (let i = d.from + 1; i < d.slots.length; i++) if (center > d.slots[i].left + d.slots[i].width / 2) to = i;
      for (let i = d.from - 1; i >= 0; i--) if (center < d.slots[i].left + d.slots[i].width / 2) to = i;
      d.to = to;
    }
    setDrag({ id: d.id, from: d.from, to: d.to, dx: d.dx, shift: d.shift, keys: d.keys, mode: d.mode, overSplit: d.overSplit, x: event.clientX, y: event.clientY });
  };
  const endDrag = (key: TabKey, commit: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (!d.moved) {
      if (commit) openTab(key);
      return;
    }
    if (commit && d.mode === "split" && d.overSplit) {
      openSplitFromTab(d.id);
      return;
    }
    const to = commit && d.mode === "reorder" ? d.to : d.from;
    const own = d.slots[d.from];
    const finalLeft = to > d.from ? d.slots[to].left + d.slots[to].width - own.width : to < d.from ? d.slots[to].left : own.left;
    const offset = own.left + d.dx - finalLeft;
    if (to !== d.from) {
      const list = usePaperTabs.getState().tabs;
      const without = list.filter((item) => item !== d.id);
      const at = without.indexOf(d.keys[to]);
      if (at >= 0) usePaperTabs.getState().moveTab(d.id, to > d.from ? at + 1 : at);
    }
    if (Math.abs(offset) > 0.5) settleRef.current = { id: d.id, offset };
  };
  // Released tab glides from where the pointer left it into its (new) slot.
  useLayoutEffect(() => {
    const settle = settleRef.current;
    if (!settle || drag) return;
    settleRef.current = null;
    const el = barRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(settle.id)}"]`);
    el?.animate([{ transform: `translateX(${settle.offset}px)` }, { transform: "translateX(0)" }], { duration: SETTLE_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" });
  });

  // Dropped on the card's left half: the paper opens there; if it was the page on the right,
  // the right side moves on to a neighbouring tab (or back to the last page).
  const openSplitFromTab = (key: TabKey) => {
    const { id } = parseTab(key);
    useSplitView.getState().openSplit(id);
    if (key !== activeId) return;
    const list = usePaperTabs.getState().tabs;
    const index = list.indexOf(key);
    const rest = list.filter((item) => item !== key);
    const next = rest[index] ?? rest[index - 1] ?? null;
    lastActiveRef.current = null;
    navigate(next ? tabPath(next) : lastPagePathRef.current);
  };

  const tabTransform = (key: TabKey): string | undefined => {
    if (!drag) return undefined;
    const index = drag.keys.indexOf(key);
    if (key === drag.id) return drag.mode === "reorder" && drag.dx !== 0 ? `translateX(${drag.dx}px)` : undefined;
    if (drag.to > drag.from && index > drag.from && index <= drag.to) return `translateX(${-drag.shift}px)`;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return `translateX(${drag.shift}px)`;
    return undefined;
  };

  const byId = new Map(papers.map((paper) => [paper.id, paper]));
  const nodeById = new Map(workspaceNodes.map((node) => [node.id, node]));
  type VisibleTab = { key: TabKey; kind: "paper" | "folder"; title: string; translating: boolean };
  const visible = tabs.flatMap((key): VisibleTab[] => {
    const { kind, id } = parseTab(key);
    if (kind === "paper") {
      const paper = byId.get(id);
      return paper ? [{ key, kind, title: displayPaperTitle(paper), translating: isTranslating(paper) }] : [];
    }
    const node = nodeById.get(id);
    return node ? [{ key, kind, title: node.name || "名称未設定", translating: false }] : [];
  });
  // Tabs start on the card's left edge (one vertical line) unless the title bar controls are in
  // the way; then they move right far enough for the flare to clear the card's corner.
  const paddingLeft = inset.left > 0 ? Math.max(EDGE_PAD, inset.left) : 0;

  return (
    <div
      ref={barRef}
      className={`${styles.bar} ${drag ? styles.reordering : ""}`}
      data-tauri-drag-region
      role="tablist"
      aria-label="開いている論文とフォルダ"
      style={{ paddingLeft, paddingRight: Math.max(EDGE_PAD + 10, inset.right) }}
    >
      {visible.map(({ key: id, kind, title, translating }, index) => {
        const active = id === activeId;
        const inSplit = kind === "paper" && parseTab(id).id === splitPaperId;
        const Icon = kind === "folder" ? Folder : FileText;
        return (
          <div
            key={id}
            data-tab-id={id}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            title={title}
            className={`${styles.tab} ${active ? styles.active : ""} ${inSplit ? styles.inSplit : ""} ${drag?.id === id ? (drag.mode === "split" ? styles.pulled : styles.dragging) : ""} ${settledRef.current?.has(id) ? "" : styles.entering}`}
            style={{ transform: tabTransform(id) }}
            onAnimationEnd={(event) => { if (event.target === event.currentTarget) settle(id); }}
            onPointerDown={(event) => onPointerDown(event, id)}
            onPointerMove={onPointerMove}
            onPointerUp={() => endDrag(id, true)}
            onPointerCancel={() => endDrag(id, false)}
            onAuxClick={(event) => { if (event.button === 1) closeTab(id); }}
            onKeyDown={(event) => { if (event.key === "Enter") openTab(id); }}
          >
            {active && <ActiveTabShape flushLeft={index === 0 && paddingLeft === 0} />}
            <Icon className={styles.icon} size={14} strokeWidth={1.6} aria-hidden />
            <span className={styles.title}>{title}</span>
            {translating && <span className={styles.status}>翻訳中</span>}
            <button
              type="button"
              className={styles.close}
              aria-label={`${title} のタブを閉じる`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); closeTab(id); }}
            >
              <X size={12} strokeWidth={2} aria-hidden />
            </button>
          </div>
        );
      })}
      {drag?.mode === "split" && createPortal(<SplitDropPreview drag={drag} title={visible.find((tab) => tab.key === drag.id)?.title ?? ""} />, document.body)}
    </div>
  );
}

const SHADOW_ROOM = 32;
const flushClip = `polygon(${-SHADOW_ROOM}px ${-SHADOW_ROOM}px, calc(100% + ${SHADOW_ROOM}px) ${-SHADOW_ROOM}px, calc(100% + ${SHADOW_ROOM}px) 100%, ${TAB_FLUSH_CAP_WIDTH}px 100%, ${TAB_FLUSH_CAP_WIDTH}px calc(100% + ${TAB_FLUSH_DROP}px), ${-SHADOW_ROOM}px calc(100% + ${TAB_FLUSH_DROP}px))`;

/** While a paper tab is pulled onto the card: a ghost under the pointer and, over the card's
 *  left half, the half it will open in. */
function SplitDropPreview({ drag, title }: { drag: DragView; title: string }) {
  const card = document.querySelector("[data-main-pane]")?.getBoundingClientRect();
  return (
    <>
      {card && (
        <div
          className={`${styles.splitZone} ${drag.overSplit ? styles.splitZoneActive : ""}`}
          style={{ left: card.left, top: card.top, width: card.width / 2, height: card.height }}
          aria-hidden
        >
          <span className={styles.splitZoneLabel}>左に並べて開く</span>
        </div>
      )}
      <div className={styles.ghost} style={{ transform: `translate(${drag.x + 12}px, ${drag.y + 10}px)` }} aria-hidden>
        <FileText size={14} strokeWidth={1.6} aria-hidden />
        <span className={styles.ghostTitle}>{title}</span>
      </div>
    </>
  );
}

/** Card-coloured tab body whose flared base runs into the main card below. */
function ActiveTabShape({ flushLeft }: { flushLeft: boolean }) {
  const cap = (fill: string, stroke: string, width = TAB_CAP_WIDTH, height = TAB_HEIGHT) => (
    <svg className={styles.cap} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={fill} className={styles.capFill} />
      <path d={stroke} className={styles.capStroke} />
    </svg>
  );
  return (
    <span
      className={styles.shape}
      style={{
        left: flushLeft ? 0 : -TAB_FLARE,
        right: -TAB_FLARE,
        height: TAB_HEIGHT,
        // The flush cap drops below the tab to square off the card's corner; keep that drop
        // when cutting the shadow at the card's top edge.
        ...(flushLeft ? { clipPath: flushClip } : {}),
      }}
      aria-hidden
    >
      {flushLeft
        ? cap(TAB_FLUSH_LEFT_FILL, TAB_FLUSH_LEFT_STROKE, TAB_FLUSH_CAP_WIDTH, TAB_HEIGHT + TAB_FLUSH_DROP)
        : cap(TAB_CAP_LEFT_FILL, TAB_CAP_LEFT_STROKE)}
      <span className={styles.shapeMid} />
      {cap(TAB_CAP_RIGHT_FILL, TAB_CAP_RIGHT_STROKE)}
    </span>
  );
}
