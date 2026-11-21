import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { derivePaperReadiness } from "../../domain/paperReadiness";
import { useLibraryPaperSearch } from "../../hooks/useLibraryPaperSearch";
import { PaperCard } from "./PaperCard";
import { PaperMenu } from "./PaperMenu";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import { LibraryViewToggle, useLibraryView } from "./LibraryViewToggle";
import { LibrarySortMenu, useSortedPapers } from "./LibrarySortMenu";
import styles from "./LibraryScreen.module.css";

export function FavoritesScreen() {
  const navigate = useNavigate();
  const papers = useLibraryCache((s) => s.papers);
  const setCurrentPaper = useAppStore((s) => s.setCurrentPaper);
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const favoriteBase = useMemo(() => papers.filter((p) => p.favorite), [papers]);
  const favorites = useSortedPapers(useLibraryPaperSearch(favoriteBase, searchQuery));
  const view = useLibraryView();
  const { busyId, requestDelete } = useDeletePaper();

  const handleOpen = (paperId: string) => {
    if (busyId === paperId) return;
    const paper = papers.find((item) => item.id === paperId);
    if (!paper) return;
    const view = derivePaperReadiness({
      processingStatus: paper.processingStatus,
      blocks: useLibraryCache.getState().blocks[paperId],
    });
    if (!view.canOpen) return;
    setCurrentPaper(paperId);
    navigate(`/reader/${paperId}`);
  };

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
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Star size={64} strokeWidth={1} /></div>
            <h2 className={styles.emptyTitle}>お気に入りがありません</h2>
            <p className={styles.emptyDescription}>論文のメニューからお気に入りに追加できます</p>
          </div>
        ) : (
          <div className={view === "grid" ? styles.tileGrid : styles.paperList}>
            {favorites.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                layout={view}
                enabled={busyId !== paper.id}
                onOpen={() => handleOpen(paper.id)}
                actions={
                  <PaperMenu
                    paper={paper}
                    variant="library"
                    onDeleteRequest={requestDelete}
                  />
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
