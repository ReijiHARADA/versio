import { ReplayablePreview } from "./ReplayablePreview";
import styles from "./BehaviorModePreview.module.css";
import type { SidebarMode } from "../../stores/appStore";

export type ModePreviewAsset = {
  src: string;
  poster: string;
  caption: string;
  /** One animation cycle length in ms (ignored when still). */
  cycleDurationMs?: number;
  /** Static frame — no GIF playback. */
  still?: boolean;
};

type BehaviorModePreviewProps = {
  mode: SidebarMode;
  assets: Record<SidebarMode, ModePreviewAsset>;
};

/** Single-slot behavior preview that follows the selected sidebarMode. */
export function BehaviorModePreview({ mode, assets }: BehaviorModePreviewProps) {
  const asset = assets[mode];

  return (
    <figure className={styles.root}>
      <div className={styles.media}>
        <ReplayablePreview
          src={asset.src}
          poster={asset.poster}
          cycleDurationMs={asset.cycleDurationMs ?? 3500}
          still={asset.still}
        />
      </div>
      <figcaption className={styles.caption}>{asset.caption}</figcaption>
    </figure>
  );
}
