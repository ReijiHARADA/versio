import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../../stores/appStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { derivePaperReadiness } from "../../domain/paperReadiness";
import type { Paper } from "../../types/paper";
import { paperTab } from "../../stores/paperTabsStore";
import { useSplitView } from "../../stores/splitViewStore";
import { useInSplitPane } from "../shell/splitPaneContext";

/** Opens a paper in the Reader when its readiness allows it. `search` is appended to the route.
 *  From the left split pane (e.g. すべての論文 there) it opens in that pane, its tab in the left group. */
export function useOpenPaper() {
  const navigate = useNavigate();
  const setCurrentPaper = useAppStore((state) => state.setCurrentPaper);
  const inPane = useInSplitPane();
  const { pathname } = useLocation();
  return useCallback(
    (paper: Paper, search = "") => {
      const { canOpen } = derivePaperReadiness({
        processingStatus: paper.processingStatus,
        blocks: useLibraryCache.getState().blocks[paper.id],
      });
      if (!canOpen) return;
      // The paper already open on the right stays there (its tab too).
      if (inPane && pathname !== `/reader/${paper.id}`) {
        useSplitView.getState().openSplit(paperTab(paper.id));
        return;
      }
      setCurrentPaper(paper.id);
      navigate(`/reader/${paper.id}${search}`);
    },
    [navigate, setCurrentPaper, inPane, pathname]
  );
}
