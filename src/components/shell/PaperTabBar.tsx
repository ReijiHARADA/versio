import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { ActiveTabShape } from "./ActiveTabShape";
import { SplitDropPreview } from "./SplitDropPreview";
import { measureSplitZones, PEEK_MS, rectOf, setSplitPeek } from "./splitPeek";
import { clampDx, crossDropIndex, crossInsertBefore, reorderTarget, SETTLE_MS, type DragView, type SplitSide, type TabDrag } from "./tabDrag";
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
    // Another paper aimed right opens past the open inspector, which stays with the current paper.
    const outer = side === "right" && d.id !== activeId && rectOf(`#${INSPECTOR_SLOT_ID}`) != null;
    if (side !== d.peekSide) {
      d.peekSide = side;
      setSplitPeek(side === "left", side === "right", outer);
      const startedAt = performance.now();
      const follow = () => {
        if (dragRef.current !== d || d.mode !== "split" || d.peekSide !== side) return;
        aimSplit(d);
        setDrag((view) => (view ? { ...view, zones: d.zones, overSplit: d.overSplit } : view));
        if (performance.now() - startedAt < PEEK_MS) requestAnimationFrame(follow);
      };
      requestAnimationFrame(follow);
    }
    d.zones = measureSplitZones(side === "left", side === "right", outer);
    const z = d.zones;
    const x = d.lastX;
    d.overSplit = !z ? null : z.left && x >= z.left[0] && x < z.left[1] ? "left" : z.right && x >= z.right[0] ? "right" : null;
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
      // Already split, aimSplit finds no target: the cards are no drop targets, a tab changes
      // sides over the tab strip.
      d.moveSide = null;
      d.dx = 0;
      d.to = d.from;
    } else {
      if (d.mode === "split") setSplitPeek(false);
      d.peekSide = null;
      d.mode = "reorder";
      d.zones = undefined;
      d.overSplit = null;
      d.moveSide = null;
      // Split view: over the other group's strip, the tab moves there and opens in that card.
      const barLeft = barRect?.left;
      if (splitTab && mainCardX != null && barLeft != null) {
        const target: SplitSide = event.clientX < barLeft + mainCardX ? "left" : "right";
        if (target === "left" ? !isLeftTab(d.id) : isLeftTab(d.id)) d.moveSide = target;
      }
      // That group opens a slot where the tab would land (its tabs narrow if the strip is full).
      const toLeft = d.moveSide === "left";
      d.insertBefore = d.moveSide ? crossInsertBefore(d.keys, d.slots, d.id, event.clientX, (key) => isLeftTab(key) === toLeft) : undefined;
      d.dx = clampDx(d.slots, d.from, event.clientX - d.startX);
      // Split view: tabs make room only inside the dragged tab's own group; none jumps across the
      // groove, and crossing to the other group moves none of them.
      const group = isLeftTab(d.id);
      d.to = d.moveSide ? d.from : reorderTarget(d.slots, d.from, d.dx, (i) => !splitTab || isLeftTab(d.keys[i]) === group);
    }
    d.lastX = event.clientX;
    d.lastY = event.clientY;
    setDrag({ id: d.id, startX: d.startX, startY: d.startY, from: d.from, to: d.to, dx: d.dx, shift: d.shift, keys: d.keys, mode: d.mode, overSplit: d.overSplit, canRight: d.canRight, moveSide: d.moveSide, insertBefore: d.insertBefore, zones: d.zones, x: event.clientX, y: event.clientY });
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
    if (commit && d.mode === "split" && d.overSplit) {
      if (d.overSplit === "left") openSplitFromTab(d.id);
      else openRightFromTab(d.id);
      return;
    }
    const to = commit && d.mode === "reorder" ? d.to : d.from;
    // Split view: dropped over the other card's tab strip, the tab joins that group and opens there.
    let crossed = false;
    if (commit && d.mode === "reorder" && d.moveSide) {
      crossed = true;
      if (d.moveSide === "right") {
        // Leaving the left group; if it was on screen there, another left tab (or none: the
        // split ends) takes its place.
        useSplitView.getState().removeLeftTab(d.id);
      }
      // It takes the slot it was dropped in.
      const toLeft = d.moveSide === "left";
      const at = crossDropIndex(usePaperTabs.getState().tabs, d.id, d.insertBefore ?? null, (key) => isLeftTab(key) === toLeft);
      if (at >= 0) usePaperTabs.getState().moveTab(d.id, at);
      moveTabToSide(d.id, d.moveSide);
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
  // Crossing to the other group, the dragged tab takes the width of the slot it would land in.
  const crossingId = drag?.mode === "reorder" && drag.moveSide ? drag.id : null;
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!crossingId || !bar) return;
    const el = bar.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(crossingId)}"]`);
    const slot = bar.querySelector<HTMLElement>(`.${styles.dropSlot}`);
    if (!el || !slot) return;
    const fit = () => {
      el.style.flex = "none";
      el.style.minWidth = "0";
      el.style.width = `${slot.getBoundingClientRect().width}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(slot);
    return () => {
      observer.disconnect();
      el.style.flex = el.style.minWidth = el.style.width = "";
    };
  }, [crossingId, drag?.insertBefore]);

  // A drag must never outlive its tab or the bar: closed / trashed mid-drag, Escape, or the bar
  // unmounting cancels it, so the selection lock and the split slots are always released.
  const cancelDragRef = useRef<() => void>(() => {});
  cancelDragRef.current = () => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDrag(null);
    setSplitPeek(false);
    d.releaseSelection?.();
  };
  const dragId = drag?.id ?? null;
  useEffect(() => {
    if (dragId && !tabs.includes(dragId)) cancelDragRef.current();
  }, [dragId, tabs]);
  useEffect(() => {
    if (!dragId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelDragRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragId]);
  useEffect(() => () => cancelDragRef.current(), []);

  // Released tab glides from where the pointer left it into its (new) slot.
  useLayoutEffect(() => {
    const settle = settleRef.current;
    if (!settle || drag) return;
    settleRef.current = null;
    const el = barRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(settle.id)}"]`);
    el?.animate([{ transform: `translateX(${settle.offset}px)` }, { transform: "translateX(0)" }], { duration: SETTLE_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" });
  });

  // The right side lost its paper / folder to the left: it moves on to a neighbouring tab, or
  // with none left the split ends and that paper / folder fills the card.
  const refillRight = (key: TabKey) => {
    const next = rightNeighbour(key);
    lastActiveRef.current = null;
    if (next) {
      navigate(tabPath(next));
      return;
    }
    useSplitView.getState().closeSplit();
    navigate(tabPath(key));
  };

  // Dropped on the card's left half: the paper opens there; if it was the page on the right,
  // the right side moves on to a neighbouring tab (or the split ends).
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
    // The right pane's paper moves left: the right shows its next tab, or the split ends.
    useSplitView.getState().openSplit(key);
    refillRight(key);
  };

  // The card's own paper / folder dropped on its right half stays there; the left shows all papers.
  const openRightFromTab = (key: TabKey) => {
    const page = pageTabForPath(location.pathname);
    if (activeId && activeId !== key) useSplitView.getState().openSplit(activeId);
    else useSplitView.getState().showPage(activeId ? "page:/" : page ?? "page:/");
    // Only the dropped tab goes right; the other tabs stay over the left card.
    for (const other of usePaperTabs.getState().tabs) if (other !== key) useSplitView.getState().addLeftTab(other);
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
  // Split view: the group a dragged tab is crossing into opens an empty slot where it would land.
  const withDropSlot = (group: VisibleTab[], side: SplitSide) => {
    const nodes = group.map(renderTab);
    if (drag?.mode !== "reorder" || drag.moveSide !== side || drag.insertBefore === undefined) return nodes;
    const at = drag.insertBefore ? group.findIndex((tab) => tab.key === drag.insertBefore) : -1;
    nodes.splice(at >= 0 ? at : nodes.length, 0, <div key="drop-slot" className={styles.dropSlot} aria-hidden />);
    return nodes;
  };
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
        // Capture lost without a pointerup (window lost focus, system gesture): cancel.
        onLostPointerCapture={() => cancelDragRef.current()}
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
          {withDropSlot(leadTabs, "left")}
        </div>
      )}
      {leadWidth == null && pinnedTabs}
      {withDropSlot(leadWidth != null ? visible.filter((tab) => !isLeftTab(tab.key)) : visible, "right")}
      {drag?.mode === "split" && createPortal(<SplitDropPreview drag={drag} />, document.body)}
    </div>
  );
}
