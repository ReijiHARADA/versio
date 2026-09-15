import {
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
  useState,
  useImperativeHandle,
  forwardRef,
  type ReactNode,
} from "react";
import type { Paper, Section, PaperBlock, FigureMetadata, EquationMetadata, TableMetadata } from "../../types/paper";
import type { Annotation } from "../../types/annotation";
import type { GlossaryEntry } from "../../services/llm/types";
import { Paragraph } from "./Paragraph";
import { Figure } from "./Figure";
import { Equation } from "./Equation";
import { Table } from "./Table";
import { Footnote } from "./Footnote";
import { displayPaperTitle, usableTranslatedText, isGarbageTitle, sectionDisplayTitle, isReferencesHeading } from "../../services/translation/quality";
import { shouldTranslateBlock, isRetryableTranslationFailure } from "../../services/importServiceV2";
import { isBusyProcessingStatus } from "../../services/paperStatus";
import { indexReferenceBlocks, parseReferenceLinks } from "../../services/citations";
import {
  countLowConfidenceBlocks,
  isLowExtractionConfidence,
} from "../../services/extractionConfidence";
import { openExternalUrl } from "../../services/openExternalUrl";
import {
  computeMountedSectionIds,
  estimateSectionBodyHeight,
  resolveTransientMountPins,
  shouldVirtualizeSections,
} from "./virtualization/sectionVirtualization";
import styles from "./PaperContent.module.css";

const EMPTY_ANNOTATIONS: Annotation[] = [];
const EMPTY_GLOSSARY: GlossaryEntry[] = [];

function renderReferenceText(text: string): ReactNode {
  const links = parseReferenceLinks(text);
  if (links.length === 0) return text;
  const parts: ReactNode[] = [];
  let cursor = 0;
  links.forEach((link, index) => {
    if (link.start > cursor) parts.push(text.slice(cursor, link.start));
    parts.push(
      <a
        key={`${link.href}-${index}`}
        className={styles.referenceLink}
        href={link.href}
        onClick={(event) => {
          event.preventDefault();
          void openExternalUrl(link.href);
        }}
      >
        {text.slice(link.start, link.end)}
      </a>
    );
    cursor = link.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export type ReaderContentHandle = {
  ensureBlockMounted: (blockId: string) => Promise<void>;
  ensureSectionMounted: (sectionId: string) => Promise<void>;
  ensureTargetMounted: (targetId: string) => Promise<void>;
};

type PaperContentProps = {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
  onSectionVisible: (sectionId: string | null) => void;
  highlightText?: string;
  onBlockUpdated?: (block: PaperBlock) => void;
  annotations?: Annotation[];
  flashAnnotationIds?: string[];
  onHighlightClick?: (annotationIds: string[], rect: DOMRect) => void;
  onOpenSourcePdf?: (block: PaperBlock) => void;
  glossaryEntries?: GlossaryEntry[];
  onOpenGlossaryInspector?: () => void;
};

type PaperBlockViewProps = {
  block: PaperBlock;
  highlightText?: string;
  onBlockUpdated?: (block: PaperBlock) => void;
  annotations: Annotation[];
  flashAnnotationIds?: string[];
  onHighlightClick?: (annotationIds: string[], rect: DOMRect) => void;
  onOpenSourcePdf?: (block: PaperBlock) => void;
  referenceIndex: Map<string, string>;
  blocks: PaperBlock[];
  glossaryEntries: GlossaryEntry[];
  onOpenGlossaryInspector?: () => void;
  onJumpToTarget: (targetId: string) => void;
};

const PaperBlockView = memo(function PaperBlockView({
  block,
  highlightText,
  onBlockUpdated,
  annotations,
  flashAnnotationIds,
  onHighlightClick,
  onOpenSourcePdf,
  referenceIndex,
  blocks,
  glossaryEntries,
  onOpenGlossaryInspector,
  onJumpToTarget,
}: PaperBlockViewProps) {
  let content: React.ReactNode = null;

  switch (block.type) {
    case "heading":
      return null;
    case "paragraph":
      content = (
        <Paragraph
          block={block}
          highlightText={highlightText}
          onBlockUpdated={onBlockUpdated}
          annotations={annotations}
          flashAnnotationIds={flashAnnotationIds}
          onHighlightClick={onHighlightClick}
          onOpenSourcePdf={onOpenSourcePdf}
          referenceIndex={referenceIndex}
          referenceBlocks={blocks}
          glossaryEntries={glossaryEntries}
          onOpenGlossaryInspector={onOpenGlossaryInspector}
          onJumpToTarget={onJumpToTarget}
        />
      );
      break;
    case "figure":
      content = <Figure block={block} metadata={block.metadata as FigureMetadata} />;
      break;
    case "table":
      content = <Table block={block} metadata={block.metadata as TableMetadata} />;
      break;
    case "equation":
      content = <Equation block={block} metadata={block.metadata as EquationMetadata} />;
      break;
    case "footnote":
      content = <Footnote block={block} />;
      break;
    case "reference": {
      const referenceId =
        typeof block.metadata.referenceId === "string" ? block.metadata.referenceId : undefined;
      content = (
        <p id={referenceId} className={styles.reference}>
          {renderReferenceText(block.original || "")}
        </p>
      );
      break;
    }
    default:
      return null;
  }

  return <div id={`block-${block.id}`}>{content}</div>;
});

function SectionBodySpacer({
  sectionId,
  blocks,
}: {
  sectionId: string;
  blocks: PaperBlock[];
}) {
  const height = estimateSectionBodyHeight(blocks);
  return (
    <div
      className={styles.sectionBodySpacer}
      style={{ minHeight: height }}
      aria-hidden="true"
      data-virtualized-section={sectionId}
    />
  );
}

function isVisibleContentBlock(block: PaperBlock): boolean {
  if (block.type === "heading") return false;
  const role = String(block.metadata?.role ?? "");
  return role !== "author" && role !== "affiliation" && role !== "copyright";
}

export const PaperContent = memo(
  forwardRef<ReaderContentHandle, PaperContentProps>(function PaperContent(
    {
      paper,
      sections,
      blocks,
      onSectionVisible,
      highlightText,
      onBlockUpdated,
      annotations = EMPTY_ANNOTATIONS,
      flashAnnotationIds = [],
      onHighlightClick,
      onOpenSourcePdf,
      glossaryEntries = EMPTY_GLOSSARY,
      onOpenGlossaryInspector,
    },
    ref
  ) {
    const observerRef = useRef<IntersectionObserver | null>(null);
    const mountObserverRef = useRef<IntersectionObserver | null>(null);
    const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
    const [visibleForMount, setVisibleForMount] = useState<string[]>([]);
    const [pinnedSectionIds, setPinnedSectionIds] = useState<string[]>([]);

    const handleIntersection = useCallback(
      (entries: IntersectionObserverEntry[]) => {
        const visibleSections = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target.id.replace("section-", ""));

        if (visibleSections.length > 0) {
          onSectionVisible(visibleSections[0]);
        }
      },
      [onSectionVisible]
    );

    useEffect(() => {
      observerRef.current = new IntersectionObserver(handleIntersection, {
        rootMargin: "-20% 0px -70% 0px",
        threshold: 0,
      });

      sectionRefs.current.forEach((element) => {
        observerRef.current?.observe(element);
      });

      return () => {
        observerRef.current?.disconnect();
      };
    }, [handleIntersection, sections]);

    useEffect(() => {
      mountObserverRef.current = new IntersectionObserver(
        (entries) => {
          setVisibleForMount((prev) => {
            const next = new Set(prev);
            for (const entry of entries) {
              const id = entry.target.id.replace("section-", "");
              if (entry.isIntersecting) next.add(id);
              else next.delete(id);
            }
            const list = [...next];
            if (list.length === prev.length && list.every((id, i) => id === prev[i])) {
              return prev;
            }
            return list;
          });
        },
        { root: null, rootMargin: "900px 0px", threshold: 0 }
      );

      sectionRefs.current.forEach((element) => {
        mountObserverRef.current?.observe(element);
      });

      return () => {
        mountObserverRef.current?.disconnect();
      };
    }, [sections]);

    const registerSectionRef = (sectionId: string, element: HTMLElement | null) => {
      if (element) {
        sectionRefs.current.set(sectionId, element);
        observerRef.current?.observe(element);
        mountObserverRef.current?.observe(element);
      } else {
        const existing = sectionRefs.current.get(sectionId);
        if (existing) {
          observerRef.current?.unobserve(existing);
          mountObserverRef.current?.unobserve(existing);
          sectionRefs.current.delete(sectionId);
        }
      }
    };

    const referenceIndex = useMemo(() => indexReferenceBlocks(blocks), [blocks]);

    const annotationsByBlock = useMemo(() => {
      const map = new Map<string, Annotation[]>();
      for (const annotation of annotations) {
        const list = map.get(annotation.blockId);
        if (list) list.push(annotation);
        else map.set(annotation.blockId, [annotation]);
      }
      return map;
    }, [annotations]);

    const allSectionsOrdered = useMemo(
      () => [...sections].sort((a, b) => a.order - b.order),
      [sections]
    );

    const sectionIds = useMemo(
      () => new Set(allSectionsOrdered.map((section) => section.id)),
      [allSectionsOrdered]
    );

    const refSectionIds = useMemo(
      () =>
        new Set(
          allSectionsOrdered
            .filter(
              (section) =>
                section.normalizedKind === "references" ||
                isReferencesHeading(section.originalTitle)
            )
            .map((section) => section.id)
        ),
      [allSectionsOrdered]
    );

    const blocksBySection = useMemo(() => {
      const map = new Map<string, PaperBlock[]>();
      for (const block of blocks) {
        if (!block.sectionId || !isVisibleContentBlock(block)) continue;
        const list = map.get(block.sectionId);
        if (list) list.push(block);
        else map.set(block.sectionId, [block]);
      }
      return map;
    }, [blocks]);

    const orphanBlocks = useMemo(
      () =>
        blocks
          .filter((block) => {
            if (!isVisibleContentBlock(block)) return false;
            return !block.sectionId || !sectionIds.has(block.sectionId);
          })
          .sort((a, b) => a.order - b.order),
      [blocks, sectionIds]
    );

    const virtualize = shouldVirtualizeSections(allSectionsOrdered.length, blocks.length);

    const mountedSectionIds = useMemo(() => {
      if (!virtualize) {
        return new Set(allSectionsOrdered.map((section) => section.id));
      }
      return computeMountedSectionIds({
        orderedSectionIds: allSectionsOrdered.map((section) => section.id),
        visibleSectionIds: visibleForMount,
        pinnedSectionIds: resolveTransientMountPins(pinnedSectionIds),
        overscan: 2,
      });
    }, [allSectionsOrdered, virtualize, visibleForMount, pinnedSectionIds]);

    const waitForPaint = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

    /** Transient pin: mount target, then release after paint so pins do not accumulate. */
    const ensureSectionMounted = useCallback(async (sectionId: string) => {
      setPinnedSectionIds((prev) =>
        prev.includes(sectionId) ? prev : [...prev, sectionId]
      );
      await waitForPaint();
      setPinnedSectionIds((prev) => prev.filter((id) => id !== sectionId));
    }, []);

    const ensureBlockMounted = useCallback(
      async (blockId: string) => {
        const block = blocks.find((item) => item.id === blockId);
        if (block?.sectionId) await ensureSectionMounted(block.sectionId);
        else await waitForPaint();
      },
      [blocks, ensureSectionMounted]
    );

    const ensureTargetMounted = useCallback(
      async (targetId: string) => {
        if (targetId.startsWith("ref-")) {
          const block = blocks.find(
            (item) =>
              typeof item.metadata?.referenceId === "string" &&
              item.metadata.referenceId === targetId
          );
          if (block?.sectionId) {
            await ensureSectionMounted(block.sectionId);
            return;
          }
          for (const id of refSectionIds) await ensureSectionMounted(id);
          return;
        }
        await ensureBlockMounted(targetId);
      },
      [blocks, ensureBlockMounted, ensureSectionMounted, refSectionIds]
    );

    const onJumpToTarget = useCallback(
      (targetId: string) => {
        void (async () => {
          await ensureTargetMounted(targetId);
          const el = document.getElementById(
            targetId.startsWith("ref-") ? targetId : `block-${targetId}`
          );
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        })();
      },
      [ensureTargetMounted]
    );

    useImperativeHandle(
      ref,
      () => ({
        ensureBlockMounted,
        ensureSectionMounted,
        ensureTargetMounted,
      }),
      [ensureBlockMounted, ensureSectionMounted, ensureTargetMounted]
    );

    const banner = useMemo(() => {
      const translatableBlocks = blocks.filter((block) =>
        shouldTranslateBlock(block, refSectionIds)
      );
      const translatedCount = translatableBlocks.filter((block) => block.translated).length;
      const totalCount = translatableBlocks.length;
      const unfinishedCount = translatableBlocks.filter(
        (block) =>
          block.translationStatus === "pending" || block.translationStatus === "processing"
      ).length;
      const failedCount = blocks.filter((block) =>
        isRetryableTranslationFailure(block, refSectionIds)
      ).length;
      const attentionCount = countLowConfidenceBlocks(blocks);
      const firstAttentionId = blocks.find((block) =>
        isLowExtractionConfidence(block.extractionConfidence)
      )?.id;
      const showBusyBanner =
        isBusyProcessingStatus(paper.processingStatus) &&
        (unfinishedCount > 0 ||
          paper.processingStatus === "extracting" ||
          paper.processingStatus === "structuring" ||
          paper.processingStatus === "glossary" ||
          paper.processingStatus === "queued");
      return {
        translatedCount,
        totalCount,
        unfinishedCount,
        failedCount,
        attentionCount,
        firstAttentionId,
        showBusyBanner,
        showPartialBanner: !showBusyBanner && failedCount > 0,
      };
    }, [blocks, paper.processingStatus, refSectionIds]);

    const renderSectionBody = (sectionId: string, contentBlocks: PaperBlock[], mounted: boolean) => {
      if (!mounted) {
        return <SectionBodySpacer key={`spacer-${sectionId}`} sectionId={sectionId} blocks={contentBlocks} />;
      }
      return contentBlocks.map((block) => (
        <PaperBlockView
          key={block.id}
          block={block}
          highlightText={highlightText}
          onBlockUpdated={onBlockUpdated}
          annotations={annotationsByBlock.get(block.id) ?? EMPTY_ANNOTATIONS}
          flashAnnotationIds={flashAnnotationIds}
          onHighlightClick={onHighlightClick}
          onOpenSourcePdf={onOpenSourcePdf}
          referenceIndex={referenceIndex}
          blocks={blocks}
          glossaryEntries={glossaryEntries}
          onOpenGlossaryInspector={onOpenGlossaryInspector}
          onJumpToTarget={onJumpToTarget}
        />
      ));
    };

    const hasContent =
      allSectionsOrdered.length > 0 || blocks.length > 0 || orphanBlocks.length > 0;

    return (
      <article className={styles.article}>
        {banner.showBusyBanner && (
          <div className={styles.processingBanner}>
            <span className={styles.processingSpinner} />
            <span>
              {paper.processingStatus === "extracting" && "テキストを抽出中..."}
              {paper.processingStatus === "structuring" && "構造を解析中..."}
              {(paper.processingStatus === "translating" || banner.unfinishedCount > 0) &&
                paper.processingStatus !== "extracting" &&
                paper.processingStatus !== "structuring" &&
                paper.processingStatus !== "glossary" &&
                paper.processingStatus !== "queued" && (
                  <>
                    翻訳中
                    {banner.totalCount > 0
                      ? `... (${banner.translatedCount}/${banner.totalCount})`
                      : "..."}
                  </>
                )}
              {paper.processingStatus === "glossary" && "用語集を生成中..."}
              {paper.processingStatus === "queued" && "処理待ち..."}
            </span>
          </div>
        )}
        {banner.showPartialBanner && (
          <div className={styles.partialBanner}>
            一部の段落の翻訳に失敗しています（{banner.failedCount}件）。該当箇所から再試行できます。
          </div>
        )}
        {banner.attentionCount > 0 && (
          <button
            type="button"
            className={styles.attentionBanner}
            onClick={() => {
              if (!banner.firstAttentionId) return;
              void ensureBlockMounted(banner.firstAttentionId).then(() => {
                document
                  .getElementById(`block-${banner.firstAttentionId}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              });
            }}
          >
            要確認 {banner.attentionCount}箇所
          </button>
        )}

        <header className={styles.header}>
          <h1 className={styles.title}>{displayPaperTitle(paper)}</h1>
          {usableTranslatedText(paper.titleTranslated, paper.titleOriginal) &&
            paper.titleOriginal &&
            !isGarbageTitle(paper.titleOriginal) && (
              <p className={styles.originalTitle}>{paper.titleOriginal}</p>
            )}
          {paper.authors.length > 0 && (
            <p className={styles.authors}>{paper.authors.join(", ")}</p>
          )}
          {paper.publication && (
            <p className={styles.publication}>
              {paper.publication}
              {paper.year && ` (${paper.year})`}
            </p>
          )}
        </header>

        <div className={styles.content}>
          {hasContent ? (
            <>
              {orphanBlocks.length > 0 && (
                <div className={styles.section}>
                  {renderSectionBody("orphan", orphanBlocks, true)}
                </div>
              )}
              {allSectionsOrdered.map((section) => {
                const contentBlocks = blocksBySection.get(section.id) ?? [];
                const mounted = mountedSectionIds.has(section.id);
                const HeadingTag =
                  `h${Math.min(section.level + 1, 6)}` as keyof React.JSX.IntrinsicElements;
                return (
                  <section
                    key={section.id}
                    id={`section-${section.id}`}
                    className={styles.section}
                    data-section-mounted={mounted ? "true" : "false"}
                    ref={(el) => registerSectionRef(section.id, el)}
                  >
                    <HeadingTag className={styles[`heading${section.level}`]}>
                      {sectionDisplayTitle(section)}
                    </HeadingTag>
                    {renderSectionBody(section.id, contentBlocks, mounted)}
                  </section>
                );
              })}
            </>
          ) : (
            <div className={styles.emptyContent}>
              {banner.showBusyBanner ? (
                <p>コンテンツを準備中です。しばらくお待ちください...</p>
              ) : paper.processingStatus === "failed" ? (
                <p>処理に失敗しました。再度インポートしてください。</p>
              ) : (
                <p>コンテンツがありません。</p>
              )}
            </div>
          )}
        </div>
      </article>
    );
  })
);
