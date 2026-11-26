import { TAB_CORNER_UNIT, TAB_K } from "./paperTabShape";
import type { DragView, SplitSide } from "./tabDrag";
import styles from "./PaperTabBar.module.css";

/** Side margin of a split target's outline inside its drop range (the range itself stays full width). */
const ZONE_MARGIN_X = 12;

/** Card-radius clothoid rectangle (corner extent = 10 × K, as --sq-radius-card), inset by half the
 *  stroke and by ZONE_MARGIN_X on the left and right. */
function zoneOutlinePath(width: number, height: number, inset = 0.75): string {
  const x0 = inset + ZONE_MARGIN_X;
  const y0 = inset;
  const x1 = width - inset - ZONE_MARGIN_X;
  const y1 = height - inset;
  const s = Math.max(0, Math.min(10 * TAB_K - inset, (x1 - x0) / 2, (y1 - y0) / 2));
  const pts: string[] = [];
  const add = (x: number, y: number) => pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  add(x1 - s, y0);
  for (const [u, v] of TAB_CORNER_UNIT) add(x1 + u * s, y0 + v * s);
  add(x1, y1 - s);
  for (const [u, v] of TAB_CORNER_UNIT) add(x1 - v * s, y1 + u * s);
  add(x0 + s, y1);
  for (const [u, v] of TAB_CORNER_UNIT) add(x0 - u * s, y1 - v * s);
  add(x0, y0 + s);
  for (const [u, v] of TAB_CORNER_UNIT) add(x0 + v * s, y0 - u * s);
  return `M${pts.join("L")}Z`;
}

function ZoneOutline({ width, height }: { width: number; height: number }) {
  return (
    <svg className={styles.splitZoneOutline} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={zoneOutlinePath(width, height)} />
    </svg>
  );
}

/** While a paper tab is pulled onto the card (the tab itself follows the pointer): over the
 *  card's left or right half, the half it will open in. */
export function SplitDropPreview({ drag }: { drag: DragView }) {
  // Each target is drawn exactly where it accepts the drop; over one, it lights up.
  const zone = (side: SplitSide) => {
    const range = drag.zones?.[side];
    const zones = drag.zones;
    return (
      range &&
      zones && (
        <div
          className={`${styles.splitZone} ${drag.overSplit === side ? styles.splitZoneActive : ""}`}
          style={{ left: range[0], top: zones.top, width: range[1] - range[0], height: zones.height }}
          aria-hidden
        >
          <ZoneOutline width={range[1] - range[0]} height={zones.height} />
          <span className={styles.splitZoneLabel}>{side === "left" ? "左に並べて開く" : "右に並べて開く"}</span>
        </div>
      )
    );
  };
  // Already split, the zones are null: the cards are no drop targets (tabs cross over the strip).
  return (
    <>
      {zone("left")}
      {zone("right")}
    </>
  );
}
