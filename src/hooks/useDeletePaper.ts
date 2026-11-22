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
    async (event: React.MouseEvent, target: string | string[]) => {
      event.preventDefault();
      event.stopPropagation();
      if (busyId) return;
      const ids = new Set(typeof target === "string" ? [target] : target);
      const papers = useLibraryCache.getState().papers.filter((item) => ids.has(item.id));
      if (papers.length === 0) return;
      setBusyId(papers[0].id);
      const moved: string[] = [];
      try {
        for (const paper of papers) {
          await movePaperToTrash(paper.id);
          removePaper(paper.id);
          moved.push(paper.id);
        }
      } catch (err) {
        console.error("Failed to move paper to trash:", err);
        showToast({
          kind: "error",
          message: "ゴミ箱への移動に失敗しました。もう一度試してください。",
        });
      } finally {
        setBusyId(null);
      }
      if (moved.length === 0) return;
      showToast({
        kind: "info",
        message:
          moved.length === 1
            ? `「${displayPaperTitle(papers[0])}」をゴミ箱に移動しました`
            : `${moved.length}件の論文をゴミ箱に移動しました`,
        actionLabel: "元に戻す",
        onAction: () => {
          void Promise.all(moved.map((id) => restorePaperFromTrash(id).then(addPaper))).catch((error: unknown) => {
            showToast({
              kind: "error",
              message: error instanceof Error ? error.message : "復元に失敗しました",
            });
          });
        },
      });
    },
    [addPaper, busyId, removePaper]
  );

  return { busyId, requestDelete: moveToTrash };
}
