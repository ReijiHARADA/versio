import { useId } from "react";
import styles from "./Toggle.module.css";

type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

/**
 * Accessible switch control — reusable across Settings and future screens.
 * Uses a real checkbox for semantics; visuals are pill + thumb.
 */
export function Toggle({
  checked,
  onChange,
  id,
  disabled = false,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: ToggleProps) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <span className={`${styles.root} ${disabled ? styles.disabled : ""}`}>
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
    </span>
  );
}
