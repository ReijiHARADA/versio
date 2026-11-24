import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Open paper tabs above the main card (UI state only, like a browser's tab strip).
 * The route stays the authority for which paper is shown: `/reader/:paperId` is the
 * active tab; any other route shows the strip with no tab selected.
 */
type PaperTabsState = {
  tabs: string[];
  /** Adds `paperId` right after `afterId` (or at the end). No-op when already open. */
  openTab: (paperId: string, afterId?: string | null) => void;
  /** Removes the tab and returns the tab to show instead (right neighbour, else left), or null. */
  closeTab: (paperId: string) => string | null;
  moveTab: (paperId: string, toIndex: number) => void;
  /** Keeps only tabs whose paper still exists. */
  retainTabs: (keep: (paperId: string) => boolean) => void;
};

export const usePaperTabs = create<PaperTabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      openTab: (paperId, afterId) =>
        set((state) => {
          if (state.tabs.includes(paperId)) return state;
          const at = afterId ? state.tabs.indexOf(afterId) : -1;
          const tabs = [...state.tabs];
          tabs.splice(at < 0 ? tabs.length : at + 1, 0, paperId);
          return { tabs };
        }),
      closeTab: (paperId) => {
        const { tabs } = get();
        const index = tabs.indexOf(paperId);
        if (index < 0) return null;
        const next = tabs.filter((id) => id !== paperId);
        set({ tabs: next });
        return next[index] ?? next[index - 1] ?? null;
      },
      moveTab: (paperId, toIndex) =>
        set((state) => {
          const from = state.tabs.indexOf(paperId);
          if (from < 0) return state;
          const tabs = state.tabs.filter((id) => id !== paperId);
          tabs.splice(Math.max(0, Math.min(toIndex, tabs.length)), 0, paperId);
          return { tabs };
        }),
      retainTabs: (keep) =>
        set((state) => {
          const tabs = state.tabs.filter(keep);
          return tabs.length === state.tabs.length ? state : { tabs };
        }),
    }),
    { name: "versio-paper-tabs", version: 1, partialize: (state) => ({ tabs: state.tabs }) }
  )
);

/** Paper id of a `/reader/:paperId` pathname, else null. */
export function readerPaperId(pathname: string): string | null {
  const match = /^\/reader\/([^/?#]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}
