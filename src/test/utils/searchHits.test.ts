import { describe, expect, it } from "vitest";
import { findSearchHitBlockIds } from "../../utils/searchHits";

describe("findSearchHitBlockIds", () => {
  const blocks = [
    { id: "b1", original: "Hello world", translated: "こんにちは世界" },
    { id: "b2", original: "Unrelated", translated: "無関係" },
    { id: "b3", original: null, translated: "world model について" },
  ];

  it("finds blocks by original or translated text", () => {
    expect(findSearchHitBlockIds("world", blocks)).toEqual(["b1", "b3"]);
    expect(findSearchHitBlockIds("無関係", blocks)).toEqual(["b2"]);
  });

  it("returns empty for short queries", () => {
    expect(findSearchHitBlockIds("w", blocks)).toEqual([]);
    expect(findSearchHitBlockIds("  ", blocks)).toEqual([]);
  });
});
