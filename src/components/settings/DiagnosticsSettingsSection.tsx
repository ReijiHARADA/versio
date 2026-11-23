import { RefreshCw } from "lucide-react";
import type { TranslationSettingsV2 } from "../../utils/translationSettings";
import type { ServiceStatus } from "./settingsTypes";
import { SettingsCard, SettingsStatusRow } from "./SettingsPrimitives";
import styles from "./SettingsScreen.module.css";

type Props = {
  settings: TranslationSettingsV2;
  onChange: (patch: Partial<TranslationSettingsV2>) => void;
  ollamaStatus: ServiceStatus;
  onRecheck: () => void;
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
  ollamaStatus,
  onRecheck,
}: Props) {
  const checking = ollamaStatus.checking;

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>詳細</h2>

      <div className={styles.cardStack}>
        <SettingsCard title="サービス">
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
              Ollama Server URL
              <span className={styles.inputField}>
                <input
                  className={styles.input}
                  value={settings.ollamaServerUrl}
                  onChange={(e) => onChange({ ollamaServerUrl: e.target.value })}
                />
              </span>
            </label>
            <label className={styles.fieldLabel}>
              Ollama Model
              <span className={styles.inputField}>
                <input
                  className={styles.input}
                  value={settings.ollamaModel}
                  onChange={(e) => onChange({ ollamaModel: e.target.value })}
                />
              </span>
            </label>
          </div>
        </SettingsCard>

      </div>
    </div>
  );
}
