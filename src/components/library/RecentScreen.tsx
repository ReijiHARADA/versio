import { useMemo } from "react";
import { Clock } from "lucide-react";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { useLibraryPaperSearch } from "../../hooks/useLibraryPaperSearch";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import { LibraryViewToggle, useLibraryView } from "./LibraryViewToggle";
import { LibrarySortMenu, useSortedPapers } from "./LibrarySortMenu";
import { LibraryEmptyState, LibraryPaperList } from "./LibraryPaperList";
import { useOpenPaper } from "./useOpenPaper";
import styles from "./LibraryScreen.module.css";

export function RecentScreen() {
  const papers = useLibraryCache((s) => s.papers);
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const { busyId, requestDelete } = useDeletePaper();
  const openPaper = useOpenPaper();

  const recentBase = useMemo(() => {
    return [...papers]
      .filter((p) => p.lastOpenedAt || p.lastReadBlockId)
      .sort((a, b) => {
        const ta = a.lastOpenedAt ?? a.updatedAt;
        const tb = b.lastOpenedAt ?? b.updatedAt;
        return tb.localeCompare(ta);
      })
      .slice(0, 30);
  }, [papers]);
  const recent = useSortedPapers(useLibraryPaperSearch(recentBase, searchQuery));
  const view = useLibraryView();

  return (
    <div className={styles.container}>
      <header className={styles.header} data-tauri-drag-region>
        <div className={styles.headerLeft}>
          <Clock size={20} style={{ color: "var(--color-accent)" }} />
          <h1 className={styles.title}>最近読んだ論文</h1>
        </div>
        <div className={styles.headerRight}>
          <LibrarySortMenu />
          <LibraryViewToggle />
        </div>
      </header>
      <main className={styles.main}>
        {recent.length === 0 ? (
          <LibraryEmptyState
            icon={<Clock size={64} strokeWidth={1} />}
            title="閲覧履歴がありません"
            description="論文を開くと、ここに最近読んだ論文が表示されます"
          />
        ) : (
          <LibraryPaperList
            view={view}
            papers={recent}
            busyId={busyId}
            onOpen={(paper) => openPaper(paper)}
            onDeleteRequest={requestDelete}
          />
        )}
      </main>
    </div>
  );
}
