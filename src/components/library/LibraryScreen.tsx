import { useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Plus, Upload } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { useImportJobStore, visibleImportJobs } from "../../stores/importJobStore";
import { useProjectStore } from "../../stores/projectStore";
import { useLibraryPaperSearch } from "../../hooks/useLibraryPaperSearch";
import { derivePaperReadiness } from "../../domain/paperReadiness";
import { tryStartPdfImport } from "../../services/pdfImport";
import { PaperCard } from "./PaperCard";
import { PaperMenu } from "./PaperMenu";
import { ImportJobCard } from "./ImportJobCard";
import { LibraryViewToggle, useLibraryView } from "./LibraryViewToggle";
import { LibrarySortMenu, useSortedPapers } from "./LibrarySortMenu";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import { useImportJobRecovery } from "./useImportJobRecovery";
import styles from "./LibraryScreen.module.css";

export function LibraryScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const papers = useLibraryCache((state) => state.papers);
  const setCurrentPaper = useAppStore((state) => state.setCurrentPaper);
  const searchQuery = useProjectStore((state) => state.searchQuery);
  const importJobs = useImportJobStore((state) => state.jobs);
  const jobs = useMemo(() => visibleImportJobs(importJobs), [importJobs]);
  const visiblePapers = useSortedPapers(useLibraryPaperSearch(papers, searchQuery));
  const recovery = useImportJobRecovery({ fileInputRef });
  const view = useLibraryView();

  const { busyId, requestDelete } = useDeletePaper();

  const handleFileSelect = useCallback(async (file: File) => {
    await tryStartPdfImport(file);
  }, []);

  const handleOpenPaper = (paperId: string) => {
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

  const isEmpty = visiblePapers.length === 0 && jobs.length === 0;

  return (
    <div className={styles.container}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        data-testid="library-add-pdf-input"
        aria-label="PDFファイルを選択"
        className={styles.hiddenInput}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFileSelect(f);
          e.target.value = "";
        }}
      />

      <header className={styles.header} data-tauri-drag-region>
        <div className={styles.headerLeft}>
          <FileText size={24} className={styles.logo} />
          <h1 className={styles.title}>すべての論文</h1>
        </div>
        <div className={styles.headerRight}>
          <LibrarySortMenu />
          <LibraryViewToggle />
          <button
            type="button"
            className={styles.addButton}
            onClick={() => fileInputRef.current?.click()}
            title="論文を追加"
            aria-label="論文を追加"
          >
            <Plus size={18} />
            論文を追加
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {isEmpty ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <Upload size={64} strokeWidth={1} />
            </div>
            <h2 className={styles.emptyTitle}>
              {searchQuery.trim() ? "一致する論文がありません" : "PDFをここにドロップ"}
            </h2>
            <p className={styles.emptyDescription}>
              {searchQuery.trim()
                ? "ライブラリ検索を変えるか、右上から PDF を追加してください"
                : "または右上の「論文を追加」から PDF を選んでください"}
            </p>
          </div>
        ) : (
          <>
            <div className={view === "grid" ? styles.tileGrid : styles.paperList}>
              {jobs.map((job) => (
                <ImportJobCard key={job.id} job={job} layout={view} {...recovery} />
              ))}
              {visiblePapers.map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  layout={view}
                  enabled={busyId !== paper.id}
                  onOpen={() => handleOpenPaper(paper.id)}
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
          </>
        )}
      </main>
    </div>
  );
}
