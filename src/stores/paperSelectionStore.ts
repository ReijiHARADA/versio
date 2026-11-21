import { create } from "zustand";

/** Finder-style selection of paper tiles in the grid ("アイテム") view. UI only. */
type PaperSelectionState = {
  ids: ReadonlySet<string>;
  select: (ids: Iterable<string>) => void;
  toggle: (id: string) => void;
  clear: () => void;
};

export const usePaperSelectionStore = create<PaperSelectionState>((set) => ({
  ids: new Set(),
  select: (ids) => set({ ids: new Set(ids) }),
  toggle: (id) =>
    set((state) => {
      const next = new Set(state.ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ids: next };
    }),
  clear: () => set((state) => (state.ids.size ? { ids: new Set() } : state)),
}));

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
