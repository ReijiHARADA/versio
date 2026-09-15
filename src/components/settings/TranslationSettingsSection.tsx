import type { TranslationSettingsV2 } from "../../utils/translationSettings";
import type { ServiceStatus } from "./settingsTypes";
import { Toggle } from "../ui/Toggle";
import { SettingsCard, SettingsRow, SettingsStatusRow } from "./SettingsPrimitives";
import styles from "./SettingsScreen.module.css";

type Props = {
  settings: TranslationSettingsV2;
  onChange: (patch: Partial<TranslationSettingsV2>) => void;
  madladStatus: ServiceStatus;
};

const speed = (value: number) =>
  value <= 2 ? "stable" : value >= 8 ? "fast" : "standard";

const speedInfo = {
  stable: "負荷を抑えやすい / 翻訳はゆっくり",
  standard: "速度と負荷のバランスがよい設定です。",
  fast: "翻訳が速い / PCへの負荷が高め",
} as const;

export function TranslationSettingsSection({
  settings,
  onChange,
  madladStatus,
}: Props) {
  const selected = speed(settings.translationConcurrency);
  const engineState = madladStatus.checking
    ? "checking"
    : madladStatus.available
      ? "ok"
      : "error";
  const engineLabel = madladStatus.checking
    ? "確認中"
    : madladStatus.available
      ? "接続済み"
      : "接続できません";

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>翻訳</h2>

      <div className={styles.cardStack}>
        <SettingsCard title="翻訳">
          <SettingsRow
            label="用語集を自動生成"
            description="論文内の専門用語を抽出し、訳し方を揃えます。"
            htmlFor="generate-glossary"
          >
            <Toggle
              id="generate-glossary"
              aria-label="用語集を自動生成"
              checked={settings.generateGlossary}
              onChange={(checked) => onChange({ generateGlossary: checked })}
            />
          </SettingsRow>

          <SettingsRow
            label="翻訳速度"
            description={speedInfo[selected]}
            align="start"
          >
            <div className={styles.segmented} role="radiogroup" aria-label="翻訳速度">
              {(["stable", "standard", "fast"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected === id}
                  className={selected === id ? styles.selected : ""}
                  onClick={() =>
                    onChange({
                      translationConcurrency: id === "stable" ? 2 : id === "standard" ? 4 : 8,
                    })
                  }
                >
                  {id === "stable" ? "安定" : id === "standard" ? "標準" : "高速"}
                </button>
              ))}
            </div>
          </SettingsRow>
        </SettingsCard>

        <SettingsCard title="ステータス">
          <SettingsStatusRow
            label="翻訳エンジン"
            state={engineState}
            stateLabel={engineLabel}
          />
          {!madladStatus.checking && !madladStatus.available ? (
            <p className={styles.hint}>詳細カテゴリで接続先を確認できます。</p>
          ) : null}
        </SettingsCard>
      </div>
    </div>
  );
}
