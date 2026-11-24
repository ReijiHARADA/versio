import { create } from "zustand";
import type { LabelColor } from "../domain/labelColors";

/** In-memory copy of SQLite `tag_colors`; keys are lowercased tag names. */
type TagColorState = {
  colors: Record<string, LabelColor>;
  setColors: (colors: Record<string, LabelColor>) => void;
  setColor: (tag: string, color: LabelColor | null) => void;
};

export const useTagColors = create<TagColorState>()((set) => ({
  colors: {},
  setColors: (colors) => set({ colors }),
  setColor: (tag, color) =>
    set((state) => {
      const colors = { ...state.colors };
      if (color) colors[tag.toLocaleLowerCase()] = color;
      else delete colors[tag.toLocaleLowerCase()];
      return { colors };
    }),
}));

export const useTagColor = (tag: string): LabelColor | undefined =>
  useTagColors((state) => state.colors[tag.toLocaleLowerCase()]);
