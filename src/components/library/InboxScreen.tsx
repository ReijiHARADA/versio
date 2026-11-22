import { useCallback, useMemo, useRef } from "react";
import { Upload, Inbox } from "lucide-react";
import { useLibraryCache } from "../../stores/libraryCache";
import { useImportJobStore, visibleImportJobs } from "../../stores/importJobStore";
import { useProjectStore } from "../../stores/projectStore";
import { useLibraryPaperSearch } from "../../hooks/useLibraryPaperSearch";
import { tryStartPdfImport } from "../../services/pdfImport";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import { useImportJobRecovery } from "./useImportJobRecovery";
import { LibraryViewToggle, useLibraryView } from "./LibraryViewToggle";
import { LibrarySortMenu, useSortedPapers } from "./LibrarySortMenu";
import { AddPaperButton } from "./AddPaperButton";
import { LibraryEmptyState, LibraryPaperList } from "./LibraryPaperList";
import { useOpenPaper } from "./useOpenPaper";
import styles from "./LibraryScreen.module.css";

export function InboxScreen() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const papers = useLibraryCache((s) => s.papers);
  const memberships = useProjectStore((s) => s.memberships);
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const importJobs = useImportJobStore((state) => state.jobs);
  const jobs = useMemo(
    () => visibleImportJobs(importJobs, { inboxOnly: true }),
    [importJobs]
  );
  const recovery = useImportJobRecovery({ fileInputRef });
  const { busyId, requestDelete } = useDeletePaper();

  const workspaceNodes = useProjectStore((s) => s.workspaceNodes);
  const assignedIds = useMemo(() => {
    const active = new Set(workspaceNodes.map((node) => node.id));
    return new Set(
      memberships.filter((m) => active.has(m.nodeId)).map((m) => m.paperId)
    );
  }, [memberships, workspaceNodes]);
  const inboxBase = useMemo(
    () => papers.filter((p) => !assignedIds.has(p.id)),
    [assignedIds, papers]
  );
  const inboxPapers = useSortedPapers(useLibraryPaperSearch(inboxBase, searchQuery));
  const view = useLibraryView();
  const openPaper = useOpenPaper();

  const handleFileSelect = useCallback(async (file: File) => {
    await tryStartPdfImport(file);
  }, []);

  return (
    <div className={styles.container}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className={styles.hiddenInput}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFileSelect(f);
          e.target.value = "";
        }}
      />

      <header className={styles.header} data-tauri-drag-region>
        <div className={styles.headerLeft}>
          <Inbox size={20} style={{ color: "var(--color-accent)" }} />
          <h1 className={styles.title}>インボックス</h1>
        </div>
        <div className={styles.headerRight}>
          <LibrarySortMenu />
          <LibraryViewToggle />
          <AddPaperButton className={styles.addButton} onPickFile={() => fileInputRef.current?.click()} />
        </div>
      </header>

      <main className={styles.main}>
        {inboxPapers.length === 0 && jobs.length === 0 ? (
          <LibraryEmptyState
            icon={<Upload size={64} strokeWidth={1} />}
            title={searchQuery.trim() ? "一致する論文がありません" : "インボックスは空です"}
            description="どのフォルダにも属さない論文がここに入ります。右上の「論文を追加」か、PDF をこの画面にドロップしてください。メニューからワークスペースのフォルダに追加できます。"
          />
        ) : (
          <LibraryPaperList
            view={view}
            papers={inboxPapers}
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
