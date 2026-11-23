import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { INSPECTOR_ON_GROUND_QUERY, INSPECTOR_SLOT_ID } from "../shell/inspectorSlot";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Settings2,
  ExternalLink,
  FileUp,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useLibraryCache } from "../../stores/libraryCache";
import {
  createBlockUpdateBatcher,
  setTranslationUiScrollPaused,
} from "../../utils/batchBlockUpdates";
import type { PaperBlock, Section } from "../../types/paper";
import { upsertBlock } from "../../utils/mergePaperData";
import { displayPaperTitle } from "../../services/translation/quality";
import { useProjectStore } from "../../stores/projectStore";
import { workspaceAncestorPath } from "../../data/workspace/tree";
import { WorkspacePathTrail } from "../workspace/WorkspacePathTrail";
import { openSourcePdf } from "../../services/sourcePdf";
import { PaperContent, type ReaderContentHandle } from "./PaperContent";
import { ExportDialog } from "./ExportDialog";
import { iconSize } from "../../styles/iconTokens";
import { Outline } from "./Outline";
import { DisplaySettingsPanel } from "./DisplaySettingsPanel";
import { SearchBar, SearchResults, findSearchResults } from "./SearchPanel";
import { ReaderInspector } from "./ReaderInspector";
import { PaperInfoPanel } from "./info/PaperInfoPanel";
import { NotesPanel } from "./notes/NotesPanel";
import { GlossaryPanel } from "./GlossaryPanel";
import { MemoPopover } from "./memo/MemoPopover";
import { useTextSelection } from "./selection/useTextSelection";
import {
  resolveReaderInspector,
  type ReaderInspectorState,
  type ReaderInspectorView,
} from "../../utils/readerRightPanel";
import { useReaderDocument } from "./hooks/useReaderDocument";
import { useReaderGlossary } from "./hooks/useReaderGlossary";
import { useReaderSearch } from "./hooks/useReaderSearch";
import { useReaderAnnotations } from "./hooks/useReaderAnnotations";
import { useReaderExport } from "./hooks/useReaderExport";
import { useReaderTranslationResume } from "./hooks/useReaderTranslationResume";
import { useReaderReadingPosition } from "./hooks/useReaderReadingPosition";
import styles from "./ReaderScreen.module.css";

const EMPTY_BLOCKS: PaperBlock[] = [];
const EMPTY_SECTIONS: Section[] = [];

function placeInspector(panel: ReactNode, slot: HTMLElement | null): ReactNode {
  return slot ? createPortal(panel, slot) : panel;
}

export function ReaderScreen() {
  const navigate = useNavigate();
  const { paperId } = useParams<{ paperId: string }>();
  const [searchParams] = useSearchParams();
  const papers = useLibraryCache((s) => s.papers);
  const workspaceNodes = useProjectStore((state) => state.workspaceNodes);
  const memberships = useProjectStore((state) => state.memberships);
  const displaySettings = useAppStore((s) => s.displaySettings);
  const updatePaper = useLibraryCache((s) => s.updatePaper);
  const setSectionsInStore = useLibraryCache((s) => s.setSections);
  const setBlocksInStore = useLibraryCache((s) => s.setBlocks);
  const updateBlockInStore = useLibraryCache((s) => s.updateBlock);
  const storeSections = useLibraryCache((s) =>
    paperId ? s.sections[paperId] ?? EMPTY_SECTIONS : EMPTY_SECTIONS
  );
  const storeBlocks = useLibraryCache((s) =>
    paperId ? s.blocks[paperId] ?? EMPTY_BLOCKS : EMPTY_BLOCKS
  );

  const [showOutline, setShowOutline] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  // Wide windows draw the inspector on the ground beside the card (AppShell slot, present only after the
  // first commit); narrow ones keep it inside the card as an overlay so it never covers the toolbar.
  const [inspectorSlot, setInspectorSlot] = useState<HTMLElement | null>(() =>
    window.matchMedia(INSPECTOR_ON_GROUND_QUERY).matches ? document.getElementById(INSPECTOR_SLOT_ID) : null
  );
  const [wideAtMount] = useState(() => window.matchMedia(INSPECTOR_ON_GROUND_QUERY).matches);
  const setDisplaySettings = useAppStore((s) => s.setDisplaySettings);
  const inspector = resolveReaderInspector(displaySettings.readerInspector, wideAtMount);
  const inspectorRef = useRef(inspector);
  inspectorRef.current = inspector;
  const setInspector = useCallback(
    (update: (current: ReaderInspectorState) => ReaderInspectorState) =>
      setDisplaySettings({ readerInspector: update(inspectorRef.current) }),
    [setDisplaySettings]
  );
  useEffect(() => {
    const wide = window.matchMedia(INSPECTOR_ON_GROUND_QUERY);
    const sync = () => setInspectorSlot(wide.matches ? document.getElementById(INSPECTOR_SLOT_ID) : null);
    sync();
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
  }, []);

  const contentRef = useRef<HTMLDivElement>(null);
  const paperContentRef = useRef<ReaderContentHandle>(null);
  const storeBlocksRef = useRef(storeBlocks);
  const setBlocksRef = useRef(setBlocksInStore);
  setBlocksRef.current = setBlocksInStore;
  const blockBatcherRef = useRef<ReturnType<typeof createBlockUpdateBatcher> | null>(null);
  if (blockBatcherRef.current == null) {
    blockBatcherRef.current = createBlockUpdateBatcher((id, batch) => {
      setBlocksRef.current(id, (prev) => batch.reduce((acc, block) => upsertBlock(acc, block), prev));
    });
  }

  useEffect(() => {
    if (blockBatcherRef.current == null) {
      blockBatcherRef.current = createBlockUpdateBatcher((id, batch) => {
        setBlocksRef.current(id, (prev) => batch.reduce((acc, block) => upsertBlock(acc, block), prev));
      });
    }
    const batcher = blockBatcherRef.current;
    return () => {
      batcher.dispose();
      if (blockBatcherRef.current === batcher) blockBatcherRef.current = null;
    };
  }, []);

  // Defer streaming translation patches while the user is scrolling the body.
  const paper = papers.find((p) => p.id === paperId);

  const { isLoading, hasSourcePdf } = useReaderDocument(paperId);
  const { glossary, setGlossary } = useReaderGlossary(paperId);

  useEffect(() => {
    if (isLoading) return;
    const root = contentRef.current;
    if (!root) return;
    let idleTimer = 0;
    const onScroll = () => {
      setTranslationUiScrollPaused(true);
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        setTranslationUiScrollPaused(false);
      }, 140);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      window.clearTimeout(idleTimer);
      setTranslationUiScrollPaused(false);
    };
  }, [isLoading]);

  const { result: selectionResult, dismiss: dismissSelection } = useTextSelection(
    contentRef,
    !isLoading
  );

  const activeWorkspace = useMemo(() => {
    const qid = searchParams.get("workspace");
    if (qid) return workspaceNodes.find((node) => node.id === qid) ?? null;
    if (!paperId) return null;
    const links = memberships.filter((m) => m.paperId === paperId);
    if (links.length === 1) return workspaceNodes.find((node) => node.id === links[0].nodeId) ?? null;
    return null;
  }, [searchParams, workspaceNodes, memberships, paperId]);

  const workspacePath = useMemo(
    () => workspaceAncestorPath(workspaceNodes, activeWorkspace?.id),
    [workspaceNodes, activeWorkspace?.id]
  );

  const annotationWorkspaceNodeId = searchParams.get("workspace")
    ? activeWorkspace?.id ?? null
    : null;

  useEffect(() => {
    storeBlocksRef.current = storeBlocks;
  }, [storeBlocks]);

  const {
    showSearch,
    searchQuery,
    searchHitIndex,
    searchHitCount,
    applySearchHits,
    handleSearchResultClick,
    handleSearchClose,
  } = useReaderSearch({ contentRef, paperContentRef, storeBlocks });

  const {
    annotations,
    activeAnnotationIds,
    flashAnnotationIds,
    memoSurface,
    draftHighlight,
    setMemoSurface,
    closeMemoSurface,
    handleSaveDraft,
    handleSaveEdit,
    handleSelectAnnotation,
    handleHighlightClick,
    handleDeleteAnnotation,
  } = useReaderAnnotations({
    paperId,
    isLoading,
    storeBlocks,
    storeBlocksRef,
    contentRef,
    paperContentRef,
    selectionResult,
    dismissSelection,
    annotationWorkspaceNodeId,
  });

  const {
    showExport,
    setShowExport,
    exportBusy,
    exportStatus,
    exportError,
    epubSyncFolder,
    setExportStatus,
    setExportError,
    handleExport,
  } = useReaderExport(paperId);

  useReaderTranslationResume({
    paperId,
    isLoading,
    blockBatcherRef,
    updatePaper,
    setSectionsInStore,
  });

  useReaderReadingPosition({
    paperId,
    paper,
    isLoading,
    contentRef,
    paperContentRef,
    storeBlocks,
    storeSections,
    updatePaper,
  });

  const handleBlockUpdated = useCallback(
    (updatedBlock: PaperBlock) => {
      if (!paperId) return;
      updateBlockInStore(paperId, updatedBlock.id, updatedBlock);
    },
    [paperId, updateBlockInStore]
  );

  useEffect(() => {
    if (!paper && paperId && !isLoading) {
      navigate("/");
    }
  }, [paper, paperId, navigate, isLoading]);

  const handleOpenSourcePdf = useCallback(
    async (page?: number) => {
      if (!paperId) return;
      try {
        await openSourcePdf({ paperId, page });
      } catch (e) {
        console.error("Failed to open source PDF:", e);
      }
    },
    [paperId]
  );
  const openBlockSourcePdf = useCallback(
    (block: PaperBlock) => {
      void handleOpenSourcePdf(block.pageStart);
    },
    [handleOpenSourcePdf]
  );
  const openGlossaryInspector = useCallback(() => {
    setInspector(() => ({ open: true, tab: "glossary" }));
  }, [setInspector]);
  // While ⌘F search has a query, the inspector gains a transient 検索 tab. It opens on its own only
  // where the inspector sits beside the card (or is already open), so narrow windows never hide hits.
  const searchActive = showSearch && searchQuery.length >= 2;
  const [searchView, setSearchView] = useState(false);
  const searchAutoOpenRef = useRef(false);
  searchAutoOpenRef.current = inspector.open || inspectorSlot != null;
  useEffect(() => {
    setSearchView(searchActive && searchAutoOpenRef.current);
  }, [searchActive]);
  const inspectorView: ReaderInspectorView = searchActive && searchView ? "search" : inspector.tab;
  const inspectorVisible = inspector.open || inspectorView === "search";
  const showInspectorTab = useCallback(
    (tab: ReaderInspectorView) => {
      if (tab === "search") {
        setSearchView(true);
        return;
      }
      setSearchView(false);
      setInspector(() => ({ open: true, tab }));
    },
    [setInspector]
  );
  // Hits in hidden original text are not in the DOM count; the bar still needs to say they exist.
  const searchResultCount = useMemo(
    () => (showSearch ? findSearchResults(storeBlocks, storeSections, searchQuery).length : 0),
    [showSearch, storeBlocks, storeSections, searchQuery]
  );
  const workspaceNames = useMemo(() => {
    const ids = new Set(memberships.filter((m) => m.paperId === paperId).map((m) => m.nodeId));
    return workspaceNodes.filter((node) => ids.has(node.id)).map((node) => node.name);
  }, [memberships, workspaceNodes, paperId]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>読み込み中...</div>
      </div>
    );
  }

  if (!paper) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          論文が見つかりません。
          <br />
          <button onClick={() => navigate("/")}>ライブラリに戻る</button>
        </div>
      </div>
    );
  }

  const handleBackClick = () => {
    if (activeWorkspace) {
      navigate(`/project/${activeWorkspace.id}`);
      return;
    }
    navigate("/");
  };

  const handleSectionClick = (sectionId: string) => {
    setActiveSection(sectionId);
    void paperContentRef.current?.scrollToSection(sectionId);
  };

  const contentStyle = {
    "--content-font-size": `${displaySettings.fontSize}px`,
    "--content-line-height": displaySettings.lineHeight,
    "--content-max-width": `${displaySettings.contentWidth}px`,
  } as React.CSSProperties;

  return (
    <div className={styles.container} data-testid="reader-screen" aria-label="リーダー">
      <header className={styles.header} data-tauri-drag-region>
        <div className={styles.headerLeft}>
          <button
            className={styles.iconButton}
            onClick={handleBackClick}
            title={activeWorkspace ? "フォルダに戻る" : "ライブラリに戻る"}
            aria-label={activeWorkspace ? "フォルダに戻る" : "ライブラリに戻る"}
          >
            <ArrowLeft size={iconSize.md} />
          </button>
          <div className={styles.titleArea}>
            {workspacePath.length > 0 && (
              <WorkspacePathTrail folders={workspacePath} prefix />
            )}
            <h1 className={styles.title} title={displayPaperTitle(paper)}>
              {displayPaperTitle(paper)}
            </h1>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.iconButton}
            onClick={() => setShowOutline((value) => !value)}
            aria-label={showOutline ? "目次を隠す" : "目次を表示"}
            data-tooltip={showOutline ? "目次を隠す" : "目次を表示"}
          >
            <PanelLeft size={iconSize.md} />
          </button>
          <button
            ref={settingsButtonRef}
            className={`${styles.iconButton} ${showSettings ? styles.active : ""}`}
            onClick={() => setShowSettings(!showSettings)}
            aria-label="表示設定"
            data-tooltip="表示設定"
          >
            <Settings2 size={iconSize.md} />
          </button>
          <button
            className={`${styles.iconButton} ${showExport ? styles.active : ""}`}
            aria-label="書き出す"
            data-tooltip="書き出す"
            data-testid="export-open"
            onClick={() => {
              setShowExport(true);
              setExportStatus(null);
              setExportError(null);
            }}
          >
            <FileUp size={iconSize.md} />
          </button>
          <button
            className={styles.iconButton}
            aria-label={hasSourcePdf ? "元PDFを開く" : "保存された元PDFがありません"}
            data-tooltip={hasSourcePdf ? "元PDFを開く" : "保存された元PDFがありません"}
            disabled={!hasSourcePdf}
            onClick={() => void handleOpenSourcePdf()}
          >
            <ExternalLink size={iconSize.md} />
          </button>
          <button
            className={`${styles.iconButton} ${inspectorVisible ? styles.active : ""}`}
            onClick={() => {
              setSearchView(false);
              setInspector((current) => ({ ...current, open: !inspectorVisible }));
            }}
            aria-label={inspectorVisible ? "インスペクタを隠す" : "インスペクタを表示"}
            aria-pressed={inspectorVisible}
            data-tooltip={inspectorVisible ? "インスペクタを隠す" : "インスペクタを表示"}
          >
            <PanelRight size={iconSize.md} />
          </button>
        </div>
      </header>

      <div className={styles.main}>
        {showOutline && (
          <aside className={styles.sidebar}>
            <Outline
              sections={storeSections}
              activeSection={activeSection}
              onSectionClick={handleSectionClick}
            />
          </aside>
        )}

        <main
          className={styles.content}
          style={contentStyle}
          ref={contentRef}
          data-testid="reader-body"
          aria-label="論文本文"
        >
          <PaperContent
            ref={paperContentRef}
            paper={paper}
            sections={storeSections}
            blocks={storeBlocks}
            scrollContainerRef={contentRef}
            onSectionVisible={setActiveSection}
            highlightText={searchQuery}
            onBlockUpdated={handleBlockUpdated}
            annotations={annotations}
            draftHighlight={draftHighlight}
            flashAnnotationIds={flashAnnotationIds}
            onHighlightClick={handleHighlightClick}
            onOpenSourcePdf={openBlockSourcePdf}
            glossaryEntries={glossary}
            onOpenGlossaryInspector={openGlossaryInspector}
          />
        </main>

        {showSearch && (
          <SearchBar
            hitIndex={searchHitIndex}
            hitCount={searchHitCount}
            query={searchQuery}
            resultCount={searchResultCount}
            onClose={handleSearchClose}
            onStep={(delta) => applySearchHits({ delta, scroll: true })}
          />
        )}

        {inspectorVisible && placeInspector(
          <aside className={styles.rightPane}>
            <ReaderInspector
              tab={inspectorView}
              searchAvailable={searchActive}
              onTabChange={showInspectorTab}
            >
              {inspectorView === "info" && (
                <PaperInfoPanel
                  paper={paper}
                  blocks={storeBlocks}
                  sections={storeSections}
                  workspaceNames={workspaceNames}
                  annotationCount={annotations.length}
                  glossaryCount={glossary.length}
                />
              )}
              {inspectorView === "glossary" && <GlossaryPanel entries={glossary} onChange={setGlossary} />}
              {inspectorView === "notes" && (
                <NotesPanel
                  annotations={annotations}
                  activeIds={activeAnnotationIds}
                  onSelect={handleSelectAnnotation}
                  onDelete={(annotation) => void handleDeleteAnnotation(annotation)}
                />
              )}
              {inspectorView === "search" && (
                <SearchResults
                  blocks={storeBlocks}
                  sections={storeSections}
                  query={searchQuery}
                  onResultClick={handleSearchResultClick}
                />
              )}
            </ReaderInspector>
          </aside>,
          inspectorSlot
        )}
      </div>

      {memoSurface && (
        <MemoPopover
          mode={memoSurface.mode}
          anchor={memoSurface.fallback}
          annotation={
            memoSurface.mode === "view" || memoSurface.mode === "edit"
              ? memoSurface.annotation
              : null
          }
          note={
            memoSurface.mode === "compose" || memoSurface.mode === "edit"
              ? memoSurface.note
              : ""
          }
          saving={
            memoSurface.mode === "compose" || memoSurface.mode === "edit"
              ? memoSurface.saving
              : false
          }
          error={
            memoSurface.mode === "compose" || memoSurface.mode === "edit"
              ? memoSurface.error
              : null
          }
          onNoteChange={(note) =>
            setMemoSurface((current) =>
              current && (current.mode === "compose" || current.mode === "edit")
                ? { ...current, note }
                : current
            )
          }
          onSave={() => {
            if (memoSurface.mode === "compose") void handleSaveDraft();
            if (memoSurface.mode === "edit") void handleSaveEdit();
          }}
          onCancel={closeMemoSurface}
          onEdit={() => {
            if (memoSurface.mode !== "view") return;
            setMemoSurface({
              mode: "edit",
              annotation: memoSurface.annotation,
              note: memoSurface.annotation.note,
              error: null,
              saving: false,
              fallback: memoSurface.fallback,
            });
          }}
          onDelete={() => {
            if (memoSurface.mode === "view" || memoSurface.mode === "edit") {
              void handleDeleteAnnotation(memoSurface.annotation);
            }
          }}
        />
      )}

      {showSettings && (
        <DisplaySettingsPanel
          anchor={settingsButtonRef.current?.getBoundingClientRect() ?? null}
          onClose={() => setShowSettings(false)}
        />
      )}


      <ExportDialog
        open={showExport}
        busy={exportBusy}
        status={exportStatus}
        error={exportError}
        epubSyncFolder={epubSyncFolder}
        onClose={() => {
          if (!exportBusy) setShowExport(false);
        }}
        onExport={(values) => void handleExport(values)}
      />
    </div>
  );
}
