import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { boxFromPoints, idsInBox, usePaperSelectionStore, type Box } from "../../stores/paperSelectionStore";
import styles from "./AppShell.module.css";

const MARQUEE_THRESHOLD_PX = 4;
/** Where a press must not start a marquee: tiles themselves, controls, menus, editable text, drop targets. */
const NON_MARQUEE_TARGET =
  'article, button, a, input, textarea, select, label, [role="menu"], [role="dialog"], [contenteditable="true"], [data-project-drop-id]';

const PAPER_CARD = "article[data-paper-id][data-layout]";

function paperCards(): { id: string; box: Box }[] {
  return [...document.querySelectorAll<HTMLElement>(PAPER_CARD)].map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.dataset.paperId!, box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
  });
}

/**
 * Finder-style rubber-band selection over paper cards (grid tiles and list rows).
 * A press on empty space inside [data-paper-marquee] starts it; a plain click there clears the selection.
 * shortcut: the box is in viewport coordinates, so scrolling mid-drag does not extend it; track scroll offsets if long grids need that.
 */
export function PaperMarquee() {
  const [box, setBox] = useState<Box | null>(null);
  const { pathname } = useLocation();

  useEffect(() => usePaperSelectionStore.getState().clear(), [pathname]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      if (!event.target.closest("[data-paper-marquee]") || event.target.closest(NON_MARQUEE_TARGET)) return;
      if (!document.querySelector(PAPER_CARD)) return;

      const selection = usePaperSelectionStore.getState();
      const additive = event.metaKey || event.shiftKey;
      const base = additive ? [...selection.ids] : [];
      const { clientX: x0, clientY: y0, pointerId } = event;
      let moved = false;
      const previousUserSelect = document.body.style.userSelect;

      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== pointerId) return;
        if (!moved && Math.hypot(move.clientX - x0, move.clientY - y0) < MARQUEE_THRESHOLD_PX) return;
        if (!moved) {
          moved = true;
          document.body.style.userSelect = "none";
          window.getSelection()?.removeAllRanges();
        }
        const next = boxFromPoints(x0, y0, move.clientX, move.clientY);
        setBox(next);
        usePaperSelectionStore.getState().select([...base, ...idsInBox(next, paperCards())]);
      };
      const onUp = (up: PointerEvent) => {
        if (up.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.style.userSelect = previousUserSelect;
        setBox(null);
        if (!moved && !additive) usePaperSelectionStore.getState().clear();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  if (!box) return null;
  return (
    <div
      className={styles.marquee}
      style={{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }}
      aria-hidden
    />
  );
}
