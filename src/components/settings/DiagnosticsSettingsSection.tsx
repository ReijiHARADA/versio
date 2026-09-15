import { RefreshCw } from "lucide-react";
import type { TranslationSettingsV2 } from "../../utils/translationSettings";
import type { ServiceStatus } from "./settingsTypes";
import { SettingsCard, SettingsStatusRow } from "./SettingsPrimitives";
import styles from "./SettingsScreen.module.css";

type Props = {
  settings: TranslationSettingsV2;
  onChange: (patch: Partial<TranslationSettingsV2>) => void;
  madladStatus: ServiceStatus;
  ollamaStatus: ServiceStatus;
  onRecheck: () => void;
  sampleAlreadyAdded: boolean;
  isAddingSample: boolean;
  sampleMessage: string | null;
  onAddSample: () => void;
};

function statusLabel(status: ServiceStatus): string {
  if (status.checking) return "確認中";
  if (status.available) return "接続済み";
  return "接続できません";
}

function statusKind(status: ServiceStatus): "checking" | "ok" | "error" {
  if (status.checking) return "checking";
  return status.available ? "ok" : "error";
}

export function DiagnosticsSettingsSection({
  settings,
  onChange,
  madladStatus,
  ollamaStatus,
  onRecheck,
  sampleAlreadyAdded,
  isAddingSample,
  sampleMessage,
  onAddSample,
}: Props) {
  const checking = madladStatus.checking || ollamaStatus.checking;

  return (
    <div className={styles.page}>
      <div>
        <h2 className={styles.pageTitle}>詳細</h2>
        <p className={styles.pageLead}>
          接続先や並行数など、通常は変更しない開発者向けの設定です。
        </p>
      </div>

      <div className={styles.cardStack}>
        <SettingsCard title="サービス">
          <SettingsStatusRow
            label="翻訳エンジン"
            detail="MADLAD"
            state={statusKind(madladStatus)}
            stateLabel={statusLabel(madladStatus)}
          />
          <SettingsStatusRow
            label="用語解析"
            detail="Ollama"
            state={statusKind(ollamaStatus)}
            stateLabel={statusLabel(ollamaStatus)}
          />
          <div className={styles.actionRow} style={{ marginTop: "var(--spacing-md)" }}>
            <button
              type="button"
              className={styles.button}
              onClick={onRecheck}
              disabled={checking}
            >
              <RefreshCw size={14} className={checking ? styles.spinning : ""} />
              接続を再確認
            </button>
          </div>
          <div className={styles.fieldStack} style={{ marginTop: "var(--spacing-lg)" }}>
            <label className={styles.fieldLabel}>
              MADLAD Server URL
              <input
                className={styles.input}
                value={settings.madladServerUrl}
                onChange={(e) => onChange({ madladServerUrl: e.target.value })}
              />
            </label>
            <label className={styles.fieldLabel}>
              Ollama Server URL
              <input
                className={styles.input}
                value={settings.ollamaServerUrl}
                onChange={(e) => onChange({ ollamaServerUrl: e.target.value })}
              />
            </label>
            <label className={styles.fieldLabel}>
              Ollama Model
              <input
                className={styles.input}
                value={settings.ollamaModel}
                onChange={(e) => onChange({ ollamaModel: e.target.value })}
              />
            </label>
          </div>
        </SettingsCard>

        <SettingsCard title="パフォーマンス">
          <div className={styles.fieldStack}>
            <label className={styles.fieldLabel}>
              Translation concurrency
              <input
                className={styles.input}
                type="number"
                min={1}
                max={8}
                value={settings.translationConcurrency}
                onChange={(e) =>
                  onChange({ translationConcurrency: Number(e.target.value) })
                }
              />
            </label>
            <p className={styles.hint}>
              一般向けの「翻訳速度」と同じ値です。細かく指定したいときだけ変更してください。
            </p>
          </div>
        </SettingsCard>

        <SettingsCard title="開発者">
          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.button}
              onClick={onAddSample}
              disabled={sampleAlreadyAdded || isAddingSample}
            >
              {sampleAlreadyAdded
                ? "サンプル論文は追加済み"
                : isAddingSample
                  ? "追加中..."
                  : "サンプル論文を追加"}
            </button>
          </div>
          {sampleMessage ? <p className={styles.statusText}>{sampleMessage}</p> : null}
        </SettingsCard>
      </div>
    </div>
  );
}
