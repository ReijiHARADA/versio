import { create } from "zustand";
import { persist } from "zustand/middleware";
import { migrateLegacyStorageKeys, STORE_KEY } from "../data/migration/renameStorageKeys";

migrateLegacyStorageKeys();

export type Theme = "light" | "dark" | "system";
export type OriginalDisplayMode = "on-demand" | "always" | "when-untranslated";
/** auto: hoverで開閉 / expanded: 常時展開 */
export type SidebarMode = "auto" | "expanded";
export type LibraryView = "list" | "grid";
export type LibrarySortKey = "added" | "opened" | "title" | "year";
export type LibrarySort = { key: LibrarySortKey; dir: "asc" | "desc" };

/** Default expanded sidebar width (px). Double-click the resize edge to restore. */
export const DEFAULT_FONT_SIZE = 16;
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 24;
export const DEFAULT_SIDEBAR_WIDTH = 220;
const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 420;

export function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
}

export type DisplaySettings = {
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  theme: Theme;
  originalDisplay: OriginalDisplayMode;
  sidebarMode: SidebarMode;
  /** Expanded sidebar width in px (collapsed rail stays fixed). */
  sidebarWidth: number;
  /** Paper / folder listing: compact rows or cover tiles. */
  libraryView: LibraryView;
  librarySort: LibrarySort;
};

/** Transient library filter (not persisted, so papers never stay hidden across launches). */
export type LibraryFilter = {
  status: import("../types/paper").PaperReadStatus | null;
  tag: string | null;
  /** Only papers sharing a DOI / title with another one. */
  duplicates: boolean;
};

type AppUiState = {
  currentPaperId: string | null;
  libraryFilter: LibraryFilter;
  setLibraryFilter: (filter: Partial<LibraryFilter>) => void;
  displaySettings: DisplaySettings;
  expandedOriginalBlocks: Set<string>;

  setCurrentPaper: (paperId: string | null) => void;
  setDisplaySettings: (settings: Partial<DisplaySettings>) => void;
  toggleOriginalExpanded: (blockId: string) => void;
  setOriginalExpanded: (blockId: string, expanded: boolean) => void;
  clearExpandedOriginals: () => void;
};

const defaultDisplaySettings: DisplaySettings = {
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: 1.8,
  contentWidth: 720,
  theme: "system",
  originalDisplay: "on-demand",
  sidebarMode: "expanded",
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  libraryView: "list",
  librarySort: { key: "added", dir: "desc" },
};

export const useAppStore = create<AppUiState>()(
  persist(
    (set) => ({
      currentPaperId: null,
      libraryFilter: { status: null, tag: null, duplicates: false },
      setLibraryFilter: (filter) =>
        set((state) => ({ libraryFilter: { ...state.libraryFilter, ...filter } })),
      displaySettings: defaultDisplaySettings,
      expandedOriginalBlocks: new Set<string>(),

      setCurrentPaper: (paperId) => set({ currentPaperId: paperId }),

      setDisplaySettings: (settings) =>
        set((state) => {
          const next = { ...state.displaySettings, ...settings };
          if (settings.sidebarWidth != null) {
            next.sidebarWidth = clampSidebarWidth(settings.sidebarWidth);
          }
          if (next.sidebarMode !== "auto" && next.sidebarMode !== "expanded") {
            next.sidebarMode = "auto";
          }
          return { displaySettings: next };
        }),

      toggleOriginalExpanded: (blockId) =>
        set((state) => {
          const next = new Set(state.expandedOriginalBlocks);
          if (next.has(blockId)) next.delete(blockId);
          else next.add(blockId);
          return { expandedOriginalBlocks: next };
        }),

      setOriginalExpanded: (blockId, expanded) =>
        set((state) => {
          const next = new Set(state.expandedOriginalBlocks);
          if (expanded) next.add(blockId);
          else next.delete(blockId);
          return { expandedOriginalBlocks: next };
        }),

      clearExpandedOriginals: () => set({ expandedOriginalBlocks: new Set<string>() }),
    }),
    {
      name: STORE_KEY,
      version: 8,
      migrate: (persisted, version) => {
        const value = persisted as {
          displaySettings?: Partial<DisplaySettings> & {
            sidebarMode?: string;
            sidebarCollapseRootsOnly?: unknown;
          };
        } | undefined;
        const legacy = value?.displaySettings ?? {};
        const rest = { ...legacy };
        delete rest.sidebarCollapseRootsOnly;
        const merged = { ...defaultDisplaySettings, ...rest };
        // v8: the sidebar is open by default and auto-collapses only in narrow windows.
        const sidebarMode: SidebarMode =
          version < 8 || merged.sidebarMode === "expanded" ? "expanded" : "auto";
        return {
          displaySettings: {
            ...merged,
            sidebarMode,
            sidebarWidth: clampSidebarWidth(merged.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH),
          },
        };
      },
      partialize: (state) => ({
        displaySettings: state.displaySettings,
      }),
    }
  )
);
