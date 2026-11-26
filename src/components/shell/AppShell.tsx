import { loadTagColors } from "../../services/tagColorService";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { DEFAULT_FONT_SIZE, MAX_FONT_SIZE, MIN_FONT_SIZE, useAppStore } from "../../stores/appStore";
import { getAllPapers, getAllWorkspacePapers } from "../../services/database";
import { seedIntroductionPaper } from "../../services/introductionPaper";
import { addPaperToWorkspace, createWorkspaceNode, listWorkspace, movePaperInWorkspace, removePaperFromAllWorkspaces, removeWorkspaceItem } from "../../services/projectService";
import { tryStartPdfImport } from "../../services/pdfImport";
import type { WorkspaceNode } from "../../types/project";
import { AppSidebar } from "./AppSidebar";
import { PaperTabBar } from "./PaperTabBar";
import { SplitReaderPane } from "./SplitReaderPane";
import { clampSplitRatio, useSplitView } from "../../stores/splitViewStore";
import { PaperMarquee } from "./PaperMarquee";
import { INSPECTOR_SLOT_ID } from "./inspectorSlot";
import { Presence } from "../ui/Presence";
import { PaperDragPreview } from "./PaperDragPreview";
import { NewWorkspaceNodeModal } from "../workspace/NewWorkspaceNodeModal";
import { ShortcutsSheet } from "./ShortcutsSheet";
import { setPaperDropHandler, INBOX_DROP_ID, usePaperDragStore } from "../../stores/paperDragStore";
import { showToast, useToastStore } from "../../stores/toastStore";
import { PlamoDownloadToast } from "./PlamoDownloadToast";
import { useGenie } from "./useGenie";
import { restoreWorkspaceFolderFromTrash, purgeExpiredTrash } from "../../services/trashService";
import { resumeSavedTranslations } from "../../services/import/startBackgroundImport";
import { createPresentationCaptureSeed } from "../../services/presentationDemo";
import { useImportJobStore } from "../../stores/importJobStore";
import { setTranslationUiDeferReason } from "../../utils/batchBlockUpdates";
import { isTauriApp } from "../../utils/serverReady";
import { checkForAppUpdate } from "../../services/appUpdate";
import { PdfFileInput } from "../ui/PdfFileInput";
import styles from "./AppShell.module.css";
import { TagMenu } from "../library/TagMenu";

export function AppShell() {
  const location = useLocation(); const navigate = useNavigate();
  const isPresentationDemo = import.meta.env.VITE_VERSIO_DEMO === "1";
  const setPapers = useLibraryCache((state) => state.setPapers);
  const workspaceNodes = useProjectStore((state) => state.workspaceNodes); const memberships = useProjectStore((state) => state.memberships); const searchQuery = useProjectStore((state) => state.searchQuery);
  const setLoaded = useProjectStore((state) => state.setLoaded); const setSearchQuery = useProjectStore((state) => state.setSearchQuery); const mergeWorkspaceNodes = useProjectStore((state) => state.mergeWorkspaceNodes); const setMemberships = useProjectStore((state) => state.setMemberships); const upsertWorkspaceNode = useProjectStore((state) => state.upsertWorkspaceNode); const upsertMembership = useProjectStore((state) => state.upsertMembership); const removeMembershipsForPaper = useProjectStore((state) => state.removeMembershipsForPaper); const removeWorkspaceNodesLocal = useProjectStore((state) => state.removeWorkspaceNodesLocal);
  const showDragToast = usePaperDragStore((state) => state.showToast); const toast = useToastStore((state) => state.toast); const clearToast = useToastStore((state) => state.clearToast); const toastRef = useRef<HTMLDivElement>(null); useGenie(toastRef, Boolean(toast));
  const [createParentId, setCreateParentId] = useState<string | null | undefined>(undefined); const [fileNodeId, setFileNodeId] = useState<string | null>(null); const fileInputRef = useRef<HTMLInputElement>(null);
  const [demoReady, setDemoReady] = useState(!isPresentationDemo);

  // The search field's scope follows the current screen, so a query never leaks into another scope.
  useEffect(() => setSearchQuery(""), [location.pathname, setSearchQuery]);
  // Route change: fade the new screen in (opacity only, so fixed-position descendants are unaffected).
  const mainBodyRef = useRef<HTMLDivElement>(null);
  const splitTab = useSplitView((state) => state.tab);
  const splitRatio = useSplitView((state) => state.ratio);
  const routeMounted = useRef(false);
  useEffect(() => {
    if (!routeMounted.current) {
      routeMounted.current = true;
      return;
    }
    const el = mainBodyRef.current;
    if (!el?.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const animation = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    return () => animation.cancel();
  }, [location.pathname]);

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
          if (seed.importJob) useImportJobStore.getState().upsertJob(seed.importJob);
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
        void loadTagColors().catch((error) => {
          console.warn("Failed to load tag colors:", error);
        });
        void seedIntroductionPaper(dbPapers.length).catch((error) => {
          console.warn("Failed to seed the Introduction paper:", error);
        });
        void purgeExpiredTrash().catch((error) => {
          console.warn("Failed to purge expired trash:", error);
        });
        if (!cancelled) resumeSavedTranslations();
      } catch (error) {
        console.error("Failed to load library:", error);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
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

  // Native menu bar items (src-tauri/src/menu.rs). Adding a paper from a folder screen files it there.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const menuActionRef = useRef<(id: string) => void>(() => {});
  menuActionRef.current = (id) => {
    if (id === "settings") navigate("/settings");
    else if (id === "add-paper") { setFileNodeId(routeNodeId); fileInputRef.current?.click(); }
    else if (id === "new-folder") setCreateParentId(null);
    else if (id === "check-update") void checkForAppUpdate({ quiet: false });
    else if (id === "toggle-sidebar") {
      const { displaySettings, setDisplaySettings } = useAppStore.getState();
      setDisplaySettings({ sidebarMode: displaySettings.sidebarMode === "expanded" ? "auto" : "expanded" });
    }
    else if (id === "text-bigger" || id === "text-smaller" || id === "text-reset") {
      const { displaySettings, setDisplaySettings } = useAppStore.getState();
      const next = id === "text-reset" ? DEFAULT_FONT_SIZE : displaySettings.fontSize + (id === "text-bigger" ? 1 : -1);
      setDisplaySettings({ fontSize: Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, next)) });
    }
    else if (id === "shortcuts") setShortcutsOpen(true);
    else if (id === "close-tab") {
      // The tab bar handles it on a reader route; anywhere else ⌘W closes the window as before.
      const event = new Event("versio:close-tab", { cancelable: true });
      if (window.dispatchEvent(event)) void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close());
    }
    else if (id === "close-window") void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close());
  };
  useEffect(() => {
    if (isTauriApp() && import.meta.env.PROD) void checkForAppUpdate({ quiet: true });
  }, []);
  useEffect(() => {
    if (!isTauriApp()) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<string>("menu-action", (event) => menuActionRef.current(event.payload)).then((unlisten) => {
        if (cancelled) unlisten();
        else stop = unlisten;
      })
    );
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
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
  const handleDropPaper = useCallback(async (targetId: string, droppedPaperId: string, sourceNodeId: string | null) => { if (targetId === INBOX_DROP_ID) { const removed = await removePaperFromAllWorkspaces(droppedPaperId); removeMembershipsForPaper(droppedPaperId); showDragToast({ kind: removed ? "added" : "duplicate", message: removed ? "インボックスに戻しました" : "すでにインボックスにあります" }); return; } if (isPresentationDemo) { /* capture-only nodes live in memory, not SQLite */ const now = new Date().toISOString(); if (sourceNodeId) useProjectStore.getState().removeMembershipLocal(sourceNodeId, droppedPaperId); upsertMembership({ nodeId: targetId, paperId: droppedPaperId, order: 0, status: "unread", createdAt: now, updatedAt: now }); showDragToast({ kind: "added", message: "論文の配置を更新しました" }); return; } try { const link = sourceNodeId ? await movePaperInWorkspace(droppedPaperId, sourceNodeId, targetId) : await addPaperToWorkspace(targetId, droppedPaperId); if (sourceNodeId) useProjectStore.getState().removeMembershipLocal(sourceNodeId, droppedPaperId); upsertMembership(link); showDragToast({ kind: "added", message: "論文の配置を更新しました" }); } catch (error) { showDragToast({ kind: error instanceof Error && error.message.includes("すでに") ? "duplicate" : "error", message: error instanceof Error ? error.message : "論文の配置に失敗しました" }); } }, [isPresentationDemo, removeMembershipsForPaper, showDragToast, upsertMembership]);
  useEffect(() => { setPaperDropHandler(handleDropPaper); return () => setPaperDropHandler(null); }, [handleDropPaper]);

  useEffect(() => {
    const open = createParentId !== undefined;
    setTranslationUiDeferReason("workspace-modal", open);
    return () => setTranslationUiDeferReason("workspace-modal", false);
  }, [createParentId]);

  return <div className={styles.shell}>
    <div className={styles.titlebarDrag} data-tauri-drag-region />
    <PdfFileInput inputRef={fileInputRef} onFile={(file) => { void tryStartPdfImport(file, fileNodeId ? { workspaceNodeId: fileNodeId } : undefined); setFileNodeId(null); }} />
    <AppSidebar workspaceNodes={workspaceNodes} searchQuery={searchQuery} onSearchChange={setSearchQuery} onNewWorkspace={() => setCreateParentId(null)} onNewChild={(node) => setCreateParentId(node.id)} onDeleteNode={deleteNode} onAddPaperToWorkspace={addPaperFile} activeNodeId={routeNodeId} inboxCount={inboxCount} />
    <div className={styles.mainColumn}><PaperTabBar /><div className={styles.cards} data-main-pane><div className={styles.splitPeekLeft} data-split-peek-left aria-hidden />{splitTab && <SplitReaderPane tab={splitTab} />}<div className={styles.main} style={splitTab ? { flexGrow: 1 - clampSplitRatio(splitRatio) } : undefined} data-main-card><div ref={mainBodyRef} className={styles.mainBody} data-paper-marquee>{demoReady && <Outlet context={{ openNewWorkspace: () => setCreateParentId(null) }} />}</div><div className={styles.mainRim} aria-hidden /></div></div></div><div className={styles.splitPeek} data-split-peek aria-hidden /><div id={INSPECTOR_SLOT_ID} className={styles.inspectorSlot} /><div className={styles.splitPeek} data-split-peek-outer aria-hidden /><PaperDragPreview /><PaperMarquee />
    <PlamoDownloadToast raised={Boolean(toast)} />
    <TagMenu />
    {toast && <div ref={toastRef} className={`${styles.toast} ${toast.kind === "error" ? styles.toastError : toast.kind === "info" ? styles.toastInfo : styles.toastOk}`} role="status"><span className={styles.toastMessage}>{toast.message}</span>{toast.actionLabel && toast.onAction && <button type="button" className={styles.toastAction} onClick={() => { toast.onAction?.(); clearToast(); }}>{toast.actionLabel}</button>}</div>}
    <Presence>{shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}</Presence>
    <Presence>{createParentId !== undefined && <NewWorkspaceNodeModal parentName={createParentId ? workspaceNodes.find((node) => node.id === createParentId)?.name : undefined} onClose={() => setCreateParentId(undefined)} onCreate={create} />}</Presence>
  </div>;
}
