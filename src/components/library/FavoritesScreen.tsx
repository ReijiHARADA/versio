import { useMemo } from "react";
import { Star } from "lucide-react";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { useLibraryPaperSearch } from "../../hooks/useLibraryPaperSearch";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import { LibraryViewToggle, useLibraryView } from "./LibraryViewToggle";
import { LibrarySortMenu, useSortedPapers } from "./LibrarySortMenu";
import { LibraryEmptyState, LibraryPaperList } from "./LibraryPaperList";
import { useOpenPaper } from "./useOpenPaper";
import styles from "./LibraryScreen.module.css";

export function FavoritesScreen() {
  const papers = useLibraryCache((s) => s.papers);
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const favoriteBase = useMemo(() => papers.filter((p) => p.favorite), [papers]);
  const favorites = useSortedPapers(useLibraryPaperSearch(favoriteBase, searchQuery));
  const view = useLibraryView();
  const { busyId, requestDelete } = useDeletePaper();
  const openPaper = useOpenPaper();

  return (
    <div className={styles.container}>
      <header className={styles.header} data-tauri-drag-region>
        <div className={styles.headerLeft}>
          <Star size={20} style={{ color: "var(--color-favorite)" }} fill="currentColor" />
          <h1 className={styles.title}>お気に入り</h1>
        </div>
        <div className={styles.headerRight}>
          <LibrarySortMenu />
          <LibraryViewToggle />
        </div>
      </header>
      <main className={styles.main}>
        {favorites.length === 0 ? (
          <LibraryEmptyState
            icon={<Star size={64} strokeWidth={1} />}
            title="お気に入りがありません"
            description="論文のメニューからお気に入りに追加できます"
          />
        ) : (
          <LibraryPaperList
            view={view}
            papers={favorites}
            busyId={busyId}
            onOpen={(paper) => openPaper(paper)}
            onDeleteRequest={requestDelete}
          />
        )}
      </main>
    </div>
  );
}
