/**
 * Settings ↔ Licenses pull-to-navigate (iOS Pull-to-Refresh style).
 *
 * Why the old model felt wrong:
 * - `overflowToReveal` mapped pull distance into a full-page stack slide, so the
 *   next screen peeked through during the gesture (unlike PTR / Marvin / Flutter
 *   two-level refresh, which keep the destination hidden until release).
 * - Commit threshold was a fraction of the viewport (~36%), so “almost there”
 *   already looked like a half page change.
 *
 * New model:
 * - At the inner edge, further wheel input accumulates `overflow` with rubber-band
 *   resistance. Only a small displacement is applied to the *current* page.
 * - Destination stays hidden; a gauge + label show progress / “離して…”.
 * - Release past threshold → page transition. Below threshold → spring back.
 * - First contact after a fling into the edge latches (bounce only) so trackpad
 *   momentum does not navigate.
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

/**
 * Raw overflow (px) required to fill the gauge and arm “離して遷移”.
 * Tuned so a deliberate trackpad drag fills the ring gradually — not in one flick.
 */
export const COMMIT_PULL_PX = 140;

/** Asymptotic max visual shift of the current page while pulling. */
export const PULL_RUBBER_DIM = 64;

/** Scale wheel deltaY into overflow so the gauge climbs/drains with scroll effort. */
const WHEEL_SCALE = 0.65;
const DECAY_STREAK = 6;
/** Only treat as “finger up” when deltas are this small (not reverse scrubbing). */
const RELEASE_ABS = 1.25;
const SETTLE_MS = 320;
const TRANSITION_MS = 420;
const REDUCED_TRANSITION_MS = 160;

/**
 * Progress 0→1 toward commit. Based on raw effort (overflow), not the damped
 * visual displacement, so the gauge fills predictably.
 */
export function pullCommitProgress(overflow: number, commitPull = COMMIT_PULL_PX): number {
  if (commitPull <= 0 || overflow <= 0) return 0;
  return Math.min(1, overflow / commitPull);
}

/** Visual page shift for a given overflow (reduced-motion: near-zero). */
export function pullVisualOffset(
  overflow: number,
  reducedMotion: boolean,
  rubberDim = PULL_RUBBER_DIM
): number {
  if (overflow <= 0) return 0;
  if (reducedMotion) return Math.min(overflow * 0.08, 10);
  return rubberBand(overflow, rubberDim, 0.55);
}

/**
 * Soft overflow cap for the momentum edge-latch.
 * Latch still bounces on release; during the pull the gauge may fill up to this
 * so the ring is visible, but cannot quite reach commit (1.0).
 */
export function latchOverflowCap(commitPull = COMMIT_PULL_PX): number {
  return commitPull * 0.92;
}

/**
 * @deprecated Full-page reveal during pull was removed. Kept so older imports
 * resolve; maps overflow to a small rubber offset only.
 */
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

/**
 * Dual-panel stack: settings (top) + licenses (bottom).
 *
 * Pull only rubber-bands the active page. Page changes happen on release
 * (or via {@link goToPage}) as a dedicated stack transition.
 */
export function useSettingsPanelTransition({ page, onPageChange }: Options) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLElement | null>(null);
  const licensesRef = useRef<HTMLElement | null>(null);

  const [viewportH, setViewportH] = useState(0);
  /** Settled stack position + in-flight page-transition offset (px). */
  const [stackOffset, setStackOffset] = useState(0);
  /** Rubber-band shift of the active page only (px, ≥ 0). */
  const [pullOffset, setPullOffset] = useState(0);
  const [progress, setProgress] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [latching, setLatching] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const overflowRef = useRef(0);
  const pullOffsetRef = useRef(0);
  const progressRef = useRef(0);
  const pageRef = useRef(page);
  const onPageChangeRef = useRef(onPageChange);
  const snappingRef = useRef(false);
  const transitioningRef = useRef(false);
  const gestureRef = useRef(false);
  const lastAbsRef = useRef(0);
  const decayStreakRef = useRef(0);
  const animTimerRef = useRef<number | null>(null);
  const wasAtEdgeRef = useRef(false);
  const latchThisGestureRef = useRef(false);
  const reducedMotionRef = useRef(false);

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

  // Keep stack glued to the settled page when not mid-transition.
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

  const resetPullState = useCallback(() => {
    overflowRef.current = 0;
    pullOffsetRef.current = 0;
    progressRef.current = 0;
    setPullOffset(0);
    setProgress(0);
    gestureRef.current = false;
    decayStreakRef.current = 0;
    lastAbsRef.current = 0;
    latchThisGestureRef.current = false;
    setLatching(false);
  }, []);

  useEffect(() => {
    if (transitioningRef.current) return;
    clearAnimTimer();
    resetPullState();
    setSnapping(false);
    snappingRef.current = false;
    wasAtEdgeRef.current = false;
  }, [page, clearAnimTimer, resetPullState]);

  const applyOverflow = useCallback((overflow: number) => {
    const next = Math.max(0, overflow);
    overflowRef.current = next;
    const reduced = reducedMotionRef.current;
    const visual = pullVisualOffset(next, reduced);
    const prog = pullCommitProgress(next);
    pullOffsetRef.current = visual;
    progressRef.current = prog;
    setPullOffset(visual);
    setProgress(prog);
    return { visual, progress: prog };
  }, []);

  const finishTransition = useCallback(
    (next: SettingsPanelPage) => {
      clearAnimTimer();
      transitioningRef.current = false;
      setTransitioning(false);
      snappingRef.current = false;
      setSnapping(false);
      resetPullState();
      wasAtEdgeRef.current = true;
      setStackOffset(next === "licenses" ? viewportH : 0);
      if (pageRef.current !== next) onPageChangeRef.current(next);
      if (next === "licenses") {
        licensesRef.current?.scrollTo({ top: 0 });
      }
    },
    [clearAnimTimer, resetPullState, viewportH]
  );

  const runPageTransition = useCallback(
    (next: SettingsPanelPage) => {
      if (transitioningRef.current) return;
      clearAnimTimer();
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

      setStackOffset(from === "licenses" ? viewportH : 0);
      requestAnimationFrame(() => {
        setStackOffset(target);
      });

      animTimerRef.current = window.setTimeout(() => {
        animTimerRef.current = null;
        finishTransition(next);
      }, duration);
    },
    [clearAnimTimer, finishTransition, resetPullState, viewportH]
  );

  const bouncePullBack = useCallback(() => {
    clearAnimTimer();
    latchThisGestureRef.current = false;
    setLatching(false);
    gestureRef.current = false;

    if (reducedMotionRef.current || pullOffsetRef.current < 0.5) {
      resetPullState();
      setSnapping(false);
      snappingRef.current = false;
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
    }, SETTLE_MS);
  }, [clearAnimTimer, resetPullState]);

  const settleGesture = useCallback(() => {
    if (!gestureRef.current || snappingRef.current || transitioningRef.current) return;
    gestureRef.current = false;

    if (latchThisGestureRef.current) {
      bouncePullBack();
      return;
    }

    if (progressRef.current >= 1) {
      const next: SettingsPanelPage =
        pageRef.current === "settings" ? "licenses" : "settings";
      runPageTransition(next);
      return;
    }

    bouncePullBack();
  }, [bouncePullBack, runPageTransition]);

  /**
   * Sidebar / programmatic navigation. Uses the same stack transition as a
   * committed pull — no mid-gesture page peek.
   */
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
      const abs = Math.abs(dy);
      const currentPage = pageRef.current;
      const active = gestureRef.current || pullOffsetRef.current > 0.5;

      const atSettingsEdge = atBottom(settings);
      const atLicensesEdge = atTop(licenses);
      const atInnerEdge =
        currentPage === "settings" ? atSettingsEdge : atLicensesEdge;

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

      const towardNext =
        (currentPage === "settings" && dy > 0) ||
        (currentPage === "licenses" && dy < 0);

      // Reverse scrub drains the gauge — never treat that as “release”.
      // Only near-zero deltas (finger up / dead momentum) advance the settle streak.
      if (!towardNext && abs >= RELEASE_ABS) {
        decayStreakRef.current = 0;
      } else if (abs < RELEASE_ABS) {
        decayStreakRef.current += 1;
      } else if (
        towardNext &&
        lastAbsRef.current > 0 &&
        abs <= lastAbsRef.current * 0.88
      ) {
        decayStreakRef.current += 1;
      } else {
        decayStreakRef.current = 0;
      }
      lastAbsRef.current = abs;

      const delta = (towardNext ? abs : -abs) * WHEEL_SCALE;
      let nextOverflow = overflowRef.current + delta;
      if (latchThisGestureRef.current) {
        nextOverflow = Math.min(nextOverflow, latchOverflowCap());
      }
      // Allow a little past commit so holding at max feels stable; reverse can drain.
      nextOverflow = Math.min(Math.max(0, nextOverflow), COMMIT_PULL_PX * 1.35);
      applyOverflow(nextOverflow);

      // Gauge drained — exit pull and let the page scroll normally again.
      if (nextOverflow <= 0 && !towardNext) {
        gestureRef.current = false;
        latchThisGestureRef.current = false;
        setLatching(false);
        decayStreakRef.current = 0;
        lastAbsRef.current = 0;
        return;
      }

      if (decayStreakRef.current >= DECAY_STREAK) {
        settleGesture();
      }
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      clearAnimTimer();
    };
  }, [applyOverflow, clearAnimTimer, settleGesture, viewportH]);

  const settledBase = page === "licenses" ? viewportH : 0;
  const pastThreshold = progress >= 1 && !latching;
  const pulling = pullOffset > 0.5 || (snapping && !transitioning);

  return {
    viewportRef,
    settingsRef,
    licensesRef,
    viewportH,
    /** Stack translate — settled page, or animating during page change. */
    stackOffset: transitioning ? stackOffset : settledBase,
    /** Rubber-band shift of the active page only (never peeks the other page). */
    pullOffset,
    progress,
    pulling,
    pastThreshold: pastThreshold || transitioning,
    latching,
    snapping,
    transitioning,
    reducedMotion,
    settleMs: SETTLE_MS,
    transitionMs: reducedMotion ? REDUCED_TRANSITION_MS : TRANSITION_MS,
    goToPage,
  };
}
