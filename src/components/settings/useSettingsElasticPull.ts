import { useCallback, useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 88;
const PULL_MAX = 140;
const WHEEL_SCALE = 0.5;
const IDLE_MS = 110;

function isAtBottom(el: HTMLElement): boolean {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
}

function isAtTop(el: HTMLElement): boolean {
  return el.scrollTop <= 2;
}

/** Rubber-band visual displacement from accumulated pull. */
export function elasticOffset(pull: number): number {
  const t = Math.min(1, Math.max(0, pull) / PULL_MAX);
  return PULL_MAX * (1 - (1 - t) * (1 - t)) * 0.62;
}

type ElasticDirection = "to-licenses" | "to-settings";

type Options = {
  enabled: boolean;
  direction: ElasticDirection;
  onCommit: () => void;
};

/**
 * At the scroll edge, continued wheel/trackpad pull stretches elastically.
 * Releasing past the threshold commits the panel switch.
 */
export function useSettingsElasticPull({ enabled, direction, onCommit }: Options) {
  const rootRef = useRef<HTMLElement | null>(null);
  const pullRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [releasing, setReleasing] = useState(false);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const setPullBoth = useCallback((next: number, animateOut = false) => {
    pullRef.current = next;
    setReleasing(animateOut);
    setPull(next);
  }, []);

  const settle = useCallback(() => {
    const current = pullRef.current;
    if (current >= PULL_THRESHOLD) {
      setPullBoth(0, false);
      onCommitRef.current();
      return;
    }
    if (current > 0) {
      setPullBoth(0, true);
    }
  }, [setPullBoth]);

  useEffect(() => {
    if (!enabled) {
      setPullBoth(0, false);
      return;
    }
    const root = rootRef.current;
    if (!root) return;

    const clearIdle = () => {
      if (idleTimerRef.current != null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const scheduleIdle = () => {
      clearIdle();
      idleTimerRef.current = window.setTimeout(() => {
        idleTimerRef.current = null;
        settle();
      }, IDLE_MS);
    };

    const onWheel = (event: WheelEvent) => {
      const atEdge =
        direction === "to-licenses" ? isAtBottom(root) : isAtTop(root);
      const pullingPast =
        direction === "to-licenses" ? event.deltaY > 0 : event.deltaY < 0;
      const pullingBack =
        direction === "to-licenses" ? event.deltaY < 0 : event.deltaY > 0;

      if (!atEdge && pullRef.current <= 0) return;

      if (atEdge && pullingPast) {
        event.preventDefault();
        const next = Math.min(
          PULL_MAX,
          pullRef.current + Math.abs(event.deltaY) * WHEEL_SCALE
        );
        setPullBoth(next, false);
        if (next >= PULL_MAX) {
          clearIdle();
          setPullBoth(0, false);
          onCommitRef.current();
          return;
        }
        scheduleIdle();
        return;
      }

      if (pullRef.current > 0 && (pullingBack || !atEdge)) {
        event.preventDefault();
        const next = Math.max(
          0,
          pullRef.current - Math.abs(event.deltaY) * WHEEL_SCALE
        );
        setPullBoth(next, false);
        if (next <= 0) {
          clearIdle();
        } else {
          scheduleIdle();
        }
      }
    };

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      clearIdle();
      root.removeEventListener("wheel", onWheel);
    };
  }, [direction, enabled, setPullBoth, settle]);

  useEffect(() => {
    if (!enabled) return;
    setPullBoth(0, false);
  }, [direction, enabled, setPullBoth]);

  const offset = elasticOffset(pull);
  const progress = Math.min(1, pull / PULL_THRESHOLD);

  return {
    rootRef,
    pull,
    offset,
    progress,
    pastThreshold: pull >= PULL_THRESHOLD,
    releasing,
  };
}
