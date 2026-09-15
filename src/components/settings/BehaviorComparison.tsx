import { ReplayablePreview } from "./ReplayablePreview";
import styles from "./BehaviorComparison.module.css";

export type BehaviorPreviewSide = {
  /** Looping GIF (or still) of production behavior. */
  src: string;
  /** Still frame for prefers-reduced-motion / paused state. */
  poster: string;
  label: string;
  caption: string;
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
 * Side-by-side OFF / ON behavior previews for boolean settings.
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
      aria-current={selected ? "true" : undefined}
    >
      <figcaption className={styles.heading}>
        <span className={styles.label}>{side.label}</span>
        {selected ? (
          <span className={styles.check} aria-hidden="true">
            ✓
          </span>
        ) : null}
      </figcaption>
      <div className={styles.media}>
        <ReplayablePreview
          src={side.src}
          poster={side.poster}
          cycleDurationMs={side.cycleDurationMs ?? 3500}
          still={side.still}
        />
      </div>
      <p className={styles.caption}>{side.caption}</p>
    </figure>
  );
}
