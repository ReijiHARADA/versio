import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotationsForPaper,
  updateAnnotationNote,
} from "../../../services/annotationService";
import { saveAnnotation } from "../../../services/database";
import type { Annotation } from "../../../types/annotation";
import type { PaperBlock } from "../../../types/paper";
import { showToast } from "../../../stores/toastStore";
import type { SelectionResult } from "../selection/selectionAnchor";
import { memoRange, type MemoSurface } from "../memo/memoSurface";
import { measureMemoAnchor, rectToAnchor } from "../memo/popoverPosition";
import type { ReaderContentHandle } from "../PaperContent";

export function useReaderAnnotations(opts: {
  paperId: string | undefined;
  isLoading: boolean;
  storeBlocks: PaperBlock[];
  storeBlocksRef: MutableRefObject<PaperBlock[]>;
  contentRef: RefObject<HTMLDivElement | null>;
  paperContentRef: RefObject<ReaderContentHandle | null>;
  selectionResult: SelectionResult | null;
  dismissSelection: () => void;
  annotationWorkspaceNodeId: string | null;
}) {
  const {
    paperId,
    isLoading,
    storeBlocks,
    storeBlocksRef,
    contentRef,
    paperContentRef,
    selectionResult,
    dismissSelection,
    annotationWorkspaceNodeId,
  } = opts;

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeAnnotationIds, setActiveAnnotationIds] = useState<string[]>([]);
  const [flashAnnotationIds, setFlashAnnotationIds] = useState<string[]>([]);
  const [memoSurface, setMemoSurface] = useState<MemoSurface | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const memoSurfaceRef = useRef<MemoSurface | null>(null);

  useEffect(() => {
    memoSurfaceRef.current = memoSurface;
  }, [memoSurface]);

  useEffect(() => {
    if (selectionResult?.kind === "ok") {
      const next = selectionResult.selection;
      const fallback = rectToAnchor(selectionResult.rect);
      setMemoSurface((current) => {
        if (
          current?.mode === "compose" &&
          current.selection.blockId === next.blockId &&
          current.selection.startOffset === next.startOffset &&
          current.selection.endOffset === next.endOffset
        ) {
          return { ...current, fallback };
        }
        return {
          mode: "compose",
          selection: next,
          note: "",
          error: null,
          saving: false,
          fallback,
        };
      });
      return;
    }
    if (selectionResult?.kind === "cross-block") {
      setMemoSurface({
        mode: "cross-block",
        fallback: rectToAnchor(selectionResult.rect),
      });
    }
  }, [selectionResult]);

  useEffect(() => {
    if (!memoSurface) return;
    const update = () => {
      const current = memoSurfaceRef.current;
      if (!current) return;
      const range = memoRange(current);
      const next = measureMemoAnchor({
        ...range,
        fallback: current.fallback,
      });
      if (!next) return;
      setMemoSurface((surface) => (surface ? { ...surface, fallback: next } : surface));
    };
    const root = contentRef.current;
    root?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      root?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // Mode only: fallback updates from this listener must not rebind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- memoSurface.fallback churn
  }, [memoSurface?.mode, contentRef]);

  const reloadAnnotations = useCallback(async () => {
    if (!paperId) return;
    const list = await listAnnotationsForPaper(paperId, storeBlocksRef.current);
    setAnnotations(list);
  }, [paperId, storeBlocksRef]);

  useEffect(() => {
    if (!paperId || isLoading) return;
    void reloadAnnotations();
  }, [paperId, isLoading, reloadAnnotations]);

  const closeMemoSurface = useCallback(() => {
    setMemoSurface(null);
    dismissSelection();
  }, [dismissSelection]);

  const flashAnnotation = useCallback((id: string) => {
    setFlashAnnotationIds([id]);
    if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = window.setTimeout(() => {
      setFlashAnnotationIds([]);
    }, 2500);
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!paperId || memoSurface?.mode !== "compose") return;
    const block = storeBlocks.find((b) => b.id === memoSurface.selection.blockId);
    if (!block?.translated) {
      setMemoSurface((current) =>
        current?.mode === "compose"
          ? { ...current, error: "訳文がまだないため保存できません" }
          : current
      );
      return;
    }
    setMemoSurface((current) =>
      current?.mode === "compose" ? { ...current, saving: true, error: null } : current
    );
    try {
      const created = await createAnnotation({
        paperId,
        workspaceNodeId: annotationWorkspaceNodeId,
        blockId: memoSurface.selection.blockId,
        translated: block.translated,
        startOffset: memoSurface.selection.startOffset,
        endOffset: memoSurface.selection.endOffset,
        selectedText: memoSurface.selection.selectedText,
        note: memoSurface.note,
      });
      setAnnotations((current) =>
        current.some((item) => item.id === created.id) ? current : [...current, created]
      );
      setActiveAnnotationIds([created.id]);
      flashAnnotation(created.id);
      setMemoSurface(null);
      dismissSelection();
      window.getSelection()?.removeAllRanges();
      void reloadAnnotations();
    } catch (error) {
      setMemoSurface((current) =>
        current?.mode === "compose"
          ? {
              ...current,
              saving: false,
              error: error instanceof Error ? error.message : "保存に失敗しました",
            }
          : current
      );
    }
  }, [
    annotationWorkspaceNodeId,
    dismissSelection,
    flashAnnotation,
    memoSurface,
    paperId,
    reloadAnnotations,
    storeBlocks,
  ]);

  const handleSaveEdit = useCallback(async () => {
    if (memoSurface?.mode !== "edit") return;
    setMemoSurface((current) =>
      current?.mode === "edit" ? { ...current, saving: true, error: null } : current
    );
    try {
      const updated = await updateAnnotationNote(memoSurface.annotation, memoSurface.note);
      setAnnotations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setMemoSurface({
        mode: "view",
        annotation: updated,
        fallback: memoSurface.fallback,
      });
      void reloadAnnotations();
    } catch (error) {
      setMemoSurface((current) =>
        current?.mode === "edit"
          ? {
              ...current,
              saving: false,
              error: error instanceof Error ? error.message : "保存に失敗しました",
            }
          : current
      );
    }
  }, [memoSurface, reloadAnnotations]);

  const handleSelectAnnotation = useCallback(
    (annotation: Annotation) => {
      setActiveAnnotationIds([annotation.id]);
      void (async () => {
        await paperContentRef.current?.ensureBlockMounted(annotation.blockId);
        const element = document.getElementById(`block-${annotation.blockId}`);
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
        flashAnnotation(annotation.id);
        window.setTimeout(() => {
          const measured = measureMemoAnchor({
            blockId: annotation.blockId,
            startOffset: annotation.startOffset,
            endOffset: annotation.endOffset,
          });
          const fallback = measured ?? {
            top: window.innerHeight / 2,
            left: window.innerWidth / 2,
            width: 0,
            height: 0,
          };
          setMemoSurface({ mode: "view", annotation, fallback });
        }, 280);
      })();
    },
    [flashAnnotation, paperContentRef]
  );

  const handleHighlightClick = useCallback(
    (ids: string[], rect: DOMRect) => {
      const annotation = annotations.find((item) => ids.includes(item.id));
      setActiveAnnotationIds(ids);
      if (!annotation) return;
      setMemoSurface({
        mode: "view",
        annotation,
        fallback: rectToAnchor(rect),
      });
      dismissSelection();
    },
    [annotations, dismissSelection]
  );

  const handleDeleteAnnotation = useCallback(
    async (annotation: Annotation) => {
      await deleteAnnotation(annotation.id);
      setAnnotations((current) => current.filter((item) => item.id !== annotation.id));
      setActiveAnnotationIds((ids) => ids.filter((id) => id !== annotation.id));
      setMemoSurface((current) =>
        current &&
        (current.mode === "view" || current.mode === "edit") &&
        current.annotation.id === annotation.id
          ? null
          : current
      );
      showToast({
        kind: "info",
        message: "メモを削除しました",
        actionLabel: "元に戻す",
        onAction: () => {
          void saveAnnotation(annotation).then(() => {
            setAnnotations((current) =>
              current.some((item) => item.id === annotation.id)
                ? current
                : [...current, annotation]
            );
            void reloadAnnotations();
          });
        },
      });
      void reloadAnnotations();
    },
    [reloadAnnotations]
  );

  return {
    annotations,
    activeAnnotationIds,
    flashAnnotationIds,
    memoSurface,
    setMemoSurface,
    reloadAnnotations,
    closeMemoSurface,
    handleSaveDraft,
    handleSaveEdit,
    handleSelectAnnotation,
    handleHighlightClick,
    handleDeleteAnnotation,
  };
}
