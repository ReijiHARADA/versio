import type { TabKey } from "../../stores/paperTabsStore";

/** How long a released tab glides into its slot. */
export const SETTLE_MS = 180;

/** x ranges of the split drop targets, from the layout frozen when the tab is pulled down. */
export type SplitZones = { top: number; height: number; left: [number, number] | null; right: [number, number] | null };

export type TabDrag = {
  id: TabKey;
  startX: number;
  startY: number;
  moved: boolean;
  /** Tab order and slot rects frozen at drag start; neighbours are shifted by transforms only. */
  keys: TabKey[];
  slots: { left: number; width: number }[];
  from: number;
  to: number;
  dx: number;
  shift: number;
  mode: "reorder" | "split";
  /** Half of the card the pulled tab will open in, or null when it is not over one. */
  overSplit: SplitSide | null;
  /** Split view: the other group whose tab strip the tab is dragged over (it moves there on drop). */
  moveSide: SplitSide | null;
  /** Crossing to the other group: the tab there it would land before (null: after the last). */
  insertBefore?: TabKey | null;
  /** Pointer x at the last move; on release in split view it picks the tab's side. */
  lastX: number;
  /** Pointer y at the last move. */
  lastY: number;
  /** Pointer offset inside the tab when grabbed; the pulled tab keeps it under the pointer. */
  grabX: number;
  grabY: number;
  /** Whether the right half accepts the tab (the paper that is there now can move left). */
  canRight: boolean;
  canLeft?: boolean;
  /** Side whose slot is open beside the shrunken card. */
  peekSide?: SplitSide | null;
  /** Drop targets: the slots beside the shrunken card (re-measured while they open). */
  zones?: SplitZones | null;
  /** Lifts the drag-time text-selection lock (set once the drag passes its threshold). */
  releaseSelection?: () => void;
};
export type SplitSide = "left" | "right";
export type DragView = Pick<TabDrag, "id" | "startX" | "startY" | "from" | "to" | "dx" | "shift" | "keys" | "mode" | "overSplit" | "canRight" | "moveSide" | "insertBefore" | "zones"> & { x: number; y: number };

type Slot = { left: number; width: number };

/** Horizontal drag offset, kept within the strip (the first slot's left to the last slot's right). */
export function clampDx(slots: Slot[], from: number, dx: number): number {
  const own = slots[from];
  const first = slots[0];
  const last = slots[slots.length - 1];
  return Math.min(last.left + last.width - (own.left + own.width), Math.max(first.left - own.left, dx));
}

/** Slot the dragged tab moves to: it passes a neighbour once its leading edge crosses that
 *  neighbour's middle. (Its centre cannot: the drag stops at the strip's ends, where an
 *  equal-width tab's centre only reaches the end tab's centre, so the end slots were unreachable.)
 *  It never passes a slot outside `inGroup` (split view: the other card's group). */
export function reorderTarget(slots: Slot[], from: number, dx: number, inGroup: (index: number) => boolean): number {
  const leftEdge = slots[from].left + dx;
  const rightEdge = leftEdge + slots[from].width;
  let to = from;
  for (let i = from + 1; i < slots.length && inGroup(i); i++) if (rightEdge > slots[i].left + slots[i].width / 2) to = i;
  for (let i = from - 1; i >= 0 && inGroup(i); i--) if (leftEdge < slots[i].left + slots[i].width / 2) to = i;
  return to;
}

/** Crossing into the other group (`inTarget`): the tab there whose middle is right of the pointer,
 *  which the dragged tab would land before; null lands after the group's last tab. */
export function crossInsertBefore(keys: TabKey[], slots: Slot[], id: TabKey, x: number, inTarget: (key: TabKey) => boolean): TabKey | null {
  const at = keys.findIndex((key, i) => key !== id && inTarget(key) && x < slots[i].left + slots[i].width / 2);
  return at >= 0 ? keys[at] : null;
}

/** Index in the tab list without `id` where a tab dropped across lands: before `insertBefore`, or
 *  after the target group's last tab; -1 keeps the order (the group is empty). */
export function crossDropIndex(list: TabKey[], id: TabKey, insertBefore: TabKey | null, inTarget: (key: TabKey) => boolean): number {
  const without = list.filter((item) => item !== id);
  if (insertBefore) return without.indexOf(insertBefore);
  const last = without.findLastIndex(inTarget);
  return last >= 0 ? last + 1 : -1;
}
