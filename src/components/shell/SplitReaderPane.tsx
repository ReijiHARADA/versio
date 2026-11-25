import { lazy, Suspense, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { parseTab, tabForPath } from "../../stores/paperTabsStore";
import { clampSplitRatio, isPageTab, pagePath, useSplitView, type SplitTab } from "../../stores/splitViewStore";
import { releasePaperBody } from "../../services/paperBodyRelease";
import { SPLIT_INSPECTOR_SLOT_ID } from "./inspectorSlot";
import { ProjectScreen } from "../project/ProjectScreen";
import { LibraryScreen } from "../library/LibraryScreen";
import { InboxScreen } from "../library/InboxScreen";
import styles from "./AppShell.module.css";
import { suppressTextSelection } from "../../utils/dragSelection";
import { SplitPaneContext } from "./splitPaneContext";

const ReaderScreen = lazy(() => import("../reader/ReaderScreen").then((m) => ({ default: m.ReaderScreen })));


/** Split view: a second card left of the main card showing a paper (Reader), a folder or a pinned
 *  page (すべての論文 / インボックス), and the groove between them (drag to resize, double-click for
 *  half and half). */
export function SplitReaderPane({ tab }: { tab: SplitTab }) {
  const page = isPageTab(tab) ? pagePath(tab) : null;
  const { kind, id } = isPageTab(tab) ? { kind: "page" as const, id: "" } : parseTab(tab);
  const location = useLocation();
  const ratio = useSplitView((state) => state.ratio);
  const closeSplit = useSplitView((state) => state.closeSplit);
  const dividerRef = useRef<HTMLDivElement>(null);

  // Opening the left paper on the right moves it there (the left pane shows another left tab, or the
  // split closes); one paper never shows twice. Only a route
  // change counts: dropping the active tab here opens the pane a render before the route moves on.
  const lastPathRef = useRef(location.pathname);
  useEffect(() => {
    if (lastPathRef.current === location.pathname) return;
    lastPathRef.current = location.pathname;
    const shownOnRight = page != null ? location.pathname === page : tabForPath(location.pathname) === tab;
    if (shownOnRight) useSplitView.getState().removeLeftTab(tab);
  }, [location.pathname, tab, page, closeSplit]);

  // The pane held the body warm; free it once the paper leaves both the pane and the tab strip.
  useEffect(() => () => {
    if (kind === "paper") releasePaperBody(id);
  }, [kind, id]);

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
    const releaseSelection = suppressTextSelection();
    const move = (e: PointerEvent) => useSplitView.getState().setRatio((left.width + e.clientX - event.clientX) / total);
    const up = () => {
      releaseSelection();
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
          <SplitPaneContext.Provider value={true}>
            <Suspense fallback={null}>
              {page === "/" ? (
                <LibraryScreen />
              ) : page === "/inbox" ? (
                <InboxScreen />
              ) : kind === "paper" ? (
                <ReaderScreen key={tab} paperId={id} onClosePane={() => useSplitView.getState().removeLeftTab(tab)} />
              ) : (
                <ProjectScreen key={tab} nodeId={id} />
              )}
            </Suspense>
          </SplitPaneContext.Provider>
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
