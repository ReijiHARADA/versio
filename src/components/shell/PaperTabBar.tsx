import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FileTextIcon as FileText,
  FolderIcon as Folder,
  InboxIcon as Inbox,
  LibraryIcon as Library,
  CloseIcon as X,
} from "@solar-icons/react/linear";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { releasePaperBody } from "../../services/paperBodyRelease";
import { parseTab, tabForPath, tabPath, usePaperTabs, type TabKey } from "../../stores/paperTabsStore";
import { useSplitView } from "../../stores/splitViewStore";
import { useAppStore } from "../../stores/appStore";
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
import { morphLeftCap, TAB_MORPH_GAP } from "./paperTabCap";
import styles from "./PaperTabBar.module.css";
import { suppressTextSelection } from "../../utils/dragSelection";

/** Icon-only tabs that always lead the main card's tabs; they are pages, not open documents. */
const PINNED_TABS = [
  { path: "/", label: "すべての論文", Icon: Library },
  { path: "/inbox", label: "インボックス", Icon: Inbox },
] as const;

const DRAG_THRESHOLD = 4;
/** How far below the strip a paper tab must be pulled before it becomes a split-view drop. */
const SPLIT_PULL = 24;
const SETTLE_MS = 180;
/** How far inside the cards' left / right edge the split drop targets reach (px, or a share of the width). */
const SPLIT_EDGE_IN = 80;
const SPLIT_EDGE_SHARE = 0.15;
const splitBand = (cardWidth: number) => Math.max(SPLIT_EDGE_IN, cardWidth * SPLIT_EDGE_SHARE);

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
  /** Half of the card the pulled tab will open in, or null when it is not over one. */
  overSplit: SplitSide | null;
  /** Split view already open: the card the pulled tab would open in (null: nowhere new). */
  moveSide: SplitSide | null;
  /** Pointer x at the last move; on release in split view it picks the tab's side. */
  lastX: number;
  /** Whether the right half accepts the tab (the paper that is there now can move left). */
  canRight: boolean;
  /** Lifts the drag-time text-selection lock (set once the drag passes its threshold). */
  releaseSelection?: () => void;
};
type SplitSide = "left" | "right";
type DragView = Pick<TabDrag, "id" | "from" | "to" | "dx" | "shift" | "keys" | "mode" | "overSplit" | "canRight" | "moveSide"> & { x: number; y: number };
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
  const splitTab = useSplitView((state) => state.tab);
  const leftTabKeys = useSplitView((state) => state.leftTabs);
  /** In split view, whether a tab sits over the left card (and opens in the left pane). */
  const isLeftTab = useCallback(
    (key: TabKey) => {
      return splitTab != null && key !== activeId && (key === splitTab || leftTabKeys.includes(key));
    },
    [splitTab, leftTabKeys, activeId]
  );
  const lastActiveRef = useRef<TabKey | null>(null);
  const lastPagePathRef = useRef("/");
  const barRef = useRef<HTMLDivElement>(null);
  const [inset, setInset] = useState({ left: 0, right: 0 });
  // Split view: x of the right (main) card's left edge from the bar's left, so the routed tab can
  // start right above it. Null when the card is not split.
  const [mainCardX, setMainCardX] = useState<number | null>(null);
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

  useLayoutEffect(() => {
    const bar = barRef.current;
    const card = splitTab ? document.querySelector<HTMLElement>("[data-main-card]") : null;
    if (!bar || !card) {
      setMainCardX(null);
      return;
    }
    const measure = () => {
      const x = Math.round(card.getBoundingClientRect().left - bar.getBoundingClientRect().left);
      setMainCardX((prev) => (prev === x ? prev : x));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [splitTab]);

  // The routed tab always sits over the right card.
  useEffect(() => {
    if (!activeId || !splitTab) return;
    if (activeId !== splitTab && leftTabKeys.includes(activeId)) useSplitView.getState().removeLeftTab(activeId);
  }, [activeId, splitTab, leftTabKeys]);

  // The paper in the split pane always has a tab (it may have been opened without one).
  useEffect(() => {
    if (!splitTab) return;
    const { kind, id } = parseTab(splitTab);
    const live = kind === "paper" ? papers.some((paper) => paper.id === id && !paper.trashedAt) : workspaceNodes.some((node) => node.id === id);
    if (live && !usePaperTabs.getState().tabs.includes(splitTab)) usePaperTabs.getState().openTab(splitTab, activeId);
  }, [splitTab, activeId, tabs, papers, workspaceNodes]);

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

  // Split view: the tab to show on the right instead of `key` (its nearest right-group neighbour).
  const rightNeighbour = useCallback(
    (key: TabKey): TabKey | null => {
      const list = usePaperTabs.getState().tabs;
      const index = list.indexOf(key);
      const right = (k: TabKey) => k !== key && !isLeftTab(k);
      return list.slice(index + 1).find(right) ?? [...list.slice(0, Math.max(0, index))].reverse().find(right) ?? null;
    },
    [isLeftTab]
  );
  // The right side ran out of tabs: the split ends and the left pane's paper fills the card.
  const collapseSplit = useCallback(() => {
    const left = useSplitView.getState().tab;
    useSplitView.getState().closeSplit();
    lastActiveRef.current = null;
    navigate(left ? tabPath(left) : lastPagePathRef.current);
  }, [navigate]);

  const closeTab = useCallback(
    (key: TabKey) => {
      const splitNext = splitTab && key === activeId ? rightNeighbour(key) : null;
      const next = usePaperTabs.getState().closeTab(key);
      // A left tab leaves the left group; if it was on screen there, another left tab takes its place.
      useSplitView.getState().removeLeftTab(key);
      // A closed paper no longer needs its body kept warm (see useReaderDocument).
      const { kind, id } = parseTab(key);
      if (kind === "paper" && key !== activeId) releasePaperBody(id);
      if (key !== activeId) return;
      if (splitTab) {
        // Closing the right side's last tab ends the split.
        if (splitNext) {
          lastActiveRef.current = null;
          navigate(tabPath(splitNext));
        } else collapseSplit();
        return;
      }
      lastActiveRef.current = null;
      navigate(next ? tabPath(next) : lastPagePathRef.current);
    },
    [activeId, navigate, splitTab, rightNeighbour, collapseSplit]
  );

  const openTab = useCallback(
    (key: TabKey) => {
      // The paper in the split pane is already on screen; its tab only marks it.
      if (key === activeId || key === useSplitView.getState().tab) return;
      // A tab over the left card opens in the left pane.
      if (isLeftTab(key)) {
        useSplitView.getState().openSplit(key);
        return;
      }
      navigate(tabPath(key));
    },
    [activeId, navigate, isLeftTab]
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
  // the tab settles into its slot. Pulled down onto either half of the card, a paper tab opens there
  // as a split pane.
  const dragRef = useRef<TabDrag | null>(null);
  const [drag, setDrag] = useState<DragView | null>(null);
  const settleRef = useRef<{ id: TabKey; offset: number } | null>(null);
  const onPointerDown = (event: React.PointerEvent, key: TabKey) => {
    if (event.button !== 0) return;
    dragRef.current = { id: key, startX: event.clientX, startY: event.clientY, moved: false, from: -1, keys: [], slots: [], shift: 0, to: -1, dx: 0, mode: "reorder", overSplit: null, canRight: false, moveSide: null, lastX: event.clientX };
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
      d.releaseSelection = suppressTextSelection();
    }
    const barRect = barRef.current?.getBoundingClientRect();
    const pulledDown = barRect != null && event.clientY > barRect.bottom + SPLIT_PULL;
    if (pulledDown) {
      const card = document.querySelector("[data-main-pane]")?.getBoundingClientRect();
      d.mode = "split";
      const left = useSplitView.getState().tab;
      d.canRight = activeId != null ? activeId !== d.id : left != null && left !== d.id;
      // Drop targets sit beside the cards, not on them: left of the cards' left edge (over the
      // sidebar) or right of their right edge, plus a thin band just inside each edge.
      // Already pulled below the strip, so any height counts; only the side matters.
      const level = card != null;
      const band = card ? splitBand(card.width) : 0;
      const side: SplitSide | null = !level || !card ? null : event.clientX < card.left + band ? "left" : event.clientX > card.right - band ? "right" : null;
      d.overSplit = side === "right" && !d.canRight ? null : side;
      d.moveSide = null;
      // Already split: dropping on a card opens the tab there (and moves it to that card's group).
      if (splitTab) {
        d.overSplit = null;
        const groove = document.querySelector("[data-main-card]")?.getBoundingClientRect().left ?? Infinity;
        const target: SplitSide = event.clientX < groove ? "left" : "right";
        const shownThere = target === "right" ? d.id === activeId : d.id === splitTab;
        d.moveSide = shownThere ? null : target;
      }
      d.dx = 0;
      d.to = d.from;
    } else {
      d.mode = "reorder";
      d.overSplit = null;
      d.moveSide = null;
      const own = d.slots[d.from];
      const first = d.slots[0];
      const last = d.slots[d.slots.length - 1];
      const dx = event.clientX - d.startX;
      d.dx = Math.min(last.left + last.width - (own.left + own.width), Math.max(first.left - own.left, dx));
      // Swap once the dragged tab's leading edge passes a neighbour's middle. (Its centre cannot:
      // the drag stops at the strip's ends, where an equal-width tab's centre only reaches the
      // end tab's centre, so the first / last slot was unreachable.)
      const leftEdge = own.left + d.dx;
      const rightEdge = leftEdge + own.width;
      let to = d.from;
      for (let i = d.from + 1; i < d.slots.length; i++) if (rightEdge > d.slots[i].left + d.slots[i].width / 2) to = i;
      for (let i = d.from - 1; i >= 0; i--) if (leftEdge < d.slots[i].left + d.slots[i].width / 2) to = i;
      d.to = to;
    }
    d.lastX = event.clientX;
    setDrag({ id: d.id, from: d.from, to: d.to, dx: d.dx, shift: d.shift, keys: d.keys, mode: d.mode, overSplit: d.overSplit, canRight: d.canRight, moveSide: d.moveSide, x: event.clientX, y: event.clientY });
  };
  const endDrag = (key: TabKey, commit: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    d.releaseSelection?.();
    if (!d.moved) {
      if (commit) openTab(key);
      return;
    }
    if (commit && d.mode === "split" && d.moveSide) {
      moveTabToSide(d.id, d.moveSide);
      return;
    }
    if (commit && d.mode === "split" && d.overSplit) {
      if (d.overSplit === "left") openSplitFromTab(d.id);
      else openRightFromTab(d.id);
      return;
    }
    const to = commit && d.mode === "reorder" ? d.to : d.from;
    // Split view: a tab on screen in neither pane may cross to the other card's group; it then
    // opens on that side. The tabs on screen stay over their own card.
    const bar = barRef.current?.getBoundingClientRect();
    let crossed = false;
    if (commit && d.mode === "reorder" && splitTab && mainCardX != null && bar) {
      const wantsLeft = d.lastX < bar.left + mainCardX;
      if (wantsLeft !== isLeftTab(d.id)) {
        crossed = true;
        if (!wantsLeft) {
          // Leaving the left group; if it was on screen there, another left tab (or none: the
          // split ends) takes its place.
          useSplitView.getState().removeLeftTab(d.id);
        } else if (d.id !== activeId) {
          useSplitView.getState().addLeftTab(d.id);
        } else {
          // The right pane's paper moves left: the right shows its next tab, or, with none left,
          // the split ends.
          const next = rightNeighbour(d.id);
          useSplitView.getState().addLeftTab(d.id);
          if (next) {
            lastActiveRef.current = null;
            navigate(tabPath(next));
          } else collapseSplit();
        }
      }
    }
    const own = d.slots[d.from];
    const finalLeft = to > d.from ? d.slots[to].left + d.slots[to].width - own.width : to < d.from ? d.slots[to].left : own.left;
    const offset = own.left + d.dx - finalLeft;
    if (to !== d.from) {
      const list = usePaperTabs.getState().tabs;
      const without = list.filter((item) => item !== d.id);
      const at = without.indexOf(d.keys[to]);
      if (at >= 0) usePaperTabs.getState().moveTab(d.id, to > d.from ? at + 1 : at);
    }
    if (!crossed && Math.abs(offset) > 0.5) settleRef.current = { id: d.id, offset };
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
    // The right side keeps at least one tab; the only tab there cannot leave it.
    const next = key === activeId ? rightNeighbour(key) : null;
    if (key === activeId && !next) return;
    useSplitView.getState().openSplit(key);
    if (!next) return;
    lastActiveRef.current = null;
    navigate(tabPath(next));
  };

  // Dropped on the card's right half: the paper opens there and the paper that was there moves
  // to the left pane (swapping places when the dropped tab came from the left pane).
  // Split view: open a tab in the given card; it joins that card's group.
  const moveTabToSide = (key: TabKey, side: SplitSide) => {
    if (side === "right") {
      // The route effects take it out of the left group (and refill or end the left side).
      if (key === activeId) return;
      lastActiveRef.current = null;
      navigate(tabPath(key));
      return;
    }
    if (key !== activeId) {
      useSplitView.getState().openSplit(key);
      return;
    }
    // The right pane's paper moves left: the right shows its next tab, or the split ends.
    const next = rightNeighbour(key);
    useSplitView.getState().openSplit(key);
    if (next) {
      lastActiveRef.current = null;
      navigate(tabPath(next));
    } else collapseSplit();
  };

  const openRightFromTab = (key: TabKey) => {
    if (activeId) useSplitView.getState().openSplit(activeId);
    navigate(tabPath(key));
  };

  // Every tab moved or closed out of the right side: the split ends.
  useEffect(() => {
    if (!splitTab || drag || papers.length === 0) return;
    const list = usePaperTabs.getState().tabs;
    if (list.length > 0 && !list.some((key) => !isLeftTab(key))) collapseSplit();
  }, [splitTab, drag, papers.length, tabs, isLeftTab, collapseSplit]);

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

  // In split view the routed tab sits above the right card's left edge; the tabs before it share
  // the room above the left card.
  // In split view the tabs form two groups: those over the left card (opening in the left pane)
  // and those over the right card, whose first tab starts at the right card's left edge.
  const leadWidth = mainCardX != null ? Math.max(0, mainCardX - paddingLeft) : null;
  const leadTabs = leadWidth != null ? visible.filter((tab) => isLeftTab(tab.key)) : [];
  const renderTab = ({ key: id, kind, title, translating }: VisibleTab) => {
    const active = id === activeId;
    const inSplit = id === splitTab;
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
        {active && <ActiveTabShape moving={drag != null} textured={kind === "folder"} />}
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
  };

  const pinnedTabs = PINNED_TABS.map(({ path, label, Icon }) => {
    const active = location.pathname === path;
    const open = () => {
      if (path === "/") useAppStore.getState().setLibraryFilter({ tag: null });
      if (!active || location.search) navigate(path);
    };
    return (
      <div
        key={path}
        role="tab"
        aria-selected={active}
        aria-label={label}
        tabIndex={active ? 0 : -1}
        title={label}
        className={`${styles.tab} ${styles.pinned} ${active ? styles.active : ""}`}
        onClick={open}
        onKeyDown={(event) => { if (event.key === "Enter") open(); }}
      >
        {active && <ActiveTabShape moving={drag != null} textured={false} />}
        <Icon className={styles.icon} size={15} strokeWidth={1.6} aria-hidden />
      </div>
    );
  });

  return (
    <div
      ref={barRef}
      className={`${styles.bar} ${drag ? styles.reordering : ""}`}
      data-tauri-drag-region="deep"
      role="tablist"
      aria-label="開いている論文とフォルダ"
      style={{ paddingLeft, paddingRight: Math.max(EDGE_PAD + 10, inset.right) }}
    >
      {leadWidth != null && (
        <div className={styles.lead} style={{ width: leadWidth }}>
          {leadTabs.map(renderTab)}
        </div>
      )}
      {pinnedTabs}
      {(leadWidth != null ? visible.filter((tab) => !isLeftTab(tab.key)) : visible).map(renderTab)}
      {drag?.mode === "split" && createPortal(<SplitDropPreview drag={drag} title={visible.find((tab) => tab.key === drag.id)?.title ?? ""} />, document.body)}
    </div>
  );
}

const SHADOW_ROOM = 32;
/** Cuts the shadow at the card's top edge but keeps a cap that drops `width` px wide into it. */
const dropClip = (width: number) =>
  `polygon(${-SHADOW_ROOM}px ${-SHADOW_ROOM}px, calc(100% + ${SHADOW_ROOM}px) ${-SHADOW_ROOM}px, calc(100% + ${SHADOW_ROOM}px) 100%, ${width}px 100%, ${width}px calc(100% + ${TAB_FLUSH_DROP}px), ${-SHADOW_ROOM}px calc(100% + ${TAB_FLUSH_DROP}px))`;
/** Keep tracking the tab this long after a drag ends, while it glides into its slot. */
const MORPH_TAIL_MS = SETTLE_MS + 120;
/** Rounds the measured gap so sub-pixel jitter does not re-render the cap. */
const snapGap = (gap: number) => (gap < 0.5 ? 0 : gap >= TAB_MORPH_GAP - 0.5 ? Infinity : Math.round(gap * 4) / 4);

/** While a paper tab is pulled onto the card: a ghost under the pointer and, over the card's
 *  left or right half, the half it will open in. */
function SplitDropPreview({ drag, title }: { drag: DragView; title: string }) {
  const card = document.querySelector("[data-main-pane]")?.getBoundingClientRect();
  const half = card ? card.width / 2 : 0;
  const band = card ? splitBand(card.width) : 0;
  // A faint band along each edge marks where to drop; over one, the half the paper will open in lights up.
  const edge = (side: SplitSide) =>
    card && (
      <>
        <div
          className={`${styles.splitEdge} ${drag.overSplit === side ? styles.splitEdgeActive : ""}`}
          style={{ left: side === "left" ? card.left : card.right - band, top: card.top, width: band, height: card.height }}
          aria-hidden
        />
        <div
          className={`${styles.splitZone} ${drag.overSplit === side ? styles.splitZoneActive : ""}`}
          style={{ left: side === "left" ? card.left : card.left + half, top: card.top, width: half, height: card.height }}
          aria-hidden
        >
          <span className={styles.splitZoneLabel}>{side === "left" ? "左に並べて開く" : "右に並べて開く"}</span>
        </div>
      </>
    );
  // Already split: the whole card the tab would open in lights up.
  const target = drag.moveSide ? document.querySelector(drag.moveSide === "left" ? "[data-split-card]" : "[data-main-card]")?.getBoundingClientRect() : null;
  const splitOpen = document.querySelector("[data-split-card]") != null;
  return (
    <>
      {!splitOpen && edge("left")}
      {!splitOpen && drag.canRight && edge("right")}
      {target && (
        <div
          className={`${styles.splitZone} ${styles.splitZoneActive}`}
          style={{ left: target.left, top: target.top, width: target.width, height: target.height }}
          aria-hidden
        >
          <span className={styles.splitZoneLabel}>{drag.moveSide === "left" ? "左で開く" : "右で開く"}</span>
        </div>
      )}
      <div className={styles.ghost} style={{ transform: `translate(${drag.x + 12}px, ${drag.y + 10}px)` }} aria-hidden>
        <FileText size={14} strokeWidth={1.6} aria-hidden />
        <span className={styles.ghostTitle}>{title}</span>
      </div>
    </>
  );
}

/** A cap's fill path as a CSS mask image. */
function capMaskUrl(d: string, width: number, height: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'><path d='${d}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Card-coloured tab body whose flared base runs into the main card below. Its left cap follows
 *  the tab's gap from the card's left edge: flush on the edge, fully flared once clear of the
 *  card's corner, and in between the card corner and the flare grow together (see morphLeftCap).
 *  `textured` paints the card's paper texture too: folder pages show it, Reader covers the card
 *  with a plain fill. */
function ActiveTabShape({ moving, textured }: { moving: boolean; textured: boolean }) {
  const cap = (fill: string, stroke: string, width = TAB_CAP_WIDTH, height = TAB_HEIGHT, clipId?: string) => (
    <svg className={styles.cap} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {clipId && (
        <clipPath id={clipId}>
          <path d={fill} />
        </clipPath>
      )}
      <path d={fill} className={styles.capFill} />
      <path d={stroke} className={styles.capStroke} {...(clipId ? { clipPath: `url(#${clipId})`, strokeWidth: 2 } : {})} />
    </svg>
  );
  const clipId = `tab-cap-${useId().replace(/:/g, "")}`;
  const shapeRef = useRef<HTMLSpanElement>(null);
  const textureRef = useRef<HTMLSpanElement>(null);
  const [gap, setGap] = useState(Infinity);
  // Anchor the texture to the main card's top-left so its dot grid runs on from the card's, and
  // measure how far the tab (with its drag / glide transform) sits from the card's left edge.
  const syncRef = useRef<() => void>(() => {});
  syncRef.current = () => {
    const texture = textureRef.current;
    const tab = shapeRef.current?.parentElement;
    const card = document.querySelector<HTMLElement>("[data-main-card]");
    if (!tab || !card) return;
    const c = card.getBoundingClientRect();
    setGap(snapGap(tab.getBoundingClientRect().left - c.left));
    // Only folder tabs carry the texture; paper tabs still need the gap above.
    if (!texture) return;
    const t = texture.getBoundingClientRect();
    const pos = `${c.left - t.left}px ${c.top - t.top}px`;
    texture.style.backgroundPosition = `${pos}, ${pos}`;
  };
  useLayoutEffect(() => syncRef.current());
  useEffect(() => {
    const shape = shapeRef.current;
    const card = document.querySelector<HTMLElement>("[data-main-card]");
    if (!shape || !card) return;
    const sync = () => syncRef.current();
    const observer = new ResizeObserver(sync);
    observer.observe(card);
    const bar = shape.closest<HTMLElement>(`.${styles.bar}`);
    if (bar) observer.observe(bar);
    // Neighbouring tabs growing / the bar's padding gliding move this tab without a resize.
    bar?.addEventListener("transitionend", sync);
    bar?.addEventListener("animationend", sync);
    return () => {
      observer.disconnect();
      bar?.removeEventListener("transitionend", sync);
      bar?.removeEventListener("animationend", sync);
    };
  }, []);
  // While tabs move (drag, then the glide into place) follow the tab every frame.
  useEffect(() => {
    let frame = 0;
    const until = moving ? Infinity : performance.now() + MORPH_TAIL_MS;
    const tick = () => {
      syncRef.current();
      if (performance.now() < until) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [moving]);

  const mode = gap === 0 ? "flush" : gap === Infinity ? "flared" : "morph";
  const morph = mode === "morph" ? morphLeftCap(gap) : null;
  const left =
    mode === "flush"
      ? { fill: TAB_FLUSH_LEFT_FILL, stroke: TAB_FLUSH_LEFT_STROKE, width: TAB_FLUSH_CAP_WIDTH, height: TAB_HEIGHT + TAB_FLUSH_DROP, offset: 0 }
      : morph
        ? { fill: morph.fill, stroke: morph.stroke, width: morph.width, height: morph.height, offset: gap }
        : { fill: TAB_CAP_LEFT_FILL, stroke: TAB_CAP_LEFT_STROKE, width: TAB_CAP_WIDTH, height: TAB_HEIGHT, offset: TAB_FLARE };
  // Where the left cap's straight top meets the middle strip, measured from the cap's left.
  const capInner = mode === "flared" ? TAB_CAP_WIDTH : left.width;
  const mask = [
    `${capMaskUrl(left.fill, left.width, left.height)} 0 0 / ${left.width}px ${left.height}px no-repeat`,
    `linear-gradient(#000, #000) ${capInner - 1}px 0 / calc(100% - ${capInner + TAB_CAP_WIDTH - 2}px) ${TAB_HEIGHT}px no-repeat`,
    `${capMaskUrl(TAB_CAP_RIGHT_FILL, TAB_CAP_WIDTH, TAB_HEIGHT)} 100% 0 / ${TAB_CAP_WIDTH}px ${TAB_HEIGHT}px no-repeat`,
  ].join(", ");
  return (
    <span
      ref={shapeRef}
      className={styles.shape}
      style={{
        left: -left.offset,
        right: -TAB_FLARE,
        height: TAB_HEIGHT,
        // A cap that drops below the tab squares off / re-rounds the card's corner; keep that
        // drop when cutting the shadow at the card's top edge.
        ...(mode !== "flared" ? { clipPath: dropClip(left.width) } : {}),
      }}
      aria-hidden
    >
      {cap(left.fill, left.stroke, left.width, left.height, morph ? clipId : undefined)}
      <span className={styles.shapeMid} />
      {cap(TAB_CAP_RIGHT_FILL, TAB_CAP_RIGHT_STROKE)}
      {textured && (
        <span
          ref={textureRef}
          className={styles.texture}
          style={{ height: left.height, mask, WebkitMask: mask }}
        />
      )}
    </span>
  );
}
