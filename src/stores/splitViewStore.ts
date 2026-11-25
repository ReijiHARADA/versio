import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Split view (UI state only): a second paper shown on the left of the main card, beside the
 * routed page on the right. Opened by dragging a paper tab onto the card's left half.
 */
type SplitViewState = {
  /** Paper in the left pane, or null when the card is not split. */
  paperId: string | null;
  /** Left pane's share of the card width (0–1). */
  ratio: number;
  openSplit: (paperId: string) => void;
  closeSplit: () => void;
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
      ratio: 0.5,
      openSplit: (paperId) => set({ paperId }),
      closeSplit: () => set({ paperId: null }),
      setRatio: (ratio) => set({ ratio: clampSplitRatio(ratio) }),
    }),
    {
      name: "versio-split-view",
      version: 1,
      partialize: (state) => ({ paperId: state.paperId, ratio: state.ratio }),
    }
  )
);
