import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Split view (UI state only): a second paper shown on the left of the main card, beside the
 * routed page on the right. Opened by dragging a paper tab onto either half of the card (the right half moves the routed paper to the left).
 */
type SplitViewState = {
  /** Paper in the left pane, or null when the card is not split. */
  paperId: string | null;
  /** Papers whose tabs sit over the left card (they open in the left pane); includes `paperId`. */
  leftTabs: string[];
  /** Left pane's share of the card width (0–1). */
  ratio: number;
  /** Shows `paperId` in the left pane and adds its tab to the left group (starting one if closed). */
  openSplit: (paperId: string) => void;
  closeSplit: () => void;
  /** Moves a paper's tab to the left group without showing it. */
  addLeftTab: (paperId: string) => void;
  /** Takes a paper's tab out of the left group. If it was on screen there, the left pane shows
   *  another left tab, or the split closes when none is left. */
  removeLeftTab: (paperId: string) => void;
  setRatio: (ratio: number) => void;
};

export const SPLIT_MIN_RATIO = 0.25;
export const SPLIT_MAX_RATIO = 0.75;

export const clampSplitRatio = (ratio: number) =>
  Math.min(SPLIT_MAX_RATIO, Math.max(SPLIT_MIN_RATIO, Number.isFinite(ratio) ? ratio : 0.5));

export const useSplitView = create<SplitViewState>()(
  persist(
    (set) => ({
      paperId: null,
      leftTabs: [],
      ratio: 0.5,
      openSplit: (paperId) =>
        set((state) => {
          const base = state.paperId ? state.leftTabs : [];
          return { paperId, leftTabs: base.includes(paperId) ? base : [...base, paperId] };
        }),
      closeSplit: () => set({ paperId: null, leftTabs: [] }),
      addLeftTab: (paperId) =>
        set((state) => (!state.paperId || state.leftTabs.includes(paperId) ? state : { leftTabs: [...state.leftTabs, paperId] })),
      removeLeftTab: (paperId) =>
        set((state) => {
          if (!state.leftTabs.includes(paperId) && state.paperId !== paperId) return state;
          const index = state.leftTabs.indexOf(paperId);
          const leftTabs = state.leftTabs.filter((id) => id !== paperId);
          if (state.paperId !== paperId) return { leftTabs };
          const next = leftTabs[index] ?? leftTabs[index - 1] ?? null;
          return next ? { paperId: next, leftTabs } : { paperId: null, leftTabs: [] };
        }),
      setRatio: (ratio) => set({ ratio: clampSplitRatio(ratio) }),
    }),
    {
      name: "versio-split-view",
      version: 2,
      partialize: (state) => ({ paperId: state.paperId, leftTabs: state.leftTabs, ratio: state.ratio }),
      // v1 had no left group: the paper on screen is its only tab.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as { paperId?: string | null; ratio?: number; leftTabs?: string[] };
        if (version < 2) return { ...state, leftTabs: state.paperId ? [state.paperId] : [] } as SplitViewState;
        return state as SplitViewState;
      },
    }
  )
);
