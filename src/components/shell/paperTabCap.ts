import {
  TAB_CAP_LEFT_FILL,
  TAB_CAP_LEFT_STROKE,
  TAB_CAP_RIGHT_FILL,
  TAB_CAP_RIGHT_STROKE,
  TAB_CAP_WIDTH,
  TAB_CORNER_R,
  TAB_CORNER_UNIT,
  TAB_FLARE,
  TAB_FLARE_R,
  TAB_FLUSH_CAP_WIDTH,
  TAB_FLUSH_DROP,
  TAB_FLUSH_LEFT_FILL,
  TAB_FLUSH_LEFT_STROKE,
  TAB_HEIGHT,
  TAB_K,
} from "./paperTabShape";

/** Gap (px) between the card's left edge and the active tab at which the card corner and the
 *  tab's flare have both grown to full size and just meet. */
export const TAB_MORPH_GAP = TAB_K * (TAB_CORNER_R + TAB_FLARE_R);

export type MorphCap = {
  /** Cap width; the cap's left edge sits on the card's left edge, `gap` px left of the tab. */
  width: number;
  height: number;
  fill: string;
  /** Open outline; drawn 2px wide and clipped to the fill, so 1px shows inside. */
  stroke: string;
};

const UNIT: ReadonlyArray<readonly [number, number]> = [[-1, 0], ...TAB_CORNER_UNIT, [0, 1]];
const f = (v: number) => +v.toFixed(2);
const path = (pts: Array<[number, number]>) => pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("");

/**
 * Left cap of the active tab while it sits `gap` px right of the card's left edge (0 < gap <
 * TAB_MORPH_GAP): the card's top-left corner and the concave flare into the tab both grow with
 * the gap, so pulling the first tab away from the edge rounds the corner continuously instead
 * of switching between the flush and the flared cap. The cap also drops below the tab to cover
 * the card's own (full-radius) corner.
 */
export function morphLeftCap(gap: number): MorphCap {
  const t = Math.min(1, Math.max(0, gap / TAB_MORPH_GAP));
  const ec = TAB_K * TAB_CORNER_R * t; // card corner extent
  const ef = TAB_K * TAB_FLARE_R * t; // flare extent
  const e = TAB_K * TAB_CORNER_R; // tab's own top corner
  const H = TAB_HEIGHT;
  const height = H + TAB_FLUSH_DROP;
  const width = Math.ceil(gap + e);
  const outline: Array<[number, number]> = [
    [0, height],
    // Card's top-left corner at (0, H).
    ...UNIT.map(([ux, uy]): [number, number] => [uy * ec, H - ux * ec]),
    // Flare: concave joint at (gap, H).
    ...UNIT.map(([ux, uy]): [number, number] => [gap + ux * ef, H - uy * ef]),
    // Tab's top-left corner at (gap, 0).
    ...UNIT.map(([ux, uy]): [number, number] => [gap + uy * e, -ux * e]),
    [width, 0],
  ];
  return { width, height, fill: `${path(outline)}L${width} ${height}Z`, stroke: path(outline) };
}

/** Rounds the measured gap so sub-pixel jitter does not re-render the cap. A tab hanging past
 *  the card's edge (dragged toward the other split card) is off the card: plain flared cap, no
 *  drop into a card that is not there. */
export const snapGap = (gap: number) => (gap < -1.5 ? Infinity : gap < 0.5 ? 0 : gap >= TAB_MORPH_GAP - 0.5 ? Infinity : Math.round(gap * 4) / 4);

/** Mirrors an absolute M/L path left-right within `width` (a left cap into a right cap). */
export const mirrorPath = (d: string, width: number) =>
  d.replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g, (_, cmd: string, x: string, y: string) => `${cmd}${+(width - Number(x)).toFixed(2)} ${y}`);
export type Cap = { fill: string; stroke: string; width: number; height: number; offset: number; mode: "flush" | "flared" | "morph" };
/** The active tab's cap for its gap from the card's edge (see morphLeftCap); `right` mirrors it. */
export function tabCap(gap: number, right: boolean): Cap {
  if (gap === Infinity) {
    return right
      ? { fill: TAB_CAP_RIGHT_FILL, stroke: TAB_CAP_RIGHT_STROKE, width: TAB_CAP_WIDTH, height: TAB_HEIGHT, offset: TAB_FLARE, mode: "flared" }
      : { fill: TAB_CAP_LEFT_FILL, stroke: TAB_CAP_LEFT_STROKE, width: TAB_CAP_WIDTH, height: TAB_HEIGHT, offset: TAB_FLARE, mode: "flared" };
  }
  const base: Cap =
    gap === 0
      ? { fill: TAB_FLUSH_LEFT_FILL, stroke: TAB_FLUSH_LEFT_STROKE, width: TAB_FLUSH_CAP_WIDTH, height: TAB_HEIGHT + TAB_FLUSH_DROP, offset: 0, mode: "flush" }
      : { ...morphLeftCap(gap), offset: gap, mode: "morph" };
  return right ? { ...base, fill: mirrorPath(base.fill, base.width), stroke: mirrorPath(base.stroke, base.width) } : base;
}
