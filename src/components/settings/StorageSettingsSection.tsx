import { useEffect, useState } from "react";
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
import {
  getTrashRetentionDays,
  setTrashRetentionDays,
  TRASH_RETENTION_OPTIONS,
  type TrashRetentionDays,
} from "../../services/trashRetention";
import { purgeExpiredTrash } from "../../services/trashService";
import { SettingsCard, SettingsRow } from "./SettingsPrimitives";
import styles from "./SettingsScreen.module.css";

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
  const [retentionDays, setRetentionDays] = useState<TrashRetentionDays>(3);

  useEffect(() => {
    void getLibraryBackupMeta().then(setMeta);
    void getTrashRetentionDays().then(setRetentionDays);
  }, []);

  const refreshLibraryCaches = async () => {
    const papers = await getAllPapers();
    useLibraryCache.getState().setPapers(papers);
    const nodes = await listWorkspace();
    const memberships = await listWorkspacePapers();
    useProjectStore.getState().mergeWorkspaceNodes(nodes);
    useProjectStore.getState().setMemberships(memberships);
  };

  const handleRetentionChange = async (value: string) => {
    const next = await setTrashRetentionDays(Number(value));
    setRetentionDays(next);
    void purgeExpiredTrash().catch((error) => {
      console.warn("Failed to purge trash after retention change:", error);
    });
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
        next.lastMessage ?? `バックアップを作成しました（論文 ${result.paperCount} 件）`
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
    <div className={styles.page}>
      <div>
        <h2 className={styles.pageTitle}>ライブラリとデータ</h2>
        <p className={styles.pageLead}>
          バックアップ、ゴミ箱の保持期間、一時データの管理です。
        </p>
      </div>

      <div className={styles.cardStack}>
        <SettingsCard title="バックアップ">
          <SettingsRow label="最終バックアップ">
            <span className={styles.statusText}>{lastBackupLabel}</span>
          </SettingsRow>
          <SettingsRow
            label="ライブラリのバックアップ"
            description="論文パッケージ・索引・メモ・読書位置・ワークスペースをまとめて退避・復元します。"
            align="start"
          >
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.button}
                disabled={backupBusy || restoreBusy || busy}
                onClick={() => void handleBackup()}
              >
                {backupBusy ? "バックアップ中..." : "バックアップを作成"}
              </button>
              {!confirmRestore ? (
                <button
                  type="button"
                  className={styles.button}
                  disabled={backupBusy || restoreBusy || busy}
                  onClick={() => setConfirmRestore(true)}
                >
                  復元
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
          </SettingsRow>
          {backupMessage ? <p className={styles.statusText}>{backupMessage}</p> : null}
        </SettingsCard>

        <SettingsCard title="ゴミ箱">
          <SettingsRow
            label="自動削除までの日数"
            description="ゴミ箱の項目を自動で完全削除するまでの日数です。変更直後に期限切れがあれば削除します。"
            htmlFor="trash-retention-days"
            align="start"
          >
            <select
              id="trash-retention-days"
              className={styles.select}
              value={retentionDays}
              onChange={(event) => void handleRetentionChange(event.target.value)}
            >
              {TRASH_RETENTION_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {days}日後
                </option>
              ))}
            </select>
          </SettingsRow>
        </SettingsCard>

        <SettingsCard title="一時データ">
          <SettingsRow
            label="翻訳キャッシュ"
            description="同じ文章を速く翻訳するための一時データです。削除しても保存済みの論文・翻訳・元PDF・メモは消えません。"
            align="start"
          >
            {confirming ? (
              <div className={styles.actionRow}>
                <p className={styles.confirmText}>
                  翻訳キャッシュを削除しますか？保存済みの論文や翻訳、元PDF、メモは削除されません。
                </p>
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
                className={styles.button}
                onClick={onRequestClear}
                disabled={busy}
              >
                翻訳キャッシュを削除
              </button>
            )}
          </SettingsRow>
          {message ? <p className={styles.statusText}>{message}</p> : null}
        </SettingsCard>
      </div>
    </div>
  );
}
