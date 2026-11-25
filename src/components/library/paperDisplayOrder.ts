/**
 * Display order of the paper cards the current library list shows. A
 * virtualized list keeps only the visible cards in the DOM, so Shift-click
 * range selection reads the order from here instead of `querySelectorAll`.
 */
let current: string[] | null = null;

export function setPaperDisplayOrder(order: string[] | null): void {
  current = order;
}

/** The registered order, else the cards in the DOM (screens that are not virtualized). */
export function paperDisplayOrder(): string[] {
  if (current) return current;
  return [...document.querySelectorAll<HTMLElement>("article[data-paper-id][data-layout]")].map(
    (el) => el.dataset.paperId!
  );
}
