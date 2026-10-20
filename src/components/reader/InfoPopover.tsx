import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  clampPopoverPosition,
  type AnchorBox,
} from "./memo/popoverPosition";
import styles from "./InfoPopover.module.css";

type InfoPopoverProps = {
  anchor: AnchorBox;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
};

/** Lightweight fixed popover shared by citation / glossary / confidence previews. */
export function InfoPopover({
  anchor,
  title,
  children,
  onClose,
  footer,
}: InfoPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 160 });
  const previousFocus = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = panelRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.offsetWidth, height: el.offsetHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.focus();
    return () => {
      observer.disconnect();
      previousFocus.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-info-popover]")) return;
      if (target?.closest("[data-citation-trigger]")) return;
      if (target?.closest("[data-glossary-term]")) return;
      if (target?.closest("[data-confidence-trigger]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  const placement = clampPopoverPosition(anchor, size);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      tabIndex={-1}
      data-info-popover="true"
      className={styles.popover}
      style={{ top: placement.top, left: placement.left }}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <button
          type="button"
          className={styles.close}
          aria-label="閉じる"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className={styles.body}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </div>,
    document.body
  );
}

