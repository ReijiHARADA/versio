import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TabKey } from "./paperTabsStore";

/**
 * Split view (UI state only): a second paper, folder or pinned page shown on the left of the main card, beside the
 * routed page on the right. Opened by dragging a paper tab onto either half of the card (the right half moves the routed paper to the left).
 */
/** A pinned page (すべての論文 / インボックス) shown in the left pane. It is not a strip tab. */
export type PageTab = "page:/" | "page:/inbox";
export type SplitTab = TabKey | PageTab;
export const PAGE_PATHS = ["/", "/inbox"] as const;
export const pageTabForPath = (pathname: string): PageTab | null =>
  (PAGE_PATHS as readonly string[]).includes(pathname) ? (`page:${pathname}` as PageTab) : null;
export const isPageTab = (tab: SplitTab | null): tab is PageTab => tab != null && tab.startsWith("page:");
export const pagePath = (tab: PageTab) => tab.slice("page:".length);

type SplitViewState = {
  /** Shown in the left pane (a paper, a folder or a pinned page), or null when the card is not split. */
  tab: SplitTab | null;
  /** Tabs over the left card (they open in the left pane); includes `tab`. */
  leftTabs: TabKey[];
  /** Left pane's share of the card width (0–1). */
  ratio: number;
  /** Shows `tab` in the left pane and adds it to the left group (starting one if closed). */
  openSplit: (tab: TabKey) => void;
  closeSplit: () => void;
  /** Shows a pinned page in the left pane (starting a split if closed); the left tabs stay. */
  showPage: (page: PageTab) => void;
  /** Moves a tab to the left group without showing it. */
  addLeftTab: (tab: TabKey) => void;
  /** Takes a tab out of the left group. If it was on screen there, the left pane shows another
   *  left tab, or the split closes when none is left. */
  removeLeftTab: (tab: SplitTab) => void;
  setRatio: (ratio: number) => void;
};

export const SPLIT_MIN_RATIO = 0.25;
export const SPLIT_MAX_RATIO = 0.75;

export const clampSplitRatio = (ratio: number) =>
  Math.min(SPLIT_MAX_RATIO, Math.max(SPLIT_MIN_RATIO, Number.isFinite(ratio) ? ratio : 0.5));

export const useSplitView = create<SplitViewState>()(
  persist(
    (set) => ({
      tab: null,
      leftTabs: [],
      ratio: 0.5,
      openSplit: (tab) =>
        set((state) => {
          const base = state.tab ? state.leftTabs : [];
          return { tab, leftTabs: base.includes(tab) ? base : [...base, tab] };
        }),
      closeSplit: () => set({ tab: null, leftTabs: [] }),
      showPage: (page) => set((state) => ({ tab: page, leftTabs: state.tab ? state.leftTabs : [] })),
      addLeftTab: (tab) =>
        set((state) => (!state.tab || state.leftTabs.includes(tab) ? state : { leftTabs: [...state.leftTabs, tab] })),
      removeLeftTab: (tab) =>
        set((state) => {
          if (isPageTab(tab)) {
            if (state.tab !== tab) return state;
            const next = state.leftTabs[state.leftTabs.length - 1] ?? null;
            return next ? { tab: next } : { tab: null, leftTabs: [] };
          }
          if (!state.leftTabs.includes(tab) && state.tab !== tab) return state;
          const index = state.leftTabs.indexOf(tab);
          const leftTabs = state.leftTabs.filter((key) => key !== tab);
          if (state.tab !== tab) return { leftTabs };
          const next = leftTabs[index] ?? leftTabs[index - 1] ?? null;
          return next ? { tab: next, leftTabs } : { tab: null, leftTabs: [] };
        }),
      setRatio: (ratio) => set({ ratio: clampSplitRatio(ratio) }),
    }),
    {
      name: "versio-split-view",
      version: 3,
      partialize: (state) => ({ tab: state.tab, leftTabs: state.leftTabs, ratio: state.ratio }),
      // v1 had one left paper and no group; v2 kept paper ids. v3 keeps tab keys (papers or folders).
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as { paperId?: string | null; tab?: TabKey | null; ratio?: number; leftTabs?: string[] };
        if (version >= 3) return old as SplitViewState;
        const tab = old.paperId ? (`paper:${old.paperId}` as TabKey) : null;
        const leftTabs = version < 2 ? (tab ? [tab] : []) : (old.leftTabs ?? []).map((id) => `paper:${id}` as TabKey);
        return { ratio: old.ratio, tab, leftTabs } as SplitViewState;
      },
    }
  )
);
