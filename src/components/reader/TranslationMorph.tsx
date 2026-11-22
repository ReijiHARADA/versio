import { useEffect, useRef, useState } from "react";
import styles from "./TranslationMorph.module.css";

type TranslationMorphPhase = "waiting" | "revealing";

type TranslationMorphProps = {
  fromText: string;
  toText?: string;
  phase: TranslationMorphPhase;
  /** Called once when the reveal finishes (not used for waiting). */
  onRevealComplete?: () => void;
  className?: string;
  /** Optional attrs for the text node (block id, role, etc.). */
  textProps?: React.HTMLAttributes<HTMLParagraphElement> & {
    "data-paper-block-id"?: string;
    "data-text-role"?: string;
    "data-translating"?: string;
  };
};

type Point = { x: number; y: number };

type Particle = {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  r: number;
  delay: number;
  nx: number;
  ny: number;
  scatter: number;
  peak: number;
};

// Keep the reveal perceptible without competing with document scrolling when
// several paragraphs finish translation close together.
const REVEAL_MS = 700;
const MAX_PARTICLES = 480;
/** English → dust only; travel/reform keep their own pace. */
const DISSOLVE_SPEED = 1.6;
const EN_FADE_END = 0.22 / DISSOLVE_SPEED;
const DUST_IN_END = 0.12 / DISSOLVE_SPEED;
const MOVE_START = 0.14 / DISSOLVE_SPEED;
const PARTICLE_RGB = "18, 18, 20";

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInOutQuint(t: number): number {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - (-2 * t + 2) ** 5 / 2;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    const tokens = paragraph.match(/[A-Za-z0-9'’.-]+(?:\s+)?|./gu) ?? [...paragraph];
    let line = "";
    for (const token of tokens) {
      const test = line + token;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line.trimEnd());
        line = token.replace(/^\s+/, "");
      } else {
        line = test;
      }
    }
    if (line) lines.push(line.trimEnd());
  }
  return lines.length ? lines : [""];
}

function subsample(points: Point[], count: number): Point[] {
  if (points.length === 0) return [];
  if (points.length <= count) {
    const out = points.slice();
    while (out.length < count) {
      const p = points[out.length % points.length]!;
      out.push({
        x: p.x + (Math.random() - 0.5) * 1.1,
        y: p.y + (Math.random() - 0.5) * 1.1,
      });
    }
    return out;
  }
  const out: Point[] = [];
  const step = points.length / count;
  for (let i = 0; i < count; i++) {
    const p = points[Math.min(points.length - 1, Math.floor(i * step))]!;
    out.push({
      x: p.x + (Math.random() - 0.5) * 0.45,
      y: p.y + (Math.random() - 0.5) * 0.45,
    });
  }
  return out;
}

/** Pair by reading order so glyph bands morph coherently, not by nearest collapse. */
function pairByOrder(sources: Point[], targets: Point[]): Point[] {
  const n = sources.length;
  if (n === 0) return [];
  const order = sources
    .map((_, i) => i)
    .sort((a, b) => {
      const pa = sources[a]!;
      const pb = sources[b]!;
      return pa.y - pb.y || pa.x - pb.x;
    });
  const dst = subsample(
    targets.slice().sort((a, b) => a.y - b.y || a.x - b.x),
    n,
  );
  const paired: Point[] = new Array(n);
  for (let rank = 0; rank < n; rank++) {
    paired[order[rank]!] = dst[rank]!;
  }
  return paired;
}

function sampleGlyphPoints(
  text: string,
  width: number,
  height: number,
  font: string,
  lineHeightPx: number,
  count: number,
): Point[] {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#000";
  ctx.font = font;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const lines = wrapLines(ctx, text, w);
  const fontSizeMatch = /([\d.]+)px/.exec(font);
  const fontSize = fontSizeMatch ? Number(fontSizeMatch[1]) : 16;
  const baseline = fontSize * 0.78;
  let y = baseline + Math.max(0, (lineHeightPx - fontSize) * 0.35);
  for (const line of lines) {
    if (line) ctx.fillText(line, 0, y);
    y += lineHeightPx;
    if (y - lineHeightPx > h) break;
  }

  const { data } = ctx.getImageData(0, 0, w, h);
  const candidates: Point[] = [];
  // Dense 1px grid keeps letterforms readable when particle count is high.
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const alpha = data[(py * w + px) * 4 + 3]!;
      if (alpha > 40) {
        candidates.push({
          x: px + (Math.random() - 0.5) * 0.35,
          y: py + (Math.random() - 0.5) * 0.35,
        });
      }
    }
  }

  if (candidates.length === 0) {
    for (let i = 0; i < count; i++) {
      candidates.push({
        x: w * (0.08 + Math.random() * 0.84),
        y: h * (0.15 + Math.random() * 0.7),
      });
    }
  }

  candidates.sort((a, b) => a.y - b.y || a.x - b.x);
  return subsample(candidates, count);
}

function particleAlpha(local: number, peak: number): number {
  // Soft envelopes — no hard hold plateaus. Dust-in is sped by DISSOLVE_SPEED.
  if (local < DUST_IN_END) return easeOutCubic(local / DUST_IN_END) * peak;
  if (local < 0.58) {
    const edge = Math.min(local - DUST_IN_END, 0.58 - local);
    const breathe = 0.92 + 0.08 * Math.sin(local * Math.PI * 3);
    return peak * breathe * (0.85 + 0.15 * clamp01(edge / 0.08));
  }
  if (local < 0.9) return peak * (1 - easeInOut((local - 0.58) / 0.32));
  return 0;
}

/**
 * English stays readable while waiting; on reveal, glyphs dissolve into fine
 * black dust and reform into the Japanese letterforms while blur melts away.
 */
export function TranslationMorph({
  fromText,
  toText = "",
  phase,
  onRevealComplete,
  className,
  textProps,
}: TranslationMorphProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLParagraphElement>(null);
  const toRef = useRef<HTMLParagraphElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onRevealComplete);
  const [progress, setProgress] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onRevealComplete;
  }, [onRevealComplete]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    completedRef.current = false;
    if (phase !== "revealing") {
      setProgress(0);
      const fromEl = fromRef.current;
      if (fromEl) {
        fromEl.style.opacity = "";
        fromEl.style.filter = "";
      }
      return;
    }

    if (reduceMotion) {
      setProgress(1);
      onCompleteRef.current?.();
      return;
    }

    const root = rootRef.current;
    const fromEl = fromRef.current;
    const canvas = canvasRef.current;
    if (!root || !fromEl || !canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let start = 0;
    let w = 1;
    let h = 1;
    let frame = 0;

    const layout = () => {
      const rect = root.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    let particles: Particle[] = [];
    let started = false;

    const applyTextStyles = (t: number) => {
      const fromOpacity = Math.max(0, 1 - easeOutCubic(clamp01(t / EN_FADE_END)) * 1.05);
      const fromBlur = Math.min(2.5, 0.25 + t * 3.2 * DISSOLVE_SPEED);
      fromEl.style.opacity = String(fromOpacity);
      fromEl.style.filter = `blur(${fromBlur.toFixed(2)}px)`;

      const toEl = toRef.current;
      if (toEl) {
        const toReveal = easeInOutQuint(clamp01((t - 0.4) / 0.52));
        toEl.style.opacity = String(toReveal);
        toEl.style.filter = `blur(${(3.5 * (1 - toReveal)).toFixed(2)}px)`;
      }
    };

    const tick = (now: number) => {
      if (!started) return;
      if (!start) start = now;
      const t = clamp01((now - start) / REVEAL_MS);
      frame += 1;
      // A 30fps canvas is enough for this decorative transition and halves
      // raster work during concurrent translation updates.
      if (frame % 2 === 1 && t < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      // Avoid React re-render every frame; sync a11y progress ~10fps.
      if (frame % 6 === 0 || t >= 1) setProgress(t);
      applyTextStyles(t);

      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        const local = clamp01((t - p.delay) / Math.max(0.001, 1 - p.delay));
        // Dwell on source (sped dissolve) → controlled travel → settle on target.
        const move = easeInOutQuint(clamp01((local - MOVE_START) / 0.48));
        const mid = Math.sin(move * Math.PI);
        // Tight lateral control keeps letter silhouettes readable mid-flight.
        const x = p.sx + (p.tx - p.sx) * move + p.nx * p.scatter * mid;
        const y = p.sy + (p.ty - p.sy) * move + p.ny * p.scatter * mid * 0.55;
        const fade = particleAlpha(local, p.peak);
        if (fade <= 0.02) continue;
        const size = p.r * (0.85 + 0.2 * (1 - move) + 0.15 * mid);
        ctx.fillStyle = `rgba(${PARTICLE_RGB}, ${fade.toFixed(3)})`;
        ctx.fillRect(x - size * 0.5, y - size * 0.5, size, size);
      }

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else if (!completedRef.current) {
        completedRef.current = true;
        setProgress(1);
        applyTextStyles(1);
        onCompleteRef.current?.();
      }
    };

    // Wait one frame so the Japanese layer can contribute to grid height.
    raf = requestAnimationFrame(() => {
      layout();
      const cs = getComputedStyle(fromEl);
      const font = cs.font || `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const lineHeightPx =
        Number.parseFloat(cs.lineHeight) || Number.parseFloat(cs.fontSize) * 1.75 || 28;
      const area = w * h;
      const count = Math.min(MAX_PARTICLES, Math.max(180, Math.round(area / 520)));
      const sources = sampleGlyphPoints(fromText, w, h, font, lineHeightPx, count);
      const targetPool = sampleGlyphPoints(toText || fromText, w, h, font, lineHeightPx, count);
      const destinations = pairByOrder(sources, targetPool);

      particles = sources.map((s, i) => {
        const dest = destinations[i] ?? s;
        const along = clamp01(s.x / Math.max(1, w));
        const band = clamp01(s.y / Math.max(1, h));
        return {
          sx: s.x,
          sy: s.y,
          tx: dest.x,
          ty: dest.y,
          r: 0.28 + Math.random() * 0.42,
          // Soft left-to-right + slight vertical wave; dissolve side is faster.
          delay: (along * 0.09 + band * 0.03 + Math.random() * 0.025) / DISSOLVE_SPEED,
          nx: Math.random() - 0.5,
          ny: Math.random() - 0.5,
          scatter: 1.2 + Math.random() * 2.8,
          peak: 0.42 + Math.random() * 0.22,
        };
      });
      started = true;
      applyTextStyles(0);
      raf = requestAnimationFrame(tick);
    });

    const onResize = () => layout();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      fromEl.style.opacity = "";
      fromEl.style.filter = "";
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- cleanup intentionally resets the element mounted at cleanup time
      const toEl = toRef.current;
      if (toEl) {
        toEl.style.opacity = "";
        toEl.style.filter = "";
      }
    };
  }, [phase, fromText, toText, reduceMotion]);

  const showingTo = phase === "revealing" && toText;
  // Waiting styles via CSS/React; revealing styles are driven by rAF for smoothness.
  const waitingFromStyle =
    phase === "waiting"
      ? { opacity: 1, filter: "blur(0.35px)" }
      : reduceMotion
        ? { opacity: 0, filter: "blur(0px)" }
        : undefined;
  const waitingToStyle = reduceMotion
    ? { opacity: 1, filter: "blur(0px)" }
    : phase === "waiting"
      ? { opacity: 0, filter: "blur(8px)" }
        : { opacity: 0, filter: "blur(3.5px)" };

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${phase === "waiting" ? styles.waiting : styles.revealing} ${className ?? ""}`}
    >
      <p
        {...textProps}
        ref={fromRef}
        className={`${styles.layer} ${styles.from} ${textProps?.className ?? ""}`}
        style={waitingFromStyle}
        aria-hidden={phase === "revealing" && progress > 0.35 ? true : undefined}
      >
        {fromText}
      </p>
      {showingTo ? (
        <p
          ref={toRef}
          className={`${styles.layer} ${styles.to}`}
          style={waitingToStyle}
          aria-hidden={progress < 0.5 ? true : undefined}
        >
          {toText}
        </p>
      ) : null}
      {!reduceMotion ? (
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      ) : null}
    </div>
  );
}
