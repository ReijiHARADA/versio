import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FileText, X } from "lucide-react";
import { useLibraryCache } from "../../stores/libraryCache";
import { readerPaperId, usePaperTabs } from "../../stores/paperTabsStore";
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
/** Keeps the outer flares on the card's straight top edge, clear of its rounded corners. */
const EDGE_PAD = 24;
const isTranslating = (paper: Paper) =>
  paper.processingStatus === "translating" || paper.processingStatus === "glossary";

/** Chrome-style paper tabs in the title bar strip above the main card. */
export function PaperTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const tabs = usePaperTabs((state) => state.tabs);
  const papers = useLibraryCache((state) => state.papers);
  const activeId = readerPaperId(location.pathname);
  const lastActiveRef = useRef<string | null>(null);
  const lastPagePathRef = useRef("/");
  const barRef = useRef<HTMLDivElement>(null);
  const [inset, setInset] = useState({ left: 0, right: 0 });
  // Tabs restored at launch appear in place; tabs opened later grow in (see .entering).
  const settledRef = useRef<Set<string> | null>(null);
  if (settledRef.current === null) settledRef.current = new Set(tabs);
  const [, setSettledVersion] = useState(0);
  const settle = (paperId: string) => {
    if (settledRef.current?.has(paperId)) return;
    settledRef.current?.add(paperId);
    setSettledVersion((v) => v + 1);
  };

  // The route decides the active tab; opening a paper anywhere opens (or focuses) its tab.
  useEffect(() => {
    if (activeId) {
      usePaperTabs.getState().openTab(activeId, lastActiveRef.current);
      lastActiveRef.current = activeId;
    } else {
      lastPagePathRef.current = location.pathname + location.search;
    }
  }, [activeId, location.pathname, location.search]);

  // Drop tabs of trashed or deleted papers once the library has loaded.
  useEffect(() => {
    if (papers.length === 0) return;
    const live = new Set(papers.filter((paper) => !paper.trashedAt).map((paper) => paper.id));
    usePaperTabs.getState().retainTabs((id) => live.has(id) || id === activeId);
  }, [papers, activeId]);

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
    (paperId: string) => {
      const next = usePaperTabs.getState().closeTab(paperId);
      if (paperId !== activeId) return;
      lastActiveRef.current = null;
      navigate(next ? `/reader/${encodeURIComponent(next)}` : lastPagePathRef.current);
    },
    [activeId, navigate]
  );

  const openTab = useCallback(
    (paperId: string) => {
      if (paperId !== activeId) navigate(`/reader/${encodeURIComponent(paperId)}`);
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

  // Pointer reordering (HTML5 drag-and-drop is unreliable in WKWebView).
  const dragRef = useRef<{ id: string; startX: number; moved: boolean } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const onPointerDown = (event: React.PointerEvent, paperId: string) => {
    if (event.button !== 0) return;
    dragRef.current = { id: paperId, startX: event.clientX, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      setDraggingId(drag.id);
    }
    const items = [...(barRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? [])];
    const index = items.findIndex((item) => {
      const rect = item.getBoundingClientRect();
      return event.clientX < rect.left + rect.width / 2;
    });
    const list = usePaperTabs.getState().tabs;
    const from = list.indexOf(drag.id);
    let to = index < 0 ? list.length - 1 : index;
    if (to > from) to -= 1;
    if (to !== from) usePaperTabs.getState().moveTab(drag.id, to);
  };
  const onPointerUp = (paperId: string) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDraggingId(null);
    if (drag && !drag.moved) openTab(paperId);
  };

  const byId = new Map(papers.map((paper) => [paper.id, paper]));
  const visible = tabs.filter((id) => byId.has(id));
  // Tabs start on the card's left edge (one vertical line) unless the title bar controls are in
  // the way; then they move right far enough for the flare to clear the card's corner.
  const paddingLeft = inset.left > 0 ? Math.max(EDGE_PAD, inset.left) : 0;

  return (
    <div
      ref={barRef}
      className={styles.bar}
      data-tauri-drag-region
      role="tablist"
      aria-label="開いている論文"
      style={{ paddingLeft, paddingRight: Math.max(EDGE_PAD + 10, inset.right) }}
    >
      {visible.map((id, index) => {
        const paper = byId.get(id)!;
        const title = displayPaperTitle(paper);
        const active = id === activeId;
        return (
          <div
            key={id}
            data-tab-id={id}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            title={title}
            className={`${styles.tab} ${active ? styles.active : ""} ${draggingId === id ? styles.dragging : ""} ${settledRef.current?.has(id) ? "" : styles.entering}`}
            onAnimationEnd={(event) => { if (event.target === event.currentTarget) settle(id); }}
            onPointerDown={(event) => onPointerDown(event, id)}
            onPointerMove={onPointerMove}
            onPointerUp={() => onPointerUp(id)}
            onPointerCancel={() => { dragRef.current = null; setDraggingId(null); }}
            onAuxClick={(event) => { if (event.button === 1) closeTab(id); }}
            onKeyDown={(event) => { if (event.key === "Enter") openTab(id); }}
          >
            {active && <ActiveTabShape flushLeft={index === 0 && paddingLeft === 0} />}
            <FileText className={styles.icon} size={14} strokeWidth={1.6} aria-hidden />
            <span className={styles.title}>{title}</span>
            {isTranslating(paper) && <span className={styles.status}>翻訳中</span>}
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
    </div>
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
    <span className={styles.shape} style={{ left: flushLeft ? 0 : -TAB_FLARE, right: -TAB_FLARE, height: TAB_HEIGHT }} aria-hidden>
      {flushLeft
        ? cap(TAB_FLUSH_LEFT_FILL, TAB_FLUSH_LEFT_STROKE, TAB_FLUSH_CAP_WIDTH, TAB_HEIGHT + TAB_FLUSH_DROP)
        : cap(TAB_CAP_LEFT_FILL, TAB_CAP_LEFT_STROKE)}
      <span className={styles.shapeMid} />
      {cap(TAB_CAP_RIGHT_FILL, TAB_CAP_RIGHT_STROKE)}
    </span>
  );
}
