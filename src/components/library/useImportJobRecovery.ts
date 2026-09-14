import { useNavigate } from "react-router-dom";
import { useImportJobStore } from "../../stores/importJobStore";
import {
  cancelBackgroundImport,
  dismissBackgroundImport,
  retryBackgroundImport,
  retryPaperTranslation,
} from "../../services/import/startBackgroundImport";

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
      navigate(`/reader/${paperId}`);
    },
    onReadd: () => {
      options?.fileInputRef?.current?.click();
    },
  };
}
