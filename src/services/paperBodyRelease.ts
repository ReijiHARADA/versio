import { useLibraryCache } from "../stores/libraryCache";
import { isPaperTabOpen } from "../stores/paperTabsStore";

/**
 * Frees a paper's in-memory body (blocks, sections, cached document, asset URLs).
 * Bodies of papers with an open tab are kept so switching tabs shows them instantly;
 * busy papers (translating / queued) are kept too. `force` skips the open-tab check.
 */
export function releasePaperBody(paperId: string, { force = false }: { force?: boolean } = {}): void {
  if (import.meta.env.VITE_VERSIO_DEMO === "1") return;
  if (!force && isPaperTabOpen(paperId)) return;
  const cache = useLibraryCache.getState();
  const paper = cache.papers.find((item) => item.id === paperId);
  const busy =
    paper?.processingStatus === "translating" ||
    paper?.processingStatus === "glossary" ||
    paper?.processingStatus === "queued";
  if (busy) return;
  cache.clearPaperBody(paperId);
  void import("../data/repositories/documentRepository").then(({ forgetDocument }) => {
    forgetDocument(paperId);
  });
  void import("../hooks/usePaperAssetUrl").then(({ revokePaperAssetUrls }) => {
    revokePaperAssetUrls(paperId);
  });
}
