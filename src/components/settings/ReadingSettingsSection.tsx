import { Sun, Moon, Monitor } from "../ui/MaterialSymbol";
import {
  useAppStore,
  type DisplaySettings,
  type OriginalDisplayMode,
  type Theme,
  DEFAULT_SIDEBAR_WIDTH,
} from "../../stores/appStore";
import { Toggle } from "../ui/Toggle";
import { SettingsCard, SettingsRow } from "./SettingsPrimitives";
import { SettingsSelect } from "./SettingsSelect";
import { ReadingPreview } from "./ReadingPreview";
import { BehaviorComparison } from "./BehaviorComparison";
import {
  SIDEBAR_AUTO_COLLAPSE_OFF,
  SIDEBAR_AUTO_COLLAPSE_ON,
} from "./settingsPreviewAssets";
import styles from "./SettingsScreen.module.css";

const DEFAULT_READING_SETTINGS: DisplaySettings = {
  fontSize: 16,
  lineHeight: 1.8,
  contentWidth: 720,
  theme: "system",
  originalDisplay: "on-demand",
  sidebarMode: "expanded",
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
};

const ORIGINAL_DISPLAY_OPTIONS: {
  value: OriginalDisplayMode;
  label: string;
}[] = [
  { value: "on-demand", label: "必要なときだけ" },
  { value: "always", label: "常に表示" },
  { value: "when-untranslated", label: "翻訳がないときだけ" },
];

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
      <h2 className={styles.pageTitle}>読書</h2>

      <div className={styles.cardStack}>
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

          <ReadingPreview settings={displaySettings} />
        </SettingsCard>

        <SettingsCard title="原文">
          <SettingsRow
            label="原文の表示"
            description="英語原文を本文内でどのように表示するか選びます。"
            htmlFor="original-display"
          >
            <SettingsSelect
              id="original-display"
              aria-label="原文の表示"
              value={displaySettings.originalDisplay}
              options={ORIGINAL_DISPLAY_OPTIONS}
              onChange={(originalDisplay) => setDisplaySettings({ originalDisplay })}
            />
          </SettingsRow>
        </SettingsCard>

        <SettingsCard title="ナビゲーション">
          <SettingsRow label="自動で折りたたむ" htmlFor="sidebar-auto-collapse">
            <Toggle
              id="sidebar-auto-collapse"
              checked={displaySettings.sidebarMode === "auto"}
              onChange={(checked) =>
                setDisplaySettings({
                  sidebarMode: checked ? "auto" : "expanded",
                })
              }
            />
          </SettingsRow>

          <BehaviorComparison
            value={displaySettings.sidebarMode === "auto"}
            off={SIDEBAR_AUTO_COLLAPSE_OFF}
            on={SIDEBAR_AUTO_COLLAPSE_ON}
          />
        </SettingsCard>
      </div>
    </div>
  );
}
