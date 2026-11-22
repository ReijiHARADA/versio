import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../stores/appStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { derivePaperReadiness } from "../../domain/paperReadiness";
import type { Paper } from "../../types/paper";

/** Opens a paper in the Reader when its readiness allows it. `search` is appended to the route. */
export function useOpenPaper() {
  const navigate = useNavigate();
  const setCurrentPaper = useAppStore((state) => state.setCurrentPaper);
  return useCallback(
    (paper: Paper, search = "") => {
      const { canOpen } = derivePaperReadiness({
        processingStatus: paper.processingStatus,
        blocks: useLibraryCache.getState().blocks[paper.id],
      });
      if (!canOpen) return;
      setCurrentPaper(paper.id);
      navigate(`/reader/${paper.id}${search}`);
    },
    [navigate, setCurrentPaper]
  );
}
