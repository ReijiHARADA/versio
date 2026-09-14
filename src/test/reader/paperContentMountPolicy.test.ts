import { describe, expect, it } from "vitest";
import {
  computeMountedSectionIds,
  expectedMountBound,
  resolveTransientMountPins,
  shouldVirtualizeSections,
  simulateTransientJumpMountCounts,
} from "../../components/reader/virtualization/sectionVirtualization";

describe("PaperContent mount policy", () => {
  const ids = Array.from({ length: 80 }, (_, i) => `s${i + 1}`);
  const refSectionId = "s75";

  it("virtualizes long papers with many blocks even when section count is small", () => {
    expect(shouldVirtualizeSections(8, 200)).toBe(true);
    expect(shouldVirtualizeSections(12, 80)).toBe(false);
    expect(shouldVirtualizeSections(13, 10)).toBe(true);
  });

  it("does not permanently pin reference sections (regression guard)", () => {
    const visible = ["s5"];
    const withTransientOnly = computeMountedSectionIds({
      orderedSectionIds: ids,
      visibleSectionIds: visible,
      pinnedSectionIds: resolveTransientMountPins([]),
      overscan: 2,
    });
    const withPermanentRefPin = computeMountedSectionIds({
      orderedSectionIds: ids,
      visibleSectionIds: visible,
      pinnedSectionIds: resolveTransientMountPins([refSectionId]),
      overscan: 2,
    });
    expect(withTransientOnly.has(refSectionId)).toBe(false);
    expect(withPermanentRefPin.has(refSectionId)).toBe(true);
    // Old behavior pinned every references section forever; viewport-only must stay small.
    expect(withTransientOnly.size).toBeLessThanOrEqual(expectedMountBound(ids.length, 2));
  });

  it("does not pin all search-match sections at once", () => {
    const searchMatches = ["s10", "s20", "s30", "s40", "s50", "s60"];
    const viewportOnly = computeMountedSectionIds({
      orderedSectionIds: ids,
      visibleSectionIds: ["s5"],
      pinnedSectionIds: resolveTransientMountPins([]),
      overscan: 2,
    });
    const allSearchPinned = computeMountedSectionIds({
      orderedSectionIds: ids,
      visibleSectionIds: ["s5"],
      pinnedSectionIds: resolveTransientMountPins(searchMatches),
      overscan: 2,
    });
    expect(viewportOnly.size).toBeLessThanOrEqual(expectedMountBound(ids.length, 2));
    expect(allSearchPinned.size).toBeGreaterThan(viewportOnly.size);
  });

  it("keeps mounted section count bounded after 50+ jumps", () => {
    const jumps = Array.from({ length: 60 }, (_, i) => ids[(i * 7) % ids.length]);
    const { maxMounted } = simulateTransientJumpMountCounts({
      orderedSectionIds: ids,
      jumpTargetSectionIds: jumps,
      overscan: 2,
    });
    expect(maxMounted).toBeLessThanOrEqual(expectedMountBound(ids.length, 2));
    expect(maxMounted).toBeLessThan(20);
  });
});
