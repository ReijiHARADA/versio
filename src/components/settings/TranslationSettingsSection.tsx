import type { TranslationEngineId, TranslationSettingsV2 } from "../../utils/translationSettings";
import type { ServiceStatus } from "./settingsTypes";
import { Toggle } from "../ui/Toggle";
import { SettingsCard, SettingsRow, SettingsStatusRow } from "./SettingsPrimitives";
import { TranslationMorphPreview } from "./TranslationMorphPreview";
import { SettingsSelect } from "./SettingsSelect";
import { usePlamoModel } from "./usePlamoModel";
import styles from "./SettingsScreen.module.css";

type Props = {
  settings: TranslationSettingsV2;
  onChange: (patch: Partial<TranslationSettingsV2>) => void;
  madladStatus: ServiceStatus;
};

const speed = (value: number) =>
  value <= 2 ? "stable" : value >= 8 ? "fast" : "standard";

const engineOptions = [
  { value: "plamo", label: "PLaMo 3 Translate 2B（推奨）" },
  { value: "madlad", label: "MADLAD-400 3B（旧エンジン・次版で削除）" },
] as const;

const modelLabel = {
  unavailable: "デスクトップ版でのみ利用できます",
  checking: "確認中",
  absent: "未ダウンロード",
  downloading: "ダウンロード中",
  present: "ダウンロード済み",
  error: "ダウンロードに失敗しました。再試行してください。",
} as const;

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
  const plamo = usePlamoModel();
  const usePlamo = settings.translationEngine === "plamo";
  const plamoReady = plamo.state === "present";
  const engineState = usePlamo
    ? plamoReady ? "ok" : plamo.state === "checking" ? "checking" : "error"
    : madladStatus.checking
    ? "checking"
    : madladStatus.available
      ? "ok"
      : "error";
  const engineLabel = usePlamo
    ? plamoReady ? "準備完了" : modelLabel[plamo.state]
    : madladStatus.checking
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
            label="翻訳エンジン"
            description={usePlamo ? "論文翻訳の品質と速度が最も高いエンジンです。" : "旧エンジンです。次のバージョンで削除します。"}
          >
            <SettingsSelect<TranslationEngineId>
              aria-label="翻訳エンジン"
              value={settings.translationEngine}
              options={engineOptions}
              onChange={(translationEngine) => onChange({ translationEngine })}
            />
          </SettingsRow>

          {usePlamo ? (
            <SettingsRow
              label="翻訳モデル"
              description={plamo.state === "downloading" ? `ダウンロード中…（${plamo.percent}%）` : modelLabel[plamo.state]}
            >
              {plamo.state === "absent" || plamo.state === "error" ? (
                <button type="button" className={styles.button} onClick={() => void plamo.download()}>
                  {plamo.state === "error" ? "再試行" : "モデルをダウンロード（1.8 GB）"}
                </button>
              ) : plamo.state === "downloading" ? (
                <progress max={100} value={plamo.percent} aria-label="ダウンロードの進捗" />
              ) : null}
            </SettingsRow>
          ) : null}

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

        <SettingsCard title="翻訳演出プレビュー">
          <TranslationMorphPreview />
        </SettingsCard>

        <SettingsCard title="ステータス">
          <SettingsStatusRow
            label="翻訳エンジン"
            state={engineState}
            stateLabel={engineLabel}
          />
          {!usePlamo && !madladStatus.checking && !madladStatus.available ? (
            <p className={styles.hint}>詳細カテゴリで接続先を確認できます。</p>
          ) : null}
        </SettingsCard>
      </div>
    </div>
  );
}
