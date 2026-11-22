import { useMemo, useRef } from "react";
import { FileText, Upload } from "lucide-react";
import { useLibraryCache } from "../../stores/libraryCache";
import { useImportJobStore, visibleImportJobs } from "../../stores/importJobStore";
import { useProjectStore } from "../../stores/projectStore";
import { useLibraryPaperSearch } from "../../hooks/useLibraryPaperSearch";
import { tryStartPdfImport } from "../../services/pdfImport";
import { LibraryViewToggle, useLibraryView } from "./LibraryViewToggle";
import { LibrarySortMenu, useSortedPapers } from "./LibrarySortMenu";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import { useImportJobRecovery } from "./useImportJobRecovery";
import { AddPaperButton } from "./AddPaperButton";
import { LibraryEmptyState, LibraryPaperList } from "./LibraryPaperList";
import { useOpenPaper } from "./useOpenPaper";
import { PdfFileInput } from "../ui/PdfFileInput";
import styles from "./LibraryScreen.module.css";

export function LibraryScreen() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const papers = useLibraryCache((state) => state.papers);
  const searchQuery = useProjectStore((state) => state.searchQuery);
  const importJobs = useImportJobStore((state) => state.jobs);
  const jobs = useMemo(() => visibleImportJobs(importJobs), [importJobs]);
  const visiblePapers = useSortedPapers(useLibraryPaperSearch(papers, searchQuery));
  const recovery = useImportJobRecovery({ fileInputRef });
  const view = useLibraryView();
  const openPaper = useOpenPaper();

  const { busyId, requestDelete } = useDeletePaper();

  const isEmpty = visiblePapers.length === 0 && jobs.length === 0;

  return (
    <div className={styles.container}>
      <PdfFileInput
        inputRef={fileInputRef}
        testId="library-add-pdf-input"
        onFile={(file) => void tryStartPdfImport(file)}
      />

      <header className={styles.header} data-tauri-drag-region>
        <div className={styles.headerLeft}>
          <FileText size={24} className={styles.logo} />
          <h1 className={styles.title}>すべての論文</h1>
        </div>
        <div className={styles.headerRight}>
          <LibrarySortMenu />
          <LibraryViewToggle />
          <AddPaperButton className={styles.addButton} onPickFile={() => fileInputRef.current?.click()} />
        </div>
      </header>

      <main className={styles.main}>
        {isEmpty ? (
          <LibraryEmptyState
            icon={<Upload size={64} strokeWidth={1} />}
            title={searchQuery.trim() ? "一致する論文がありません" : "PDFをここにドロップ"}
            description={
              searchQuery.trim()
                ? "ライブラリ検索を変えるか、右上から PDF を追加してください"
                : "または右上の「論文を追加」から PDF を選んでください"
            }
          />
        ) : (
          <LibraryPaperList
            view={view}
            papers={visiblePapers}
            busyId={busyId}
            onOpen={(paper) => openPaper(paper)}
            onDeleteRequest={requestDelete}
            jobs={jobs}
            recovery={recovery}
          />
        )}
      </main>
    </div>
  );
}
