/**
 * Settings ↔ Licenses pull-to-navigate (iOS Pull-to-Refresh style).
 *
 * Model (distance, not velocity/acceleration):
 * 1. Scroll into the inner edge → stop. No page change from momentum.
 * 2. After a brief rest at the edge, the next pull arms the gauge.
 * 3. Each wheel tick adds a *capped* step so a fast flick cannot dump the ring.
 * 4. Finger-up (idle after last wheel): progress ≥ 1 → navigate; else bounce.
 *
 * macOS trackpad has no touchend — settle/arm use short idle timers.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** iOS / WebKit-style asymptotic rubber band (visual displacement). */
export function rubberBand(overflow: number, dimension = 72, constant = 0.55): number {
  const x = Math.max(0, overflow);
  if (dimension <= 0) return 0;
  return dimension * (1 - 1 / ((x * constant) / dimension + 1));
}

/** @deprecated alias kept for older call sites / tests */
export function elasticOffset(pull: number): number {
  return rubberBand(pull, 72, 0.55);
}

/** Raw overflow required to fill the gauge and arm “離して遷移”. */
export const COMMIT_PULL_PX = 140;

/** Asymptotic max shift of the page stack while pulling (the next page peeks in by this much). */
export const PULL_RUBBER_DIM = 88;

/**
 * Soft per-wheel ceiling (px of |deltaY| before scale). High enough to feel
 * like the original 0.65 scale, but still clips extreme momentum spikes.
 */
export const MAX_WHEEL_STEP = 28;

/** Scale wheel step into overflow (original gauge-follow sensitivity). */
const WHEEL_SCALE = 0.65;

/** Finger-up / settle after wheels stop. */
export const RELEASE_IDLE_MS = 140;

/** Rest at the edge before a pull can fill the gauge (absorbs fling-in). */
export const EDGE_ARM_IDLE_MS = 120;

const SETTLE_MS = 320;
const TRANSITION_MS = 420;
const REDUCED_TRANSITION_MS = 160;

export function pullCommitProgress(overflow: number, commitPull = COMMIT_PULL_PX): number {
  if (commitPull <= 0 || overflow <= 0) return 0;
  return Math.min(1, overflow / commitPull);
}

export function pullVisualOffset(
  overflow: number,
  reducedMotion: boolean,
  rubberDim = PULL_RUBBER_DIM
): number {
  if (overflow <= 0) return 0;
  if (reducedMotion) return Math.min(overflow * 0.08, 10);
  return rubberBand(overflow, rubberDim, 0.55);
}

/** Distance contributed by one wheel event (clamped — not velocity-weighted). */
export function wheelStep(deltaY: number, maxStep = MAX_WHEEL_STEP, scale = WHEEL_SCALE): number {
  const abs = Math.abs(deltaY);
  if (abs < 0.01) return 0;
  return Math.min(abs, maxStep) * scale;
}

/** @deprecated latch removed — edge arming replaced velocity latch. */
export function latchOverflowCap(commitPull = COMMIT_PULL_PX): number {
  return commitPull * 0.88;
}

/** @deprecated full-page reveal during pull removed. */
export function overflowToReveal(overflow: number, viewportH: number): number {
  if (viewportH <= 0 || overflow <= 0) return 0;
  return pullVisualOffset(overflow, false, Math.min(viewportH * 0.28, 120));
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

export function useSettingsPanelTransition({ page, onPageChange }: Options) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLElement | null>(null);
  const licensesRef = useRef<HTMLElement | null>(null);

  const [viewportH, setViewportH] = useState(0);
  const [stackOffset, setStackOffset] = useState(0);
  const [pullOffset, setPullOffset] = useState(0);
  const [progress, setProgress] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  /** True while waiting at the edge before the gauge can fill (fling absorbed). */
  const [arming, setArming] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const overflowRef = useRef(0);
  const pullOffsetRef = useRef(0);
  const progressRef = useRef(0);
  const pageRef = useRef(page);
  const onPageChangeRef = useRef(onPageChange);
  const snappingRef = useRef(false);
  const transitioningRef = useRef(false);
  const gestureRef = useRef(false);
  const animTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const armTimerRef = useRef<number | null>(null);
  /** User has rested at the inner edge; next toward-edge pull may fill the gauge. */
  const edgeArmedRef = useRef(false);
  const wasAtEdgeRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const settleGestureRef = useRef<() => void>(() => {});

  pageRef.current = page;
  onPageChangeRef.current = onPageChange;
  snappingRef.current = snapping;
  transitioningRef.current = transitioning;
  pullOffsetRef.current = pullOffset;
  progressRef.current = progress;
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const next = mq.matches;
      reducedMotionRef.current = next;
      setReducedMotion(next);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setViewportH(viewport.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (transitioningRef.current) return;
    setStackOffset(page === "licenses" ? viewportH : 0);
  }, [page, viewportH]);

  const clearAnimTimer = useCallback(() => {
    if (animTimerRef.current != null) {
      window.clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current != null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const clearArmTimer = useCallback(() => {
    if (armTimerRef.current != null) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  }, []);

  const resetPullState = useCallback(() => {
    overflowRef.current = 0;
    pullOffsetRef.current = 0;
    progressRef.current = 0;
    setPullOffset(0);
    setProgress(0);
    gestureRef.current = false;
    setArming(false);
  }, []);

  useEffect(() => {
    if (transitioningRef.current) return;
    clearAnimTimer();
    clearIdleTimer();
    clearArmTimer();
    resetPullState();
    setSnapping(false);
    snappingRef.current = false;
    wasAtEdgeRef.current = false;
    edgeArmedRef.current = false;
  }, [page, clearAnimTimer, clearArmTimer, clearIdleTimer, resetPullState]);

  const applyOverflow = useCallback((overflow: number) => {
    const next = Math.max(0, overflow);
    overflowRef.current = next;
    const visual = pullVisualOffset(next, reducedMotionRef.current);
    const prog = pullCommitProgress(next);
    pullOffsetRef.current = visual;
    progressRef.current = prog;
    setPullOffset(visual);
    setProgress(prog);
  }, []);

  const finishTransition = useCallback(
    (next: SettingsPanelPage) => {
      clearAnimTimer();
      clearIdleTimer();
      clearArmTimer();
      transitioningRef.current = false;
      setTransitioning(false);
      snappingRef.current = false;
      setSnapping(false);
      resetPullState();
      wasAtEdgeRef.current = true;
      edgeArmedRef.current = true;
      setStackOffset(next === "licenses" ? viewportH : 0);
      if (pageRef.current !== next) onPageChangeRef.current(next);
      if (next === "licenses") {
        licensesRef.current?.scrollTo({ top: 0 });
      }
    },
    [clearAnimTimer, clearArmTimer, clearIdleTimer, resetPullState, viewportH]
  );

  const runPageTransition = useCallback(
    (next: SettingsPanelPage) => {
      if (transitioningRef.current) return;
      clearAnimTimer();
      clearIdleTimer();
      clearArmTimer();
      const pulled = pullOffsetRef.current;
      resetPullState();

      const from = pageRef.current;
      if (next === from) {
        setSnapping(false);
        snappingRef.current = false;
        return;
      }

      const duration = reducedMotionRef.current ? REDUCED_TRANSITION_MS : TRANSITION_MS;
      const target = next === "licenses" ? viewportH : 0;

      transitioningRef.current = true;
      setTransitioning(true);
      snappingRef.current = true;
      setSnapping(true);

      // Start from where the pull left the stack so the slide has no jump back.
      setStackOffset(from === "licenses" ? viewportH - pulled : pulled);
      requestAnimationFrame(() => {
        setStackOffset(target);
      });

      animTimerRef.current = window.setTimeout(() => {
        animTimerRef.current = null;
        finishTransition(next);
      }, duration);
    },
    [clearAnimTimer, clearArmTimer, clearIdleTimer, finishTransition, resetPullState, viewportH]
  );

  const bouncePullBack = useCallback(() => {
    clearAnimTimer();
    clearIdleTimer();
    gestureRef.current = false;
    setArming(false);

    if (reducedMotionRef.current || pullOffsetRef.current < 0.5) {
      resetPullState();
      setSnapping(false);
      snappingRef.current = false;
      edgeArmedRef.current = true;
      wasAtEdgeRef.current = true;
      return;
    }

    snappingRef.current = true;
    setSnapping(true);
    overflowRef.current = 0;
    pullOffsetRef.current = 0;
    progressRef.current = 0;
    setPullOffset(0);
    setProgress(0);

    animTimerRef.current = window.setTimeout(() => {
      animTimerRef.current = null;
      snappingRef.current = false;
      setSnapping(false);
      wasAtEdgeRef.current = true;
      edgeArmedRef.current = true;
    }, SETTLE_MS);
  }, [clearAnimTimer, clearIdleTimer, resetPullState]);

  const settleGesture = useCallback(() => {
    if (!gestureRef.current || snappingRef.current || transitioningRef.current) return;
    clearIdleTimer();
    gestureRef.current = false;

    if (progressRef.current >= 1) {
      const next: SettingsPanelPage =
        pageRef.current === "settings" ? "licenses" : "settings";
      runPageTransition(next);
      return;
    }

    bouncePullBack();
  }, [bouncePullBack, clearIdleTimer, runPageTransition]);

  settleGestureRef.current = settleGesture;

  const scheduleReleaseSettle = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      settleGestureRef.current();
    }, RELEASE_IDLE_MS);
  }, [clearIdleTimer]);

  const scheduleEdgeArm = useCallback(() => {
    clearArmTimer();
    setArming(true);
    armTimerRef.current = window.setTimeout(() => {
      armTimerRef.current = null;
      edgeArmedRef.current = true;
      setArming(false);
    }, EDGE_ARM_IDLE_MS);
  }, [clearArmTimer]);

  const goToPage = useCallback(
    (next: SettingsPanelPage) => {
      if (snappingRef.current || transitioningRef.current) return;
      if (next === pageRef.current) {
        if (next === "licenses") licensesRef.current?.scrollTo({ top: 0 });
        return;
      }
      runPageTransition(next);
    },
    [runPageTransition]
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || viewportH <= 0) return;

    const onWheel = (event: WheelEvent) => {
      if (snappingRef.current || transitioningRef.current) {
        event.preventDefault();
        return;
      }

      const settings = settingsRef.current;
      const licenses = licensesRef.current;
      if (!settings || !licenses) return;

      const dy = event.deltaY;
      const currentPage = pageRef.current;
      const active = gestureRef.current || pullOffsetRef.current > 0.5;

      const atSettingsEdge = atBottom(settings);
      const atLicensesEdge = atTop(licenses);
      const atInnerEdge =
        currentPage === "settings" ? atSettingsEdge : atLicensesEdge;

      const towardNext =
        (currentPage === "settings" && dy > 0) ||
        (currentPage === "licenses" && dy < 0);

      // Left the edge — disarm and let normal scroll resume.
      if (!active && !atInnerEdge) {
        wasAtEdgeRef.current = false;
        edgeArmedRef.current = false;
        clearArmTimer();
        setArming(false);
        return;
      }

      // Arriving at / resting on the edge before the gauge is armed: absorb
      // overscroll, wait for a quiet moment, then arm. No velocity latch.
      if (!active && atInnerEdge && !edgeArmedRef.current) {
        if (towardNext) {
          event.preventDefault();
          wasAtEdgeRef.current = true;
          scheduleEdgeArm();
        } else {
          // Scrolling away from the edge while unarmed — normal scroll.
          wasAtEdgeRef.current = atInnerEdge;
          clearArmTimer();
          setArming(false);
        }
        return;
      }

      if (!active && atInnerEdge && edgeArmedRef.current && !towardNext) {
        // Armed but scrolling inland — disarm until they rest at the edge again.
        edgeArmedRef.current = false;
        wasAtEdgeRef.current = true;
        return;
      }

      const startLicenses =
        currentPage === "settings" && (active || (atSettingsEdge && towardNext && edgeArmedRef.current));
      const startSettings =
        currentPage === "licenses" && (active || (atLicensesEdge && towardNext && edgeArmedRef.current));

      if (!startLicenses && !startSettings) return;
      if (currentPage === "settings" && !active && !atSettingsEdge) return;
      if (currentPage === "licenses" && !active && !atLicensesEdge) return;

      event.preventDefault();
      clearArmTimer();
      setArming(false);
      gestureRef.current = true;

      const step = wheelStep(dy);
      const signed = towardNext ? step : -step;
      let nextOverflow = overflowRef.current + signed;
      nextOverflow = Math.min(Math.max(0, nextOverflow), COMMIT_PULL_PX * 1.25);
      applyOverflow(nextOverflow);

      if (nextOverflow <= 0 && !towardNext) {
        clearIdleTimer();
        gestureRef.current = false;
        // Stay armed so the next pull can start immediately.
        edgeArmedRef.current = true;
        wasAtEdgeRef.current = true;
        return;
      }

      scheduleReleaseSettle();
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      clearAnimTimer();
      clearIdleTimer();
      clearArmTimer();
    };
  }, [
    applyOverflow,
    clearAnimTimer,
    clearArmTimer,
    clearIdleTimer,
    scheduleEdgeArm,
    scheduleReleaseSettle,
    viewportH,
  ]);

  const settledBase = page === "licenses" ? viewportH : 0;
  const pastThreshold = progress >= 1;
  const pulling = pullOffset > 0.5 || (snapping && !transitioning) || arming;

  return {
    viewportRef,
    settingsRef,
    licensesRef,
    viewportH,
    stackOffset: transitioning
      ? stackOffset
      : settledBase + (page === "licenses" ? -pullOffset : pullOffset),
    pullOffset,
    progress,
    pulling,
    pastThreshold: pastThreshold || transitioning,
    /** @deprecated alias — edge arming replaced latch; true while waiting at edge. */
    latching: arming,
    arming,
    snapping,
    transitioning,
    reducedMotion,
    settleMs: SETTLE_MS,
    transitionMs: reducedMotion ? REDUCED_TRANSITION_MS : TRANSITION_MS,
    goToPage,
  };
}
