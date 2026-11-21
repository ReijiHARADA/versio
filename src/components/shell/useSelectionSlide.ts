import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Slides the sidebar's selection pill from the previously active item to the new one.
 * A ghost pill (same classes as an active item) animates between the two boxes, under the
 * item labels, while the arriving item hides its own fill. Plain FLIP instead of View
 * Transitions: WKWebView snapshots the squircle-masked items wrongly and the pill only fades.
 */
export function useSelectionSlide(
  containerRef: RefObject<HTMLElement | null>,
  classes: { item: string; active: string; ghost: string; arriving: string }
) {
  const last = useRef<{ el: Element; rect: DOMRect } | null>(null);

  // No deps: the active item can change from the route or from props (activeNodeId).
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // CSS-module names with `composes` hold several classes; select by the first.
    const sel = (name: string) => `.${name.split(" ")[0]}`;
    const el = container.querySelector(`${sel(classes.item)}${sel(classes.active)}:not(${sel(classes.ghost)})`);
    const prev = last.current;
    last.current = el ? { el, rect: el.getBoundingClientRect() } : null;
    if (!el || !prev || prev.el === el || !prev.el.isConnected) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const to = last.current!.rect;
    const from = prev.el.getBoundingClientRect(); // fresh: the list may have scrolled since
    if (!to.width || !from.width) return;
    const base = container.getBoundingClientRect();
    const box = (r: DOMRect) => ({
      left: `${r.left - base.left}px`,
      top: `${r.top - base.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });

    const ghost = document.createElement("div");
    ghost.className = `${classes.item} ${classes.active} ${classes.ghost}`;
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, box(to));
    container.prepend(ghost); // first child: paints under the item labels
    el.classList.add(classes.arriving);
    // The old item would also fade its own fill out; the ghost already carries it away.
    const left = prev.el as HTMLElement;
    left.style.transition = "none";
    const animation = ghost.animate([box(from), box(to)], {
      duration: 280,
      easing: "cubic-bezier(0.32, 0.72, 0, 1)",
    });
    const done = () => {
      ghost.remove();
      el.classList.remove(classes.arriving);
      left.style.transition = "";
    };
    animation.onfinish = done;
    animation.oncancel = done;
    return () => animation.cancel(); // a newer selection takes over mid-slide
  });
}
