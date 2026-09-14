import { useMemo } from "react";
import { AlertCircle, Loader2, RotateCcw, Trash2, ExternalLink } from "lucide-react";
import type { ImportJob } from "../../stores/importJobStore";
import {
  actionLabel,
  classifyImportFailure,
  type ImportRecoveryAction,
} from "../../services/import/classifyFailure";
import styles from "./PaperCard.module.css";
import jobStyles from "./ImportJobCard.module.css";

type ImportJobCardProps = {
  job: ImportJob;
  onRetry?: (jobId: string) => void;
  onResume?: (jobId: string) => void;
  onDismiss?: (jobId: string) => void;
  onOpenExisting?: (paperId: string) => void;
  onReadd?: () => void;
};

export function ImportJobCard({
  job,
  onRetry,
  onResume,
  onDismiss,
  onOpenExisting,
  onReadd,
}: ImportJobCardProps) {
  const failed = job.stage === "failed" || job.stage === "duplicate";
  const percent =
    job.stageTotal > 0 ? Math.round((job.stageProgress / job.stageTotal) * 100) : 0;
  const classified = useMemo(
    () =>
      failed
        ? classifyImportFailure(job.error ?? job.message, job.failureKind ?? job.stage)
        : null,
    [failed, job.error, job.message, job.failureKind, job.stage]
  );

  const runAction = (action: ImportRecoveryAction) => {
    switch (action) {
      case "retry":
        onRetry?.(job.id);
        break;
      case "resume":
        (onResume ?? onRetry)?.(job.id);
        break;
      case "open_existing":
        if (job.existingPaperId) onOpenExisting?.(job.existingPaperId);
        break;
      case "dismiss":
        onDismiss?.(job.id);
        break;
      case "readd":
        onReadd?.();
        onDismiss?.(job.id);
        break;
    }
  };

  const actions = classified
    ? [classified.primaryAction, ...classified.secondaryActions.filter((a) => a !== classified.primaryAction)]
    : [];

  return (
    <article
      className={styles.row}
      aria-busy={!failed}
      aria-label={failed ? `${job.fileName}の読み込み失敗` : `${job.fileName}を準備中`}
    >
      <div className={styles.info}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{job.fileName}</h3>
        </div>
        {failed && classified && (
          <div className={jobStyles.failureDetail}>
            <p className={jobStyles.failureTitle}>{classified.title}</p>
            <p className={jobStyles.failureGuidance}>{classified.guidance}</p>
            {job.error && job.error !== classified.title ? (
              <p className={jobStyles.failureRaw}>{job.error}</p>
            ) : null}
          </div>
        )}
      </div>
      <div className={styles.trailing}>
        <span className={styles.status}>
          {failed ? (
            <AlertCircle size={14} className={styles.statusFailed} />
          ) : (
            <Loader2 size={14} className={styles.statusProcessing} />
          )}
          <span className={styles.statusLabel}>
            {job.stage === "duplicate" ? "重複" : failed ? "要確認" : "準備中"}
          </span>
        </span>
        {!failed && (
          <span className={styles.date}>{percent > 0 ? `${percent}%` : job.message}</span>
        )}
        {failed && (
          <div className={styles.importActions}>
            {actions.map((action) => {
              if (action === "open_existing" && !job.existingPaperId) return null;
              if (action === "readd" && !onReadd) return null;
              const label = actionLabel(action);
              const icon =
                action === "open_existing" ? (
                  <ExternalLink size={14} />
                ) : action === "dismiss" ? (
                  <Trash2 size={14} />
                ) : (
                  <RotateCcw size={14} />
                );
              return (
                <button
                  key={action}
                  type="button"
                  className={
                    action === classified?.primaryAction
                      ? jobStyles.primaryAction
                      : styles.actionButton
                  }
                  title={label}
                  aria-label={label}
                  onClick={() => runAction(action)}
                >
                  {icon}
                  <span className={jobStyles.actionText}>{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}
