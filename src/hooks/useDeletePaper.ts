import { useCallback, useState } from "react";
import { useLibraryCache } from "../stores/libraryCache";
import { showToast } from "../stores/toastStore";
import { displayPaperTitle } from "../services/translation/quality";
import {
  movePaperToTrash,
  restorePaperFromTrash,
} from "../services/trashService";

export function useDeletePaper() {
  const removePaper = useLibraryCache((s) => s.removePaper);
  const addPaper = useLibraryCache((s) => s.addPaper);
  const [busyId, setBusyId] = useState<string | null>(null);

  const moveToTrash = useCallback(
    async (event: React.MouseEvent, paperId: string) => {
      event.preventDefault();
      event.stopPropagation();
      if (busyId) return;
      const paper = useLibraryCache.getState().papers.find((item) => item.id === paperId);
      if (!paper) return;
      setBusyId(paperId);
      try {
        await movePaperToTrash(paperId);
        removePaper(paperId);
        const title = displayPaperTitle(paper);
        showToast({
          kind: "info",
          message: `「${title}」をゴミ箱に移動しました`,
          actionLabel: "元に戻す",
          onAction: () => {
            void restorePaperFromTrash(paperId)
              .then((restored) => {
                addPaper(restored);
              })
              .catch((error: unknown) => {
                showToast({
                  kind: "error",
                  message:
                    error instanceof Error ? error.message : "復元に失敗しました",
                });
              });
          },
        });
      } catch (err) {
        console.error("Failed to move paper to trash:", err);
        showToast({
          kind: "error",
          message: "ゴミ箱への移動に失敗しました。もう一度試してください。",
        });
      } finally {
        setBusyId(null);
      }
    },
    [addPaper, busyId, removePaper]
  );

  return { busyId, requestDelete: moveToTrash };
}
