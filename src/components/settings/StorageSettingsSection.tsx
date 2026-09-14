import { useEffect, useState } from "react";
import styles from "./SettingsScreen.module.css";
import {
  getLibraryBackupMeta,
  runLibraryBackup,
  runLibraryRestore,
  type LibraryBackupMeta,
} from "../../services/libraryBackup";
import { useLibraryCache } from "../../stores/libraryCache";
import { listWorkspace, listWorkspacePapers } from "../../services/projectService";
import { useProjectStore } from "../../stores/projectStore";
import { getAllPapers } from "../../services/database";

type StorageSettingsSectionProps = {
  confirming: boolean;
  busy: boolean;
  message: string | null;
  onRequestClear: () => void;
  onConfirmClear: () => void;
  onCancelClear: () => void;
};

const APP_VERSION = "0.1.0";

export function StorageSettingsSection({
  confirming,
  busy,
  message,
  onRequestClear,
  onConfirmClear,
  onCancelClear,
}: StorageSettingsSectionProps) {
  const [meta, setMeta] = useState<LibraryBackupMeta | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  useEffect(() => {
    void getLibraryBackupMeta().then(setMeta);
  }, []);

  const refreshLibraryCaches = async () => {
    const papers = await getAllPapers();
    useLibraryCache.getState().setPapers(papers);
    const nodes = await listWorkspace();
    const memberships = await listWorkspacePapers();
    useProjectStore.getState().mergeWorkspaceNodes(nodes);
    useProjectStore.getState().setMemberships(memberships);
  };

  const handleBackup = async () => {
    if (backupBusy || restoreBusy) return;
    setBackupBusy(true);
    setBackupMessage(null);
    try {
      const result = await runLibraryBackup(APP_VERSION);
      const next = await getLibraryBackupMeta();
      setMeta(next);
      setBackupMessage(
        next.lastMessage ??
          `バックアップを作成しました（論文 ${result.paperCount} 件）`
      );
    } catch (error) {
      setBackupMessage(
        `バックアップに失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestore = async () => {
    if (backupBusy || restoreBusy) return;
    setRestoreBusy(true);
    setBackupMessage(null);
    try {
      const result = await runLibraryRestore();
      await refreshLibraryCaches();
      setConfirmRestore(false);
      const next = await getLibraryBackupMeta();
      setMeta(next);
      setBackupMessage(
        `復元しました（論文 ${result.paperCount} 件）。必要ならアプリを再起動してください。`
      );
    } catch (error) {
      setBackupMessage(
        `復元に失敗しました（ライブラリは変更されていません）: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      setConfirmRestore(false);
    } finally {
      setRestoreBusy(false);
    }
  };

  const lastBackupLabel = meta?.lastBackupAt
    ? new Date(meta.lastBackupAt).toLocaleString()
    : "まだありません";

  return (
    <>
      <h2 className={styles.sectionTitle}>データ</h2>
      <div className={styles.surface}>
        <h3 className={styles.surfaceTitle}>ライブラリのバックアップ</h3>
        <p className={styles.sectionDescription}>
          論文パッケージ・索引・メモ・読書位置・ワークスペースをまとめて退避・復元します。
        </p>
        <p className={styles.cacheNote}>最終バックアップ: {lastBackupLabel}</p>
        <div className={styles.confirmRow}>
          <button
            type="button"
            className={styles.sectionButton}
            disabled={backupBusy || restoreBusy || busy}
            onClick={() => void handleBackup()}
          >
            {backupBusy ? "バックアップ中..." : "バックアップを作成"}
          </button>
          {!confirmRestore ? (
            <button
              type="button"
              className={styles.sectionButton}
              disabled={backupBusy || restoreBusy || busy}
              onClick={() => setConfirmRestore(true)}
            >
              バックアップから復元
            </button>
          ) : (
            <>
              <p className={styles.confirmText}>
                現在のライブラリは安全コピーのあと、選択したバックアップで置き換えられます。よろしいですか？
              </p>
              <button
                type="button"
                className={styles.dangerButton}
                disabled={backupBusy || restoreBusy}
                onClick={() => void handleRestore()}
              >
                {restoreBusy ? "復元中..." : "復元する"}
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                disabled={restoreBusy}
                onClick={() => setConfirmRestore(false)}
              >
                キャンセル
              </button>
            </>
          )}
        </div>
        {backupMessage && <p className={styles.sectionStatus}>{backupMessage}</p>}
      </div>

      <div className={styles.surface}>
        <h3 className={styles.surfaceTitle}>翻訳キャッシュ</h3>
        <p className={styles.sectionDescription}>
          同じ文章を速く翻訳するための一時データです。
        </p>
        <p className={styles.cacheNote}>削除しても、保存済みの論文・翻訳・元PDF・メモは消えません。</p>
        <p className={styles.cacheNote}>翻訳結果をリセットしたいときに削除してください。</p>
        {confirming ? (
          <div className={styles.confirmRow}>
            <p className={styles.confirmText}>翻訳キャッシュを削除しますか？ 保存済みの論文や翻訳、元PDF、メモは削除されません。</p>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={busy}
              onClick={onConfirmClear}
            >
              {busy ? "削除中..." : "キャッシュを削除"}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              disabled={busy}
              onClick={onCancelClear}
            >
              キャンセル
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.sectionButton}
            onClick={onRequestClear}
            disabled={busy}
          >
            翻訳キャッシュを削除
          </button>
        )}
        {message && <p className={styles.sectionStatus}>{message}</p>}
      </div>
    </>
  );
}
