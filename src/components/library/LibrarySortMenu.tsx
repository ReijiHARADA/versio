import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Check } from "lucide-react";
import { useAppStore, type LibraryFilter, type LibrarySort, type LibrarySortKey } from "../../stores/appStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { READ_STATUS_LABELS } from "../../services/paperLibraryState";
import type { PaperReadStatus } from "../../types/paper";
import { displayPaperTitle } from "../../services/translation/quality";
import type { Paper } from "../../types/paper";
import menuStyles from "./PaperCard.module.css";
import styles from "./LibrarySortMenu.module.css";

const KEYS: Array<{ key: LibrarySortKey; label: string }> = [
  { key: "added", label: "追加日" },
  { key: "opened", label: "最近開いた日" },
  { key: "title", label: "タイトル" },
  { key: "year", label: "発行年" },
];

const DEFAULT_SORT: LibrarySort = { key: "added", dir: "desc" };

export function useLibrarySort(): LibrarySort {
  return useAppStore((state) => state.displaySettings.librarySort ?? DEFAULT_SORT);
}

function compare(a: Paper, b: Paper, key: LibrarySortKey): number {
  if (key === "title") return displayPaperTitle(a).localeCompare(displayPaperTitle(b), "ja");
  if (key === "year") return (a.year ?? -Infinity) - (b.year ?? -Infinity);
  if (key === "opened") return (a.lastOpenedAt ?? "").localeCompare(b.lastOpenedAt ?? "");
  return a.createdAt.localeCompare(b.createdAt);
}

export function sortPapers(papers: Paper[], sort: LibrarySort): Paper[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  // Ties fall back to newest-added so the order stays stable.
  return [...papers].sort(
    (a, b) => sign * compare(a, b, sort.key) || b.createdAt.localeCompare(a.createdAt)
  );
}

export function filterPapers(papers: Paper[], filter: LibraryFilter): Paper[] {
  if (!filter.status && !filter.tag) return papers;
  return papers.filter(
    (paper) =>
      (!filter.status || (paper.readStatus ?? "unread") === filter.status) &&
      (!filter.tag || (paper.tags ?? []).includes(filter.tag))
  );
}

/** Sorted and filtered by the library-wide (transient) read-status / tag filter. */
export function useSortedPapers(papers: Paper[]): Paper[] {
  const sort = useLibrarySort();
  const filter = useAppStore((state) => state.libraryFilter);
  return useMemo(() => sortPapers(filterPapers(papers, filter), sort), [papers, sort, filter]);
}

const STATUSES: PaperReadStatus[] = ["unread", "reading", "read"];

export function LibrarySortMenu() {
  const sort = useLibrarySort();
  const setDisplaySettings = useAppStore((state) => state.setDisplaySettings);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = KEYS.find((item) => item.key === sort.key) ?? KEYS[0];
  const filter = useAppStore((state) => state.libraryFilter);
  const setLibraryFilter = useAppStore((state) => state.setLibraryFilter);
  const papers = useLibraryCache((state) => state.papers);
  const allTags = useMemo(
    () =>
      [...new Set(papers.filter((paper) => !paper.trashedAt).flatMap((paper) => paper.tags ?? []))].sort(
        (a, b) => a.localeCompare(b, "ja")
      ),
    [papers]
  );
  const filtering = filter.status != null || filter.tag != null;
  const filterLabel = [
    filter.status ? READ_STATUS_LABELS[filter.status] : null,
    filter.tag ? `#${filter.tag}` : null,
  ]
    .filter(Boolean)
    .join("・");
  const title = `並べ替え: ${current.label}（${sort.dir === "asc" ? "昇順" : "降順"}）${filtering ? ` / 絞り込み: ${filterLabel}` : ""}`;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (next: LibrarySort) => {
    setDisplaySettings({ librarySort: next });
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={title}
        title={title}
        data-filtering={filtering || undefined}
        data-testid="library-sort"
        onClick={() => setOpen((value) => !value)}
      >
        <ArrowUpDown size={15} aria-hidden="true" />
        {filtering ? <span className={styles.filterDot} aria-hidden="true" /> : null}
      </button>
      {open && (
        <div className={menuStyles.menu} role="menu">
          {KEYS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitemradio"
              aria-checked={sort.key === item.key}
              className={menuStyles.menuItem}
              onClick={() => choose({ ...sort, key: item.key })}
            >
              <Check size={14} className={sort.key === item.key ? "" : styles.hidden} />
              {item.label}
            </button>
          ))}
          <div className={menuStyles.menuSep} />
          {(["asc", "desc"] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              role="menuitemradio"
              aria-checked={sort.dir === dir}
              className={menuStyles.menuItem}
              onClick={() => choose({ ...sort, dir })}
            >
              <Check size={14} className={sort.dir === dir ? "" : styles.hidden} />
              {dir === "asc" ? "昇順" : "降順"}
            </button>
          ))}
          <div className={menuStyles.menuSep} />
          <p className={styles.sectionLabel}>読書ステータス</p>
          {[null, ...STATUSES].map((status) => (
            <button
              key={status ?? "all"}
              type="button"
              role="menuitemradio"
              aria-checked={filter.status === status}
              className={menuStyles.menuItem}
              onClick={() => setLibraryFilter({ status })}
            >
              <Check size={14} className={filter.status === status ? "" : styles.hidden} />
              {status ? READ_STATUS_LABELS[status] : "すべて"}
            </button>
          ))}
          {allTags.length > 0 && (
            <>
              <div className={menuStyles.menuSep} />
              <p className={styles.sectionLabel}>タグ</p>
              <div className={styles.tagList}>
                {[null, ...allTags].map((tag) => (
                  <button
                    key={tag ?? "all"}
                    type="button"
                    role="menuitemradio"
                    aria-checked={filter.tag === tag}
                    className={menuStyles.menuItem}
                    onClick={() => setLibraryFilter({ tag })}
                  >
                    <Check size={14} className={filter.tag === tag ? "" : styles.hidden} />
                    {tag ?? "すべて"}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
