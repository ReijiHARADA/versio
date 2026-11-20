import { describe, expect, it } from "vitest";
import type { CanonicalNode } from "../../services/pdfExtraction/canonical/types";
import { extractKeywords } from "../../services/pdfExtraction/projection/frontMatter/keywords";

const node = (id: string, role: CanonicalNode["role"], text: string, page = 1): CanonicalNode => ({
  id, role, text, pageStart: page, pageEnd: page, boundingBoxes: [], confidence: 0.9, evidence: [],
  sourceAnchor: { page, boundingBoxes: [] },
} as unknown as CanonicalNode);

describe("extractKeywords", () => {
  it("reads a label followed by a list wrapped over several nodes", () => {
    const r = extractKeywords([
      node("a", "other", "KEYWORDS"),
      node("b", "copyright", "gaze following, human-robot interaction,"),
      node("c", "copyright", "joint attention, social robot"),
      node("d", "heading", "1 Introduction"),
    ]);
    expect(r.keywords).toEqual(["gaze following", "human-robot interaction", "joint attention", "social robot"]);
    expect([...r.nodeIds]).toEqual(["a", "b", "c"]);
  });

  it("reads an inline label and joins a hyphen broken across nodes", () => {
    const r = extractKeywords([
      node("a", "copyright", "Keywords: biosignals, medical robotics, open-"),
      node("b", "copyright", "source, social robotics"),
    ]);
    expect(r.keywords).toEqual(["biosignals", "medical robotics", "open-source", "social robotics"]);
  });

  it("skips glued rail labels and sentences that start with the word", () => {
    expect(extractKeywords([node("a", "other", "KEYWORDS COPYRIGHT")]).keywords).toEqual([]);
    expect(extractKeywords([node("a", "paragraph", "Keywords were extracted from each abstract and ranked by frequency.")]).keywords).toEqual([]);
    expect(extractKeywords([
      node("a", "other", "KEYWORDS"),
      node("b", "paragraph", "meaningful interaction, creativity, collaboration, and engagement while addressing ethical, accessibility, and"),
    ]).keywords).toEqual([]);
  });
});
