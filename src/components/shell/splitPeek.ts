import { INSPECTOR_SLOT_ID } from "./inspectorSlot";
import type { SplitZones } from "./tabDrag";

export const rectOf = (selector: string) => {
  const rect = document.querySelector(selector)?.getBoundingClientRect();
  return rect && rect.width > 0 ? rect : null;
};
/** Targets never overlap the main card: the card shrinks to open an empty slot on the side being
 *  aimed at. Left target: the left slot only (not the sidebar). Right target: the slot between the
 *  card and its inspector, or, for another paper, the slot past the inspector (`outer`), so the
 *  inspector stays beside the paper it belongs to. */
export function measureSplitZones(canLeft: boolean, canRight: boolean, outer = false): SplitZones | null {
  const card = rectOf("[data-main-card]");
  if (!card) return null;
  const leftSlot = document.querySelector("[data-split-peek-left]")?.getBoundingClientRect();
  const rightSlot = document.querySelector("[data-split-peek]")?.getBoundingClientRect();
  const inspector = rectOf(`#${INSPECTOR_SLOT_ID}`);
  const outerSlot = document.querySelector("[data-split-peek-outer]")?.getBoundingClientRect();
  const right: [number, number] | null = !canRight
    ? null
    : outer && inspector && outerSlot
      ? [inspector.right, outerSlot.right]
      : rightSlot
        ? [card.right, Math.max(rightSlot.right, card.right)]
        : null;
  return { top: card.top, height: card.height, left: canLeft && leftSlot ? [leftSlot.left, card.left] : null, right };
}
/** Opens (or closes) the empty slots beside the main card where a pulled tab can open. */
export const setSplitPeek = (left: boolean, right = left, outer = false) => {
  document.querySelector<HTMLElement>("[data-split-peek-left]")?.toggleAttribute("data-open", left);
  document.querySelector<HTMLElement>("[data-split-peek]")?.toggleAttribute("data-open", right && !outer);
  document.querySelector<HTMLElement>("[data-split-peek-outer]")?.toggleAttribute("data-open", right && outer);
};
/** How long the slots take to open (AppShell.module.css .splitPeek). */
export const PEEK_MS = 240;
