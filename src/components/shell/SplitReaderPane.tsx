import { lazy, Suspense, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { readerPaperId } from "../../stores/paperTabsStore";
import { clampSplitRatio, useSplitView } from "../../stores/splitViewStore";
import { releasePaperBody } from "../../services/paperBodyRelease";
import { SPLIT_INSPECTOR_SLOT_ID } from "./inspectorSlot";
import styles from "./AppShell.module.css";

const ReaderScreen = lazy(() => import("../reader/ReaderScreen").then((m) => ({ default: m.ReaderScreen })));

/** Split view: a second card with its own Reader left of the main card, and the groove between
 *  them (drag to resize, double-click for half and half). */
export function SplitReaderPane({ paperId }: { paperId: string }) {
  const location = useLocation();
  const ratio = useSplitView((state) => state.ratio);
  const closeSplit = useSplitView((state) => state.closeSplit);
  const dividerRef = useRef<HTMLDivElement>(null);

  // Opening the same paper on the right moves it there; one paper never shows twice. Only a route
  // change counts: dropping the active tab here opens the pane a render before the route moves on.
  const lastPathRef = useRef(location.pathname);
  useEffect(() => {
    if (lastPathRef.current === location.pathname) return;
    lastPathRef.current = location.pathname;
    if (readerPaperId(location.pathname) === paperId) closeSplit();
  }, [location.pathname, paperId, closeSplit]);

  // The pane held the body warm; free it once the paper leaves both the pane and the tab strip.
  useEffect(() => () => releasePaperBody(paperId), [paperId]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const row = dividerRef.current?.parentElement;
    if (!row) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    // The cards share what the inspectors leave; the left card's right edge follows the pointer.
    const left = row.querySelector<HTMLElement>("[data-split-card]")?.getBoundingClientRect();
    const right = row.querySelector<HTMLElement>("[data-main-card]")?.getBoundingClientRect();
    if (!left || !right) return;
    const total = left.width + right.width;
    const move = (e: PointerEvent) => useSplitView.getState().setRatio((left.width + e.clientX - event.clientX) / total);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <>
      <div className={`${styles.main} ${styles.splitCard}`} style={{ flexGrow: clampSplitRatio(ratio) }} data-split-card>
        <div className={styles.splitPane} data-split-pane>
          <Suspense fallback={null}>
            <ReaderScreen key={paperId} paperId={paperId} onClosePane={closeSplit} />
          </Suspense>
        </div>
        <div className={styles.mainRim} aria-hidden />
      </div>
      {/* This pane's inspector sits on the ground beside its card, like the main card's. */}
      <div id={SPLIT_INSPECTOR_SLOT_ID} className={styles.splitInspectorSlot} />
      <div
        ref={dividerRef}
        className={styles.splitGroove}
        role="separator"
        aria-orientation="vertical"
        aria-label="分割表示の幅を変更"
        onPointerDown={onPointerDown}
        onDoubleClick={() => useSplitView.getState().setRatio(0.5)}
      >
        <span className={styles.splitGrip} />
      </div>
    </>
  );
}
