import { getStorage } from "../data/runtime";
import { listTagColors, setTagColor } from "../data/repositories/tagColorRepository";
import type { LabelColor } from "../domain/labelColors";
import { useTagColors } from "../stores/tagColors";

export async function loadTagColors(): Promise<void> {
  const { db } = await getStorage();
  useTagColors.getState().setColors(listTagColors(db));
}

export async function applyTagColor(tag: string, color: LabelColor | null): Promise<void> {
  const { db } = await getStorage();
  setTagColor(db, tag, color);
  useTagColors.getState().setColor(tag, color);
}
