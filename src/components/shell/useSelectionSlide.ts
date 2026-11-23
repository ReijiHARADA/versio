import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Slides the sidebar's selection pill from the previously active item to the new one.
 * A ghost pill (same classes as an active item) animates between the two boxes, under the
 * item labels, while the arriving item hides its own fill. Plain FLIP instead of View
 * Transitions: WKWebView snapshots the squircle-masked items wrongly and the pill only fades.
 */
const DURATION = 280;
const EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

export function useSelectionSlide(
  containerRef: RefObject<HTMLElement | null>,
  classes: { item: string; active: string; ghost: string; arriving: string }
) {
  const last = useRef<{ el: Element; rect: DOMRect; bg: string } | null>(null);
  const running = useRef<Animation | null>(null);
  useEffect(() => () => running.current?.cancel(), []);

  // No deps: the active item can change from the route or from props (activeNodeId).
  // Only a querySelector runs per render; layout is read just when the selection changes.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // CSS-module names with `composes` hold several classes; select by the first.
    const sel = (name: string) => `.${name.split(" ")[0]}`;
    const el = container.querySelector(`${sel(classes.item)}${sel(classes.active)}:not(${sel(classes.ghost)})`);
    const prev = last.current;
    if (el === prev?.el) return;
    if (!el) {
      last.current = null;
      return;
    }
    const to = el.getBoundingClientRect();
    // Tone (favorites / trash) changes the fill: remember it so the ghost can blend colors.
    // Read the target, not the start of the item's own --sq-bg transition.
    const bg = readFinalBg(el);
    last.current = { el, rect: to, bg };
    if (!prev || !to.width || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Clicking a parent folder collapses it and unmounts the old child row: fall back to
    // where that row was when it was selected.
    const from = prev.el.isConnected ? prev.el.getBoundingClientRect() : prev.rect;
    if (!from.width) return;
    const base = container.getBoundingClientRect();

    running.current?.cancel(); // a newer selection takes over mid-slide
    const ghost = document.createElement("div");
    ghost.className = `${classes.item} ${classes.active} ${classes.ghost}`;
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, {
      left: `${to.left - base.left}px`,
      top: `${to.top - base.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
    });
    container.prepend(ghost); // first child: paints under the item labels
    el.classList.add(classes.arriving);
    // The old item would also fade its own fill out; the ghost already carries it away.
    const left = prev.el instanceof HTMLElement ? prev.el : null;
    // Labels still blend their text color over the slide.
    if (left) left.style.transition = `color ${DURATION}ms ${EASING}`;

    // Position moves on the compositor; width only changes between tree depths.
    const translate = `translate(${from.left - to.left}px, ${from.top - to.top}px)`;
    const sameSize = from.width === to.width && from.height === to.height;
    const keyframes: Keyframe[] = [
      {
        transform: translate,
        "--sq-bg": prev.bg,
        ...(sameSize ? {} : { width: `${from.width}px`, height: `${from.height}px` }),
      },
      {
        transform: "none",
        "--sq-bg": bg,
        ...(sameSize ? {} : { width: `${to.width}px`, height: `${to.height}px` }),
      },
    ];
    const animation = ghost.animate(keyframes, {
      duration: DURATION,
      easing: EASING,
    });
    const done = () => {
      ghost.remove();
      el.classList.remove(classes.arriving);
      if (left) left.style.transition = "";
    };
    animation.onfinish = done;
    animation.oncancel = done;
    running.current = animation;
  });
}

function readFinalBg(el: Element): string {
  if (!(el instanceof HTMLElement)) return getComputedStyle(el).getPropertyValue("--sq-bg").trim();
  const prev = el.style.transition;
  el.style.transition = "none";
  const bg = getComputedStyle(el).getPropertyValue("--sq-bg").trim();
  el.style.transition = prev;
  return bg;
}
