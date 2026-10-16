import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Folder, FileText, Trash2 } from "lucide-react";
import {
  emptyTrash,
  listTrashItems,
  permanentlyDeletePaper,
  permanentlyDeleteWorkspaceFolder,
  purgeExpiredTrash,
  restorePaperFromTrash,
  restoreWorkspaceFolderFromTrash,
  type TrashItem,
} from "../../services/trashService";
import {
  formatTrashRemainingLabel,
  getTrashRetentionDays,
  isTrashAutoDeleteEnabled,
} from "../../services/trashRetention";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { getAllWorkspacePapers, getAllPapers } from "../../services/database";
import { showToast } from "../../stores/toastStore";
import styles from "./LibraryScreen.module.css";
import trashStyles from "./TrashScreen.module.css";

const EMPTY_HOLD_MS = 1100;

function itemKey(item: Pick<TrashItem, "kind" | "id">): string {
  return `${item.kind}:${item.id}`;
}

function HoldToEmptyButton({
  disabled,
  onComplete,
  widthPx,
}: {
  disabled: boolean;
  onComplete: () => void;
  /** Match the measured 元に戻す + 削除 action pair. */
  widthPx: number | null;
}) {
  const [progress, setProgress] = useState(0);
  const holdingRef = useRef(false);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  const completedRef = useRef(false);

  const stopHold = useCallback((commit: boolean) => {
    holdingRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (!commit) {
      setProgress(0);
      completedRef.current = false;
    }
  }, []);

  const tick = useCallback(
    (now: number) => {
      if (!holdingRef.current) return;
      const t = Math.min(1, (now - startRef.current) / EMPTY_HOLD_MS);
      setProgress(t);
      if (t >= 1) {
        holdingRef.current = false;
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete();
        }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [onComplete]
  );

  const startHold = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      holdingRef.current = true;
      completedRef.current = false;
      startRef.current = performance.now();
      setProgress(0.02);
      rafRef.current = requestAnimationFrame(tick);
    },
    [disabled, tick]
  );

  useEffect(() => () => stopHold(false), [stopHold]);

  return (
    <button
      type="button"
      className={trashStyles.emptyHoldButton}
      disabled={disabled}
      aria-label="長押しでゴミ箱を空にする"
      title="長押しでゴミ箱を空にする"
      style={{
        ["--hold-t" as string]: progress,
        ...(widthPx != null ? { width: `${widthPx}px` } : null),
      }}
      onPointerDown={startHold}
      onPointerUp={() => stopHold(false)}
      onPointerCancel={() => stopHold(false)}
      onPointerLeave={(event) => {
        if (event.buttons === 0) stopHold(false);
      }}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => event.preventDefault()}
    >
      <span className={trashStyles.emptyHoldFill} aria-hidden="true" />
      <span className={trashStyles.emptyHoldLabel}>ゴミ箱を空にする</span>
    </button>
  );
}

export function TrashScreen() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [retentionDays, setRetentionDays] = useState(3);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionsWidthPx, setActionsWidthPx] = useState<number | null>(null);
  const actionsMeasureRef = useRef<HTMLDivElement | null>(null);
  const addPaper = useLibraryCache((s) => s.addPaper);
  const removePaper = useLibraryCache((s) => s.removePaper);
  const removePaperData = useLibraryCache((s) => s.removePaperData);
  const upsertWorkspaceNode = useProjectStore((s) => s.upsertWorkspaceNode);
  const removeWorkspaceNodesLocal = useProjectStore((s) => s.removeWorkspaceNodesLocal);
  const setMemberships = useProjectStore((s) => s.setMemberships);
  const removeMembershipsForPaper = useProjectStore((s) => s.removeMembershipsForPaper);

  const refresh = useCallback(async () => {
    await purgeExpiredTrash();
    const [next, days] = await Promise.all([listTrashItems(), getTrashRetentionDays()]);
    setItems(next);
    setRetentionDays(days);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void refresh()
      .catch((error) => {
        console.error(error);
        showToast({
          kind: "error",
          message: error instanceof Error ? error.message : "ゴミ箱の読み込みに失敗しました",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useLayoutEffect(() => {
    const node = actionsMeasureRef.current;
    if (!node) return;
    const apply = () => {
      const width = Math.ceil(node.getBoundingClientRect().width);
      if (width > 0) setActionsWidthPx(width);
    };
    apply();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, []);

  const handleRestore = async (item: TrashItem) => {
    if (busyId) return;
    setBusyId(item.id);
    try {
      if (item.kind === "paper") {
        const restored = await restorePaperFromTrash(item.id);
        addPaper(restored);
      } else {
        const restored = await restoreWorkspaceFolderFromTrash(item.id);
        for (const node of restored) upsertWorkspaceNode(node);
        setMemberships(await getAllWorkspacePapers());
      }
      await refresh();
      showToast({ kind: "info", message: `「${item.name}」を元に戻しました` });
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "復元に失敗しました",
      });
    } finally {
      setBusyId(null);
    }
  };

  const commitPermanent = async (item: TrashItem) => {
    try {
      if (item.kind === "paper") {
        await permanentlyDeletePaper(item.id);
        removePaper(item.id);
        removePaperData(item.id);
        removeMembershipsForPaper(item.id);
      } else {
        const removed = await permanentlyDeleteWorkspaceFolder(item.id);
        removeWorkspaceNodesLocal(removed);
        setMemberships(await getAllWorkspacePapers());
      }
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "完全削除に失敗しました",
      });
      void refresh();
    }
  };

  const handlePermanent = (item: TrashItem) => {
    if (busyId) return;
    const key = itemKey(item);
    setBusyId(item.id);
    // Optimistic hide; real delete waits for toast expiry so「元に戻す」can cancel.
    setItems((current) => current.filter((entry) => itemKey(entry) !== key));
    setBusyId(null);

    let cancelled = false;
    showToast({
      kind: "info",
      message: `「${item.name}」を完全に削除しました`,
      actionLabel: "元に戻す",
      onAction: () => {
        cancelled = true;
        void refresh().catch(() => {
          /* refresh errors surface via next load */
        });
      },
      onExpire: () => {
        if (cancelled) return;
        void commitPermanent(item);
      },
    });
  };

  const handleEmpty = useCallback(async () => {
    if (busyId) return;
    setBusyId("__empty__");
    try {
      const result = await emptyTrash();
      useLibraryCache.getState().setPapers(await getAllPapers());
      setMemberships(await getAllWorkspacePapers());
      await refresh();
      showToast({
        kind: "info",
        message: `ゴミ箱を空にしました（論文 ${result.papers}・フォルダ ${result.folders}）`,
      });
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "ゴミ箱を空にできませんでした",
      });
    } finally {
      setBusyId(null);
    }
  }, [busyId, refresh, setMemberships]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Trash2 size={20} style={{ color: "var(--color-accent)" }} />
          <h1 className={styles.title}>ゴミ箱</h1>
        </div>
        <div className={styles.headerRight}>
          <div
            ref={actionsMeasureRef}
            className={trashStyles.actionsMeasure}
            aria-hidden="true"
          >
            <button type="button" className={trashStyles.restoreButton} tabIndex={-1}>
              元に戻す
            </button>
            <button type="button" className={trashStyles.dangerButton} tabIndex={-1}>
              削除
            </button>
          </div>
          <HoldToEmptyButton
            disabled={items.length === 0 || Boolean(busyId)}
            widthPx={actionsWidthPx}
            onComplete={() => void handleEmpty()}
          />
        </div>
      </header>

      <main className={`${styles.main} ${trashStyles.main}`}>
        {loading ? (
          <p className={styles.emptyDescription}>読み込み中…</p>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <Trash2 size={64} strokeWidth={1} />
            </div>
            <h2 className={styles.emptyTitle}>ゴミ箱は空です</h2>
            <p className={styles.emptyDescription}>
              削除した論文とフォルダがここに入ります。
              {isTrashAutoDeleteEnabled(retentionDays)
                ? `${retentionDays}日後に自動で完全削除されます。`
                : "自動削除はオフです。手動で空にするまで残ります。"}
            </p>
          </div>
        ) : (
          <ul className={trashStyles.list}>
            {items.map((item) => (
              <li key={`${item.kind}-${item.id}`} className={trashStyles.row}>
                <div className={trashStyles.icon}>
                  {item.kind === "paper" ? <FileText size={18} /> : <Folder size={18} />}
                </div>
                <div className={trashStyles.meta}>
                  <p className={trashStyles.name}>{item.name}</p>
                  <p className={trashStyles.detail}>
                    {item.kind === "paper" ? "論文" : "フォルダ"}
                    {" · "}
                    {new Date(item.trashedAt).toLocaleString()}
                    {" · "}
                    {formatTrashRemainingLabel(item.trashedAt, retentionDays)}
                    {item.kind === "folder" && item.childFolderCount > 0
                      ? ` · 配下 ${item.childFolderCount} フォルダ`
                      : null}
                  </p>
                </div>
                <div className={trashStyles.actions}>
                  <button
                    type="button"
                    className={trashStyles.restoreButton}
                    disabled={busyId === item.id}
                    onClick={() => void handleRestore(item)}
                  >
                    元に戻す
                  </button>
                  <button
                    type="button"
                    className={trashStyles.dangerButton}
                    disabled={Boolean(busyId)}
                    onClick={() => handlePermanent(item)}
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
