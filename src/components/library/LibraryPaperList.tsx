import { memo, useEffect, useMemo, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { LibraryView } from "../../stores/appStore";
import type { ImportJob } from "../../stores/importJobStore";
import type { Paper } from "../../types/paper";
import { ImportJobCard } from "./ImportJobCard";
import { PaperCard } from "./PaperCard";
import { PaperMenu } from "./PaperMenu";
import { setPaperDisplayOrder } from "./paperDisplayOrder";
import styles from "./LibraryScreen.module.css";

type LibraryPaperListProps = {
  view: LibraryView;
  papers: Paper[];
  busyId: string | null;
  onOpen: (paper: Paper) => void;
  onDeleteRequest: ComponentProps<typeof PaperMenu>["onDeleteRequest"];
  jobs?: ImportJob[];
  recovery?: Omit<ComponentProps<typeof ImportJobCard>, "job" | "layout">;
};

/**
 * Up to this many cards render as one plain grid / list. Above it only the rows
 * near the viewport are mounted: 10000 cards took 6.7 s to show and ~2 s per
 * keystroke (docs/research/library-scale-bench-2026-11.md).
 */
export const VIRTUALIZE_ABOVE = 150;
/** `.tileGrid` minimum column width and gap (`--spacing-xs`). */
const TILE_MIN_WIDTH = 150;
const TILE_GAP = 4;

const NO_JOBS: ImportJob[] = [];

type Item = { kind: "job"; job: ImportJob } | { kind: "paper"; paper: Paper };

/** Grid/list of import jobs and paper cards shared by the library collection screens. */
export function LibraryPaperList({
  view,
  papers,
  busyId,
  onOpen,
  onDeleteRequest,
  jobs = NO_JOBS,
  recovery,
}: LibraryPaperListProps) {
  const renderItem = (item: Item) => (
    <LibraryItem
      key={item.kind === "job" ? item.job.id : item.paper.id}
      item={item}
      view={view}
      busy={item.kind === "paper" && busyId === item.paper.id}
      onOpen={onOpen}
      onDeleteRequest={onDeleteRequest}
      recovery={recovery}
    />
  );
  const items = useMemo<Item[]>(
    () => [
      ...jobs.map((job) => ({ kind: "job" as const, job })),
      ...papers.map((paper) => ({ kind: "paper" as const, paper })),
    ],
    [jobs, papers]
  );

  if (items.length <= VIRTUALIZE_ABOVE) {
    return <div className={view === "grid" ? styles.tileGrid : styles.paperList}>{items.map(renderItem)}</div>;
  }
  // A fresh virtualizer per view: grid row heights must not seed the list rows.
  return <VirtualPaperList key={view} view={view} items={items} papers={papers} renderItem={renderItem} />;
}

/** Memoized so scrolling a virtual list re-renders only the rows it mounts. */
const LibraryItem = memo(function LibraryItem({
  item,
  view,
  busy,
  onOpen,
  onDeleteRequest,
  recovery,
}: {
  item: Item;
  view: LibraryView;
  busy: boolean;
  onOpen: (paper: Paper) => void;
  onDeleteRequest: LibraryPaperListProps["onDeleteRequest"];
  recovery: LibraryPaperListProps["recovery"];
}) {
  if (item.kind === "job") return <ImportJobCard job={item.job} layout={view} {...recovery} />;
  const { paper } = item;
  return (
    <PaperCard
      paper={paper}
      layout={view}
      enabled={!busy}
      onOpen={() => {
        if (!busy) onOpen(paper);
      }}
      actions={<PaperMenu paper={paper} variant="library" onDeleteRequest={onDeleteRequest} />}
    />
  );
});

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

function VirtualPaperList({
  view,
  items,
  papers,
  renderItem,
}: {
  view: LibraryView;
  items: Item[];
  papers: Paper[];
  renderItem: (item: Item) => ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const list = listRef.current;
    const scroller = scrollParent(list);
    setScrollEl(scroller);
    if (!list || !scroller) return;
    const measure = () => {
      setWidth(list.clientWidth);
      setScrollMargin(
        list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  // Shift-click ranges follow the full display order, not just the mounted cards.
  useEffect(() => {
    setPaperDisplayOrder(papers.map((paper) => paper.id));
    return () => setPaperDisplayOrder(null);
  }, [papers]);

  const columns =
    view === "grid" ? Math.max(1, Math.floor((width + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP))) : 1;
  const rowCount = Math.ceil(items.length / columns);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollEl,
    // Grid tiles are a cover plus two title lines; list rows measure about 41px.
    estimateSize: () => (view === "grid" ? (width / columns) * 1.3 + 48 : 41),
    overscan: 4,
    scrollMargin,
  });

  // A width change regroups items into rows; drop the old row measurements.
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [virtualizer, columns]);

  return (
    <div ref={listRef} className={styles.virtualList} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={`${columns}-${row.index}`}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className={view === "grid" ? `${styles.tileGrid} ${styles.virtualGridRow}` : styles.paperList}
          style={{
            transform: `translateY(${row.start - scrollMargin}px)`,
            ...(view === "grid" ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : {}),
          }}
        >
          {items.slice(row.index * columns, row.index * columns + columns).map(renderItem)}
        </div>
      ))}
    </div>
  );
}

export function LibraryEmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>{icon}</div>
      <h2 className={styles.emptyTitle}>{title}</h2>
      <p className={styles.emptyDescription}>{description}</p>
    </div>
  );
}
