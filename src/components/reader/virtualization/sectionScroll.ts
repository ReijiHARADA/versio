/** Align an element's top with the reader scroll container, honoring scroll-margin-top. */
export function readScrollMarginTop(element: HTMLElement): number {
  const parsed = parseFloat(getComputedStyle(element).scrollMarginTop || "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * IntersectionObserver only reports entries that changed in that frame.
 * Active outline highlighting must therefore keep a persistent intersecting
 * set and pick the earliest section in document order — never
 * `entries.filter(isIntersecting)[0]`, which thrash-jumps the TOC.
 */
export function pickActiveSectionId(
  orderedSectionIds: readonly string[],
  intersectingIds: ReadonlySet<string>
): string | null {
  for (const id of orderedSectionIds) {
    if (intersectingIds.has(id)) return id;
  }
  return null;
}

/** Apply intersection deltas into a mutable set; returns whether membership changed. */
export function applyIntersectionDelta(
  intersectingIds: Set<string>,
  entries: ReadonlyArray<{ target: { id: string }; isIntersecting: boolean }>
): boolean {
  let changed = false;
  for (const entry of entries) {
    const id = entry.target.id.replace(/^section-/, "");
    if (!id) continue;
    if (entry.isIntersecting) {
      if (!intersectingIds.has(id)) {
        intersectingIds.add(id);
        changed = true;
      }
    } else if (intersectingIds.delete(id)) {
      changed = true;
    }
  }
  return changed;
}

export function computeAlignedScrollTop(args: {
  containerScrollTop: number;
  containerViewportTop: number;
  elementViewportTop: number;
  scrollMarginTop: number;
}): number {
  const delta =
    args.elementViewportTop - args.containerViewportTop - args.scrollMarginTop;
  return Math.max(0, args.containerScrollTop + delta);
}

export function scrollTopToAlignElementTop(
  container: HTMLElement,
  element: HTMLElement,
  marginTop = readScrollMarginTop(element)
): number {
  return computeAlignedScrollTop({
    containerScrollTop: container.scrollTop,
    containerViewportTop: container.getBoundingClientRect().top,
    elementViewportTop: element.getBoundingClientRect().top,
    scrollMarginTop: marginTop,
  });
}

export function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function isSectionBodyMounted(sectionId: string): boolean {
  const el = document.getElementById(`section-${sectionId}`);
  return el?.getAttribute("data-section-mounted") === "true";
}

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Where a glide starts. A long jump first skips to one short stretch before the target, so only
 * that stretch animates and the sections in between never mount (virtualized reader).
 */
export function glideStart(current: number, target: number, viewportHeight: number): number {
  const stretch = viewportHeight * 0.6;
  if (Math.abs(target - current) <= stretch * 2) return current;
  return target - Math.sign(target - current) * stretch;
}

export function glideDuration(distance: number): number {
  return Math.min(420, 220 + Math.abs(distance) * 0.25);
}

/**
 * Scroll `container` until the element's top meets the container top (less scroll-margin-top).
 * The target is re-read every frame, so layout shifts from sections mounting mid-glide are followed.
 * After the glide it keeps aligning until `isReady()` and the target has held still for 2 frames
 * (about 1 s at most). `shouldStop()` aborts at any frame (user scroll, a newer jump).
 */
export async function glideToElement(options: {
  container: HTMLElement;
  getElement: () => HTMLElement | null;
  isReady: () => boolean;
  shouldStop: () => boolean;
  animate: boolean;
}): Promise<void> {
  const { container, getElement, isReady, shouldStop, animate } = options;
  let element = getElement();
  for (let frame = 0; !element && frame < 10; frame++) {
    await nextFrame();
    if (shouldStop()) return;
    element = getElement();
  }
  if (!element) return;
  const margin = readScrollMarginTop(element); // read once, not per frame
  const target = () => {
    const el = getElement();
    return el ? scrollTopToAlignElementTop(container, el, margin) : container.scrollTop;
  };

  if (animate) {
    const first = target();
    const from = glideStart(container.scrollTop, first, container.clientHeight);
    container.scrollTop = from;
    const duration = glideDuration(first - from);
    const startedAt = performance.now();
    for (;;) {
      const now = await nextFrame();
      if (shouldStop()) return;
      const progress = Math.min(1, (now - startedAt) / duration);
      container.scrollTop = from + (target() - from) * easeOutCubic(progress);
      if (progress >= 1) break;
    }
  }

  let previous = Number.NaN;
  let stillFrames = 0;
  for (let frame = 0; frame < 60; frame++) {
    const next = target();
    if (Math.abs(next - container.scrollTop) > 0.5) container.scrollTop = next;
    // Compare targets, not scrollTop: near the end of the paper scrollTop clamps short of it.
    stillFrames = isReady() && Math.abs(next - previous) <= 1 ? stillFrames + 1 : 0;
    if (stillFrames >= 2) return;
    previous = next;
    await nextFrame();
    if (shouldStop()) return;
  }
}
