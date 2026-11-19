import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, Smartphone } from "../ui/MaterialSymbol";
import {
  getEpubSyncFolder,
  hydrateEpubSyncStatus,
} from "../../services/epubSync";
import {
  presentEpubSyncFeedback,
  sendPaperEpubToSyncFolder,
} from "../../services/paperEpubSync";
import { useEpubSyncStore } from "../../stores/epubSyncStore";
import styles from "./PaperCard.module.css";

type SyncPhase = "idle" | "syncing" | "error";

type PaperEpubSyncControlProps = {
  paperId: string;
  /** Compact control for menus; list rows use the labeled button. */
  variant?: "labeled" | "menu";
  disabled?: boolean;
  onFinished?: () => void;
};

export function PaperEpubSyncControl({
  paperId,
  variant = "labeled",
  disabled = false,
  onFinished,
}: PaperEpubSyncControlProps) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<SyncPhase>("idle");
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entry = useEpubSyncStore((state) => state.byPaperId[paperId]);
  const saved = Boolean(folderPath && entry?.folderPath === folderPath);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await hydrateEpubSyncStatus();
      const folder = await getEpubSyncFolder();
      if (!cancelled) setFolderPath(folder);
    })();
    return () => {
      cancelled = true;
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const run = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (disabled || phase === "syncing") return;

    const alreadySaved = saved;
    setPhase("syncing");
    const result = await sendPaperEpubToSyncFolder(paperId);
    if (result.status === "ok" || result.status === "needs_folder") {
      const folder = await getEpubSyncFolder();
      setFolderPath(folder);
    }
    presentEpubSyncFeedback(result, {
      onOpenSettings: () => navigate("/settings"),
      alreadySaved,
    });

    if (result.status === "error") {
      setPhase("error");
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setPhase("idle"), 2400);
    } else {
      setPhase("idle");
    }
    onFinished?.();
  };

  const label =
    phase === "syncing"
      ? "送信中…"
      : phase === "error"
        ? "失敗"
        : saved
          ? "保存済み"
          : "スマホで読む";

  const icon =
    phase === "syncing" ? (
      <Loader2 size={14} className={styles.statusProcessing} aria-hidden="true" />
    ) : saved ? (
      <Check size={14} aria-hidden="true" />
    ) : (
      <Smartphone size={14} aria-hidden="true" />
    );

  if (variant === "menu") {
    return (
      <button
        type="button"
        role="menuitem"
        disabled={disabled || phase === "syncing"}
        onClick={(event) => void run(event)}
      >
        {phase === "syncing" ? (
          <Loader2 size={14} className={styles.statusProcessing} />
        ) : saved ? (
          <Check size={14} />
        ) : (
          <Smartphone size={14} />
        )}
        {label === "失敗" ? "送信失敗" : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.epubSyncButton} ${saved && phase === "idle" ? styles.epubSyncDone : ""} ${phase === "error" ? styles.epubSyncError : ""}`}
      title={
        saved
          ? "同期先に保存済み。クリックで EPUB を更新"
          : "同期先フォルダへ EPUB を送り、スマホで読む"
      }
      aria-label={saved ? "保存済み（クリックで更新）" : "スマホで読む"}
      aria-busy={phase === "syncing"}
      disabled={disabled || phase === "syncing"}
      data-testid="paper-epub-sync"
      data-synced={saved ? "true" : "false"}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => void run(event)}
    >
      {icon}
      <span className={styles.epubSyncLabel}>{label}</span>
    </button>
  );
}
