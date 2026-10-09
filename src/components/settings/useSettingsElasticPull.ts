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
const COMMIT_RATIO = 0.36;
const NEW_FLICK_RATIO = 1.4;
const DECAY_STREAK = 5;
const SNAP_MS = 400;

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

  const overflowRef = useRef(0);
  const revealRef = useRef(0);
  const pageRef = useRef(page);
  const onPageChangeRef = useRef(onPageChange);
  const snappingRef = useRef(false);
  const gestureRef = useRef(false);
  const lastAbsRef = useRef(0);
  const decayStreakRef = useRef(0);
  const snapTimerRef = useRef<number | null>(null);

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

  const settleGesture = useCallback(() => {
    if (!gestureRef.current || snappingRef.current) return;
    gestureRef.current = false;
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

      const startLicenses =
        currentPage === "settings" && (active || (atBottom(settings) && dy > 0));
      const startSettings =
        currentPage === "licenses" && (active || (atTop(licenses) && dy < 0));

      if (!startLicenses && !startSettings) return;
      if (currentPage === "settings" && !active && !atBottom(settings)) return;
      if (currentPage === "licenses" && !active && !atTop(licenses)) return;

      event.preventDefault();
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
      const visual = applyOverflow(overflowRef.current + delta);

      // Deep pull: commit without waiting for decay.
      if (towardNext && viewportH > 0 && visual / viewportH >= 0.92) {
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

  return {
    viewportRef,
    settingsRef,
    licensesRef,
    viewportH,
    stackOffset: settledBase + signedReveal,
    reveal,
    pulling: reveal > 0.5 || snapping,
    pastThreshold: pastThreshold || snapping,
    snapping,
  };
}
