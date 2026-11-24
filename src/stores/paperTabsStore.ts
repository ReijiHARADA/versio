import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useSplitView } from "./splitViewStore";

/**
 * Open tabs above the main card (UI state only, like a browser's tab strip).
 * A tab is a paper (`paper:<id>`, route `/reader/:paperId`) or a workspace folder
 * (`folder:<id>`, route `/project/:projectId`). The route stays the authority for which
 * tab is active; any other route shows the strip with no tab selected.
 */
export type TabKey = `paper:${string}` | `folder:${string}`;

type PaperTabsState = {
  tabs: TabKey[];
  /** Adds `key` right after `afterKey` (or at the end). No-op when already open. */
  openTab: (key: TabKey, afterKey?: TabKey | null) => void;
  /** Removes the tab and returns the tab to show instead (right neighbour, else left), or null. */
  closeTab: (key: TabKey) => TabKey | null;
  moveTab: (key: TabKey, toIndex: number) => void;
  /** Keeps only tabs whose paper / folder still exists. */
  retainTabs: (keep: (key: TabKey) => boolean) => void;
};

export const usePaperTabs = create<PaperTabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      openTab: (key, afterKey) =>
        set((state) => {
          if (state.tabs.includes(key)) return state;
          const at = afterKey ? state.tabs.indexOf(afterKey) : -1;
          const tabs = [...state.tabs];
          tabs.splice(at < 0 ? tabs.length : at + 1, 0, key);
          return { tabs };
        }),
      closeTab: (key) => {
        const { tabs } = get();
        const index = tabs.indexOf(key);
        if (index < 0) return null;
        const next = tabs.filter((id) => id !== key);
        set({ tabs: next });
        return next[index] ?? next[index - 1] ?? null;
      },
      moveTab: (key, toIndex) =>
        set((state) => {
          const from = state.tabs.indexOf(key);
          if (from < 0) return state;
          const tabs = state.tabs.filter((id) => id !== key);
          tabs.splice(Math.max(0, Math.min(toIndex, tabs.length)), 0, key);
          return tabs.every((id, i) => id === state.tabs[i]) ? state : { tabs };
        }),
      retainTabs: (keep) =>
        set((state) => {
          const tabs = state.tabs.filter(keep);
          return tabs.length === state.tabs.length ? state : { tabs };
        }),
    }),
    {
      name: "versio-paper-tabs",
      version: 2,
      partialize: (state) => ({ tabs: state.tabs }),
      migrate: migratePaperTabs,
    }
  )
);

/** v1 stored bare paper ids. */
export function migratePaperTabs(persisted: unknown, version: number): { tabs: TabKey[] } {
  const tabs = (persisted as { tabs?: unknown } | null)?.tabs;
  const list = Array.isArray(tabs) ? tabs.filter((id): id is string => typeof id === "string") : [];
  return { tabs: version < 2 ? list.map((id) => paperTab(id)) : (list as TabKey[]) };
}

export const paperTab = (paperId: string): TabKey => `paper:${paperId}`;
export const folderTab = (nodeId: string): TabKey => `folder:${nodeId}`;

export function parseTab(key: TabKey): { kind: "paper" | "folder"; id: string } {
  const at = key.indexOf(":");
  return { kind: key.slice(0, at) as "paper" | "folder", id: key.slice(at + 1) };
}

/** Route of a tab. */
export function tabPath(key: TabKey): string {
  const { kind, id } = parseTab(key);
  return `${kind === "paper" ? "/reader" : "/project"}/${encodeURIComponent(id)}`;
}

/** Tab of a `/reader/:paperId` or `/project/:projectId` pathname, else null. */
export function tabForPath(pathname: string): TabKey | null {
  const match = /^\/(reader|project)\/([^/?#]+)/.exec(pathname);
  if (!match) return null;
  const id = decodeURIComponent(match[2]);
  return match[1] === "reader" ? paperTab(id) : folderTab(id);
}

/** Paper id of a `/reader/:paperId` pathname, else null. */
export function readerPaperId(pathname: string): string | null {
  const match = /^\/reader\/([^/?#]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

/** True while the paper has an open tab or sits in the split pane (its body stays in memory for instant switching). */
export function isPaperTabOpen(paperId: string): boolean {
  return usePaperTabs.getState().tabs.includes(paperTab(paperId)) || useSplitView.getState().paperId === paperId;
}
