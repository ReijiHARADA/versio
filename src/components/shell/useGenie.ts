import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * macOS-genie entrance/exit for a bottom toast: it is pulled out of (or sucked into) a point just
 * below the window's bottom edge. The toast is drawn as 1px strips of a DOM snapshot, each strip
 * scaled on its own along a funnel; the real element stays hidden until the motion ends.
 */
export function useGenie(ref: RefObject<HTMLElement | null>, show: boolean) {
  const snap = useRef<{ node: HTMLElement; rect: DOMRect } | null>(null);

  // remember the last shown frame so the exit can play after React has removed the element
  useLayoutEffect(() => {
    if (show && ref.current) snap.current = { node: ref.current, rect: ref.current.getBoundingClientRect() };
  });

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (show && ref.current) return play(ref.current, ref.current.getBoundingClientRect(), "in");
    const last = snap.current;
    snap.current = null;
    if (!show && last) return play(last.node, last.rect, "out");
  }, [show, ref]);
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function play(source: HTMLElement, rect: DOMRect, dir: "in" | "out"): () => void {
  const { width: W, height: H, top: T } = rect;
  if (W < 1 || H < 1) return () => {};
  const template = source.cloneNode(true) as HTMLElement;
  template.removeAttribute("role");
  template.removeAttribute("aria-live");
  for (const el of [template, ...template.querySelectorAll<HTMLElement>("*")]) el.style.animation = "none";
  Object.assign(template.style, {
    position: "absolute", left: "0", right: "auto", bottom: "auto", margin: "0", transform: "none",
    width: `${W}px`, height: `${H}px`, maxWidth: "none", transition: "none", visibility: "visible",
  });

  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.style.cssText = "position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:41";
  // strips clip the box-shadow, so cast the same shadow from the warped silhouette instead
  const shadow = getComputedStyle(source).boxShadow.match(/^(rgba?\([^)]*\)) (-?[\d.]+px) (-?[\d.]+px) ([\d.]+px)/);
  // drop-shadow takes the standard deviation, box-shadow twice that
  if (shadow) stage.style.filter = `drop-shadow(${shadow[2]} ${shadow[3]} ${parseFloat(shadow[4]) / 2}px ${shadow[1]})`;
  const rows = Math.max(1, Math.round(H));
  const sh = H / rows;
  const strips = Array.from({ length: rows }, (_, i) => {
    const strip = document.createElement("div");
    strip.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${sh + 0.6}px;overflow:hidden;transform-origin:0 0`;
    const copy = template.cloneNode(true) as HTMLElement;
    copy.style.top = `${-i * sh}px`;
    strip.append(copy);
    stage.append(strip);
    return strip;
  });
  document.body.append(stage);

  // u: 0 = resting toast, 1 = fully inside the source point below the window
  const render = (u: number) => {
    const cx = rect.left + W / 2;
    const srcY = window.innerHeight + 36;
    const neck = 10;
    const c = easeInOut(clamp(u / 0.5)); // the funnel forms
    const s = easeInOut(clamp((u - 0.2) / 0.8)); // the content slides into it
    const a = srcY + (T + H * 0.15 - srcY) * c;
    const d = s * (srcY - T + 4);
    strips.forEach((strip, i) => {
      const y = T + i * sh + d;
      const k = y <= a ? 1 : (W + (neck - W) * smooth(clamp((y - a) / (srcY - a)))) / W;
      strip.style.visibility = y > srcY ? "hidden" : "visible";
      strip.style.transform = `translate(${cx - (W * k) / 2}px, ${y}px) scaleX(${k})`;
    });
  };

  const duration = dir === "in" ? 620 : 520;
  if (dir === "in") source.style.visibility = "hidden";
  let frame = 0;
  const finish = () => {
    cancelAnimationFrame(frame);
    stage.remove();
    if (dir === "in") source.style.visibility = "";
  };
  const t0 = performance.now();
  const step = (now: number) => {
    const p = clamp((now - t0) / duration);
    render(dir === "in" ? 1 - p : p);
    if (p < 1) frame = requestAnimationFrame(step);
    else finish();
  };
  render(dir === "in" ? 1 : 0);
  frame = requestAnimationFrame(step);
  return finish;
}
