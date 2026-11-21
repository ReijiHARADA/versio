import { describe, expect, it } from "vitest";
import {
  applyIntersectionDelta,
  computeAlignedScrollTop,
  easeOutCubic,
  glideDuration,
  glideStart,
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

  it("glides short jumps from where the reader is", () => {
    expect(glideStart(1000, 1500, 800)).toBe(1000);
    expect(glideStart(1500, 1000, 800)).toBe(1500);
  });

  it("skips most of a long jump and glides only the last stretch", () => {
    expect(glideStart(0, 20000, 800)).toBe(20000 - 480);
    expect(glideStart(20000, 0, 800)).toBe(480);
  });

  it("caps the glide duration and eases to the end", () => {
    expect(glideDuration(0)).toBe(220);
    expect(glideDuration(-480)).toBe(340);
    expect(glideDuration(5000)).toBe(420);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });
});
