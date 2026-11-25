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
import { isPageTab, pagePath, pageTabForPath, useSplitView, type PageTab } from "../../stores/splitViewStore";
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
  TAB_CORNER_UNIT,
  TAB_HEIGHT,
  TAB_K,
} from "./paperTabShape";
import { morphLeftCap, TAB_MORPH_GAP } from "./paperTabCap";
import { INSPECTOR_SLOT_ID } from "./inspectorSlot";
import styles from "./PaperTabBar.module.css";
import { suppressTextSelection } from "../../utils/dragSelection";

/** Icon-only tabs that always lead the strip; they are pages, not open documents. The left is
 *  their home: in split view they lead the left card's tabs and open in the left pane. */
const PINNED_TABS: { path: string; page: PageTab; label: string; Icon: typeof Library }[] = [
  { path: "/", page: "page:/", label: "すべての論文", Icon: Library },
  { path: "/inbox", page: "page:/inbox", label: "インボックス", Icon: Inbox },
];

const DRAG_THRESHOLD = 4;
/** How far below the strip a paper tab must be pulled before it becomes a split-view drop. */
const SPLIT_PULL = 24;
const SETTLE_MS = 180;
/** x ranges of the split drop targets, from the layout frozen when the tab is pulled down. */
type SplitZones = { top: number; height: number; left: [number, number] | null; right: [number, number] | null };
const rectOf = (selector: string) => {
  const rect = document.querySelector(selector)?.getBoundingClientRect();
  return rect && rect.width > 0 ? rect : null;
};
/** Targets never overlap the main card: the card shrinks to open an empty slot on the side being
 *  aimed at. Left target: the left slot only (not the sidebar). Right target: the right slot plus
 *  the open inspector. */
function measureSplitZones(canLeft: boolean, canRight: boolean): SplitZones | null {
  const card = rectOf("[data-main-card]");
  if (!card) return null;
  const leftSlot = document.querySelector("[data-split-peek-left]")?.getBoundingClientRect();
  const rightSlot = document.querySelector("[data-split-peek]")?.getBoundingClientRect();
  const inspector = rectOf(`#${INSPECTOR_SLOT_ID}`);
  return {
    top: card.top,
    height: card.height,
    left: canLeft && leftSlot ? [leftSlot.left, card.left] : null,
    right: canRight && rightSlot ? [card.right, inspector && inspector.left >= rightSlot.right - 1 ? inspector.right : rightSlot.right] : null,
  };
}
/** Opens (or closes) the empty slots beside the main card where a pulled tab can open. */
const setSplitPeek = (left: boolean, right = left) => {
  document.querySelector<HTMLElement>("[data-split-peek-left]")?.toggleAttribute("data-open", left);
  document.querySelector<HTMLElement>("[data-split-peek]")?.toggleAttribute("data-open", right);
};
/** How long the slots take to open (AppShell.module.css .splitPeek). */
const PEEK_MS = 240;

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
  /** Pointer y at the last move. */
  lastY: number;
  /** Pointer offset inside the tab when grabbed; the pulled tab keeps it under the pointer. */
  grabX: number;
  grabY: number;
  /** Whether the right half accepts the tab (the paper that is there now can move left). */
  canRight: boolean;
  canLeft?: boolean;
  /** Side whose slot is open beside the shrunken card. */
  peekSide?: SplitSide | null;
  /** Drop targets: the slots beside the shrunken card (re-measured while they open). */
  zones?: SplitZones | null;
  /** Lifts the drag-time text-selection lock (set once the drag passes its threshold). */
  releaseSelection?: () => void;
};
type SplitSide = "left" | "right";
type DragView = Pick<TabDrag, "id" | "startX" | "startY" | "from" | "to" | "dx" | "shift" | "keys" | "mode" | "overSplit" | "canRight" | "moveSide" | "zones"> & { x: number; y: number };
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
  // Split view: x of the left card's right edge. The left pane's inspector sits between the two
  // cards; the left group's tabs stay over the left card and never reach over that inspector.
  const [splitCardRight, setSplitCardRight] = useState<number | null>(null);
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
    const leftCard = splitTab ? document.querySelector<HTMLElement>("[data-split-card]") : null;
    if (!bar || !card) {
      setMainCardX(null);
      setSplitCardRight(null);
      return;
    }
    const measure = () => {
      const barLeft = bar.getBoundingClientRect().left;
      const x = Math.round(card.getBoundingClientRect().left - barLeft);
      setMainCardX((prev) => (prev === x ? prev : x));
      const right = leftCard ? Math.round(leftCard.getBoundingClientRect().right - barLeft) : null;
      setSplitCardRight((prev) => (prev === right ? prev : right));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    if (leftCard) observer.observe(leftCard);
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
    if (!splitTab || isPageTab(splitTab)) return;
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
    navigate(left ? (isPageTab(left) ? pagePath(left) : tabPath(left)) : lastPagePathRef.current);
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
    const grabbed = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = { id: key, startX: event.clientX, startY: event.clientY, moved: false, from: -1, keys: [], slots: [], shift: 0, to: -1, dx: 0, mode: "reorder", overSplit: null, canRight: false, moveSide: null, lastX: event.clientX, lastY: event.clientY, grabX: event.clientX - grabbed.left, grabY: event.clientY - grabbed.top };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  // Already pulled below the strip, so any height counts; only the side matters.
  // The card shrinks only on the side the pointer is on (its half of the card); the slot that opens
  // there is the target. Follow the slot while it opens.
  const aimSplit = (d: TabDrag) => {
    if (splitTab) {
      d.zones = null;
      d.overSplit = null;
      return;
    }
    const card = rectOf("[data-main-card]");
    const half: SplitSide | null = !card ? null : d.lastX < card.left + card.width / 2 ? "left" : "right";
    // With only one side open to it, the tab aims there from anywhere on the card.
    const side = !half ? null : !d.canLeft ? (d.canRight ? "right" : null) : half === "left" ? "left" : d.canRight ? "right" : null;
    if (side !== d.peekSide) {
      d.peekSide = side;
      setSplitPeek(side === "left", side === "right");
      const startedAt = performance.now();
      const follow = () => {
        if (dragRef.current !== d || d.mode !== "split" || d.peekSide !== side) return;
        aimSplit(d);
        setDrag((view) => (view ? { ...view, zones: d.zones, overSplit: d.overSplit } : view));
        if (performance.now() - startedAt < PEEK_MS) requestAnimationFrame(follow);
      };
      requestAnimationFrame(follow);
    }
    d.zones = measureSplitZones(side === "left", side === "right");
    const z = d.zones;
    const x = d.lastX;
    d.overSplit = !z ? null : z.left && x >= z.left[0] && x < z.left[1] ? "left" : z.right && x > z.right[0] ? "right" : null;
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
      const left = useSplitView.getState().tab;
      // Either side can take any tab: with nothing else to show, the other side shows all papers.
      d.canRight = left == null || left !== d.id;
      // The only paper / folder tab opens on the right only: all papers stay on the left.
      if (d.mode !== "split") d.canLeft = usePaperTabs.getState().tabs.length > 1;
      d.mode = "split";
      d.lastX = event.clientX;
      aimSplit(d);
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
      if (d.mode === "split") setSplitPeek(false);
      d.peekSide = null;
      d.mode = "reorder";
      d.zones = undefined;
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
    d.lastY = event.clientY;
    setDrag({ id: d.id, startX: d.startX, startY: d.startY, from: d.from, to: d.to, dx: d.dx, shift: d.shift, keys: d.keys, mode: d.mode, overSplit: d.overSplit, canRight: d.canRight, moveSide: d.moveSide, zones: d.zones, x: event.clientX, y: event.clientY });
  };
  const endDrag = (key: TabKey, commit: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    setSplitPeek(false);
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
          // The right pane's paper moves left: the right shows its next tab, or all papers.
          useSplitView.getState().addLeftTab(d.id);
          refillRight(d.id);
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

  // The right side lost its paper / folder to the left: it moves on to a neighbouring tab, or
  // with none left shows all papers.
  const refillRight = (key: TabKey) => {
    const next = rightNeighbour(key);
    lastActiveRef.current = null;
    navigate(next ? tabPath(next) : "/");
  };

  // Dropped on the card's left half: the paper opens there; if it was the page on the right,
  // the right side moves on to a neighbouring tab (or all papers).
  const openSplitFromTab = (key: TabKey) => {
    useSplitView.getState().openSplit(key);
    if (key === activeId) refillRight(key);
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
    // The right pane's paper moves left: the right shows its next tab, or all papers.
    useSplitView.getState().openSplit(key);
    refillRight(key);
  };

  // The card's own paper / folder dropped on its right half stays there; the left shows all papers.
  const openRightFromTab = (key: TabKey) => {
    const page = pageTabForPath(location.pathname);
    if (activeId && activeId !== key) useSplitView.getState().openSplit(activeId);
    else useSplitView.getState().showPage(activeId ? "page:/" : page ?? "page:/");
    if (key !== activeId) navigate(tabPath(key));
  };

  // Every tab moved or closed out of the right side: the split ends, unless the right card shows
  // a pinned page (all papers / inbox) of its own.
  useEffect(() => {
    if (!splitTab || drag || papers.length === 0) return;
    if (pageTabForPath(location.pathname)) return;
    const list = usePaperTabs.getState().tabs;
    if (list.length > 0 && !list.some((key) => !isLeftTab(key))) collapseSplit();
  }, [splitTab, drag, papers.length, tabs, isLeftTab, collapseSplit, location.pathname]);

  const tabTransform = (key: TabKey): string | undefined => {
    if (!drag) return undefined;
    const index = drag.keys.indexOf(key);
    // Pulled down to split the card, the tab follows the pointer (see the effect below).
    if (key === drag.id && drag.mode === "split") return undefined;
    if (key === drag.id) return drag.dx !== 0 ? `translateX(${drag.dx}px)` : undefined;
    if (drag.to > drag.from && index > drag.from && index <= drag.to) return `translateX(${-drag.shift}px)`;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return `translateX(${drag.shift}px)`;
    return undefined;
  };

  // The pulled tab stays under the pointer where it was grabbed. Its slot moves while the card
  // shrinks to open the split slots, so place it from its current layout position every frame
  // rather than from where the drag started.
  const pulledId = drag?.mode === "split" ? drag.id : null;
  useEffect(() => {
    if (!pulledId) return;
    const el = barRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(pulledId)}"]`);
    if (!el) return;
    let frame = 0;
    const place = () => {
      const d = dragRef.current;
      const parent = el.offsetParent as HTMLElement | null;
      if (d && parent) {
        const origin = parent.getBoundingClientRect();
        const x = d.lastX - d.grabX - (origin.left + el.offsetLeft);
        const y = d.lastY - d.grabY - (origin.top + el.offsetTop);
        el.style.transform = `translate(${x}px, ${y}px)`;
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => {
      cancelAnimationFrame(frame);
      el.style.transform = "";
    };
  }, [pulledId]);

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
  // Room past the left card (its inspector) that the left group's tabs leave empty.
  const leadGutter = mainCardX != null && splitCardRight != null ? Math.max(0, mainCardX - splitCardRight) : 0;
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
        className={`${styles.tab} ${active ? styles.active : ""} ${inSplit ? styles.inSplit : ""} ${drag?.id === id ? `${styles.lifted} ${drag.mode === "split" ? styles.pulled : styles.dragging}` : ""} ${settledRef.current?.has(id) ? "" : styles.entering}`}
        style={{ transform: tabTransform(id) }}
        onAnimationEnd={(event) => { if (event.target === event.currentTarget) settle(id); }}
        onPointerDown={(event) => onPointerDown(event, id)}
        onPointerMove={onPointerMove}
        onPointerUp={() => endDrag(id, true)}
        onPointerCancel={() => endDrag(id, false)}
        onAuxClick={(event) => { if (event.button === 1) closeTab(id); }}
        onKeyDown={(event) => { if (event.key === "Enter") openTab(id); }}
      >
        {(active || inSplit) && drag?.id !== id && <ActiveTabShape moving={drag != null} textured={kind === "folder"} card={inSplit ? "[data-split-card]" : "[data-main-card]"} />}
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

  const split = leadWidth != null;
  const pinnedTabs = PINNED_TABS.map(({ path, page, label, Icon }) => {
    // In split view the pinned pages open in the left pane; one already on the right stays there.
    const onRight = location.pathname === path;
    const shownLeft = split && splitTab === page;
    const active = split ? shownLeft : onRight;
    const open = () => {
      if (path === "/") useAppStore.getState().setLibraryFilter({ tag: null });
      if (split) {
        if (!onRight) useSplitView.getState().showPage(page);
        return;
      }
      if (!onRight || location.search) navigate(path);
    };
    return (
      <div
        key={path}
        role="tab"
        aria-selected={active}
        aria-label={label}
        tabIndex={active ? 0 : -1}
        title={label}
        className={`${styles.tab} ${styles.pinned} ${active ? styles.active : split && onRight ? styles.pinnedCurrent : ""}`}
        onClick={open}
        onKeyDown={(event) => { if (event.key === "Enter") open(); }}
      >
        {/* In split view the page shows in the left card; one left on the right card is only filled. */}
        {active && <ActiveTabShape moving={drag != null} textured={false} card={split ? "[data-split-card]" : "[data-main-card]"} />}
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
        <div className={styles.lead} style={{ width: leadWidth, paddingRight: leadGutter }}>
          {pinnedTabs}
          {leadTabs.map(renderTab)}
        </div>
      )}
      {leadWidth == null && pinnedTabs}
      {(leadWidth != null ? visible.filter((tab) => !isLeftTab(tab.key)) : visible).map(renderTab)}
      {drag?.mode === "split" && createPortal(<SplitDropPreview drag={drag} />, document.body)}
    </div>
  );
}

const SHADOW_ROOM = 32;
/** Cuts the shadow at the card's top edge but keeps a cap that drops `width` px wide into it. */
const dropClip = (width: number) =>
  `polygon(${-SHADOW_ROOM}px ${-SHADOW_ROOM}px, calc(100% + ${SHADOW_ROOM}px) ${-SHADOW_ROOM}px, calc(100% + ${SHADOW_ROOM}px) 100%, ${width}px 100%, ${width}px calc(100% + ${TAB_FLUSH_DROP}px), ${-SHADOW_ROOM}px calc(100% + ${TAB_FLUSH_DROP}px))`;
/** Keep tracking the tab this long after a drag ends, while it glides into its slot. */
const MORPH_TAIL_MS = SETTLE_MS + 120;
/** Rounds the measured gap so sub-pixel jitter does not re-render the cap. A tab hanging past
 *  the card's edge (dragged toward the other split card) is off the card: plain flared cap, no
 *  drop into a card that is not there. */
const snapGap = (gap: number) => (gap < -1.5 ? Infinity : gap < 0.5 ? 0 :gap >= TAB_MORPH_GAP - 0.5 ? Infinity : Math.round(gap * 4) / 4);

/** Side margin of a split target's outline inside its drop range (the range itself stays full width). */
const ZONE_MARGIN_X = 12;

/** Card-radius clothoid rectangle (corner extent = 10 × K, as --sq-radius-card), inset by half the
 *  stroke and by ZONE_MARGIN_X on the left and right. */
function zoneOutlinePath(width: number, height: number, inset = 0.75): string {
  const x0 = inset + ZONE_MARGIN_X;
  const y0 = inset;
  const x1 = width - inset - ZONE_MARGIN_X;
  const y1 = height - inset;
  const s = Math.max(0, Math.min(10 * TAB_K - inset, (x1 - x0) / 2, (y1 - y0) / 2));
  const pts: string[] = [];
  const add = (x: number, y: number) => pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  add(x1 - s, y0);
  for (const [u, v] of TAB_CORNER_UNIT) add(x1 + u * s, y0 + v * s);
  add(x1, y1 - s);
  for (const [u, v] of TAB_CORNER_UNIT) add(x1 - v * s, y1 + u * s);
  add(x0 + s, y1);
  for (const [u, v] of TAB_CORNER_UNIT) add(x0 - u * s, y1 - v * s);
  add(x0, y0 + s);
  for (const [u, v] of TAB_CORNER_UNIT) add(x0 + v * s, y0 - u * s);
  return `M${pts.join("L")}Z`;
}

function ZoneOutline({ width, height }: { width: number; height: number }) {
  return (
    <svg className={styles.splitZoneOutline} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={zoneOutlinePath(width, height)} />
    </svg>
  );
}

/** While a paper tab is pulled onto the card (the tab itself follows the pointer): over the
 *  card's left or right half, the half it will open in. */
function SplitDropPreview({ drag }: { drag: DragView }) {
  // Each target is drawn exactly where it accepts the drop; over one, it lights up.
  const zone = (side: SplitSide) => {
    const range = drag.zones?.[side];
    const zones = drag.zones;
    return (
      range &&
      zones && (
        <div
          className={`${styles.splitZone} ${drag.overSplit === side ? styles.splitZoneActive : ""}`}
          style={{ left: range[0], top: zones.top, width: range[1] - range[0], height: zones.height }}
          aria-hidden
        >
          <ZoneOutline width={range[1] - range[0]} height={zones.height} />
          <span className={styles.splitZoneLabel}>{side === "left" ? "左に並べて開く" : "右に並べて開く"}</span>
        </div>
      )
    );
  };
  // Already split: the whole card the tab would open in lights up.
  const target = drag.moveSide ? document.querySelector(drag.moveSide === "left" ? "[data-split-card]" : "[data-main-card]")?.getBoundingClientRect() : null;
  const splitOpen = document.querySelector("[data-split-card]") != null;
  return (
    <>
      {!splitOpen && zone("left")}
      {!splitOpen && zone("right")}
      {target && (
        <div
          className={`${styles.splitZone} ${styles.splitZoneActive}`}
          style={{ left: target.left, top: target.top, width: target.width, height: target.height }}
          aria-hidden
        >
          <ZoneOutline width={target.width} height={target.height} />
          <span className={styles.splitZoneLabel}>{drag.moveSide === "left" ? "左で開く" : "右で開く"}</span>
        </div>
      )}
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
/** The tab of the paper a card shows, joined to that card (`card`: the card's selector). */
function ActiveTabShape({ moving, textured, card: cardSelector = "[data-main-card]" }: { moving: boolean; textured: boolean; card?: string }) {
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
    const card = document.querySelector<HTMLElement>(cardSelector);
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
    const card = document.querySelector<HTMLElement>(cardSelector);
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
  }, [cardSelector]);
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
