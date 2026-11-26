import { describe, expect, it } from "vitest";
import { mirrorPath, snapGap, tabCap, TAB_MORPH_GAP } from "./paperTabCap";
import { TAB_CAP_LEFT_FILL, TAB_CAP_RIGHT_FILL, TAB_CAP_WIDTH, TAB_FLARE, TAB_FLUSH_CAP_WIDTH } from "./paperTabShape";

describe("mirrorPath", () => {
  it("is its own inverse", () => {
    expect(mirrorPath(mirrorPath(TAB_CAP_LEFT_FILL, TAB_CAP_WIDTH), TAB_CAP_WIDTH)).toBe(TAB_CAP_LEFT_FILL);
  });
  it("turns the flared left cap into the right cap", () => {
    expect(mirrorPath(TAB_CAP_LEFT_FILL, TAB_CAP_WIDTH)).toBe(TAB_CAP_RIGHT_FILL);
  });
});

describe("snapGap", () => {
  it("is flush on the edge and flared off the card or clear of its corner", () => {
    expect(snapGap(0.3)).toBe(0);
    expect(snapGap(-3)).toBe(Infinity);
    expect(snapGap(TAB_MORPH_GAP)).toBe(Infinity);
    expect(snapGap(5.1)).toBe(5);
  });
});

describe("tabCap", () => {
  it("flares by default on both sides", () => {
    expect(tabCap(Infinity, false)).toMatchObject({ mode: "flared", offset: TAB_FLARE, fill: TAB_CAP_LEFT_FILL });
    expect(tabCap(Infinity, true)).toMatchObject({ mode: "flared", offset: TAB_FLARE, fill: TAB_CAP_RIGHT_FILL });
  });
  it("mirrors the flush and morphing caps on the right", () => {
    const flush = tabCap(0, true);
    expect(flush).toMatchObject({ mode: "flush", offset: 0, width: TAB_FLUSH_CAP_WIDTH });
    expect(flush.fill).toBe(mirrorPath(tabCap(0, false).fill, flush.width));
    const morph = tabCap(8, true);
    expect(morph.mode).toBe("morph");
    expect(morph.fill).toBe(mirrorPath(tabCap(8, false).fill, morph.width));
  });
});
