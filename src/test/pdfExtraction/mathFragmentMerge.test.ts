import { describe, expect, it } from "vitest";
import type { CanonicalNode } from "../../services/pdfExtraction/canonical/types";
import {
  isDerivativeStackCrumb,
  isInlineMathGlyphCrumb,
  isOrphanMathTailCrumb,
  isSuperscriptBracketCrumb,
  mergeMathematicalDisplayFragments,
  sanitizeMathControls,
} from "../../services/pdfExtraction/resolver/mathFragmentMerge";

function node(
  id: string,
  role: CanonicalNode["role"],
  text: string,
  y: number,
  x = 100,
  width = 200,
): CanonicalNode {
  return {
    id,
    role,
    text,
    pageStart: 2,
    pageEnd: 2,
    boundingBoxes: [{ page: 2, x, y, width, height: 12 }],
    confidence: 0.9,
    evidence: [],
    sourceAnchor: {
      page: 2,
      boundingBoxes: [{ page: 2, x, y, width, height: 12 }],
    },
  };
}

describe("math fragment predicates", () => {
  it("recognizes inline glyphs, stacked derivatives, superscripts, and orphan tails", () => {
    expect(isInlineMathGlyphCrumb("√")).toBe(true);
    expect(isInlineMathGlyphCrumb("Let p")).toBe(false);
    expect(isDerivativeStackCrumb("d")).toBe(true);
    expect(isDerivativeStackCrumb("dγ")).toBe(true);
    expect(isDerivativeStackCrumb("dγ ")).toBe(true);
    expect(isSuperscriptBracketCrumb("[ 2]")).toBe(true);
    expect(isSuperscriptBracketCrumb("[ ∗ 2]")).toBe(true);
    expect(isOrphanMathTailCrumb("γ,γ)")).toBe(true);
  });
});

describe("mergeMathematicalDisplayFragments", () => {
  it("merges stacked d / display / dγ into one numbered equation", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "d", 242, 252, 8),
      node("b", "equation", "I(x; zγ ) = 1/2 mmse(γ). (1)", 247, 262, 240),
      node("c", "paragraph", "dγ", 256, 250, 16),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/^d\/dγ\s+I\(x;/);
    expect(merged[0]?.text).toMatch(/\(1\)\s*$/);
    expect(merged[0]?.evidence.some((e) => e.label === "stacked-derivative-merge")).toBe(true);
  });

  it("reattaches a lone √ glyph to the following paragraph", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "√", 160, 318, 8),
      node(
        "b",
        "paragraph",
        "Let p(zγ |x) be a Gaussian noise channel with zγ = γx + ε",
        166,
        108,
        400,
      ),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.role).toBe("paragraph");
    expect(merged[0]?.text?.startsWith("√")).toBe(true);
    expect(merged[0]?.text).toMatch(/Gaussian noise channel/);
  });

  it("absorbs superscript bracket crumbs into the neighboring equation", () => {
    const before = mergeMathematicalDisplayFragments([
      node("b", "paragraph", "[ 2]", 281, 200, 20),
      node("a", "equation", "‖x − xˆ(zγ , γ)‖ . (2)", 289, 108, 360),
    ]);
    expect(before).toHaveLength(1);
    expect(before[0]?.text).toContain("²");
    expect(before[0]?.role).toBe("equation");

    const after = mergeMathematicalDisplayFragments([
      node("a", "equation", "‖x − xˆ(zγ , γ)‖ . (2)", 289, 108, 360),
      node("b", "paragraph", "[ 2]", 300, 200, 20),
    ]);
    expect(after).toHaveLength(1);
    expect(after[0]?.text).toContain("²");
    expect(after[0]?.role).toBe("equation");
  });

  it("absorbs orphan arg-min tails and promotes numbered display paragraphs", () => {
    const merged = mergeMathematicalDisplayFragments([
      node(
        "a",
        "paragraph",
        "xˆ∗(zγ , γ) ≡ arg minxˆ(z mse(γ) = Ex∼p(x|zγ)[x] (3)",
        347,
        108,
        400,
      ),
      node("b", "paragraph", "γ,γ)", 360, 120, 40),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toContain("γ,γ)");
    expect(merged[0]?.text).toMatch(/\(3\)/);
  });

  it("sanitizes C0 controls used as ε in math prose", () => {
    const dirty = node(
      "a",
      "paragraph",
      "zγ = γx + \u000f and \u000f ∼ N (0, I)",
      166,
    );
    const cleaned = sanitizeMathControls(dirty);
    expect(cleaned.text).toBe("zγ = γx + ε and ε ∼ N (0, I)");
  });
});
