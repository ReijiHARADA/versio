import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Eye, EyeOff, RefreshCw } from "lucide-react";
import type { PaperBlock } from "../../types/paper";
import type { Annotation } from "../../types/annotation";
import type { GlossaryEntry } from "../../services/llm/types";
import { useAppStore } from "../../stores/appStore";
import { updateBlock, getGlossary, getSetting } from "../../services/database";
import { MADLADEngine } from "../../services/translation/madladEngine";
import type { ImportConfig } from "../../services/importServiceV2";
import {
  usableTranslatedText,
  looksLikeBibliographyEntry,
  isReferencesHeading,
  shouldTranslateParagraph,
} from "../../services/translation/quality";
import { isLowExtractionConfidence } from "../../services/extractionConfidence";
import { splitHighlightedText } from "../../services/highlightRanges";
import { parseCitationGroups, uniqueCitationTarget } from "../../services/citations";
import { applyGlossary } from "../../services/llm/glossaryService";
import {
  citationPreviewFromIndex,
  type CitationPreviewModel,
} from "./citations/citationPreview";
import { CitationPreviewPopover } from "./citations/CitationPreviewPopover";
import { anchorFromEventTarget } from "./popoverAnchor";
import { segmentTextWithGlossary } from "./glossary/glossaryTerms";
import { GlossaryTermPopover } from "./glossary/GlossaryTermPopover";
import type { AnchorBox } from "./memo/popoverPosition";
import { TranslationMorph } from "./TranslationMorph";
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
}: ParagraphProps) {
  const isExpanded = useAppStore((state) => state.expandedOriginalBlocks.has(block.id));
  const toggleOriginalExpanded = useAppStore((state) => state.toggleOriginalExpanded);
  const setOriginalExpanded = useAppStore((state) => state.setOriginalExpanded);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showConfidenceMenu, setShowConfidenceMenu] = useState(false);
  const confidenceRef = useRef<HTMLDivElement>(null);
  const [citationPreview, setCitationPreview] = useState<{
    model: CitationPreviewModel;
    anchor: AnchorBox;
  } | null>(null);
  const [termPreview, setTermPreview] = useState<{
    entry: GlossaryEntry;
    anchor: AnchorBox;
  } | null>(null);
  const [morph, setMorph] = useState<{ from: string; to: string } | null>(null);
  const wasWaitingRef = useRef(false);

  const usableStoredTranslation = usableTranslatedText(block.translated, block.original);
  // The import policy understands projected list items and other structured
  // units that the generic paragraph heuristic intentionally rejects. Once a
  // translation has completed and passed the shared quality gate, the Reader
  // must not hide it by re-running the narrower source-shape heuristic.
  const hasAcceptedStoredTranslation =
    block.translationStatus === "completed" && Boolean(usableStoredTranslation);
  const skipTranslation = !hasAcceptedStoredTranslation && (
    block.translationStatus === "skipped" ||
    looksLikeBibliographyEntry(block.original || "") ||
    isReferencesHeading(block.original || "") ||
    !shouldTranslateParagraph(block.original || "")
  );
  const translated = skipTranslation ? null : usableStoredTranslation;
  const hasTranslation = Boolean(translated);
  const hasOriginal = Boolean(block.original && translated);
  const isPending = !skipTranslation && block.translationStatus === "pending";
  const isProcessing = !skipTranslation && block.translationStatus === "processing";
  const isFailed = !skipTranslation && block.translationStatus === "failed" && !hasTranslation;
  const isWaiting = !hasTranslation && (isPending || isProcessing);
  const lowConfidence = isLowExtractionConfidence(block.extractionConfidence);
  const translationInputWarning =
    !hasTranslation && typeof block.metadata.translationInputWarning === "string"
      ? block.metadata.translationInputWarning
      : null;

  const handleToggle = () => {
    toggleOriginalExpanded(block.id);
  };

  useEffect(() => {
    if (isWaiting) wasWaitingRef.current = true;
  }, [isWaiting]);

  useEffect(() => {
    if (!translated || !block.original || !wasWaitingRef.current || morph) return;
    wasWaitingRef.current = false;
    setMorph({ from: block.original, to: translated });
  }, [translated, block.original, morph]);

  useEffect(() => {
    if (!showConfidenceMenu) return;
    const onPointer = (event: PointerEvent) => {
      if (confidenceRef.current?.contains(event.target as Node)) return;
      setShowConfidenceMenu(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowConfidenceMenu(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [showConfidenceMenu]);

  const handleRetry = useCallback(async () => {
    if (!block.original || isRetrying) return;

    setIsRetrying(true);
    try {
      const v2 = await getSetting<ImportConfig>("translationSettingsV2");
      const engine = new MADLADEngine(v2?.madladServerUrl);
      const result = await engine.translate(block.original, "en", "ja");
      const glossary = await getGlossary(block.paperId);
      const text = applyGlossary(result.text, glossary);

      const updatedBlock: PaperBlock = {
        ...block,
        translated: text,
        translationStatus: "completed",
        metadata:
          block.type === "figure" || block.type === "table"
            ? { ...block.metadata, captionTranslated: text }
            : block.metadata,
      };

      await updateBlock(updatedBlock);
      onBlockUpdated?.(updatedBlock);
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

  const showMorphWaiting = isWaiting && Boolean(block.original);
  const showMorphReveal = Boolean(morph);

  return (
    <div
      className={`${styles.container} ${isWaiting ? styles.pending : ""} ${isExpanded ? styles.expanded : ""} ${lowConfidence ? styles.lowConfidence : ""}`}
    >
      {showMorphWaiting || showMorphReveal ? (
        <TranslationMorph
          fromText={showMorphReveal ? morph!.from : block.original!}
          toText={showMorphReveal ? morph!.to : undefined}
          phase={showMorphReveal ? "revealing" : "waiting"}
          onRevealComplete={() => setMorph(null)}
          textProps={{
            className: styles.translated,
            "data-paper-block-id": block.id,
            "data-text-role": "original",
            "data-translating": showMorphWaiting ? "" : undefined,
          }}
        />
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
            <div className={styles.confidenceGutter} ref={confidenceRef}>
              <button
                type="button"
                className={styles.confidenceButton}
                aria-expanded={showConfidenceMenu}
                aria-label="読み順の信頼度が低い箇所"
                title="要確認"
                onClick={() => setShowConfidenceMenu((value) => !value)}
              >
                <AlertTriangle size={14} />
              </button>
              {showConfidenceMenu && (
                <div className={styles.confidenceMenu} role="dialog" aria-label="要確認メニュー">
                  <p>この箇所は読み順の信頼度が低い可能性があります</p>
                  {hasOriginal && (
                    <button
                      type="button"
                      onClick={() => {
                        setOriginalExpanded(block.id, true);
                        setShowConfidenceMenu(false);
                      }}
                    >
                      原文を見る
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSourcePdf?.(block);
                      setShowConfidenceMenu(false);
                    }}
                  >
                    元PDFで確認
                  </button>
                </div>
              )}
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
