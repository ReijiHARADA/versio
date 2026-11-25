import { TAB_CORNER_R, TAB_CORNER_UNIT, TAB_FLARE_R, TAB_FLUSH_DROP, TAB_HEIGHT, TAB_K } from "./paperTabShape";

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

/** Mirrors an M/L path left-right within a `width`-wide box (for the right-hand caps). */
export function mirrorPath(d: string, width: number): string {
  return d.replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g, (_, cmd: string, x: string, y: string) => `${cmd}${f(width - Number(x))} ${y}`);
}

/** Right cap of the active tab `gap` px left of the card's right edge: morphLeftCap mirrored. */
export function morphRightCap(gap: number): MorphCap {
  const cap = morphLeftCap(gap);
  return { ...cap, fill: mirrorPath(cap.fill, cap.width), stroke: mirrorPath(cap.stroke, cap.width) };
}
