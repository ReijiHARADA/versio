import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Eye, EyeOff, RefreshCw } from "lucide-react";
import type { PaperBlock } from "../../types/paper";
import type { Annotation } from "../../types/annotation";
import type { GlossaryEntry } from "../../services/llm/types";
import { useAppStore } from "../../stores/appStore";
import { retryBlockTranslation } from "../../services/import/retryBlockTranslation";
import { isLowExtractionConfidence } from "../../services/extractionConfidence";
import { splitHighlightedText } from "../../services/highlightRanges";
import { parseCitationGroups, uniqueCitationTarget } from "../../services/citations";
import {
  citationPreviewFromIndex,
  type CitationPreviewModel,
} from "./citations/citationPreview";
import { CitationPreviewPopover } from "./citations/CitationPreviewPopover";
import { anchorFromEventTarget } from "./popoverAnchor";
import { segmentTextWithGlossary } from "./glossary/glossaryTerms";
import { GlossaryTermPopover } from "./glossary/GlossaryTermPopover";
import { InfoPopover } from "./InfoPopover";
import infoStyles from "./InfoPopover.module.css";
import type { AnchorBox } from "./memo/popoverPosition";
import { resolveParagraphTranslationUi } from "./paragraphTranslationUi";
import styles from "./Paragraph.module.css";

type ParagraphProps = {
  block: PaperBlock;
  highlightText?: string;
  onBlockUpdated?: (block: PaperBlock) => void;
  annotations?: Annotation[];
  /** Unsaved selection highlight while composing a memo. */
  draftHighlight?: { start: number; end: number } | null;
  flashAnnotationIds?: string[];
  onHighlightClick?: (annotationIds: string[], rect: DOMRect) => void;
  onOpenSourcePdf?: (block: PaperBlock) => void;
  referenceIndex?: Map<string, string>;
  referenceBlocks?: PaperBlock[];
  glossaryEntries?: GlossaryEntry[];
  onOpenGlossaryInspector?: () => void;
  onJumpToTarget?: (targetId: string) => void;
  /** Reference section ids — same set import uses for translation eligibility. */
  refSectionIds?: Set<string>;
};

const COMPOSE_DRAFT_ID = "__compose-draft__";

function highlightMatches(text: string, query: string): ReactNode {
  if (!query || query.length < 2) return text;

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className={styles.highlight} data-search-hit="">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function Paragraph({
  block,
  highlightText,
  onBlockUpdated,
  annotations = [],
  draftHighlight = null,
  flashAnnotationIds = [],
  onHighlightClick,
  onOpenSourcePdf,
  referenceIndex,
  referenceBlocks = [],
  glossaryEntries = [],
  onOpenGlossaryInspector,
  onJumpToTarget,
  refSectionIds,
}: ParagraphProps) {
  const isExpanded = useAppStore((state) => state.expandedOriginalBlocks.has(block.id));
  const toggleOriginalExpanded = useAppStore((state) => state.toggleOriginalExpanded);
  const setOriginalExpanded = useAppStore((state) => state.setOriginalExpanded);
  const [isRetrying, setIsRetrying] = useState(false);
  const [confidenceMenu, setConfidenceMenu] = useState<{
    anchor: AnchorBox;
  } | null>(null);
  const [citationPreview, setCitationPreview] = useState<{
    model: CitationPreviewModel;
    anchor: AnchorBox;
  } | null>(null);
  const [termPreview, setTermPreview] = useState<{
    entry: GlossaryEntry;
    anchor: AnchorBox;
  } | null>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [reservedHeight, setReservedHeight] = useState<number | null>(null);

  const {
    translated,
    hasTranslation,
    isFailed,
    isWaiting,
    untranslatedReason: translationInputWarning,
  } = resolveParagraphTranslationUi(block, refSectionIds ?? new Set());
  const hasOriginal = Boolean(block.original && translated);
  const lowConfidence = isLowExtractionConfidence(block.extractionConfidence);

  // Translation changes line wrapping (and therefore block height). Reserve
  // the height observed while waiting so completion cannot pull the viewport
  // upward/downward while the user is scrolling near a section boundary.
  useEffect(() => {
    if (!isWaiting || reservedHeight != null) return;
    const frame = requestAnimationFrame(() => {
      const height = layoutRef.current?.getBoundingClientRect().height ?? 0;
      if (height > 0) setReservedHeight(Math.ceil(height));
    });
    return () => cancelAnimationFrame(frame);
  }, [isWaiting, reservedHeight]);

  useEffect(() => {
    setReservedHeight(null);
  }, [block.id]);

  const handleToggle = () => {
    toggleOriginalExpanded(block.id);
  };

  const handleRetry = useCallback(async () => {
    if (!block.original || isRetrying) return;

    setIsRetrying(true);
    try {
      await retryBlockTranslation(block, { onBlockUpdated });
    } catch (e) {
      console.error("Retry failed:", e);
    } finally {
      setIsRetrying(false);
    }
  }, [block, isRetrying, onBlockUpdated]);

  const renderGlossaryText = (text: string, keyPrefix: string): ReactNode => {
    if (!glossaryEntries.length) {
      return highlightText ? highlightMatches(text, highlightText) : text;
    }
    const segments = segmentTextWithGlossary(text, glossaryEntries);
    return segments.map((seg, i) => {
      if (seg.kind === "text") {
        return (
          <span key={`${keyPrefix}-t-${i}`}>
            {highlightText ? highlightMatches(seg.text, highlightText) : seg.text}
          </span>
        );
      }
      return (
        <button
          key={`${keyPrefix}-g-${i}`}
          type="button"
          className={styles.glossaryTerm}
          data-glossary-term=""
          aria-label={`用語: ${seg.entry.term}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setCitationPreview(null);
            setTermPreview({
              entry: seg.entry,
              anchor: anchorFromEventTarget(event.currentTarget),
            });
          }}
        >
          {highlightText ? highlightMatches(seg.text, highlightText) : seg.text}
        </button>
      );
    });
  };

  const openCitation = (
    key: string,
    target: string,
    event: React.MouseEvent | React.KeyboardEvent
  ) => {
    const model = citationPreviewFromIndex(key, referenceIndex!, referenceBlocks);
    if (!model) {
      onJumpToTarget?.(target);
      return;
    }
    setTermPreview(null);
    setCitationPreview({
      model,
      anchor: anchorFromEventTarget(event.currentTarget),
    });
  };

  const renderCited = (text: string): ReactNode => {
    const groups = referenceIndex && referenceIndex.size > 0 ? parseCitationGroups(text) : [];
    if (groups.length === 0) {
      return renderGlossaryText(text, "plain");
    }
    const parts: ReactNode[] = [];
    let cursor = 0;
    groups.forEach((group, i) => {
      if (group.start > cursor) {
        const slice = text.slice(cursor, group.start);
        parts.push(<span key={`t-${i}`}>{renderGlossaryText(slice, `t-${i}`)}</span>);
      }
      const target = uniqueCitationTarget(group.keys, referenceIndex!);
      const cited = text.slice(group.start, group.end);
      if (target && group.keys[0]) {
        const href = target.startsWith("ref-") ? `#${target}` : `#block-${target}`;
        parts.push(
          <a
            key={`c-${i}`}
            className={styles.citation}
            href={href}
            data-citation-trigger=""
            aria-haspopup="dialog"
            aria-label={`参考文献 ${cited}`}
            onClick={(e) => {
              e.preventDefault();
              openCitation(group.keys[0], target, e);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openCitation(group.keys[0], target, e);
              }
            }}
          >
            {cited}
          </a>
        );
      } else {
        parts.push(
          <span
            key={`c-${i}`}
            className={styles.citationPlain}
            title="対応する参考文献を特定できません"
          >
            {cited}
          </span>
        );
      }
      cursor = group.end;
    });
    if (cursor < text.length) {
      const slice = text.slice(cursor);
      parts.push(<span key="t-end">{renderGlossaryText(slice, "end")}</span>);
    }
    return parts;
  };

  const renderTranslated = (text: string): ReactNode => {
    const ranges = [
      ...annotations.map((a) => ({
        id: a.id,
        start: a.startOffset,
        end: a.endOffset,
        status: a.status,
      })),
    ];
    if (draftHighlight && draftHighlight.end > draftHighlight.start) {
      ranges.push({
        id: COMPOSE_DRAFT_ID,
        start: draftHighlight.start,
        end: draftHighlight.end,
        status: "active",
      });
    }
    if (ranges.length === 0) return renderCited(text);

    const segments = splitHighlightedText(text, ranges);

    return segments.map((seg, i) => {
      if (seg.annotationIds.length === 0) {
        return <span key={i}>{renderCited(seg.text)}</span>;
      }
      const realIds = seg.annotationIds.filter((id) => id !== COMPOSE_DRAFT_ID);
      const isDraftOnly = realIds.length === 0;
      const flashing = flashAnnotationIds.some((id) => realIds.includes(id));
      if (isDraftOnly) {
        return (
          <mark
            key={i}
            data-draft-highlight=""
            className={styles.draftMark}
          >
            {highlightText ? highlightMatches(seg.text, highlightText) : seg.text}
          </mark>
        );
      }
      return (
        <mark
          key={i}
          data-annotation-mark=""
          data-testid="annotation-mark"
          className={`${styles.annotationMark} ${flashing ? styles.annotationFlash : ""}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onHighlightClick?.(realIds, e.currentTarget.getBoundingClientRect());
          }}
        >
          {highlightText ? highlightMatches(seg.text, highlightText) : seg.text}
        </mark>
      );
    });
  };

  const displayText = translated || block.original || "";

  return (
    <div
      ref={layoutRef}
      style={reservedHeight ? { minHeight: `${reservedHeight}px` } : undefined}
      className={`${styles.container} ${isWaiting ? styles.pending : ""} ${isExpanded ? styles.expanded : ""} ${lowConfidence ? styles.lowConfidence : ""}`}
    >
      {isWaiting ? (
        <p
          className={styles.translated}
          data-paper-block-id={block.id}
          data-text-role="original"
          data-translating=""
        >
          {block.original}
        </p>
      ) : isFailed ? (
        <div className={styles.failedContent}>
          <div className={styles.failedHeader}>
            <p className={styles.failedText}>翻訳に失敗しました</p>
            <button
              className={styles.retryButton}
              onClick={handleRetry}
              disabled={isRetrying}
              title="再翻訳"
              aria-label="この段落を再翻訳"
            >
              <RefreshCw size={14} className={isRetrying ? styles.spinning : ""} />
              {isRetrying ? "翻訳中..." : "再試行"}
            </button>
          </div>
          {block.original && <p className={styles.originalFallback}>{block.original}</p>}
        </div>
      ) : (
        <>
          {translationInputWarning && (
            <div className={styles.sourceStructureWarning} role="note">
              <AlertTriangle size={14} aria-hidden="true" />
              <span>
                {translationInputWarning}。推測翻訳を避けるため、原文を表示しています。
              </span>
            </div>
          )}
          <p
            className={styles.translated}
            data-paper-block-id={block.id}
            data-text-role={hasTranslation ? "translation" : "original"}
          >
            {hasTranslation ? renderTranslated(translated!) : renderCited(displayText)}
          </p>

          {lowConfidence && (
            <div className={styles.confidenceGutter}>
              <button
                type="button"
                className={styles.confidenceButton}
                data-confidence-trigger=""
                aria-expanded={confidenceMenu != null}
                aria-label="読み順の信頼度が低い箇所"
                title="要確認"
                onClick={(event) => {
                  if (confidenceMenu) {
                    setConfidenceMenu(null);
                    return;
                  }
                  setConfidenceMenu({
                    anchor: anchorFromEventTarget(event.currentTarget),
                  });
                }}
              >
                <AlertTriangle size={14} />
              </button>
            </div>
          )}

          {hasOriginal && (
            <button
              type="button"
              className={styles.toggleButton}
              onClick={handleToggle}
              title={isExpanded ? "原文を隠す" : "原文を表示"}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? "原文を隠す" : "原文を表示"}
            >
              {isExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}

          {isExpanded && block.original && (
            <div className={styles.originalWrapper}>
              <p className={styles.original}>
                {highlightText
                  ? highlightMatches(block.original, highlightText)
                  : block.original}
              </p>
            </div>
          )}
        </>
      )}

      {confidenceMenu && (
        <InfoPopover
          anchor={confidenceMenu.anchor}
          title="要確認"
          onClose={() => setConfidenceMenu(null)}
          footer={
            <>
              {hasOriginal ? (
                <button
                  type="button"
                  className={infoStyles.action}
                  onClick={() => {
                    setOriginalExpanded(block.id, true);
                    setConfidenceMenu(null);
                  }}
                >
                  原文を見る
                </button>
              ) : null}
              <button
                type="button"
                className={infoStyles.action}
                onClick={() => {
                  onOpenSourcePdf?.(block);
                  setConfidenceMenu(null);
                }}
              >
                元PDFで確認
              </button>
            </>
          }
        >
          <p className={infoStyles.raw}>
            この箇所は読み順の信頼度が低い可能性があります
          </p>
        </InfoPopover>
      )}
      {citationPreview && (
        <CitationPreviewPopover
          model={citationPreview.model}
          anchor={citationPreview.anchor}
          onClose={() => setCitationPreview(null)}
          onJump={(targetId) => onJumpToTarget?.(targetId)}
        />
      )}
      {termPreview && (
        <GlossaryTermPopover
          entry={termPreview.entry}
          anchor={termPreview.anchor}
          onClose={() => setTermPreview(null)}
          onOpenInspector={onOpenGlossaryInspector}
        />
      )}
    </div>
  );
}
