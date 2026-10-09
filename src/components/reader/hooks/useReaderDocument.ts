import { useEffect, useState } from "react";
import { useLibraryCache } from "../../../stores/libraryCache";
import {
  getBlocksByPaper,
  getPaper,
  getSectionsByPaper,
  markPaperOpened,
} from "../../../services/database";
import { sourcePdfExists } from "../../../services/sourcePdf";
import {
  mergePreferTranslated,
  mergePreferTranslatedSections,
} from "../../../utils/mergePaperData";
export function useReaderDocument(paperId: string | undefined) {
  const updatePaper = useLibraryCache((s) => s.updatePaper);
  const setSectionsInStore = useLibraryCache((s) => s.setSections);
  const setBlocksInStore = useLibraryCache((s) => s.setBlocks);

  const [isLoading, setIsLoading] = useState(true);
  const [hasSourcePdf, setHasSourcePdf] = useState(false);

  useEffect(() => {
    let cancelled = false;

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
          void markPaperOpened(dbPaper.id).then(() => {
            updatePaper(dbPaper.id, { lastOpenedAt: new Date().toISOString() });
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

  // Release previous paper body when navigating away (keep metadata + active imports).
  useEffect(() => {
    return () => {
      if (!paperId) return;
      const cache = useLibraryCache.getState();
      const paper = cache.papers.find((item) => item.id === paperId);
      const busy =
        paper?.processingStatus === "translating" ||
        paper?.processingStatus === "glossary" ||
        paper?.processingStatus === "queued";
      if (busy) return;
      cache.clearPaperBody(paperId);
      void import("../../../data/repositories/documentRepository").then(({ forgetDocument }) => {
        forgetDocument(paperId);
      });
      void import("../../../hooks/usePaperAssetUrl").then(({ revokePaperAssetUrls }) => {
        revokePaperAssetUrls(paperId);
      });
    };
  }, [paperId]);

  return {
    isLoading,
    hasSourcePdf,
  };
}
