import { lazy, Suspense, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { readerPaperId } from "../../stores/paperTabsStore";
import { clampSplitRatio, useSplitView } from "../../stores/splitViewStore";
import { releasePaperBody } from "../../services/paperBodyRelease";
import styles from "./AppShell.module.css";

const ReaderScreen = lazy(() => import("../reader/ReaderScreen").then((m) => ({ default: m.ReaderScreen })));

/** Left half of a split card: a second Reader beside the routed page, with a resizable divider. */
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
    const card = dividerRef.current?.parentElement;
    if (!card) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = card.getBoundingClientRect();
    const move = (e: PointerEvent) => useSplitView.getState().setRatio((e.clientX - rect.left) / rect.width);
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
      <div className={styles.splitPane} style={{ flexBasis: `${clampSplitRatio(ratio) * 100}%` }} data-split-pane>
        <Suspense fallback={null}>
          <ReaderScreen key={paperId} paperId={paperId} onClosePane={closeSplit} />
        </Suspense>
      </div>
      <div
        ref={dividerRef}
        className={styles.splitDivider}
        role="separator"
        aria-orientation="vertical"
        aria-label="分割表示の幅を変更"
        onPointerDown={onPointerDown}
        onDoubleClick={() => useSplitView.getState().setRatio(0.5)}
      />
    </>
  );
}
