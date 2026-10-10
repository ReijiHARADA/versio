import { describe, expect, it } from "vitest";
import { computeAlignedScrollTop } from "../../components/reader/virtualization/sectionScroll";

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
});
