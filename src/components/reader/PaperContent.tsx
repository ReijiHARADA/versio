import {
  useLayoutEffect,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
  useState,
  useImperativeHandle,
  forwardRef,
  type RefObject,
} from "react";
import type { Paper, Section, PaperBlock } from "../../types/paper";
import type { Annotation } from "../../types/annotation";
import type { GlossaryEntry } from "../../services/llm/types";
import { displayPaperTitle, usableTranslatedText, isGarbageTitle, sectionDisplayTitle, isReferencesHeading } from "../../services/translation/quality";
import { shouldTranslateBlock, isRetryableTranslationFailure } from "../../services/importServiceV2";
import { isBusyProcessingStatus } from "../../services/paperStatus";
import { coalesceSplitReferenceBlocks } from "../../services/citations";
import {
  countLowConfidenceBlocks,
  isLowExtractionConfidence,
} from "../../services/extractionConfidence";
import {
  computeMountedSectionIds,
  estimateSectionBodyHeight,
  resolveTransientMountPins,
  shouldVirtualizeSections,
} from "./virtualization/sectionVirtualization";
import {
  applyIntersectionDelta,
  glideToElement,
  isSectionBodyMounted,
  pickActiveSectionId,
  waitForPaint,
} from "./virtualization/sectionScroll";
import { PaperBlockView } from "./PaperBlockView";
import {
  groupAnnotationsByBlock,
  groupVisibleBlocksBySection,
  orphanVisibleBlocks,
  referenceSectionIds,
  useStableReferenceBlocks,
  useStableReferenceIndex,
} from "./paperContentData";
import styles from "./PaperContent.module.css";
import { Presence, MotionDiv } from "../ui/Presence";
import motion from "../../styles/motion.module.css";

const EMPTY_ANNOTATIONS: Annotation[] = [];
const EMPTY_GLOSSARY: GlossaryEntry[] = [];

export type ReaderContentHandle = {
  ensureBlockMounted: (blockId: string) => Promise<void>;
  ensureSectionMounted: (sectionId: string) => Promise<void>;
  ensureTargetMounted: (targetId: string) => Promise<void>;
  scrollToSection: (sectionId: string) => Promise<void>;
};

type PaperContentProps = {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
  scrollContainerRef?: RefObject<HTMLElement | null>;
  onSectionVisible: (sectionId: string | null) => void;
  highlightText?: string;
  onBlockUpdated?: (block: PaperBlock) => void;
  annotations?: Annotation[];
  draftHighlight?: { blockId: string; start: number; end: number } | null;
  flashAnnotationIds?: string[];
  onHighlightClick?: (annotationIds: string[], rect: DOMRect) => void;
  onOpenSourcePdf?: (block: PaperBlock) => void;
  glossaryEntries?: GlossaryEntry[];
  onOpenGlossaryInspector?: () => void;
};

function SectionBodySpacer({
  sectionId,
  blocks,
  measuredHeight,
}: {
  sectionId: string;
  blocks: PaperBlock[];
  measuredHeight?: number;
}) {
  const height =
    typeof measuredHeight === "number" && measuredHeight > 0
      ? measuredHeight
      : estimateSectionBodyHeight(blocks);
  return (
    <div
      className={styles.sectionBodySpacer}
      style={{ minHeight: height }}
      aria-hidden="true"
      data-virtualized-section={sectionId}
      data-section-body={sectionId}
    />
  );
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
      draftHighlight = null,
      flashAnnotationIds = [],
      onHighlightClick,
      onOpenSourcePdf,
      glossaryEntries = EMPTY_GLOSSARY,
      onOpenGlossaryInspector,
      scrollContainerRef,
    },
    ref
  ) {
    const observerRef = useRef<IntersectionObserver | null>(null);
    const mountObserverRef = useRef<IntersectionObserver | null>(null);
    const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
    const intersectingSectionIdsRef = useRef<Set<string>>(new Set());
    const orderedSectionIdsRef = useRef<string[]>([]);
    const programmaticActiveLockRef = useRef<string | null>(null);
    const lastPublishedActiveRef = useRef<string | null>(null);
    const measuredBodyHeightsRef = useRef<Map<string, number>>(new Map());
    const prevMountedSectionIdsRef = useRef<Set<string>>(new Set());
    const [visibleForMount, setVisibleForMount] = useState<string[]>([]);
    const [pinnedSectionIds, setPinnedSectionIds] = useState<string[]>([]);

    const publishActiveSection = useCallback(
      (sectionId: string | null) => {
        const locked = programmaticActiveLockRef.current;
        const next = locked ?? sectionId;
        if (next === lastPublishedActiveRef.current) return;
        lastPublishedActiveRef.current = next;
        onSectionVisible(next);
      },
      [onSectionVisible]
    );

    const handleIntersection = useCallback(
      (entries: IntersectionObserverEntry[]) => {
        applyIntersectionDelta(intersectingSectionIdsRef.current, entries);
        const next = pickActiveSectionId(
          orderedSectionIdsRef.current,
          intersectingSectionIdsRef.current
        );
        if (next) publishActiveSection(next);
      },
      [publishActiveSection]
    );

    useLayoutEffect(() => {
      const scrollRoot = scrollContainerRef?.current ?? null;
      observerRef.current = new IntersectionObserver(handleIntersection, {
        root: scrollRoot,
        rootMargin: scrollRoot ? "-15% 0px -55% 0px" : "-20% 0px -70% 0px",
        threshold: 0,
      });

      sectionRefs.current.forEach((element) => {
        observerRef.current?.observe(element);
      });

      return () => {
        observerRef.current?.disconnect();
      };
    }, [handleIntersection, sections, scrollContainerRef]);

    useLayoutEffect(() => {
      const scrollRoot = scrollContainerRef?.current ?? null;
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
        {
          root: scrollRoot,
          rootMargin: scrollRoot ? "600px 0px" : "900px 0px",
          threshold: 0,
        }
      );

      sectionRefs.current.forEach((element) => {
        mountObserverRef.current?.observe(element);
      });

      return () => {
        mountObserverRef.current?.disconnect();
      };
    }, [sections, scrollContainerRef]);

    const registerSectionRef = useCallback((sectionId: string, element: HTMLElement | null) => {
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
        intersectingSectionIdsRef.current.delete(sectionId);
      }
    }, []);
    const sectionRefCallbacks = useRef(new Map<string, (element: HTMLElement | null) => void>());
    const sectionRef = useCallback(
      (sectionId: string) => {
        let callback = sectionRefCallbacks.current.get(sectionId);
        if (!callback) {
          callback = (element) => registerSectionRef(sectionId, element);
          sectionRefCallbacks.current.set(sectionId, callback);
        }
        return callback;
      },
      [registerSectionRef]
    );

    const referenceBlocks = useStableReferenceBlocks(blocks);
    const referenceIndex = useStableReferenceIndex(blocks);

    const annotationsByBlock = useMemo(() => groupAnnotationsByBlock(annotations), [annotations]);

    const allSectionsOrdered = useMemo(
      () => [...sections].sort((a, b) => a.order - b.order),
      [sections]
    );

    orderedSectionIdsRef.current = allSectionsOrdered.map((section) => section.id);

    useLayoutEffect(() => {
      intersectingSectionIdsRef.current.clear();
      measuredBodyHeightsRef.current.clear();
      prevMountedSectionIdsRef.current = new Set();
      lastPublishedActiveRef.current = null;
      programmaticActiveLockRef.current = null;
    }, [paper.id]);

    const sectionIds = useMemo(
      () => new Set(allSectionsOrdered.map((section) => section.id)),
      [allSectionsOrdered]
    );

    const refSectionIds = useMemo(() => referenceSectionIds(allSectionsOrdered), [allSectionsOrdered]);

    const blocksBySection = useMemo(() => groupVisibleBlocksBySection(blocks), [blocks]);

    const orphanBlocks = useMemo(() => orphanVisibleBlocks(blocks, sectionIds), [blocks, sectionIds]);

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

    const blocksBySectionRef = useRef(blocksBySection);
    blocksBySectionRef.current = blocksBySection;

    // Remember real body heights so spacers match after a section unmounts,
    // and compensate scrollTop when a newly mounted body above the viewport
    // differs from its previous spacer estimate (avoids content jump).
    // Do not depend on blocksBySection identity — translation patches would
    // otherwise re-run layout work on every completed paragraph.
    useLayoutEffect(() => {
      const container = scrollContainerRef?.current;
      const prev = prevMountedSectionIdsRef.current;
      if (virtualize && container) {
        const containerTop = container.getBoundingClientRect().top;
        for (const sectionId of mountedSectionIds) {
          if (prev.has(sectionId)) continue;
          const sectionEl = sectionRefs.current.get(sectionId);
          const bodyEl = sectionEl?.querySelector<HTMLElement>(
            `[data-section-body="${sectionId}"]`
          );
          if (!sectionEl || !bodyEl) continue;
          const estimated =
            measuredBodyHeightsRef.current.get(sectionId) ??
            estimateSectionBodyHeight(blocksBySectionRef.current.get(sectionId) ?? []);
          const actual = bodyEl.getBoundingClientRect().height;
          const delta = actual - estimated;
          if (Math.abs(delta) <= 2) continue;
          if (sectionEl.getBoundingClientRect().top < containerTop - 1) {
            // oxlint-disable-next-line react/immutability -- DOM scroll position, not a React prop
            container.scrollTop += delta;
          }
        }
      }
      prevMountedSectionIdsRef.current = new Set(mountedSectionIds);
    }, [mountedSectionIds, virtualize, scrollContainerRef]);

    useEffect(() => {
      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const target = entry.target;
          if (!(target instanceof HTMLElement)) continue;
          const sectionId = target.getAttribute("data-section-body");
          if (!sectionId) continue;
          const height = entry.contentRect.height;
          if (height <= 0) continue;
          measuredBodyHeightsRef.current.set(sectionId, height);
        }
      });
      for (const sectionId of mountedSectionIds) {
        const body = document.querySelector(`[data-section-body="${sectionId}"]`);
        if (body instanceof HTMLElement) observer.observe(body);
      }
      return () => observer.disconnect();
    }, [mountedSectionIds]);

    const addSectionPin = useCallback((sectionId: string) => {
      setPinnedSectionIds((prev) =>
        prev.includes(sectionId) ? prev : [...prev, sectionId]
      );
    }, []);

    const removeSectionPin = useCallback((sectionId: string) => {
      setPinnedSectionIds((prev) => prev.filter((id) => id !== sectionId));
    }, []);

    /** Transient pin: keep target mounted until its body is in the DOM. */
    const ensureSectionMounted = useCallback(
      async (sectionId: string) => {
        if (!virtualize) {
          await waitForPaint();
          return;
        }
        addSectionPin(sectionId);
        try {
          for (let attempt = 0; attempt < 40; attempt++) {
            await waitForPaint();
            if (isSectionBodyMounted(sectionId)) return;
          }
        } finally {
          removeSectionPin(sectionId);
        }
      },
      [virtualize, addSectionPin, removeSectionPin]
    );

    const scrollToSectionTokenRef = useRef(0);
    const scrollToSection = useCallback(
      async (sectionId: string) => {
        const container = scrollContainerRef?.current;
        const sectionEl = () => document.getElementById(`section-${sectionId}`);
        const token = ++scrollToSectionTokenRef.current;
        programmaticActiveLockRef.current = sectionId;
        publishActiveSection(sectionId);

        // The reader's own wheel / touch / keys take over from an in-flight glide.
        let userScrolled = false;
        const onUserScroll = () => {
          userScrolled = true;
        };
        const userEvents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
        for (const type of userEvents) container?.addEventListener(type, onUserScroll, { passive: true });
        if (virtualize) addSectionPin(sectionId);

        try {
          if (!container) {
            await waitForPaint();
            sectionEl()?.scrollIntoView({ behavior: "auto", block: "start" });
            return;
          }
          await glideToElement({
            container,
            getElement: sectionEl,
            isReady: () => !virtualize || isSectionBodyMounted(sectionId),
            shouldStop: () => userScrolled || token !== scrollToSectionTokenRef.current,
            animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          });
        } finally {
          for (const type of userEvents) container?.removeEventListener(type, onUserScroll);
          if (virtualize) removeSectionPin(sectionId);
          // A newer jump owns the lock and the highlight now.
          if (token === scrollToSectionTokenRef.current) {
            programmaticActiveLockRef.current = null;
            // Keep the clicked section: its top lands on scroll-margin-top, a hair above the
            // observer band (15%), so the previous section's last pixel still "intersects".
            // Only a reader who scrolled away mid-glide gets the position-based pick.
            if (userScrolled) {
              const settled = pickActiveSectionId(
                orderedSectionIdsRef.current,
                intersectingSectionIdsRef.current
              );
              publishActiveSection(settled ?? sectionId);
            }
          }
        }
      },
      [
        virtualize,
        scrollContainerRef,
        addSectionPin,
        removeSectionPin,
        publishActiveSection,
      ]
    );

    const blocksRef = useRef(blocks);
    blocksRef.current = blocks;

    const ensureBlockMounted = useCallback(
      async (blockId: string) => {
        const block = blocksRef.current.find((item) => item.id === blockId);
        if (block?.sectionId) await ensureSectionMounted(block.sectionId);
        else await waitForPaint();
      },
      [ensureSectionMounted]
    );

    const ensureTargetMounted = useCallback(
      async (targetId: string) => {
        const currentBlocks = blocksRef.current;
        if (targetId.startsWith("ref-")) {
          const block = currentBlocks.find(
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
      [ensureBlockMounted, ensureSectionMounted, refSectionIds]
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
        scrollToSection,
      }),
      [ensureBlockMounted, ensureSectionMounted, ensureTargetMounted, scrollToSection]
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
      const inReferencesSection = refSectionIds.has(sectionId);
      if (!mounted) {
        return (
          <SectionBodySpacer
            key={`spacer-${sectionId}`}
            sectionId={sectionId}
            blocks={contentBlocks}
            measuredHeight={measuredBodyHeightsRef.current.get(sectionId)}
          />
        );
      }
      return (
        <div data-section-body={sectionId}>
          {contentBlocks.map((block) => (
            <PaperBlockView
              key={block.id}
              block={block}
              highlightText={highlightText}
              onBlockUpdated={onBlockUpdated}
              annotations={annotationsByBlock.get(block.id) ?? EMPTY_ANNOTATIONS}
              draftHighlight={
                draftHighlight && draftHighlight.blockId === block.id
                  ? { start: draftHighlight.start, end: draftHighlight.end }
                  : null
              }
              flashAnnotationIds={flashAnnotationIds}
              onHighlightClick={onHighlightClick}
              onOpenSourcePdf={onOpenSourcePdf}
              referenceIndex={referenceIndex}
              referenceBlocks={referenceBlocks}
              glossaryEntries={glossaryEntries}
              onOpenGlossaryInspector={onOpenGlossaryInspector}
              onJumpToTarget={onJumpToTarget}
              inReferencesSection={inReferencesSection}
              refSectionIds={refSectionIds}
            />
          ))}
        </div>
      );
    };

    const hasContent =
      allSectionsOrdered.length > 0 || blocks.length > 0 || orphanBlocks.length > 0;

    return (
      <article className={styles.article}>
        <Presence>{banner.showBusyBanner && (
          <MotionDiv className={`${styles.processingBanner} ${motion.reveal}`}>
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
          </MotionDiv>
        )}</Presence>
        <Presence>{banner.showPartialBanner && (
          <MotionDiv className={`${styles.partialBanner} ${motion.reveal}`}>
            一部の段落の翻訳に失敗しています（{banner.failedCount}件）。該当箇所から再試行できます。
          </MotionDiv>
        )}</Presence>
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
          {paper.affiliations && paper.affiliations.length > 0 && (
            <div className={styles.affiliations} aria-label="著者所属">
              {paper.affiliations.map((affiliation) => (
                <p className={styles.affiliation} key={affiliation.id}>
                  {affiliation.name}
                </p>
              ))}
            </div>
          )}
          {paper.keywords && paper.keywords.length > 0 && (
            <ul className={styles.keywords} aria-label="キーワード">
              {paper.keywords.map((keyword) => (
                <li className={styles.keyword} key={keyword}>{keyword}</li>
              ))}
            </ul>
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
                const rawBlocks = blocksBySection.get(section.id) ?? [];
                const contentBlocks =
                  section.normalizedKind === "references" ||
                  isReferencesHeading(section.originalTitle)
                    ? coalesceSplitReferenceBlocks(rawBlocks)
                    : rawBlocks;
                const mounted = mountedSectionIds.has(section.id);
                const HeadingTag =
                  `h${Math.min(section.level + 1, 6)}` as keyof React.JSX.IntrinsicElements;
                return (
                  <section
                    key={section.id}
                    id={`section-${section.id}`}
                    className={styles.section}
                    data-section-mounted={mounted ? "true" : "false"}
                    ref={sectionRef(section.id)}
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
