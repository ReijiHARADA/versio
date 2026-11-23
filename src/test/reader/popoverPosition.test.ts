import { describe, expect, it } from "vitest";
import { clampPopoverPosition, isAnchorInBounds } from "../../components/reader/memo/popoverPosition";

const viewport = { width: 1000, height: 800 };

describe("clampPopoverPosition", () => {
  it("places the popover below a mid-screen selection", () => {
    const placed = clampPopoverPosition(
      { top: 200, left: 400, width: 80, height: 20 },
      { width: 320, height: 160 },
      viewport
    );
    expect(placed.top).toBe(228);
    expect(placed.left).toBeGreaterThanOrEqual(12);
    expect(placed.left + 320).toBeLessThanOrEqual(988);
  });

  it("flips above when there is no room below", () => {
    const placed = clampPopoverPosition(
      { top: 720, left: 400, width: 80, height: 20 },
      { width: 320, height: 160 },
      viewport
    );
    expect(placed.top).toBeLessThan(720);
    expect(placed.top + 160).toBeLessThanOrEqual(720);
  });

  it("keeps the popover inside the viewport near the right edge", () => {
    const placed = clampPopoverPosition(
      { top: 120, left: 940, width: 40, height: 16 },
      { width: 320, height: 160 },
      viewport
    );
    expect(placed.left + 320).toBeLessThanOrEqual(988);
    expect(placed.left).toBeGreaterThanOrEqual(12);
  });

  it("stays inside a pane that starts below the viewport top", () => {
    const pane = { top: 130, left: 290, width: 640, height: 600 };
    const placed = clampPopoverPosition(
      { top: 120, left: 400, width: 80, height: 20 },
      { width: 320, height: 160 },
      pane
    );
    expect(placed.top).toBeGreaterThanOrEqual(142);
    expect(placed.left).toBeGreaterThanOrEqual(302);
  });

  it("reports an anchor scrolled above the pane as out of bounds", () => {
    const pane = { top: 130, left: 0, width: 640, height: 600 };
    expect(isAnchorInBounds({ top: 100, left: 0, width: 80, height: 20 }, pane)).toBe(false);
    expect(isAnchorInBounds({ top: 125, left: 0, width: 80, height: 20 }, pane)).toBe(true);
  });
});
