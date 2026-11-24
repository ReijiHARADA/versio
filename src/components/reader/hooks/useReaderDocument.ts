import { useEffect, useState } from "react";
import { useLibraryCache } from "../../../stores/libraryCache";
import {
  getBlocksByPaper,
  getPaper,
  getSectionsByPaper,
  markPaperOpened,
} from "../../../services/database";
import { sourcePdfExists } from "../../../services/sourcePdf";
import { releasePaperBody } from "../../../services/paperBodyRelease";
import {
  mergePreferTranslated,
  mergePreferTranslatedSections,
} from "../../../utils/mergePaperData";
export function useReaderDocument(paperId: string | undefined) {
  const updatePaper = useLibraryCache((s) => s.updatePaper);
  const setSectionsInStore = useLibraryCache((s) => s.setSections);
  const setBlocksInStore = useLibraryCache((s) => s.setBlocks);

  // A paper whose body is still in memory (open tab) renders at once; the reload below
  // only refreshes it.
  const [isLoading, setIsLoading] = useState(
    () => !paperId || (useLibraryCache.getState().blocks[paperId]?.length ?? 0) === 0
  );
  const [hasSourcePdf, setHasSourcePdf] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (import.meta.env.VITE_VERSIO_DEMO === "1") {
      setIsLoading(false);
      setHasSourcePdf(false);
      return () => {
        cancelled = true;
      };
    }

    async function loadData() {
      if (!paperId) {
        setIsLoading(false);
        return;
      }

      try {
        const [dbPaper, dbSections, dbBlocks] = await Promise.all([
          getPaper(paperId),
          getSectionsByPaper(paperId),
          getBlocksByPaper(paperId),
        ]);
        if (cancelled) return;
        if (dbPaper) {
          updatePaper(dbPaper.id, dbPaper);
          void markPaperOpened(dbPaper.id).then((opened) => {
            if (opened) updatePaper(dbPaper.id, opened);
          });
        }
        // Package reads can briefly race SQLite/package startup (especially
        // immediately after launching the Tauri app). Do not turn that
        // transient empty result into a permanent "no content" screen.
        let loadedSections = dbSections;
        let loadedBlocks = dbBlocks;
        if (loadedBlocks.length === 0 && dbPaper) {
          for (let attempt = 0; attempt < 2 && loadedBlocks.length === 0; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (cancelled) return;
            [loadedSections, loadedBlocks] = await Promise.all([
              getSectionsByPaper(paperId),
              getBlocksByPaper(paperId),
            ]);
          }
        }
        if (loadedSections.length > 0) {
          setSectionsInStore(paperId, (prev) =>
            mergePreferTranslatedSections(prev, loadedSections)
          );
        }
        if (loadedBlocks.length > 0) {
          setBlocksInStore(paperId, (prev) => mergePreferTranslated(prev, loadedBlocks));
        }
        const exists = await sourcePdfExists(paperId);
        if (!cancelled) setHasSourcePdf(exists || Boolean(dbPaper?.sourceStoredPath));
      } catch (e) {
        console.error("Failed to load paper data:", e);
      }
      if (!cancelled) setIsLoading(false);
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [paperId, setSectionsInStore, setBlocksInStore, updatePaper]);

  // Release the previous paper body when navigating away, unless its tab stays open.
  useEffect(() => {
    return () => {
      if (paperId) releasePaperBody(paperId);
    };
  }, [paperId]);

  return {
    isLoading,
    hasSourcePdf,
  };
}
