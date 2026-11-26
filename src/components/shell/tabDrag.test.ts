import { describe, expect, it } from "vitest";
import { clampDx, crossDropIndex, crossInsertBefore, reorderTarget } from "./tabDrag";
import type { TabKey } from "../../stores/paperTabsStore";

// Four 100px tabs with 10px gaps: a b | c d (a, b over the left card in split view).
const slots = [0, 110, 220, 330].map((left) => ({ left, width: 100 }));
const keys = ["paper:a", "paper:b", "paper:c", "paper:d"] as TabKey[];
const left = new Set<TabKey>(["paper:a", "paper:b"]);
const all = () => true;

describe("clampDx", () => {
  it("keeps the tab inside the strip", () => {
    expect(clampDx(slots, 1, -500)).toBe(-110);
    expect(clampDx(slots, 1, 500)).toBe(220);
    expect(clampDx(slots, 1, 30)).toBe(30);
  });
});

describe("reorderTarget", () => {
  it("passes a neighbour once the leading edge crosses its middle", () => {
    expect(reorderTarget(slots, 0, 59, all)).toBe(0);
    expect(reorderTarget(slots, 0, 61, all)).toBe(1);
    expect(reorderTarget(slots, 3, -330, all)).toBe(0);
  });
  it("never passes a tab of the other group", () => {
    const inGroup = (i: number) => left.has(keys[i]);
    expect(reorderTarget(slots, 0, 330, inGroup)).toBe(1);
    const right = (i: number) => !left.has(keys[i]);
    expect(reorderTarget(slots, 3, -330, right)).toBe(2);
  });
});

describe("crossInsertBefore", () => {
  const inLeft = (key: TabKey) => left.has(key);
  it("lands before the first target tab whose middle is right of the pointer", () => {
    expect(crossInsertBefore(keys, slots, "paper:d", 20, inLeft)).toBe("paper:a");
    expect(crossInsertBefore(keys, slots, "paper:d", 120, inLeft)).toBe("paper:b");
  });
  it("lands after the group's last tab past its middle", () => {
    expect(crossInsertBefore(keys, slots, "paper:d", 200, inLeft)).toBeNull();
  });
});

describe("crossDropIndex", () => {
  const inLeft = (key: TabKey) => left.has(key);
  it("indexes the list without the dragged tab", () => {
    expect(crossDropIndex(keys, "paper:d", "paper:b", inLeft)).toBe(1);
    expect(crossDropIndex(keys, "paper:d", null, inLeft)).toBe(2);
  });
  it("keeps the order when the target group is empty", () => {
    expect(crossDropIndex(keys, "paper:d", null, () => false)).toBe(-1);
  });
});
