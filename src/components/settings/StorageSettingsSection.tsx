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
  trashRetentionOptionLabel,
  type TrashRetentionDays,
} from "../../services/trashRetention";
import { renewTrashItemsPastCutoff } from "../../services/trashService";
import {
  chooseEpubSyncFolder,
  clearEpubSyncFolder,
  getEpubSyncFolder,
} from "../../services/epubSync";
import {
  formatBytes,
  getAppVersion,
  getStorageUsage,
  revealAppDataFolder,
  type StorageUsage,
} from "../../services/appInfo";
import { showToast } from "../../stores/toastStore";
import { SettingsCard, SettingsRow } from "./SettingsPrimitives";
import { SettingsSelect } from "./SettingsSelect";
import styles from "./SettingsScreen.module.css";

type StorageSettingsSectionProps = {
  busy: boolean;
  onClearCache: () => void;
};

/** Written into backup metadata when the bundle version is unavailable (browser dev). */
const FALLBACK_APP_VERSION = "0.1.0";

export function StorageSettingsSection({
  busy,
  onClearCache,
}: StorageSettingsSectionProps) {
  const [meta, setMeta] = useState<LibraryBackupMeta | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState<TrashRetentionDays>(3);
  const [epubSyncFolder, setEpubSyncFolder] = useState<string | null>(null);
  const [epubSyncBusy, setEpubSyncBusy] = useState(false);
  const [usage, setUsage] = useState<StorageUsage | null>(null);

  useEffect(() => {
    void getLibraryBackupMeta().then(setMeta);
    void getTrashRetentionDays().then(setRetentionDays);
    void getEpubSyncFolder().then(setEpubSyncFolder);
    void getStorageUsage()
      .then(setUsage)
      .catch((error) => console.warn("Storage usage failed:", error));
  }, []);

  const handleRevealDataFolder = async () => {
    try {
      await revealAppDataFolder();
    } catch (error) {
      console.error("Reveal data folder failed:", error);
      showToast({ kind: "error", message: "データフォルダを開けませんでした" });
    }
  };

  const refreshLibraryCaches = async () => {
    const papers = await getAllPapers();
    useLibraryCache.getState().setPapers(papers);
    const nodes = await listWorkspace();
    const memberships = await listWorkspacePapers();
    useProjectStore.getState().mergeWorkspaceNodes(nodes);
    useProjectStore.getState().setMemberships(memberships);
  };

  const handleRetentionChange = async (days: TrashRetentionDays) => {
    const next = await setTrashRetentionDays(days);
    setRetentionDays(next);
    // Do not purge on change — items that would expire under the new window
    // get a fresh retention period from now.
    void renewTrashItemsPastCutoff(next).catch((error) => {
      console.warn("Failed to renew trash after retention change:", error);
    });
  };

  const handleBackup = async () => {
    if (backupBusy || restoreBusy) return;
    setBackupBusy(true);
    setBackupMessage(null);
    try {
      const result = await runLibraryBackup((await getAppVersion()) ?? FALLBACK_APP_VERSION);
      const next = await getLibraryBackupMeta();
      setMeta(next);
      const skipNote =
        result.warnings.length > 0
          ? `（不完全な論文 ${result.warnings.length} 件は除外）`
          : "";
      setBackupMessage(
        next.lastMessage ??
          `バックアップを作成しました（論文 ${result.paperCount} 件）${skipNote}`
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
  const syncFolderLabel = epubSyncFolder
    ? epubSyncFolder.split(/[\\/]/).filter(Boolean).at(-1) || epubSyncFolder
    : "未設定";

  const handleChooseEpubSyncFolder = async () => {
    if (epubSyncBusy) return;
    setEpubSyncBusy(true);
    try {
      const folder = await chooseEpubSyncFolder();
      if (folder) setEpubSyncFolder(folder);
    } catch (error) {
      setBackupMessage(
        `EPUB同期先の設定に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setEpubSyncBusy(false);
    }
  };

  const handleClearEpubSyncFolder = async () => {
    if (epubSyncBusy) return;
    setEpubSyncBusy(true);
    try {
      await clearEpubSyncFolder();
      setEpubSyncFolder(null);
    } finally {
      setEpubSyncBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>ライブラリとデータ</h2>

      <div className={styles.cardStack}>
        {usage ? (
          <SettingsCard title="保存場所">
            <SettingsRow
              label="データフォルダ"
              description={usage.path}
              align="start"
            >
              <button
                type="button"
                className={styles.button}
                onClick={() => void handleRevealDataFolder()}
              >
                Finder で表示
              </button>
            </SettingsRow>
            <SettingsRow label="使用容量">
              <span className={styles.statusText}>
                {`合計 ${formatBytes(usage.totalBytes)}（論文 ${formatBytes(usage.papersBytes)}・翻訳モデル ${formatBytes(usage.modelsBytes)}）`}
              </span>
            </SettingsRow>
          </SettingsCard>
        ) : null}

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
            description="ゴミ箱の項目を自動で完全削除するまでの日数です。"
            htmlFor="trash-retention"
          >
            <SettingsSelect
              id="trash-retention"
              aria-label="自動削除までの日数"
              value={retentionDays}
              options={TRASH_RETENTION_OPTIONS.map((days) => ({
                value: days,
                label: trashRetentionOptionLabel(days),
              }))}
              onChange={(days) => void handleRetentionChange(days)}
            />
          </SettingsRow>
        </SettingsCard>

        <SettingsCard title="一時データ">
          <SettingsRow
            label="翻訳キャッシュ"
            description="同じ文章を速く翻訳するための一時データです。削除しても保存済みの論文・翻訳・元PDF・メモは消えません。"
            align="start"
          >
            <button
              type="button"
              className={styles.button}
              onClick={onClearCache}
              disabled={busy}
            >
              {busy ? "削除中..." : "翻訳キャッシュを削除"}
            </button>
          </SettingsRow>
        </SettingsCard>

        <SettingsCard title="スマートフォン用EPUB同期">
          <SettingsRow
            label="同期先フォルダ"
            description="iCloud DriveやGoogle Driveのフォルダを選ぶと、ライブラリの「スマホで読む」から EPUB をそのフォルダへコピーできます。お気に入り（スター）とは別操作です。書き出しダイアログからも送れます。クラウド API 連携やバックグラウンド自動同期は行いません。"
            align="start"
          >
            <div className={styles.actionRow}>
              <span className={styles.statusText}>{syncFolderLabel}</span>
              <button
                type="button"
                className={styles.button}
                disabled={epubSyncBusy || busy}
                onClick={() => void handleChooseEpubSyncFolder()}
              >
                {epubSyncBusy ? "設定中..." : "フォルダを選択"}
              </button>
              {epubSyncFolder ? (
                <button
                  type="button"
                  className={styles.ghostButton}
                  disabled={epubSyncBusy || busy}
                  onClick={() => void handleClearEpubSyncFolder()}
                >
                  解除
                </button>
              ) : null}
            </div>
          </SettingsRow>
        </SettingsCard>
      </div>
    </div>
  );
}
