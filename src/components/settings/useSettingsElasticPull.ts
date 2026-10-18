import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * iOS / WebKit-style asymptotic rubber band.
 * Used for the early stretch; past the soft zone we ease into a full-page reveal.
 */
export function rubberBand(overflow: number, dimension = 120, constant = 0.55): number {
  const x = Math.max(0, overflow);
  if (dimension <= 0) return 0;
  return dimension * (1 - 1 / ((x * constant) / dimension + 1));
}

/** @deprecated kept for existing unit tests */
export function elasticOffset(pull: number): number {
  return rubberBand(pull, 140, 0.55);
}

/**
 * Map accumulated overscroll (px) → stack translation (px) toward the next page.
 * Early motion is rubbery; later motion opens the next panel.
 */
export function overflowToReveal(overflow: number, viewportH: number): number {
  if (viewportH <= 0 || overflow <= 0) return 0;
  const soft = Math.min(viewportH * 0.28, 120);
  if (overflow <= soft * 1.8) {
    // Soft zone: asymptotic rubber, capped near `soft`.
    return rubberBand(overflow, soft, 0.55);
  }
  // Past soft zone: continue toward a full viewport reveal.
  const atSoft = rubberBand(soft * 1.8, soft, 0.55);
  const rest = overflow - soft * 1.8;
  const remain = Math.max(1, viewportH - atSoft);
  const t = Math.min(1, rest / (remain * 1.15));
  return atSoft + remain * (1 - (1 - t) * (1 - t));
}

const WHEEL_SCALE = 1;
/** Reveal fraction of viewport height that commits to the other page. */
export const COMMIT_RATIO = 0.36;
const NEW_FLICK_RATIO = 1.4;
const DECAY_STREAK = 5;
const SNAP_MS = 400;

/**
 * Progress 0→1 toward the commit threshold (circular gauge fill).
 * Full ring ≈ ready to release onto the other page.
 */
export function pullCommitProgress(reveal: number, viewportH: number): number {
  if (viewportH <= 0 || reveal <= 0) return 0;
  return Math.min(1, reveal / (viewportH * COMMIT_RATIO));
}

/** Soft overflow cap for the first “stop at the edge” latch pull. */
export function latchOverflowCap(viewportH: number): number {
  const soft = Math.min(viewportH * 0.28, 120);
  return soft * 1.35;
}

function atBottom(el: HTMLElement): boolean {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
}

function atTop(el: HTMLElement): boolean {
  return el.scrollTop <= 2;
}

export type SettingsPanelPage = "settings" | "licenses";

type Options = {
  page: SettingsPanelPage;
  onPageChange: (page: SettingsPanelPage) => void;
};

/**
 * Dual-panel stack: settings (top) + licenses (bottom).
 *
 * Overscroll at the inner edge accumulates `overflow` px; reveal follows
 * {@link overflowToReveal}. Gesture end uses decaying wheel deltas — not an
 * idle timeout — because macOS trackpad momentum has no JS phase flag.
 *
 * @see https://goodturn.ai/p/gtp_01kyz8dqeyfhmt1jn398d8bcej
 */
export function useSettingsPanelTransition({ page, onPageChange }: Options) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLElement | null>(null);
  const licensesRef = useRef<HTMLElement | null>(null);

  const [viewportH, setViewportH] = useState(0);
  /** Translation from the settled page toward the other (px, always ≥ 0). */
  const [reveal, setReveal] = useState(0);
  const [snapping, setSnapping] = useState(false);
  /** True while the current pull is the edge-latch bounce (cannot commit). */
  const [latching, setLatching] = useState(false);

  const overflowRef = useRef(0);
  const revealRef = useRef(0);
  const pageRef = useRef(page);
  const onPageChangeRef = useRef(onPageChange);
  const snappingRef = useRef(false);
  const gestureRef = useRef(false);
  const lastAbsRef = useRef(0);
  const decayStreakRef = useRef(0);
  const snapTimerRef = useRef<number | null>(null);
  /** Already resting at the inner edge before this wheel series. */
  const wasAtEdgeRef = useRef(false);
  /**
   * First contact after scrolling into the edge (e.g. fling from top).
   * That pull only rubber-bands and always snaps back — “一旦止まる”.
   */
  const latchThisGestureRef = useRef(false);

  pageRef.current = page;
  onPageChangeRef.current = onPageChange;
  snappingRef.current = snapping;
  revealRef.current = reveal;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setViewportH(viewport.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (snapTimerRef.current != null) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
    overflowRef.current = 0;
    revealRef.current = 0;
    setReveal(0);
    setSnapping(false);
    snappingRef.current = false;
    gestureRef.current = false;
    decayStreakRef.current = 0;
    lastAbsRef.current = 0;
    wasAtEdgeRef.current = false;
    latchThisGestureRef.current = false;
    setLatching(false);
  }, [page]);

  const applyOverflow = useCallback(
    (overflow: number) => {
      const next = Math.max(0, overflow);
      overflowRef.current = next;
      const visual = overflowToReveal(next, viewportH);
      revealRef.current = visual;
      setReveal(visual);
      return visual;
    },
    [viewportH]
  );

  const finishSnap = useCallback((next: SettingsPanelPage) => {
    overflowRef.current = 0;
    revealRef.current = 0;
    setReveal(0);
    setSnapping(false);
    snappingRef.current = false;
    gestureRef.current = false;
    decayStreakRef.current = 0;
    lastAbsRef.current = 0;
    latchThisGestureRef.current = false;
    setLatching(false);
    // After a bounce-back latch, treat the edge as resting so the next pull can commit.
    wasAtEdgeRef.current = true;
    if (pageRef.current !== next) onPageChangeRef.current(next);
    if (next === "licenses") {
      licensesRef.current?.scrollTo({ top: 0 });
    }
  }, []);

  const snapTo = useCallback(
    (next: SettingsPanelPage) => {
      if (snapTimerRef.current != null) window.clearTimeout(snapTimerRef.current);
      setSnapping(true);
      snappingRef.current = true;
      const staying = next === pageRef.current;
      // Stay: spring rubber back to 0. Switch: complete the remaining reveal.
      const target = staying ? 0 : Math.max(viewportH, revealRef.current);
      revealRef.current = target;
      setReveal(target);
      snapTimerRef.current = window.setTimeout(() => {
        snapTimerRef.current = null;
        finishSnap(next);
      }, SNAP_MS);
    },
    [finishSnap, viewportH]
  );

  /**
   * Animated page change for sidebar taps. Matches the overscroll snap so
   * "ライセンス" does not hard-cut the dual-panel stack.
   */
  const goToPage = useCallback(
    (next: SettingsPanelPage) => {
      if (snappingRef.current) return;
      if (next === pageRef.current) {
        if (next === "licenses") licensesRef.current?.scrollTo({ top: 0 });
        return;
      }
      // Seed a small reveal so stackSnap has distance to travel even when the
      // user never rubber-banded first (sidebar tap with reveal === 0).
      if (revealRef.current < 1 && viewportH > 0) {
        const seed = Math.min(viewportH * 0.08, 48);
        overflowRef.current = seed;
        revealRef.current = seed;
        setReveal(seed);
      }
      snapTo(next);
    },
    [snapTo, viewportH]
  );

  const settleGesture = useCallback(() => {
    if (!gestureRef.current || snappingRef.current) return;
    gestureRef.current = false;
    // Momentum that first hit the edge: always stop once (bounce back).
    if (latchThisGestureRef.current) {
      latchThisGestureRef.current = false;
      setLatching(false);
      snapTo(pageRef.current);
      return;
    }
    const ratio = viewportH > 0 ? revealRef.current / viewportH : 0;
    if (pageRef.current === "settings") {
      snapTo(ratio >= COMMIT_RATIO ? "licenses" : "settings");
    } else {
      snapTo(ratio >= COMMIT_RATIO ? "settings" : "licenses");
    }
  }, [snapTo, viewportH]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || viewportH <= 0) return;

    const onWheel = (event: WheelEvent) => {
      if (snappingRef.current) {
        event.preventDefault();
        return;
      }

      const settings = settingsRef.current;
      const licenses = licensesRef.current;
      if (!settings || !licenses) return;

      const dy = event.deltaY;
      const abs = Math.abs(dy);
      const currentPage = pageRef.current;
      const active = gestureRef.current || revealRef.current > 0.5;

      const atSettingsEdge = atBottom(settings);
      const atLicensesEdge = atTop(licenses);
      const atInnerEdge =
        currentPage === "settings" ? atSettingsEdge : atLicensesEdge;

      // Track edge arrival so a fling from mid-page stops once before page change.
      // Skip latch when the panel is not scrollable (already glued to the edge).
      const edgeIsScrollable =
        currentPage === "settings"
          ? settings.scrollHeight > settings.clientHeight + 4
          : licenses.scrollHeight > licenses.clientHeight + 4;

      if (!active) {
        if (!atInnerEdge) {
          wasAtEdgeRef.current = false;
          latchThisGestureRef.current = false;
        } else if (!wasAtEdgeRef.current) {
          const arrivingTowardEdge =
            (currentPage === "settings" && dy > 0) ||
            (currentPage === "licenses" && dy < 0);
          wasAtEdgeRef.current = true;
          if (arrivingTowardEdge && edgeIsScrollable) {
            latchThisGestureRef.current = true;
          }
        }
      }

      const startLicenses =
        currentPage === "settings" && (active || (atSettingsEdge && dy > 0));
      const startSettings =
        currentPage === "licenses" && (active || (atLicensesEdge && dy < 0));

      if (!startLicenses && !startSettings) return;
      if (currentPage === "settings" && !active && !atSettingsEdge) return;
      if (currentPage === "licenses" && !active && !atLicensesEdge) return;

      event.preventDefault();
      if (!gestureRef.current && latchThisGestureRef.current) {
        setLatching(true);
      }
      gestureRef.current = true;

      if (lastAbsRef.current > 0 && abs > lastAbsRef.current * NEW_FLICK_RATIO) {
        decayStreakRef.current = 0;
      } else if (abs <= lastAbsRef.current * 0.92 || abs < 1.15) {
        decayStreakRef.current += 1;
      } else {
        decayStreakRef.current = 0;
      }
      lastAbsRef.current = abs;

      const towardNext =
        (currentPage === "settings" && dy > 0) ||
        (currentPage === "licenses" && dy < 0);
      const delta = (towardNext ? abs : -abs) * WHEEL_SCALE;
      let nextOverflow = overflowRef.current + delta;
      // Latch pull: soft rubber only — never reach commit depth on first stop.
      if (latchThisGestureRef.current) {
        nextOverflow = Math.min(nextOverflow, latchOverflowCap(viewportH));
      }
      const visual = applyOverflow(nextOverflow);

      // Deep pull: commit without waiting for decay (skipped while latched).
      if (
        !latchThisGestureRef.current &&
        towardNext &&
        viewportH > 0 &&
        visual / viewportH >= 0.92
      ) {
        settleGesture();
        return;
      }

      if (decayStreakRef.current >= DECAY_STREAK) {
        settleGesture();
      }
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      if (snapTimerRef.current != null) {
        window.clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
      }
    };
  }, [applyOverflow, settleGesture, viewportH]);

  const settledBase = page === "licenses" ? viewportH : 0;
  const signedReveal = page === "settings" ? reveal : -reveal;
  const pastThreshold = viewportH > 0 && reveal / viewportH >= COMMIT_RATIO;
  const progress = pullCommitProgress(reveal, viewportH);

  return {
    viewportRef,
    settingsRef,
    licensesRef,
    viewportH,
    stackOffset: settledBase + signedReveal,
    reveal,
    progress,
    pulling: reveal > 0.5 || snapping,
    pastThreshold: pastThreshold || snapping,
    latching,
    snapping,
    goToPage,
  };
}
