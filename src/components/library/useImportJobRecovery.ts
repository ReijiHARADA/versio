import { useNavigate } from "react-router-dom";
import { useImportJobStore } from "../../stores/importJobStore";
import {
  cancelBackgroundImport,
  dismissBackgroundImport,
  retryBackgroundImport,
  retryPaperTranslation,
} from "../../services/import/startBackgroundImport";
import { getPaper } from "../../services/database";
import { restorePaperFromTrash } from "../../services/trashService";
import { useLibraryCache } from "../../stores/libraryCache";
import { showToast } from "../../stores/toastStore";

/** Shared recovery actions for pre-paper ImportJobCard instances. */
export function useImportJobRecovery(options?: {
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const navigate = useNavigate();

  return {
    onRetry: (id: string) => void retryBackgroundImport(id),
    onResume: (id: string) => {
      const job = useImportJobStore.getState().jobs.find((item) => item.id === id);
      if (job?.paperId) {
        void retryPaperTranslation(job.paperId);
        dismissBackgroundImport(id);
        return;
      }
      void retryBackgroundImport(id);
    },
    onDismiss: dismissBackgroundImport,
    onCancel: (id: string) => {
      cancelBackgroundImport(id);
    },
    onOpenExisting: (paperId: string) => {
      const job = useImportJobStore
        .getState()
        .jobs.find((item) => item.existingPaperId === paperId);
      if (job) dismissBackgroundImport(job.id);
      void (async () => {
        try {
          const existing = await getPaper(paperId);
          if (existing?.trashedAt) {
            const restored = await restorePaperFromTrash(paperId);
            useLibraryCache.getState().addPaper(restored);
            showToast({
              kind: "info",
              message: "ゴミ箱から復元しました",
            });
          }
          navigate(`/reader/${paperId}`);
        } catch (error) {
          showToast({
            kind: "error",
            message: error instanceof Error ? error.message : "復元に失敗しました",
          });
        }
      })();
    },
    onReadd: () => {
      options?.fileInputRef?.current?.click();
    },
  };
}
