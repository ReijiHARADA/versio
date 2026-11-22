import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, FolderX, Loader2, Upload } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppStore } from "../../stores/appStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { useImportJobStore, visibleImportJobs } from "../../stores/importJobStore";
import { usePaperDragStore } from "../../stores/paperDragStore";
import { derivePaperReadiness } from "../../domain/paperReadiness";
import { useLibraryPaperSearch } from "../../hooks/useLibraryPaperSearch";
import { useFolderExport } from "../../hooks/useFolderExport";
import { collectDescendantIds, listChildWorkspaceNodes, workspaceAncestorPath } from "../../data/workspace/tree";
import { listPapersForWorkspace, removePaperFromWorkspace } from "../../services/projectService";
import { tryStartPdfImport } from "../../services/pdfImport";
import { PaperCard } from "../library/PaperCard";
import { PaperMenu } from "../library/PaperMenu";
import { ImportJobCard } from "../library/ImportJobCard";
import { useImportJobRecovery } from "../library/useImportJobRecovery";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import { ExportDialog } from "../reader/ExportDialog";
import { WorkspaceFolderCard } from "./WorkspaceFolderCard";
import { LibraryViewToggle, useLibraryView } from "../library/LibraryViewToggle";
import { LibrarySortMenu, useSortedPapers } from "../library/LibrarySortMenu";
import { WorkspacePathTrail } from "../workspace/WorkspacePathTrail";
import type { Paper } from "../../types/paper";
import type { WorkspaceNode, WorkspacePaper } from "../../types/project";
import { AddPaperButton } from "../library/AddPaperButton";
import styles from "./ProjectScreen.module.css";

function subtreePaperIds(
  nodeId: string,
  nodes: WorkspaceNode[],
  memberships: WorkspacePaper[]
): string[] {
  const ids = new Set([nodeId, ...collectDescendantIds(nodes, nodeId)]);
  return [
    ...new Set(memberships.filter((link) => ids.has(link.nodeId)).map((link) => link.paperId)),
  ];
}

/** Compatibility route component for /project/:id; every id is a WorkspaceNode. */
export function ProjectScreen() {
  const { projectId: nodeId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const setCurrentPaper = useAppStore((state) => state.setCurrentPaper);
  const storePapers = useLibraryCache((state) => state.papers);
  const searchQuery = useProjectStore((state) => state.searchQuery);
  const workspaceNodes = useProjectStore((state) => state.workspaceNodes);
  const memberships = useProjectStore((state) => state.memberships);
  const removeMembershipLocal = useProjectStore((state) => state.removeMembershipLocal);
  const importJobs = useImportJobStore((state) => state.jobs);
  const dropTargetId = usePaperDragStore((state) => state.dropTargetId);
  const draggingPaperId = usePaperDragStore((state) => state.draggingPaperId);
  const { requestDelete } = useDeletePaper();
  const folderExport = useFolderExport();
  const view = useLibraryView();
  const jobs = useMemo(
    () => visibleImportJobs(importJobs, { workspaceNodeId: nodeId }),
    [importJobs, nodeId]
  );
  const node = workspaceNodes.find((item) => item.id === nodeId);
  // The card lists the whole subtree; a drag moves the paper out of the node that holds it.
  const sourceNodeByPaper = useMemo(() => {
    const map = new Map<string, string>();
    if (!nodeId) return map;
    const ids = new Set([nodeId, ...collectDescendantIds(workspaceNodes, nodeId)]);
    for (const link of memberships) {
      if (ids.has(link.nodeId) && (!map.has(link.paperId) || link.nodeId === nodeId)) map.set(link.paperId, link.nodeId);
    }
    return map;
  }, [nodeId, workspaceNodes, memberships]);
  const subtreeCount = useMemo(
    () => (nodeId ? subtreePaperIds(nodeId, workspaceNodes, memberships).length : 0),
    [memberships, nodeId, workspaceNodes]
  );
  const [nodePapers, setNodePapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recovery = useImportJobRecovery({ fileInputRef });

  useEffect(() => {
    if (!nodeId) return;
    setLoading(true);
    void listPapersForWorkspace(nodeId).then(setNodePapers).finally(() => setLoading(false));
  }, [nodeId, memberships]);

  const projectBase = useMemo(
    () => nodePapers.map((paper) => storePapers.find((item) => item.id === paper.id) ?? paper),
    [nodePapers, storePapers]
  );
  const merged = useSortedPapers(useLibraryPaperSearch(projectBase, searchQuery));

  const childFolders = useMemo(() => {
    if (!nodeId) return [];
    const query = searchQuery.trim().toLowerCase();
    return listChildWorkspaceNodes(workspaceNodes, nodeId).filter(
      (item) => !query || item.name.toLowerCase().includes(query)
    );
  }, [nodeId, searchQuery, workspaceNodes]);

  const folderPath = useMemo(
    () => workspaceAncestorPath(workspaceNodes, nodeId),
    [workspaceNodes, nodeId]
  );

  const file = useCallback(
    async (selected: File) => {
      if (nodeId) await tryStartPdfImport(selected, { workspaceNodeId: nodeId });
    },
    [nodeId]
  );

  if (!node && !loading) {
    return (
      <div className={styles.empty}>
        <FolderX size={48} strokeWidth={1} />
        <p>ワークスペースが見つかりません</p>
      </div>
    );
  }

  const isEmpty = merged.length === 0 && jobs.length === 0 && childFolders.length === 0;

  return (
    <div className={styles.container}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className={styles.hiddenInput}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (selected) void file(selected);
          event.target.value = "";
        }}
      />
      <header className={styles.header} data-tauri-drag-region>
        <div className={styles.headerText}>
          {folderPath.length > 0 ? (
            <h1 className={styles.title}>
              <WorkspacePathTrail folders={folderPath} />
            </h1>
          ) : (
            <h1 className={styles.title}>{node?.name ?? "…"}</h1>
          )}
          {node?.description && <p className={styles.description}>{node.description}</p>}
        </div>
        <div className={styles.headerActions}>
          <LibrarySortMenu />
          <LibraryViewToggle />
          <button
            type="button"
            className={styles.exportButton}
            disabled={!node || subtreeCount === 0}
            onClick={() => {
              if (node) folderExport.openExport(node);
            }}
            aria-label="このフォルダを書き出す"
          >
            <Upload size={18} />
            書き出す
          </button>
          <AddPaperButton className={styles.addButton} onPickFile={() => fileInputRef.current?.click()} workspaceNodeId={nodeId} />
        </div>
      </header>
      {loading ? (
        <div className={styles.loadingWrap}>
          <Loader2 size={28} className={styles.spin} />
          <p>読み込み中...</p>
        </div>
      ) : isEmpty ? (
        <div className={styles.emptyState}>
          <FileText size={48} strokeWidth={1} />
          <p>{searchQuery.trim() ? "一致する項目がありません" : "まだフォルダも論文もありません"}</p>
          <p className={styles.hint}>
            このフォルダ内の子フォルダと、このフォルダおよび子フォルダの論文を表示します。
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {childFolders.length > 0 && (
            <div className={view === "grid" ? styles.tileGrid : styles.folderList}>
              {childFolders.map((folder) => {
                const paperIds = subtreePaperIds(folder.id, workspaceNodes, memberships);
                return (
                  <WorkspaceFolderCard
                    key={folder.id}
                    node={folder}
                    layout={view}
                    coverPaperIds={paperIds}
                    childFolderCount={listChildWorkspaceNodes(workspaceNodes, folder.id).length}
                    paperCount={paperIds.length}
                    dropTarget={dropTargetId === folder.id}
                    onOpen={() => {
                      if (draggingPaperId) return;
                      navigate(`/project/${folder.id}`);
                    }}
                  />
                );
              })}
            </div>
          )}
          <div className={view === "grid" ? styles.tileGrid : styles.paperList}>
            {jobs.map((job) => (
              <ImportJobCard key={job.id} job={job} layout={view} {...recovery} />
            ))}
            {merged.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                layout={view}
                sourceNodeId={sourceNodeByPaper.get(paper.id)}
                onOpen={() => {
                  const state = derivePaperReadiness({
                    processingStatus: paper.processingStatus,
                    blocks: useLibraryCache.getState().blocks[paper.id],
                  });
                  if (state.canOpen) {
                    setCurrentPaper(paper.id);
                    navigate(`/reader/${paper.id}?workspace=${nodeId}`);
                  }
                }}
                actions={
                  <PaperMenu
                    paper={paper}
                    variant="workspace"
                    onRemoveFromWorkspace={(paperId) => {
                      if (nodeId) {
                        void removePaperFromWorkspace(nodeId, paperId).then(() =>
                          removeMembershipLocal(nodeId, paperId)
                        );
                      }
                    }}
                    onDeleteRequest={requestDelete}
                  />
                }
              />
            ))}
          </div>
        </div>
      )}
      <ExportDialog
        open={folderExport.showExport}
        busy={folderExport.exportBusy}
        status={folderExport.exportStatus}
        error={folderExport.exportError}
        title="フォルダを書き出す"
        scopeNote={
          folderExport.target
            ? `「${folderExport.target.name}」とその子フォルダの論文 ${subtreePaperIds(folderExport.target.id, workspaceNodes, memberships).length} 件を、フォルダ階層つき ZIP にまとめます。失敗した論文はスキップし report に残します。`
            : null
        }
        allowEpubSync={false}
        onClose={folderExport.closeExport}
        onExport={(values) => {
          void folderExport.handleExport(values);
        }}
      />
    </div>
  );
}
