import { describe, expect, it } from "vitest";
import { blockF1, boundaryF1, characterErrorRate, normalizedEditDistance, readingOrderEditDistance, tableTeds } from "../../evaluation/benchmark/standardMetrics";

describe("standard extraction metrics", () => {
  it("keeps CER and NED distinct and never scores an empty reference", () => {
    expect(characterErrorRate("ab", "abc")).toMatchObject({ value: 1 / 3, evaluated: 3 });
    expect(normalizedEditDistance("ab", "abc")).toMatchObject({ value: 1 / 3, evaluated: 3 });
    expect(characterErrorRate("noise", "").value).toBeNull();
  });
  it("requires one-to-one role and geometry matches for block F1", () => {
    const gold = [{ id: "g", role: "paragraph", region: { page: 1, x: 0, y: 0, width: 10, height: 10 } }];
    const prediction = [{ id: "p", role: "heading", region: { page: 1, x: 0, y: 0, width: 10, height: 10 } }];
    expect(blockF1(prediction, gold)).toMatchObject({ truePositive: 0, falsePositive: 1, falseNegative: 1, f1: 0 });
  });
  it("measures reading order and table structure independently", () => {
    expect(readingOrderEditDistance(["a", "block-102", "block-101"], ["a", "block-101", "block-102"])).toMatchObject({ value: 2 / 3, evaluated: 3 });
    expect(boundaryF1([["a", "c"]], [["a", "b"], ["b", "c"]]).f1).toBe(0);
    expect(tableTeds({ tag: "table", children: [{ tag: "tr" }] }, { tag: "table", children: [{ tag: "tr" }] }).value).toBe(1);
    expect(tableTeds({ tag: "table", children: [{ tag: "td", text: "wrong" }] }, { tag: "table", children: [{ tag: "td", text: "reference" }] }).value).toBeLessThan(1);
  });
});
