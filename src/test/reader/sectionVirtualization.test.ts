import { describe, expect, it } from "vitest";
import {
  computeMountedSectionIds,
  countMountedBodies,
  estimateSectionBodyHeight,
  sectionIdForBlock,
  sectionsMatchingQuery,
} from "../../components/reader/virtualization/sectionVirtualization";

describe("section virtualization", () => {
  const ids = Array.from({ length: 80 }, (_, i) => `s${i + 1}`);

  it("keeps a head window when nothing is visible yet", () => {
    const mounted = computeMountedSectionIds({
      orderedSectionIds: ids,
      visibleSectionIds: [],
      overscan: 2,
    });
    expect([...mounted]).toEqual(["s1", "s2", "s3"]);
  });

  it("mounts overscan around visible sections and pinned targets", () => {
    const mounted = computeMountedSectionIds({
      orderedSectionIds: ids,
      visibleSectionIds: ["s40"],
      pinnedSectionIds: ["s70"],
      overscan: 2,
    });
    expect(mounted.has("s38")).toBe(true);
    expect(mounted.has("s40")).toBe(true);
    expect(mounted.has("s42")).toBe(true);
    expect(mounted.has("s70")).toBe(true);
    expect(mounted.has("s10")).toBe(false);
    const metric = countMountedBodies(ids.length, mounted.size);
    expect(metric.savedRatio).toBeGreaterThan(0.8);
  });

  it("estimates spacer height from block types", () => {
    expect(
      estimateSectionBodyHeight([
        { type: "paragraph" },
        { type: "figure" },
        { type: "paragraph" },
      ])
    ).toBe(72 + 280 + 72);
  });

  it("resolves section id for a block", () => {
    expect(
      sectionIdForBlock("b2", [
        { id: "b1", sectionId: "s1" },
        { id: "b2", sectionId: "s9" },
      ])
    ).toBe("s9");
  });

  it("pins sections that match a search query", () => {
    const blocksBySection = new Map([
      ["s1", [{ original: "Hello world", translated: "こんにちは" }]],
      ["s2", [{ original: "Unrelated", translated: "無関係" }]],
      ["s3", [{ original: "world model", translated: null }]],
    ]);
    expect(
      sectionsMatchingQuery("world", [{ id: "s1" }, { id: "s2" }, { id: "s3" }], blocksBySection)
    ).toEqual(["s1", "s3"]);
  });
});
