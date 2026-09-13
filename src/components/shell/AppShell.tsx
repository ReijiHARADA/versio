import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { getAllPapers, getAllWorkspacePapers } from "../../services/database";
import { addPaperToWorkspace, createWorkspaceNode, listWorkspace, movePaperInWorkspace, removePaperFromAllWorkspaces, removeWorkspaceItem } from "../../services/projectService";
import { tryStartPdfImport } from "../../services/pdfImport";
import type { WorkspaceNode } from "../../types/project";
import { AppSidebar } from "./AppSidebar";
import { PaperDragPreview } from "./PaperDragPreview";
import { NewWorkspaceNodeModal } from "../workspace/NewWorkspaceNodeModal";
import { setPaperDropHandler, INBOX_DROP_ID, usePaperDragStore } from "../../stores/paperDragStore";
import { useToastStore } from "../../stores/toastStore";
import { resumeAfterTranslationServerReady } from "../../services/import/startBackgroundImport";
import { isTranslationServerReady, subscribeTranslationServerReady } from "../../utils/serverReady";
import styles from "./AppShell.module.css";

export function AppShell() {
  const location = useLocation(); const navigate = useNavigate(); const { paperId } = useParams<{ paperId?: string }>();
  const setPapers = useLibraryCache((state) => state.setPapers);
  const workspaceNodes = useProjectStore((state) => state.workspaceNodes); const memberships = useProjectStore((state) => state.memberships); const searchQuery = useProjectStore((state) => state.searchQuery);
  const setLoaded = useProjectStore((state) => state.setLoaded); const setSearchQuery = useProjectStore((state) => state.setSearchQuery); const mergeWorkspaceNodes = useProjectStore((state) => state.mergeWorkspaceNodes); const setMemberships = useProjectStore((state) => state.setMemberships); const upsertWorkspaceNode = useProjectStore((state) => state.upsertWorkspaceNode); const upsertMembership = useProjectStore((state) => state.upsertMembership); const removeMembershipsForPaper = useProjectStore((state) => state.removeMembershipsForPaper); const removeWorkspaceNodesLocal = useProjectStore((state) => state.removeWorkspaceNodesLocal);
  const showToast = usePaperDragStore((state) => state.showToast); const toast = useToastStore((state) => state.toast); const clearToast = useToastStore((state) => state.clearToast);
  const [createParentId, setCreateParentId] = useState<string | null | undefined>(undefined); const [fileNodeId, setFileNodeId] = useState<string | null>(null); const fileInputRef = useRef<HTMLInputElement>(null);

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
  }, [mergeWorkspaceNodes, setLoaded, setMemberships, setPapers]);

  const routeNodeId = location.pathname.startsWith("/project/") ? location.pathname.slice("/project/".length).split("/")[0] : null;
  const readerNodeId = useMemo(() => { const fromQuery = new URLSearchParams(location.search).get("workspace"); if (fromQuery) return fromQuery; if (!paperId) return null; const links = memberships.filter((link) => link.paperId === paperId); return links.length === 1 ? links[0].nodeId : null; }, [location.search, memberships, paperId]);
  const papers = useLibraryCache((state) => state.papers); const inboxCount = useMemo(() => { const assigned = new Set(memberships.map((link) => link.paperId)); return papers.filter((paper) => !assigned.has(paper.id)).length; }, [memberships, papers]);
  const create = async (input: { name: string; description?: string }) => { const node = await createWorkspaceNode({ ...input, parentId: createParentId ?? null }); upsertWorkspaceNode(node); setCreateParentId(undefined); if (node.parentId) return; navigate(`/project/${node.id}`); };
  const addPaperFile = (node: WorkspaceNode) => { setFileNodeId(node.id); fileInputRef.current?.click(); };
  const deleteNode = async (node: WorkspaceNode) => { const removed = await removeWorkspaceItem(node.id); removeWorkspaceNodesLocal(removed); setMemberships(await getAllWorkspacePapers()); if (routeNodeId && removed.includes(routeNodeId)) navigate("/inbox"); };
  const handleDropPaper = useCallback(async (targetId: string, droppedPaperId: string, sourceNodeId: string | null) => { if (targetId === INBOX_DROP_ID) { const removed = await removePaperFromAllWorkspaces(droppedPaperId); removeMembershipsForPaper(droppedPaperId); showToast({ kind: removed ? "added" : "duplicate", message: removed ? "インボックスに戻しました" : "すでにインボックスにあります" }); return; } try { const link = sourceNodeId ? await movePaperInWorkspace(droppedPaperId, sourceNodeId, targetId) : await addPaperToWorkspace(targetId, droppedPaperId); if (sourceNodeId) useProjectStore.getState().removeMembershipLocal(sourceNodeId, droppedPaperId); upsertMembership(link); showToast({ kind: "added", message: "論文の配置を更新しました" }); } catch (error) { showToast({ kind: error instanceof Error && error.message.includes("すでに") ? "duplicate" : "error", message: error instanceof Error ? error.message : "論文の配置に失敗しました" }); } }, [removeMembershipsForPaper, showToast, upsertMembership]);
  useEffect(() => { setPaperDropHandler(handleDropPaper); return () => setPaperDropHandler(null); }, [handleDropPaper]);
  return <div className={styles.shell}>
    <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className={styles.hiddenInput} onChange={(event) => { const file = event.target.files?.[0]; if (file && fileNodeId) void tryStartPdfImport(file, { workspaceNodeId: fileNodeId }); event.target.value = ""; setFileNodeId(null); }} />
    <AppSidebar workspaceNodes={workspaceNodes} searchQuery={searchQuery} onSearchChange={setSearchQuery} onNewWorkspace={() => setCreateParentId(null)} onNewChild={(node) => setCreateParentId(node.id)} onDeleteNode={deleteNode} onAddPaperToWorkspace={addPaperFile} activeNodeId={readerNodeId ?? routeNodeId} inboxCount={inboxCount} />
    <div className={styles.main}><Outlet context={{ openNewWorkspace: () => setCreateParentId(null) }} /></div><PaperDragPreview />
    {toast && <div className={`${styles.toast} ${toast.kind === "error" ? styles.toastError : toast.kind === "info" ? styles.toastInfo : styles.toastOk}`} role="status"><span>{toast.message}</span>{toast.actionLabel && toast.onAction && <button type="button" className={styles.toastAction} onClick={() => { toast.onAction?.(); clearToast(); }}>{toast.actionLabel}</button>}</div>}
    {createParentId !== undefined && <NewWorkspaceNodeModal parentName={createParentId ? workspaceNodes.find((node) => node.id === createParentId)?.name : undefined} onClose={() => setCreateParentId(undefined)} onCreate={create} />}
  </div>;
}
