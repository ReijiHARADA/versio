import { Sun, Moon, Monitor } from "lucide-react";
import {
  useAppStore,
  type DisplaySettings,
  type SidebarMode,
  type Theme,
  DEFAULT_SIDEBAR_WIDTH,
} from "../../stores/appStore";
import { Toggle } from "../ui/Toggle";
import { SettingsCard, SettingsRow } from "./SettingsPrimitives";
import { ReadingPreview } from "./ReadingPreview";
import styles from "./SettingsScreen.module.css";

const DEFAULT_READING_SETTINGS: DisplaySettings = {
  fontSize: 16,
  lineHeight: 1.8,
  contentWidth: 720,
  theme: "system",
  originalDisplay: "on-demand",
  sidebarMode: "auto",
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  sidebarCollapseRootsOnly: true,
};

export function ReadingSettingsSection() {
  const displaySettings = useAppStore((state) => state.displaySettings);
  const setDisplaySettings = useAppStore((state) => state.setDisplaySettings);

  const handleThemeChange = (theme: Theme) => {
    setDisplaySettings({ theme });
    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  };

  return (
    <div className={styles.page}>
      <div>
        <h2 className={styles.pageTitle}>読書</h2>
        <p className={styles.pageLead}>
          本文の見やすさとサイドバーの振る舞いを調整します。右側のプレビューにすぐ反映されます。
        </p>
      </div>

      <div className={styles.readingLayout}>
        <div className={styles.readingControls}>
          <SettingsCard title="表示">
            <SettingsRow
              label="テーマ"
              description="アプリ全体の明るさを選びます。"
              align="start"
            >
              <div className={styles.themeButtons} role="group" aria-label="テーマ">
                <button
                  type="button"
                  className={`${styles.themeButton} ${displaySettings.theme === "light" ? styles.active : ""}`}
                  onClick={() => handleThemeChange("light")}
                >
                  <Sun size={14} />
                  ライト
                </button>
                <button
                  type="button"
                  className={`${styles.themeButton} ${displaySettings.theme === "dark" ? styles.active : ""}`}
                  onClick={() => handleThemeChange("dark")}
                >
                  <Moon size={14} />
                  ダーク
                </button>
                <button
                  type="button"
                  className={`${styles.themeButton} ${displaySettings.theme === "system" ? styles.active : ""}`}
                  onClick={() => handleThemeChange("system")}
                >
                  <Monitor size={14} />
                  システム
                </button>
              </div>
            </SettingsRow>

            <SettingsRow
              label="文字サイズ"
              description="本文の文字を読みやすい大きさに調整します。"
            >
              <div className={styles.sliderRow}>
                <span>小</span>
                <input
                  className={styles.slider}
                  aria-label="文字サイズ"
                  type="range"
                  min="12"
                  max="24"
                  step="1"
                  value={displaySettings.fontSize}
                  onChange={(e) => setDisplaySettings({ fontSize: Number(e.target.value) })}
                />
                <span>大</span>
              </div>
            </SettingsRow>

            <SettingsRow label="行間" description="文章の行と行の間隔を調整します。">
              <div className={styles.sliderRow}>
                <span>狭</span>
                <input
                  className={styles.slider}
                  aria-label="行間"
                  type="range"
                  min="1.4"
                  max="2.4"
                  step="0.1"
                  value={displaySettings.lineHeight}
                  onChange={(e) => setDisplaySettings({ lineHeight: Number(e.target.value) })}
                />
                <span>広</span>
              </div>
            </SettingsRow>

            <SettingsRow label="本文幅" description="1行の長さを調整します。">
              <div className={styles.sliderRow}>
                <span>狭</span>
                <input
                  className={styles.slider}
                  aria-label="本文幅"
                  type="range"
                  min="480"
                  max="960"
                  step="10"
                  value={displaySettings.contentWidth}
                  onChange={(e) =>
                    setDisplaySettings({ contentWidth: Number(e.target.value) })
                  }
                />
                <span>広</span>
              </div>
            </SettingsRow>

            <SettingsRow label="リセット">
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => {
                  setDisplaySettings(DEFAULT_READING_SETTINGS);
                  handleThemeChange(DEFAULT_READING_SETTINGS.theme);
                }}
              >
                デフォルトに戻す
              </button>
            </SettingsRow>
          </SettingsCard>

          <SettingsCard title="原文">
            <SettingsRow
              label="原文の表示"
              description="英語原文を本文内でどのように表示するか選びます。"
              htmlFor="original-display"
              align="start"
            >
              <select
                id="original-display"
                className={styles.select}
                value={displaySettings.originalDisplay}
                onChange={(e) =>
                  setDisplaySettings({
                    originalDisplay: e.target.value as DisplaySettings["originalDisplay"],
                  })
                }
              >
                <option value="on-demand">必要なときだけ</option>
                <option value="always">常に表示</option>
                <option value="when-untranslated">翻訳がないときだけ</option>
              </select>
            </SettingsRow>
          </SettingsCard>

          <SettingsCard title="ナビゲーション">
            <SettingsRow
              label="左サイドバー"
              description="ホバーで自動開閉するか、常に開いた／閉じた状態にするかを選びます。"
              htmlFor="sidebar-mode"
              align="start"
            >
              <select
                id="sidebar-mode"
                className={styles.select}
                value={displaySettings.sidebarMode}
                onChange={(e) =>
                  setDisplaySettings({ sidebarMode: e.target.value as SidebarMode })
                }
              >
                <option value="auto">ホバーで自動開閉</option>
                <option value="expanded">常に開く</option>
                <option value="collapsed">常に閉じる（アイコンのみ）</option>
              </select>
            </SettingsRow>

            <SettingsRow
              label="折りたたみ時は最上位だけ表示"
              description="オン（推奨）: アイコンだけのとき、入れ子フォルダ／論文を隠します。"
              htmlFor="sidebar-roots-only"
            >
              <Toggle
                id="sidebar-roots-only"
                checked={displaySettings.sidebarCollapseRootsOnly}
                onChange={(checked) =>
                  setDisplaySettings({ sidebarCollapseRootsOnly: checked })
                }
              />
            </SettingsRow>
          </SettingsCard>
        </div>

        <div className={styles.readingPreviewColumn}>
          <ReadingPreview settings={displaySettings} />
        </div>
      </div>
    </div>
  );
}
