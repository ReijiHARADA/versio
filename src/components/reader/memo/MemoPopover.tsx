import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Annotation } from "../../../types/annotation";
import {
  clampPopoverPosition,
  isAnchorInBounds,
  type AnchorBox,
  type PopoverBounds,
} from "./popoverPosition";
import styles from "./MemoPopover.module.css";
import { isImeComposing } from "../../../utils/ime";

type MemoPopoverMode = "compose" | "view" | "edit" | "cross-block";

type MemoPopoverProps = {
  mode: MemoPopoverMode;
  anchor: AnchorBox;
  annotation?: Annotation | null;
  note: string;
  saving?: boolean;
  error?: string | null;
  onNoteChange: (note: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Scroll pane the popover must stay inside (the reader body). */
  boundsRef?: RefObject<HTMLElement | null>;
};

const dateFormat = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric" });

function formatMemoDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

export function MemoPopover({
  mode,
  anchor,
  annotation,
  note,
  saving = false,
  error,
  onNoteChange,
  onSave,
  onCancel,
  onEdit,
  onDelete,
  boundsRef,
}: MemoPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [size, setSize] = useState({ width: 320, height: 180 });

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const update = () => {
      setSize({ width: el.offsetWidth, height: el.offsetHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode, note]);

  // Grow with the note instead of showing a resize handle.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [mode, note]);

  useEffect(() => {
    if (mode === "compose" || mode === "edit") {
      textareaRef.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-memo-popover]")) return;
      if (target?.closest("[data-annotation-mark]")) return;
      if (target?.closest("[data-draft-highlight]")) return;
      onCancel();
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [onCancel]);

  const paneRect = boundsRef?.current?.getBoundingClientRect();
  const bounds: PopoverBounds | undefined = paneRect
    ? { top: paneRect.top, left: paneRect.left, width: paneRect.width, height: paneRect.height }
    : undefined;
  const placement = clampPopoverPosition(anchor, size, bounds);
  // Hide (but keep the draft) while the anchor is scrolled out of the pane.
  const hidden = bounds ? !isAnchorInBounds(anchor, bounds) : false;
  const memoDate = formatMemoDate(annotation?.updatedAt ?? annotation?.createdAt);
  const title =
    mode === "cross-block"
      ? "複数段落"
      : mode === "compose"
        ? "メモを追加"
        : "メモ";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      data-memo-popover="true"
      data-testid="memo-popover"
      className={styles.popover}
      data-hidden={hidden || undefined}
      style={{ top: placement.top, left: placement.left }}
    >
      {mode === "cross-block" ? (
        <p className={styles.message}>
          複数段落にまたがるメモには現在対応していません
        </p>
      ) : (
        <>
          {annotation?.status === "orphaned" && (
            <p className={styles.orphaned}>
              元の翻訳文が変更されたため、現在の本文上で位置を特定できません。
            </p>
          )}
          {mode === "view" ? (
            <p className={styles.body}>{annotation?.note || "ハイライトのみ"}</p>
          ) : (
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              rows={2}
              value={note}
              disabled={saving}
              placeholder="メモを入力…"
              aria-label="メモを入力"
              data-testid="memo-note-input"
              onChange={(event) => onNoteChange(event.target.value)}
              onKeyDown={(event) => {
                if (isImeComposing(event)) return;
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  onSave();
                }
              }}
            />
          )}
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            {mode === "view" ? (
              <>
                <span className={styles.meta}>{memoDate}</span>
                <button
                  type="button"
                  className={styles.icon}
                  onClick={onEdit}
                  aria-label="編集"
                  title="編集"
                >
                  <Pencil size={15} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className={`${styles.icon} ${styles.danger}`}
                  onClick={onDelete}
                  aria-label="削除"
                  title="削除"
                >
                  <Trash2 size={15} strokeWidth={2} />
                </button>
              </>
            ) : (
              <>
                <span className={styles.meta} aria-hidden="true">⌘↩ で保存</span>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={onCancel}
                  disabled={saving}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={onSave}
                  disabled={saving}
                  data-testid="memo-save"
                  aria-label="メモを保存"
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
