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

export function alignElementTopInScrollContainer(
  container: HTMLElement,
  element: HTMLElement
): number {
  const next = scrollTopToAlignElementTop(container, element);
  if (Math.abs(next - container.scrollTop) > 0.5) {
    container.scrollTop = next;
  }
  return next;
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
