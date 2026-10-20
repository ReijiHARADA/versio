import { create } from "zustand";

export type EpubSyncEntry = {
  syncedAt: string;
  fileName: string;
  folderPath: string;
};

type EpubSyncState = {
  /** paperId → last successful sync into the configured folder */
  byPaperId: Record<string, EpubSyncEntry>;
  hydrated: boolean;
  setHydrated: (byPaperId: Record<string, EpubSyncEntry>) => void;
  markSynced: (paperId: string, entry: EpubSyncEntry) => void;
  clearForFolder: (folderPath: string | null) => void;
};

export const useEpubSyncStore = create<EpubSyncState>((set) => ({
  byPaperId: {},
  hydrated: false,
  setHydrated: (byPaperId) => set({ byPaperId, hydrated: true }),
  markSynced: (paperId, entry) =>
    set((state) => ({
      byPaperId: { ...state.byPaperId, [paperId]: entry },
      hydrated: true,
    })),
  clearForFolder: (folderPath) =>
    set((state) => {
      if (!folderPath) return { byPaperId: {}, hydrated: true };
      const next: Record<string, EpubSyncEntry> = {};
      for (const [id, entry] of Object.entries(state.byPaperId)) {
        if (entry.folderPath === folderPath) next[id] = entry;
      }
      return { byPaperId: next, hydrated: true };
    }),
}));
