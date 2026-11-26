import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { TAB_CAP_WIDTH, TAB_FLUSH_DROP, TAB_HEIGHT } from "./paperTabShape";
import { snapGap, tabCap } from "./paperTabCap";
import { SETTLE_MS } from "./tabDrag";
import styles from "./PaperTabBar.module.css";

const SHADOW_ROOM = 32;
/** Cuts the shadow at the card's top edge but keeps a cap that drops `width` px wide into it. */
const dropClip = (left: number | null, right: number | null) => {
  const S = SHADOW_ROOM;
  const D = TAB_FLUSH_DROP;
  const pts = [`${-S}px ${-S}px`, `calc(100% + ${S}px) ${-S}px`];
  if (right != null) pts.push(`calc(100% + ${S}px) calc(100% + ${D}px)`, `calc(100% - ${right}px) calc(100% + ${D}px)`, `calc(100% - ${right}px) 100%`);
  else pts.push(`calc(100% + ${S}px) 100%`);
  if (left != null) pts.push(`${left}px 100%`, `${left}px calc(100% + ${D}px)`, `${-S}px calc(100% + ${D}px)`);
  else pts.push(`${-S}px 100%`);
  return `polygon(${pts.join(", ")})`;
};
/** Keep tracking the tab this long after a drag ends, while it glides into its slot. */
const MORPH_TAIL_MS = SETTLE_MS + 120;

/** A cap's fill path as a CSS mask image. */
function capMaskUrl(d: string, width: number, height: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'><path d='${d}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Card-coloured tab body whose flared base runs into the main card below. Its left cap follows
 *  the tab's gap from the card's left edge: flush on the edge, fully flared once clear of the
 *  card's corner, and in between the card corner and the flare grow together (see morphLeftCap).
 *  `textured` paints the card's paper texture too: folder pages show it, Reader covers the card
 *  with a plain fill. */
/** The tab of the paper a card shows, joined to that card (`card`: the card's selector). */
export function ActiveTabShape({ moving, textured, card: cardSelector = "[data-main-card]" }: { moving: boolean; textured: boolean; card?: string }) {
  const cap = (fill: string, stroke: string, width = TAB_CAP_WIDTH, height = TAB_HEIGHT, clipId?: string) => (
    <svg className={styles.cap} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {clipId && (
        <clipPath id={clipId}>
          <path d={fill} />
        </clipPath>
      )}
      <path d={fill} className={styles.capFill} />
      <path d={stroke} className={styles.capStroke} {...(clipId ? { clipPath: `url(#${clipId})`, strokeWidth: 2 } : {})} />
    </svg>
  );
  const clipId = `tab-cap-${useId().replace(/:/g, "")}`;
  const shapeRef = useRef<HTMLSpanElement>(null);
  const textureRef = useRef<HTMLSpanElement>(null);
  const [gap, setGap] = useState(Infinity);
  const [rightGap, setRightGap] = useState(Infinity);
  // Anchor the texture to the main card's top-left so its dot grid runs on from the card's, and
  // measure how far the tab (with its drag / glide transform) sits from the card's left edge.
  const syncRef = useRef<() => void>(() => {});
  syncRef.current = () => {
    const texture = textureRef.current;
    const tab = shapeRef.current?.parentElement;
    const card = document.querySelector<HTMLElement>(cardSelector);
    if (!tab || !card) return;
    const c = card.getBoundingClientRect();
    const r = tab.getBoundingClientRect();
    setGap(snapGap(r.left - c.left));
    setRightGap(snapGap(c.right - r.right));
    // Only folder tabs carry the texture; paper tabs still need the gap above.
    if (!texture) return;
    const t = texture.getBoundingClientRect();
    const pos = `${c.left - t.left}px ${c.top - t.top}px`;
    texture.style.backgroundPosition = `${pos}, ${pos}`;
  };
  useLayoutEffect(() => syncRef.current());
  useEffect(() => {
    const shape = shapeRef.current;
    const card = document.querySelector<HTMLElement>(cardSelector);
    if (!shape || !card) return;
    const sync = () => syncRef.current();
    const observer = new ResizeObserver(sync);
    observer.observe(card);
    const bar = shape.closest<HTMLElement>(`.${styles.bar}`);
    if (bar) observer.observe(bar);
    // Neighbouring tabs growing / the bar's padding gliding move this tab without a resize.
    bar?.addEventListener("transitionend", sync);
    bar?.addEventListener("animationend", sync);
    return () => {
      observer.disconnect();
      bar?.removeEventListener("transitionend", sync);
      bar?.removeEventListener("animationend", sync);
    };
  }, [cardSelector]);
  // While tabs move (drag, then the glide into place) follow the tab every frame.
  useEffect(() => {
    let frame = 0;
    const until = moving ? Infinity : performance.now() + MORPH_TAIL_MS;
    const tick = () => {
      syncRef.current();
      if (performance.now() < until) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [moving]);

  const left = tabCap(gap, false);
  const right = tabCap(rightGap, true);
  // Where each cap's straight top meets the middle strip, measured from that cap's outer edge.
  const capInner = left.mode === "flared" ? TAB_CAP_WIDTH : left.width;
  const capInnerRight = right.mode === "flared" ? TAB_CAP_WIDTH : right.width;
  const mask = [
    `${capMaskUrl(left.fill, left.width, left.height)} 0 0 / ${left.width}px ${left.height}px no-repeat`,
    `linear-gradient(#000, #000) ${capInner - 1}px 0 / calc(100% - ${capInner + capInnerRight - 2}px) ${TAB_HEIGHT}px no-repeat`,
    `${capMaskUrl(right.fill, right.width, right.height)} 100% 0 / ${right.width}px ${right.height}px no-repeat`,
  ].join(", ");
  return (
    <span
      ref={shapeRef}
      className={styles.shape}
      style={{
        left: -left.offset,
        right: -right.offset,
        height: TAB_HEIGHT,
        // A cap that drops below the tab squares off / re-rounds the card's corner; keep that
        // drop when cutting the shadow at the card's top edge.
        ...(left.mode !== "flared" || right.mode !== "flared"
          ? { clipPath: dropClip(left.mode !== "flared" ? left.width : null, right.mode !== "flared" ? right.width : null) }
          : {}),
      }}
      aria-hidden
    >
      {cap(left.fill, left.stroke, left.width, left.height, left.mode === "morph" ? clipId : undefined)}
      <span className={styles.shapeMid} />
      {cap(right.fill, right.stroke, right.width, right.height, right.mode === "morph" ? `${clipId}-r` : undefined)}
      {textured && (
        <span
          ref={textureRef}
          className={styles.texture}
          style={{ height: Math.max(left.height, right.height), mask, WebkitMask: mask }}
        />
      )}
    </span>
  );
}
