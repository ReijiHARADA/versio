import { useEffect, useState } from "react";
import { getAppVersion, revealTranslationLog } from "../../services/appInfo";
import { checkForAppUpdate } from "../../services/appUpdate";
import { showToast } from "../../stores/toastStore";
import { isTauriApp } from "../../utils/serverReady";
import { Presence } from "../ui/Presence";
import { ShortcutsSheet } from "../shell/ShortcutsSheet";
import { SettingsCard, SettingsRow } from "./SettingsPrimitives";
import styles from "./SettingsScreen.module.css";

export function AboutSettingsSection() {
  const desktop = isTauriApp();
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    void getAppVersion().then(setVersion);
  }, []);

  const handleCheckUpdate = async () => {
    if (checking) return;
    setChecking(true);
    try {
      await checkForAppUpdate({ quiet: false });
    } finally {
      setChecking(false);
    }
  };

  const handleRevealLog = async () => {
    try {
      await revealTranslationLog();
    } catch (error) {
      console.error("Reveal translation log failed:", error);
      showToast({ kind: "error", message: "翻訳ログを開けませんでした" });
    }
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>このアプリについて</h2>

      <div className={styles.cardStack}>
        <SettingsCard title="Versio">
          <SettingsRow label="バージョン">
            <span className={styles.statusText}>
              {desktop ? (version ?? "—") : "ブラウザ版（開発用）"}
            </span>
          </SettingsRow>
          {desktop ? (
            <SettingsRow label="アップデート">
              <button
                type="button"
                className={styles.button}
                disabled={checking}
                onClick={() => void handleCheckUpdate()}
              >
                {checking ? "確認中..." : "アップデートを確認"}
              </button>
            </SettingsRow>
          ) : null}
        </SettingsCard>

        <SettingsCard title="キーボードショートカット">
          <SettingsRow
            label="ショートカット一覧"
            description="メニューの「ヘルプ」や ⌘/ からも開けます。"
          >
            <button
              type="button"
              className={styles.button}
              onClick={() => setShortcutsOpen(true)}
            >
              一覧を表示
            </button>
          </SettingsRow>
        </SettingsCard>

        {desktop ? (
          <SettingsCard title="診断">
            <SettingsRow
              label="翻訳ログ"
              description="翻訳が始まらない・止まるときの記録です。不具合を報告するときに添えてください。"
              align="start"
            >
              <button
                type="button"
                className={styles.button}
                onClick={() => void handleRevealLog()}
              >
                Finder で表示
              </button>
            </SettingsRow>
          </SettingsCard>
        ) : null}
      </div>

      <Presence>
        {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}
      </Presence>
    </div>
  );
}
