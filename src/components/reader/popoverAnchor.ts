import { rectToAnchor, type AnchorBox } from "./memo/popoverPosition";

export function anchorFromEventTarget(target: EventTarget | null): AnchorBox {
  if (target instanceof HTMLElement) {
    return rectToAnchor(target.getBoundingClientRect());
  }
  return { top: 120, left: 120, width: 40, height: 20 };
}
