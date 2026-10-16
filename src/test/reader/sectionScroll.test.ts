import { describe, expect, it } from "vitest";
import {
  applyIntersectionDelta,
  computeAlignedScrollTop,
  pickActiveSectionId,
} from "../../components/reader/virtualization/sectionScroll";

describe("sectionScroll", () => {
  it("computes scrollTop so element top sits below scroll-margin", () => {
    const next = computeAlignedScrollTop({
      containerScrollTop: 400,
      containerViewportTop: 100,
      elementViewportTop: 520,
      scrollMarginTop: 48,
    });
    expect(next).toBe(772);
  });

  it("picks the earliest intersecting section in document order", () => {
    expect(
      pickActiveSectionId(["a", "b", "c"], new Set(["c", "b"]))
    ).toBe("b");
    expect(pickActiveSectionId(["a", "b"], new Set())).toBeNull();
  });

  it("merges IntersectionObserver deltas without dropping stable members", () => {
    const intersecting = new Set(["a", "b"]);
    applyIntersectionDelta(intersecting, [
      { target: { id: "section-c" }, isIntersecting: true },
      { target: { id: "section-a" }, isIntersecting: false },
    ]);
    expect([...intersecting].sort()).toEqual(["b", "c"]);
    expect(pickActiveSectionId(["a", "b", "c"], intersecting)).toBe("b");
  });
});
