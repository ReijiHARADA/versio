import { Check, X } from "lucide-react";
import { LABEL_COLORS, LABEL_COLOR_NAMES, labelColorVar, type LabelColor } from "../../domain/labelColors";
import styles from "./LabelColorPicker.module.css";

type Props = {
  value: LabelColor | null | undefined;
  onChange: (color: LabelColor | null) => void;
  /** Accessible group name, e.g. "フォルダの色". */
  label: string;
};

/** Finder-style row of label swatches plus a "no color" swatch. */
export function LabelColorPicker({ value, onChange, label }: Props) {
  return (
    <div className={styles.row} role="radiogroup" aria-label={label}>
      <button
        type="button"
        role="radio"
        aria-checked={!value}
        aria-label="色なし"
        title="色なし"
        className={`${styles.swatch} ${styles.none}`}
        onClick={() => onChange(null)}
      >
        <X size={10} strokeWidth={2.5} />
      </button>
      {LABEL_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={LABEL_COLOR_NAMES[color]}
          title={LABEL_COLOR_NAMES[color]}
          className={styles.swatch}
          style={{ "--swatch": labelColorVar(color) } as React.CSSProperties}
          onClick={() => onChange(value === color ? null : color)}
        >
          {value === color ? <Check size={10} strokeWidth={3} /> : null}
        </button>
      ))}
    </div>
  );
}

/** Small filled dot used before a colored tag name. */
export function LabelDot({ color, className }: { color: LabelColor; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.dot} ${className ?? ""}`}
      style={{ "--swatch": labelColorVar(color) } as React.CSSProperties}
    />
  );
}
