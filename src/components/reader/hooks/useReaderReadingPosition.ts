import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import { saveReadingPosition } from "../../../services/database";
import { shouldTranslateBlock } from "../../../services/importServiceV2";
import { isReferencesHeading } from "../../../services/translation/quality";
import {
  translationManager,
  READER_PRIORITY_DEBOUNCE_MS,
} from "../../../services/translation";
import type { Paper, PaperBlock, Section } from "../../../types/paper";
import type { ReaderContentHandle } from "../PaperContent";

type VisibleBlock = { id: string; offset: number };

function refreshBlockElements(content: HTMLElement): HTMLElement[] {
  return [...content.querySelectorAll<HTMLElement>("[id^='block-']")];
}

function findVisibleBlockId(
  content: HTMLElement,
  elements: HTMLElement[],
  startIndex = 0
): { visible: VisibleBlock | null; index: number } {
  if (elements.length === 0) return { visible: null, index: 0 };
  const contentRect = content.getBoundingClientRect();
  let index = Math.min(Math.max(startIndex, 0), elements.length - 1);
  const elemAt = (i: number) => elements[i];

  while (index > 0 && elemAt(index).getBoundingClientRect().top > contentRect.top + 8) {
    index -= 1;
  }
  while (
    index < elements.length - 1 &&
    elemAt(index).getBoundingClientRect().bottom <= contentRect.top
  ) {
    index += 1;
  }

  const elem = elemAt(index);
  if (!elem) return { visible: null, index };
  const rect = elem.getBoundingClientRect();
  if (rect.bottom <= contentRect.top || rect.top >= contentRect.bottom) {
    return { visible: null, index };
  }
  return {
    visible: {
      id: elem.id.replace("block-", ""),
      offset: contentRect.top - rect.top,
    },
    index,
  };
}

export function useReaderReadingPosition(opts: {
  paperId: string | undefined;
  paper: Paper | undefined;
  isLoading: boolean;
  contentRef: RefObject<HTMLDivElement | null>;
  paperContentRef: RefObject<ReaderContentHandle | null>;
  storeBlocks: PaperBlock[];
  storeSections: Section[];
  updatePaper: (paperId: string, updates: Partial<Paper>) => void;
}) {
  const {
    paperId,
    paper,
    isLoading,
    contentRef,
    paperContentRef,
    storeBlocks,
    storeSections,
    updatePaper,
  } = opts;

  const saveTimeoutRef = useRef<number | null>(null);
  const priorityTimeoutRef = useRef<number | null>(null);
  const lastPriorityBlockRef = useRef<string | null>(null);
  const blockElementsRef = useRef<HTMLElement[]>([]);
  const lastVisibleIndexRef = useRef(0);
  const restoredScrollForPaper = useRef<string | null>(null);

  const translatableIds = useMemo(() => {
    const refIds = new Set(
      storeSections
        .filter(
          (sec) =>
            sec.normalizedKind === "references" ||
            isReferencesHeading(sec.originalTitle)
        )
        .map((sec) => sec.id)
    );
    return [...storeBlocks]
      .filter((b) => shouldTranslateBlock(b, refIds))
      .sort((a, b) => a.order - b.order)
      .map((b) => b.id);
  }, [storeBlocks, storeSections]);

  const prioritizeVisible = useCallback(
    (blockId: string) => {
      if (!paperId) return;
      if (lastPriorityBlockRef.current === blockId) return;
      lastPriorityBlockRef.current = blockId;
      translationManager.prioritizeAroundBlock(paperId, blockId, translatableIds);
    },
    [paperId, translatableIds]
  );

  const handleScroll = useCallback(() => {
    if (!paperId || !contentRef.current) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    if (priorityTimeoutRef.current) {
      window.clearTimeout(priorityTimeoutRef.current);
    }

    const found = findVisibleBlockId(
      contentRef.current,
      blockElementsRef.current,
      lastVisibleIndexRef.current
    );
    lastVisibleIndexRef.current = found.index;
    if (found.visible) {
      priorityTimeoutRef.current = window.setTimeout(() => {
        prioritizeVisible(found.visible!.id);
      }, READER_PRIORITY_DEBOUNCE_MS);
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      const content = contentRef.current;
      if (!content) return;
      const next = findVisibleBlockId(
        content,
        blockElementsRef.current,
        lastVisibleIndexRef.current
      );
      lastVisibleIndexRef.current = next.index;
      if (!next.visible) return;
      try {
        await saveReadingPosition(paperId, next.visible.id, next.visible.offset);
        updatePaper(paperId, {
          lastReadBlockId: next.visible.id,
          lastReadOffset: next.visible.offset,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error("Failed to save reading position:", e);
      }
    }, 1000);
  }, [paperId, contentRef, updatePaper, prioritizeVisible]);

  useEffect(() => {
    if (!contentRef.current) return;
    blockElementsRef.current = refreshBlockElements(contentRef.current);
    lastVisibleIndexRef.current = 0;
  }, [paperId, isLoading, storeBlocks.length, contentRef]);

  useEffect(() => {
    restoredScrollForPaper.current = null;
  }, [paperId]);

  // Restore once per paper. Do not re-run when translation polling
  // recreates callbacks or updates lastReadBlockId during reading.
  useEffect(() => {
    if (!paper || !contentRef.current || isLoading) return;
    if (restoredScrollForPaper.current === paper.id) return;
    if (!paper.lastReadBlockId) {
      restoredScrollForPaper.current = paper.id;
      return;
    }

    const blockId = paper.lastReadBlockId;
    const offset = paper.lastReadOffset;
    let cancelled = false;
    void (async () => {
      await paperContentRef.current?.ensureBlockMounted(blockId);
      if (cancelled) return;
      const element = document.getElementById(`block-${blockId}`);
      if (!element) return;
      restoredScrollForPaper.current = paper.id;
      window.setTimeout(() => {
        element.scrollIntoView({ block: "start" });
        if (offset) {
          contentRef.current?.scrollBy(0, offset);
        }
        prioritizeVisible(blockId);
      }, 100);
    })();
    return () => {
      cancelled = true;
    };
  }, [paper, isLoading, storeBlocks.length, prioritizeVisible, contentRef, paperContentRef]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    content.addEventListener("scroll", handleScroll);
    return () => {
      content.removeEventListener("scroll", handleScroll);
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      if (priorityTimeoutRef.current) {
        window.clearTimeout(priorityTimeoutRef.current);
      }
    };
  }, [handleScroll, contentRef]);
}
