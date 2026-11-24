import { useTagColors } from "../../stores/tagColors";
import { tagColorStyle } from "../../domain/labelColors";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Star,
} from "lucide-react";
import type { Paper } from "../../types/paper";
import { useLibraryCache } from "../../stores/libraryCache";
import { useAppStore } from "../../stores/appStore";
import { shouldTranslateBlock } from "../../services/importServiceV2";
import { applyPaperFavorite } from "../../services/paperFavorite";
import {
  derivePaperReadiness,
  formatTranslationProgressLabel,
  translationPercent,
} from "../../domain/paperReadiness";
import { displayPaperTitle } from "../../services/translation/quality";
import { DraggablePaperArticle } from "./DraggablePaperArticle";
import { PaperEpubSyncControl } from "./PaperEpubSyncControl";
import { PaperCover } from "./PaperCover";
import styles from "./PaperCard.module.css";

type PaperCardProps = {
  paper: Paper;
  enabled?: boolean;
  onOpen: () => void;
  actions?: ReactNode;
  layout?: "list" | "grid";
  /** Workspace node the paper is dragged out of; a drop then moves instead of adding. */
  sourceNodeId?: string;
};

function getStatusIcon(readiness: ReturnType<typeof derivePaperReadiness>["readiness"]) {
  if (readiness === "preparing" || readiness === "translating") {
    return <Loader2 size={14} className={styles.statusProcessing} />;
  }
  if (readiness === "readable") {
    return <CheckCircle size={14} className={styles.statusReady} />;
  }
  if (readiness === "needs_attention") {
    return <AlertCircle size={14} className={styles.statusFailed} />;
  }
  return <Clock size={14} className={styles.statusPending} />;
}

export function PaperCard({ paper, enabled = true, onOpen, actions, layout = "list", sourceNodeId }: PaperCardProps) {
  const blocks = useLibraryCache((state) => state.blocks[paper.id]);
  const [favoriting, setFavoriting] = useState(false);
  const view = derivePaperReadiness({
    processingStatus: paper.processingStatus,
    blocks,
  });
  const percent =
    view.readiness === "translating"
      ? translationPercent(blocks, (block) => shouldTranslateBlock(block))
      : null;
  const statusLabel = formatTranslationProgressLabel(view.readiness);

  // "読めます" flashes for 5s right after a paper finishes; settled papers show no status.
  const previousReadiness = useRef(view.readiness);
  const [justReady, setJustReady] = useState(false);
  useEffect(() => {
    const previous = previousReadiness.current;
    previousReadiness.current = view.readiness;
    if (view.readiness !== "readable") {
      setJustReady(false);
      return;
    }
    if (previous !== "preparing" && previous !== "translating") return;
    setJustReady(true);
    const timer = window.setTimeout(() => setJustReady(false), 5000);
    return () => window.clearTimeout(timer);
  }, [view.readiness]);
  const showStatus = view.readiness !== "readable" || justReady;

  const toggleFavorite = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (favoriting) return;
    setFavoriting(true);
    try {
      await applyPaperFavorite(paper.id, !paper.favorite);
    } finally {
      setFavoriting(false);
    }
  };

  const favoriteButton = (className = "", iconSize = 14) => (
    <button
      type="button"
      className={`${styles.favoriteButton} ${paper.favorite ? styles.favoriteOn : ""} ${className}`}
      title={paper.favorite ? "お気に入りを外す" : "お気に入りに追加"}
      aria-label={paper.favorite ? "お気に入りを外す" : "お気に入りに追加"}
      aria-pressed={paper.favorite}
      disabled={favoriting}
      data-testid="paper-favorite-toggle"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => void toggleFavorite(event)}
    >
      <Star
        size={iconSize}
        fill={paper.favorite ? "currentColor" : "none"}
        aria-hidden="true"
      />
    </button>
  );
  const status = showStatus ? (
    <span className={styles.status}>
      {getStatusIcon(view.readiness)}
      <span className={styles.statusLabel} data-testid="paper-readiness">
        {statusLabel}
      </span>
      {view.readiness === "translating" && percent != null ? (
        <span
          className={styles.translateProgress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`翻訳 ${percent}%`}
          data-testid="paper-translation-progress"
        >
          <span
            className={styles.translateProgressFill}
            style={{ width: `${percent}%` }}
          />
        </span>
      ) : null}
    </span>
  ) : null;
  const label = displayPaperTitle(paper);
  const tags = paper.tags ?? [];
  const tagFilter = useAppStore((state) => state.libraryFilter.tag);
  const tagColors = useTagColors((state) => state.colors);
  const setLibraryFilter = useAppStore((state) => state.setLibraryFilter);
  // Narrow grid tiles fit one tag beside the badge; the rest collapse into "+N".
  const tagLimit = layout === "grid" ? 1 : 3;
  const libraryMeta =
    tags.length > 0 ? (
      <span className={styles.libraryMeta}>
        {tags.slice(0, tagLimit).map((tag) => (
          <button
            key={tag}
            type="button"
            className={styles.tagChip}
            // Long tags give up width first so short ones stay readable.
            style={{ flexShrink: tag.length, ...tagColorStyle(tagColors[tag.toLocaleLowerCase()]) }}
            data-colored={tagColors[tag.toLocaleLowerCase()] ? "" : undefined}
            data-active={tagFilter === tag || undefined}
            title={tagFilter === tag ? `#${tag} の絞り込みを解除` : `#${tag} で絞り込む`}
            onClick={(event) => {
              event.stopPropagation();
              setLibraryFilter({ tag: tagFilter === tag ? null : tag });
            }}
          >
            {tag}
          </button>
        ))}
        {tags.length > tagLimit ? (
          <span className={styles.tagMore}>+{tags.length - tagLimit}</span>
        ) : null}
      </span>
    ) : null;

  if (layout === "grid") {
    return (
      <DraggablePaperArticle
        paperId={paper.id}
        label={label}
        className={styles.tile}
        enabled={enabled}
        sourceNodeId={sourceNodeId}
        layout="grid"
        onOpen={onOpen}
      >
        <div className={styles.tileCover}>
          <PaperCover paperId={paper.id} />
          <div className={styles.tileOverlay}>
            {favoriteButton()}
            <div className={styles.actions}>{actions}</div>
          </div>
        </div>
        <h3 className={styles.tileTitle} title={label}>
          {label}
        </h3>
        {libraryMeta}
        {status}
      </DraggablePaperArticle>
    );
  }

  return (
    <DraggablePaperArticle
      paperId={paper.id}
      label={label}
      className={styles.row}
      enabled={enabled}
      sourceNodeId={sourceNodeId}
      onOpen={onOpen}
    >
      <div className={styles.info}>
        <div className={styles.titleRow}>
          {/* List: only favorites show a star, hung left of the title; unfavorite via the menu too. */}
          {paper.favorite ? favoriteButton(styles.listFavorite, 8) : null}
          <h3 className={styles.title}>{label}</h3>
          {libraryMeta}
        </div>
      </div>
      <div className={styles.trailing}>
        {status}
        <div className={styles.actions}>
          <PaperEpubSyncControl paperId={paper.id} disabled={!enabled} />
          {actions}
        </div>
      </div>
    </DraggablePaperArticle>
  );
}
