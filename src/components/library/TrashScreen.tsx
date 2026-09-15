import { useCallback, useEffect, useState } from "react";
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
} from "../../services/trashRetention";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { getAllWorkspacePapers, getAllPapers } from "../../services/database";
import { showToast } from "../../stores/toastStore";
import styles from "./LibraryScreen.module.css";
import trashStyles from "./TrashScreen.module.css";

export function TrashScreen() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [retentionDays, setRetentionDays] = useState(3);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmPermanentId, setConfirmPermanentId] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
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

  const handleRestore = async (item: TrashItem) => {
    if (busyId) return;
    setBusyId(item.id);
    setConfirmPermanentId(null);
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

  const handlePermanent = async (item: TrashItem) => {
    if (busyId) return;
    setBusyId(item.id);
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
      setConfirmPermanentId(null);
      await refresh();
      showToast({ kind: "info", message: `「${item.name}」を完全に削除しました` });
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "完全削除に失敗しました",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleEmpty = async () => {
    if (busyId) return;
    setBusyId("__empty__");
    try {
      const result = await emptyTrash();
      useLibraryCache.getState().setPapers(await getAllPapers());
      setMemberships(await getAllWorkspacePapers());
      setConfirmEmpty(false);
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
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Trash2 size={20} style={{ color: "var(--color-accent)" }} />
          <h1 className={styles.title}>ゴミ箱</h1>
        </div>
        <div className={styles.headerRight}>
          {confirmEmpty ? (
            <div className={trashStyles.confirmInline}>
              <span>ゴミ箱をすべて完全削除しますか？</span>
              <button
                type="button"
                className={trashStyles.dangerButton}
                disabled={Boolean(busyId)}
                onClick={() => void handleEmpty()}
              >
                空にする
              </button>
              <button
                type="button"
                className={trashStyles.ghostButton}
                disabled={Boolean(busyId)}
                onClick={() => setConfirmEmpty(false)}
              >
                キャンセル
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.addButton}
              disabled={items.length === 0 || Boolean(busyId)}
              onClick={() => setConfirmEmpty(true)}
            >
              ゴミ箱を空にする
            </button>
          )}
        </div>
      </header>

      <main className={styles.main}>
        {loading ? (
          <p className={styles.emptyDescription}>読み込み中…</p>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <Trash2 size={64} strokeWidth={1} />
            </div>
            <h2 className={styles.emptyTitle}>ゴミ箱は空です</h2>
            <p className={styles.emptyDescription}>
              削除した論文とフォルダがここに入ります。{retentionDays}日後に自動で完全削除されます。
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
                  {confirmPermanentId === item.id ? (
                    <div className={trashStyles.confirmInline}>
                      <span>完全に削除しますか？</span>
                      <button
                        type="button"
                        className={trashStyles.dangerButton}
                        disabled={busyId === item.id}
                        onClick={() => void handlePermanent(item)}
                      >
                        削除する
                      </button>
                      <button
                        type="button"
                        className={trashStyles.ghostButton}
                        onClick={() => setConfirmPermanentId(null)}
                      >
                        キャンセル
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={trashStyles.dangerButton}
                      disabled={Boolean(busyId)}
                      onClick={() => setConfirmPermanentId(item.id)}
                    >
                      今すぐ完全に削除
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
