import { create } from "zustand";

/** Finder-style selection of paper cards (grid tiles and list rows). UI only. */
type PaperSelectionState = {
  ids: ReadonlySet<string>;
  /** Last ⌘-clicked / dragged card: the fixed end of a ⇧-click range. */
  anchor: string | null;
  select: (ids: Iterable<string>, anchor?: string | null) => void;
  toggle: (id: string) => void;
  clear: () => void;
};

export const usePaperSelectionStore = create<PaperSelectionState>((set) => ({
  ids: new Set(),
  anchor: null,
  select: (ids, anchor) => set((state) => ({ ids: new Set(ids), anchor: anchor === undefined ? state.anchor : anchor })),
  toggle: (id) =>
    set((state) => {
      const next = new Set(state.ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ids: next, anchor: id };
    }),
  clear: () => set((state) => (state.ids.size || state.anchor ? { ids: new Set(), anchor: null } : state)),
}));

/** Ids from anchor to target inclusive, in display order; just the target when the anchor is gone. */
export function rangeBetween(order: string[], anchor: string | null, target: string): string[] {
  const from = anchor ? order.indexOf(anchor) : -1;
  const to = order.indexOf(target);
  if (from < 0 || to < 0) return [target];
  return order.slice(Math.min(from, to), Math.max(from, to) + 1);
}

export type Box = { left: number; top: number; right: number; bottom: number };

export function boxFromPoints(x1: number, y1: number, x2: number, y2: number): Box {
  return { left: Math.min(x1, x2), top: Math.min(y1, y2), right: Math.max(x1, x2), bottom: Math.max(y1, y2) };
}

/** Ids whose box overlaps the marquee (touching counts, like Finder). */
export function idsInBox(marquee: Box, items: { id: string; box: Box }[]): string[] {
  return items
    .filter(({ box }) => box.left <= marquee.right && box.right >= marquee.left && box.top <= marquee.bottom && box.bottom >= marquee.top)
    .map(({ id }) => id);
}
