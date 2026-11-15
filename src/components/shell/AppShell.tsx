import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { useAppStore } from "../../stores/appStore";
import { getAllPapers, getAllWorkspacePapers } from "../../services/database";
import { addPaperToWorkspace, createWorkspaceNode, listWorkspace, movePaperInWorkspace, removePaperFromAllWorkspaces, removeWorkspaceItem } from "../../services/projectService";
import { tryStartPdfImport } from "../../services/pdfImport";
import type { WorkspaceNode } from "../../types/project";
import { AppSidebar } from "./AppSidebar";
import { PaperDragPreview } from "./PaperDragPreview";
import { NewWorkspaceNodeModal } from "../workspace/NewWorkspaceNodeModal";
import { setPaperDropHandler, INBOX_DROP_ID, usePaperDragStore } from "../../stores/paperDragStore";
import { showToast, useToastStore } from "../../stores/toastStore";
import { restoreWorkspaceFolderFromTrash, purgeExpiredTrash } from "../../services/trashService";
import { resumeAfterTranslationServerReady } from "../../services/import/startBackgroundImport";
import { createPresentationCaptureSeed } from "../../services/presentationDemo";
import { useImportJobStore } from "../../stores/importJobStore";
import { isTranslationServerReady, subscribeTranslationServerReady } from "../../utils/serverReady";
import { setTranslationUiDeferReason } from "../../utils/batchBlockUpdates";
import styles from "./AppShell.module.css";

export function AppShell() {
  const location = useLocation(); const navigate = useNavigate();
  const isPresentationDemo = import.meta.env.VITE_VERSIO_DEMO === "1";
  const setPapers = useLibraryCache((state) => state.setPapers);
  const workspaceNodes = useProjectStore((state) => state.workspaceNodes); const memberships = useProjectStore((state) => state.memberships); const searchQuery = useProjectStore((state) => state.searchQuery);
  const setLoaded = useProjectStore((state) => state.setLoaded); const setSearchQuery = useProjectStore((state) => state.setSearchQuery); const mergeWorkspaceNodes = useProjectStore((state) => state.mergeWorkspaceNodes); const setMemberships = useProjectStore((state) => state.setMemberships); const upsertWorkspaceNode = useProjectStore((state) => state.upsertWorkspaceNode); const upsertMembership = useProjectStore((state) => state.upsertMembership); const removeMembershipsForPaper = useProjectStore((state) => state.removeMembershipsForPaper); const removeWorkspaceNodesLocal = useProjectStore((state) => state.removeWorkspaceNodesLocal);
  const showDragToast = usePaperDragStore((state) => state.showToast); const toast = useToastStore((state) => state.toast); const clearToast = useToastStore((state) => state.clearToast);
  const [createParentId, setCreateParentId] = useState<string | null | undefined>(undefined); const [fileNodeId, setFileNodeId] = useState<string | null>(null); const fileInputRef = useRef<HTMLInputElement>(null);
  const [demoReady, setDemoReady] = useState(!isPresentationDemo);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) {
        // Allow ⌘K from library search itself to select-all; otherwise steal from Reader fields only when not typing.
        if (target.id === "library-search") return;
      }
      event.preventDefault();
      const input = document.getElementById("library-search") as HTMLInputElement | null;
      input?.focus();
      input?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (isPresentationDemo) {
          // Capture-only, in-memory state: never read or write the user's library.
          const seed = createPresentationCaptureSeed();
          useAppStore.getState().setDisplaySettings({ sidebarMode: "expanded" });
          useProjectStore.getState().setWorkspaceNodes(seed.workspaceNodes);
          setMemberships(seed.memberships);
          setPapers(seed.papers);
          const cache = useLibraryCache.getState();
          for (const document of seed.documents) {
            cache.setSections(document.paperId, document.sections);
            cache.setBlocks(document.paperId, document.blocks);
          }
          useImportJobStore.getState().upsertJob(seed.importJob);
          // Capture-only: let a scripted screenshot open e.g. the Reader directly.
          const startPath = import.meta.env.VITE_VERSIO_DEMO_START_PATH;
          if (!cancelled && typeof startPath === "string" && startPath.startsWith("/")) {
            navigate(startPath, { replace: true });
          }
          if (!cancelled) setDemoReady(true);
          return;
        }
        // Metadata only at startup — full sections/blocks load in Reader (or import/resume).
        const [dbPapers, dbLinks, dbNodes] = await Promise.all([
          getAllPapers(),
          getAllWorkspacePapers(),
          listWorkspace(),
        ]);
        if (cancelled) return;
        mergeWorkspaceNodes(dbNodes);
        setMemberships(dbLinks);
        setPapers(dbPapers);
        void purgeExpiredTrash().catch((error) => {
          console.warn("Failed to purge expired trash:", error);
        });
        if (!cancelled && isTranslationServerReady()) {
          resumeAfterTranslationServerReady();
        }
      } catch (error) {
        console.error("Failed to load library:", error);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    const unsubscribe = subscribeTranslationServerReady(() => {
      if (!cancelled) resumeAfterTranslationServerReady();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- one-shot demo seed; navigate identity must not re-run it
  }, [isPresentationDemo, mergeWorkspaceNodes, setLoaded, setMemberships, setPapers]);

  const routeNodeId = location.pathname.startsWith("/project/") ? location.pathname.slice("/project/".length).split("/")[0] : null;
  const papers = useLibraryCache((state) => state.papers); const inboxCount = useMemo(() => {
    const activeNodes = new Set(workspaceNodes.map((node) => node.id));
    const assigned = new Set(
      memberships.filter((link) => activeNodes.has(link.nodeId)).map((link) => link.paperId)
    );
    return papers.filter((paper) => !assigned.has(paper.id)).length;
  }, [memberships, papers, workspaceNodes]);
  const create = async (input: { name: string; description?: string }) => { const node = await createWorkspaceNode({ ...input, parentId: createParentId ?? null }); upsertWorkspaceNode(node); setCreateParentId(undefined); if (node.parentId) return; navigate(`/project/${node.id}`); };
  const addPaperFile = (node: WorkspaceNode) => { setFileNodeId(node.id); fileInputRef.current?.click(); };
  const deleteNode = async (node: WorkspaceNode) => {
    const removed = await removeWorkspaceItem(node.id);
    removeWorkspaceNodesLocal(removed);
    setMemberships(await getAllWorkspacePapers());
    if (routeNodeId && removed.includes(routeNodeId)) navigate("/inbox");
    showToast({
      kind: "info",
      message: `「${node.name}」をゴミ箱に移動しました`,
      actionLabel: "元に戻す",
      onAction: () => {
        void restoreWorkspaceFolderFromTrash(node.id)
          .then(async (restored) => {
            for (const item of restored) {
              upsertWorkspaceNode(item);
            }
            setMemberships(await getAllWorkspacePapers());
          })
          .catch((error: unknown) => {
            showToast({
              kind: "error",
              message: error instanceof Error ? error.message : "復元に失敗しました",
            });
          });
      },
    });
  };
  const handleDropPaper = useCallback(async (targetId: string, droppedPaperId: string, sourceNodeId: string | null) => { if (targetId === INBOX_DROP_ID) { const removed = await removePaperFromAllWorkspaces(droppedPaperId); removeMembershipsForPaper(droppedPaperId); showDragToast({ kind: removed ? "added" : "duplicate", message: removed ? "インボックスに戻しました" : "すでにインボックスにあります" }); return; } try { const link = sourceNodeId ? await movePaperInWorkspace(droppedPaperId, sourceNodeId, targetId) : await addPaperToWorkspace(targetId, droppedPaperId); if (sourceNodeId) useProjectStore.getState().removeMembershipLocal(sourceNodeId, droppedPaperId); upsertMembership(link); showDragToast({ kind: "added", message: "論文の配置を更新しました" }); } catch (error) { showDragToast({ kind: error instanceof Error && error.message.includes("すでに") ? "duplicate" : "error", message: error instanceof Error ? error.message : "論文の配置に失敗しました" }); } }, [removeMembershipsForPaper, showDragToast, upsertMembership]);
  useEffect(() => { setPaperDropHandler(handleDropPaper); return () => setPaperDropHandler(null); }, [handleDropPaper]);

  useEffect(() => {
    const open = createParentId !== undefined;
    setTranslationUiDeferReason("workspace-modal", open);
    return () => setTranslationUiDeferReason("workspace-modal", false);
  }, [createParentId]);

  return <div className={styles.shell}>
    <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className={styles.hiddenInput} onChange={(event) => { const file = event.target.files?.[0]; if (file && fileNodeId) void tryStartPdfImport(file, { workspaceNodeId: fileNodeId }); event.target.value = ""; setFileNodeId(null); }} />
    <AppSidebar workspaceNodes={workspaceNodes} searchQuery={searchQuery} onSearchChange={setSearchQuery} onNewWorkspace={() => setCreateParentId(null)} onNewChild={(node) => setCreateParentId(node.id)} onDeleteNode={deleteNode} onAddPaperToWorkspace={addPaperFile} activeNodeId={routeNodeId} inboxCount={inboxCount} />
    <div className={styles.main}>{demoReady && <Outlet context={{ openNewWorkspace: () => setCreateParentId(null) }} />}</div><PaperDragPreview />
    {toast && <div className={`${styles.toast} ${toast.kind === "error" ? styles.toastError : toast.kind === "info" ? styles.toastInfo : styles.toastOk}`} role="status"><span className={styles.toastMessage}>{toast.message}</span>{toast.actionLabel && toast.onAction && <button type="button" className={styles.toastAction} onClick={() => { toast.onAction?.(); clearToast(); }}>{toast.actionLabel}</button>}</div>}
    {createParentId !== undefined && <NewWorkspaceNodeModal parentName={createParentId ? workspaceNodes.find((node) => node.id === createParentId)?.name : undefined} onClose={() => setCreateParentId(undefined)} onCreate={create} />}
  </div>;
}
