import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
} from "react";

/**
 * "open" while a surface is shown, "closed" while it plays its exit motion before unmounting,
 * "static" for a child that was already there when an `initial={false}` Presence mounted (no enter motion).
 */
export type MotionState = "open" | "closed" | "static";

const PresenceContext = createContext<MotionState>("open");

/** Exit length for popovers, menus, and sheets. Keep in step with `--motion-exit` in variables.css. */
export const MOTION_EXIT_MS = 160;

/** Exit length for panes (outline, inspector). Keep in step with `--motion-exit-pane`. */
export const MOTION_EXIT_PANE_MS = 260;

/** Motion state of the nearest `<Presence>`; "open" outside one. Put it on the surface as `data-motion`. */
export function useMotionState(): MotionState {
  return useContext(PresenceContext);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Keeps the last rendered child mounted for `exitMs` after it goes away, so it can animate out.
 * Use it like a conditional: `<Presence>{open && <Sheet />}</Presence>`. Inside the child,
 * `useMotionState()` reads "closed" during the exit; the motion CSS keys off `data-motion="closed"`.
 */
export function Presence({
  children,
  exitMs = MOTION_EXIT_MS,
  initial = true,
}: {
  children: ReactNode;
  exitMs?: number;
  /** false: a child present on first render reports "static" so it skips its enter motion. */
  initial?: boolean;
}) {
  const present = children !== null && children !== undefined && children !== false;
  const last = useRef<ReactNode>(null);
  const wasPresent = useRef(present);
  const isStatic = useRef(!initial && present);
  const [exiting, setExiting] = useState(false);
  if (present) last.current = children;

  useEffect(() => {
    if (present) {
      wasPresent.current = true;
      setExiting(false);
      return;
    }
    isStatic.current = false;
    if (!wasPresent.current) return;
    wasPresent.current = false;
    if (exitMs <= 0 || prefersReducedMotion()) {
      last.current = null;
      setExiting(false);
      return;
    }
    setExiting(true);
    const timer = window.setTimeout(() => {
      last.current = null;
      setExiting(false);
    }, exitMs);
    return () => window.clearTimeout(timer);
  }, [present, exitMs]);

  // The render that drops the child still shows the old one (wasPresent is updated in the effect).
  const leaving = !present && (exiting || wasPresent.current);
  return (
    <PresenceContext.Provider value={leaving ? "closed" : isStatic.current ? "static" : "open"}>
      {present ? children : leaving ? last.current : null}
    </PresenceContext.Provider>
  );
}

/**
 * A `<div>` that carries the nearest Presence's `data-motion`. Being its own component, it updates
 * during the exit even though Presence re-renders a cached copy of its child element.
 */
export function MotionDiv(props: ComponentPropsWithRef<"div">) {
  return <div {...props} data-motion={useMotionState()} />;
}

/** `<section>` variant of MotionDiv. */
export function MotionSection(props: ComponentPropsWithRef<"section">) {
  return <section {...props} data-motion={useMotionState()} />;
}

/** `<aside>` variant of MotionDiv. */
export function MotionAside(props: ComponentPropsWithRef<"aside">) {
  return <aside {...props} data-motion={useMotionState()} />;
}

/** `<p>` variant of MotionDiv. */
export function MotionP(props: ComponentPropsWithRef<"p">) {
  return <p {...props} data-motion={useMotionState()} />;
}
