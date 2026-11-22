import { describe, expect, it } from "vitest";
import { boxFromPoints, idsInBox, rangeBetween, usePaperSelectionStore } from "./paperSelectionStore";

describe("paper marquee selection", () => {
  const items = [
    { id: "a", box: { left: 0, top: 0, right: 100, bottom: 140 } },
    { id: "b", box: { left: 120, top: 0, right: 220, bottom: 140 } },
    { id: "c", box: { left: 0, top: 160, right: 100, bottom: 300 } },
  ];

  it("normalises a box dragged up-left", () => {
    expect(boxFromPoints(50, 80, 10, 20)).toEqual({ left: 10, top: 20, right: 50, bottom: 80 });
  });

  it("selects every tile the marquee overlaps", () => {
    expect(idsInBox(boxFromPoints(90, 100, 130, 10), items)).toEqual(["a", "b"]);
    expect(idsInBox(boxFromPoints(105, 145, 115, 155), items)).toEqual([]);
  });

  it("selects a shift-click range in either direction", () => {
    const order = ["a", "b", "c", "d"];
    expect(rangeBetween(order, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeBetween(order, "d", "a")).toEqual(["a", "b", "c", "d"]);
    expect(rangeBetween(order, null, "c")).toEqual(["c"]);
    expect(rangeBetween(order, "gone", "c")).toEqual(["c"]);
  });

  it("toggles and clears", () => {
    const store = usePaperSelectionStore.getState();
    store.select(["a"]);
    usePaperSelectionStore.getState().toggle("b");
    usePaperSelectionStore.getState().toggle("a");
    expect([...usePaperSelectionStore.getState().ids]).toEqual(["b"]);
    usePaperSelectionStore.getState().clear();
    expect(usePaperSelectionStore.getState().ids.size).toBe(0);
  });
});
