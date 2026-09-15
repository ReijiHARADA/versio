import type { ReactNode } from "react";
import styles from "./SettingsPrimitives.module.css";

type SettingsCardProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

export function SettingsCard({ title, children, className }: SettingsCardProps) {
  return (
    <section className={`${styles.card} ${className ?? ""}`}>
      <h3 className={styles.cardTitle}>{title}</h3>
      <div className={styles.cardBody}>{children}</div>
    </section>
  );
}

type SettingsRowProps = {
  label: string;
  description?: string;
  htmlFor?: string;
  children: ReactNode;
  align?: "center" | "start";
};

export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
  align = "center",
}: SettingsRowProps) {
  return (
    <div className={`${styles.row} ${align === "start" ? styles.rowStart : ""}`}>
      <div className={styles.rowText}>
        {htmlFor ? (
          <label className={styles.rowLabel} htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <p className={styles.rowLabel}>{label}</p>
        )}
        {description ? <p className={styles.rowDescription}>{description}</p> : null}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

type SettingsStatusRowProps = {
  label: string;
  detail?: string;
  state: "checking" | "ok" | "error";
  stateLabel: string;
};

export function SettingsStatusRow({
  label,
  detail,
  state,
  stateLabel,
}: SettingsStatusRowProps) {
  return (
    <div className={styles.statusRow}>
      <div className={styles.rowText}>
        <p className={styles.rowLabel}>{label}</p>
        {detail ? <p className={styles.rowDescription}>{detail}</p> : null}
      </div>
      <p
        className={`${styles.statusValue} ${
          state === "ok" ? styles.statusOk : state === "error" ? styles.statusError : ""
        }`}
      >
        <span className={styles.statusDot} aria-hidden="true" />
        {stateLabel}
      </p>
    </div>
  );
}
