import { ReplayablePreview } from "./ReplayablePreview";
import styles from "./BehaviorComparison.module.css";

export type BehaviorPreviewSide = {
  /** Looping GIF (or still) of production behavior. */
  src: string;
  /** Still frame for prefers-reduced-motion / paused state. */
  poster: string;
  /** Screen-reader only name for this column. */
  ariaLabel: string;
  cycleDurationMs?: number;
  still?: boolean;
};

type BehaviorComparisonProps = {
  /** Current setting value; true highlights the ON column. */
  value: boolean;
  off: BehaviorPreviewSide;
  on: BehaviorPreviewSide;
};

/**
 * Side-by-side behavior previews for boolean settings.
 * Does not own the setting — Toggle elsewhere is the control of record.
 */
export function BehaviorComparison({ value, off, on }: BehaviorComparisonProps) {
  return (
    <div className={styles.root} role="group" aria-label="挙動の比較">
      <ComparisonColumn side={off} selected={!value} />
      <ComparisonColumn side={on} selected={value} />
    </div>
  );
}

function ComparisonColumn({
  side,
  selected,
}: {
  side: BehaviorPreviewSide;
  selected: boolean;
}) {
  return (
    <figure
      className={`${styles.column} ${selected ? styles.selected : ""}`}
      aria-label={side.ariaLabel}
      aria-current={selected ? "true" : undefined}
    >
      <div className={styles.stage}>
        <div className={styles.window}>
          <div className={styles.titlebar} aria-hidden="true">
            <span className={styles.traffic}>
              <span className={`${styles.dot} ${styles.close}`} />
              <span className={`${styles.dot} ${styles.minimize}`} />
              <span className={`${styles.dot} ${styles.zoom}`} />
            </span>
            <span className={styles.windowTitle}>Versio</span>
          </div>
          <div className={styles.media}>
            <ReplayablePreview
              src={side.src}
              poster={side.poster}
              cycleDurationMs={side.cycleDurationMs ?? 3500}
              still={side.still}
              embedded
            />
          </div>
        </div>
      </div>
    </figure>
  );
}
