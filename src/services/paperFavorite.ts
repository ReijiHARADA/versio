/**
 * Toggle paper favorite (library star). Independent of EPUB sync.
 */

import { setPaperFavorite } from "./database";
import { useLibraryCache } from "../stores/libraryCache";
import { showToast } from "../stores/toastStore";

export async function applyPaperFavorite(
  paperIds: string | string[],
  favorite: boolean
): Promise<void> {
  for (const paperId of typeof paperIds === "string" ? [paperIds] : paperIds) {
    await setPaperFavorite(paperId, favorite);
    useLibraryCache.getState().updatePaper(paperId, { favorite });
  }
  showToast({
    kind: "success",
    message: favorite ? "お気に入りに追加しました" : "お気に入りを外しました",
  });
}
