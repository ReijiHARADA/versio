import { useEffect, useRef, useState } from "react";
import { FolderPlus, MoreHorizontal, Pause, RefreshCw, RotateCcw, Star, Trash2, UserMinus } from "lucide-react";
import type { Paper } from "../../types/paper";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { showToast } from "../../stores/toastStore";
import { applyPaperFavorite } from "../../services/paperFavorite";
import {
  cancelPaperWork,
  retryPaperTranslation,
} from "../../services/import/startBackgroundImport";
import { reextractPaper } from "../../services/reextractPaper";
import { derivePaperReadiness } from "../../domain/paperReadiness";
import {
  addPaperToWorkspace,
} from "../../services/projectService";
import { PaperEpubSyncControl } from "./PaperEpubSyncControl";
import styles from "./PaperCard.module.css";

type PaperMenuProps = {
  paper: Paper;
  variant: "library" | "workspace";
  onDeleteRequest?: (event: React.MouseEvent, paperId: string) => void;
  onRemoveFromWorkspace?: (paperId: string) => void;
};

export function PaperMenu({
  paper,
  variant,
  onDeleteRequest,
  onRemoveFromWorkspace,
}: PaperMenuProps) {
  const [open, setOpen] = useState(false);
  const [pickingWorkspace, setPickingWorkspace] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const blocks = useLibraryCache((state) => state.blocks[paper.id]);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reextracting, setReextracting] = useState(false);
  const [favoriting, setFavoriting] = useState(false);
  const workspaceNodes = useProjectStore((state) => state.workspaceNodes);
  const memberships = useProjectStore((state) => state.memberships);
  const upsertMembership = useProjectStore((state) => state.upsertMembership);
  const readiness = derivePaperReadiness({
    processingStatus: paper.processingStatus,
    blocks,
  }).readiness;

  useEffect(() => {
    if (!open && !pickingWorkspace) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setPickingWorkspace(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setPickingWorkspace(false);
      }
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, pickingWorkspace]);

  const toggleFavorite = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (favoriting) return;
    setFavoriting(true);
    try {
      await applyPaperFavorite(paper.id, !paper.favorite);
    } finally {
      setFavoriting(false);
      setOpen(false);
    }
  };

  const retryTranslation = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (retrying) return;
    setRetrying(true);
    try {
      await retryPaperTranslation(paper.id);
    } finally {
      setRetrying(false);
      setOpen(false);
    }
  };

  const pauseTranslation = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (cancelling) return;
    setCancelling(true);
    try {
      const ok = cancelPaperWork(paper.id);
      if (!ok) {
        showToast({ kind: "info", message: "中断できる翻訳処理がありません" });
      }
    } finally {
      setCancelling(false);
      setOpen(false);
    }
  };

  const reextract = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (reextracting) return;
    setReextracting(true);
    try {
      const result = await reextractPaper(paper.id);
      useLibraryCache.getState().updatePaper(paper.id, result.paper);
      useLibraryCache.getState().setSections(paper.id, result.sections);
      useLibraryCache.getState().setBlocks(paper.id, result.blocks);
      showToast({ kind: "success", message: "PDFの抽出結果を更新しました。未翻訳の箇所は翻訳を再試行できます" });
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "PDFの抽出結果を更新できませんでした",
      });
    } finally {
      setReextracting(false);
      setOpen(false);
    }
  };

  const addToWorkspace = async (event: React.MouseEvent, nodeId: string) => {
    event.stopPropagation();
    const node = workspaceNodes.find((item) => item.id === nodeId);
    try {
      const link = await addPaperToWorkspace(nodeId, paper.id);
      upsertMembership(link);
      showToast({
        kind: "success",
        message: `「${node?.name ?? "ワークスペース"}」に追加しました`,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("すでに")) {
        showToast({
          kind: "info",
          message: `「${node?.name ?? "ワークスペース"}」にはすでに入っています`,
        });
      } else {
        showToast({ kind: "error", message: "ワークスペースへの追加に失敗しました" });
      }
    }
    setPickingWorkspace(false);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={styles.menuRoot} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={styles.menuButton}
        title="論文の操作"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
          setPickingWorkspace(false);
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            role="menuitem"
            disabled={favoriting}
            onClick={(event) => void toggleFavorite(event)}
          >
            <Star
              size={14}
              fill={paper.favorite ? "currentColor" : "none"}
              style={paper.favorite ? { color: "var(--color-favorite)" } : undefined}
            />
            {paper.favorite ? "お気に入りを外す" : "お気に入り"}
          </button>
          <PaperEpubSyncControl
            paperId={paper.id}
            variant="menu"
            onFinished={() => setOpen(false)}
          />
          {variant === "library" && (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setPickingWorkspace(true);
              }}
            >
              <FolderPlus size={14} />
              ワークスペースに追加…
            </button>
          )}
          <button type="button" role="menuitem" disabled={reextracting} onClick={(event) => void reextract(event)}>
            <RefreshCw size={14} />
            {reextracting ? "抽出を更新中..." : "PDFを再抽出"}
          </button>
          {readiness === "translating" && (
            <button
              type="button"
              role="menuitem"
              disabled={cancelling}
              onClick={(event) => pauseTranslation(event)}
            >
              <Pause size={14} />
              {cancelling ? "中断しています..." : "翻訳を中断"}
            </button>
          )}
          {readiness === "needs_attention" && (
            <button type="button" role="menuitem" disabled={retrying} onClick={(event) => void retryTranslation(event)}>
              <RotateCcw size={14} />
              {retrying
                ? paper.processingStatus === "partial"
                  ? "再開中..."
                  : "再試行中..."
                : paper.processingStatus === "partial"
                  ? "続きから再開"
                  : "翻訳を再試行"}
            </button>
          )}
          {variant === "workspace" && onRemoveFromWorkspace && (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onRemoveFromWorkspace(paper.id);
              }}
            >
              <UserMinus size={14} />
              ワークスペースから外す
            </button>
          )}
          {onDeleteRequest && (
            <>
              <div className={styles.menuSep} />
              <button
                type="button"
                role="menuitem"
                className={styles.menuDanger}
                onClick={(event) => {
                  setOpen(false);
                  onDeleteRequest(event, paper.id);
                }}
              >
                <Trash2 size={14} />
                ゴミ箱へ移動
              </button>
            </>
          )}
        </div>
      )}
      {pickingWorkspace && (
        <div className={styles.menu} role="menu">
          {workspaceNodes.length === 0 ? (
            <p className={styles.menuEmpty}>フォルダがありません</p>
          ) : (
            workspaceNodes.map((node) => {
              const already = memberships.some(
                (link) => link.nodeId === node.id && link.paperId === paper.id
              );
              return (
                <button
                  key={node.id}
                  type="button"
                  role="menuitem"
                  disabled={already}
                  onClick={(event) => void addToWorkspace(event, node.id)}
                >
                  {node.name}
                  {already ? "（追加済み）" : ""}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
