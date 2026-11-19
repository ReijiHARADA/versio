import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Clock } from "../ui/MaterialSymbol";
import { useAppStore } from "../../stores/appStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { derivePaperReadiness } from "../../domain/paperReadiness";
import { useLibraryPaperSearch } from "../../hooks/useLibraryPaperSearch";
import { PaperCard } from "./PaperCard";
import { PaperMenu } from "./PaperMenu";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import styles from "./LibraryScreen.module.css";

export function RecentScreen() {
  const navigate = useNavigate();
  const papers = useLibraryCache((s) => s.papers);
  const setCurrentPaper = useAppStore((s) => s.setCurrentPaper);
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const { busyId, requestDelete } = useDeletePaper();

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
  const recent = useLibraryPaperSearch(recentBase, searchQuery);

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
          <Clock size={20} style={{ color: "var(--color-accent)" }} />
          <h1 className={styles.title}>最近読んだ論文</h1>
        </div>
      </header>
      <main className={styles.main}>
        {recent.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Clock size={64} strokeWidth={1} /></div>
            <h2 className={styles.emptyTitle}>閲覧履歴がありません</h2>
            <p className={styles.emptyDescription}>論文を開くと、ここに最近読んだ論文が表示されます</p>
          </div>
        ) : (
          <div className={styles.paperList}>
            {recent.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
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
