import { describe, expect, it } from "vitest";
import type { CanonicalNode } from "../../services/pdfExtraction/canonical/types";
import {
  isBareEquationNumber,
  isDerivativeStackCrumb,
  isIndexedEquationNumber,
  isInlineMathGlyphCrumb,
  isOrphanMathTailCrumb,
  isOrphanOperatorIndexCrumb,
  isSuperscriptBracketCrumb,
  mergeMathematicalDisplayFragments,
  normalizeLinearStackedDerivative,
  sanitizeMathControls,
  scrubUnderbraceLabelDebris,
  stripTrailingOrphanMathTail,
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
    expect(isBareEquationNumber("(21)")).toBe(true);
    expect(isBareEquationNumber("(3) remaining")).toBe(false);
    expect(isBareEquationNumber("(0)")).toBe(false);
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
    // Crumb is absorbed then stripped before English prose (not left as `√ Let…`).
    expect(merged[0]?.text).toMatch(/^Let p\(zγ/);
    expect(merged[0]?.text).toMatch(/Gaussian noise channel/);
    expect(merged[0]?.text).not.toMatch(/^√/);
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

  it("scrubs underbrace debris and strips orphan tails after the equation number", () => {
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
    expect(merged[0]?.text).not.toMatch(/γ\s*,\s*γ\)\s*$/);
    expect(merged[0]?.text).toMatch(/arg\s*min/i);
    expect(merged[0]?.text).toMatch(/\(3\)\s*$/);
  });

  it("normalizes linearized stacked derivatives and detaches a trailing integral", () => {
    expect(
      normalizeLinearStackedDerivative(
        "d DKL[p(zγ |x) ‖ p(zγ )] = 1/2 mmse(x, γ) (4) dγ ∫",
      ),
    ).toBe("d/dγ DKL[p(zγ |x) ‖ p(zγ )] = 1/2 mmse(x, γ) (4) ∫");
    expect(stripTrailingOrphanMathTail("…[x] (3)γ,γ)")).toMatch(/\(3\)\s*$/);
    expect(scrubUnderbraceLabelDebris("mmse(γ) ≡ xˆ(minzγ,γ) Ep(zγ,x) ‖x‖")).toMatch(
      /≡\s*Ep\(zγ,x\)/,
    );

    const merged = mergeMathematicalDisplayFragments([
      node(
        "a",
        "paragraph",
        "d DKL[p(zγ |x) ‖ p(zγ )] = 1/2 mmse(x, γ) (4) dγ ∫",
        496,
        218,
        280,
      ),
      node(
        "b",
        "paragraph",
        "The marginal is p(zγ ) = p(zγ |x)p(x)dx",
        530,
        108,
        400,
      ),
    ]);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/^d\/dγ\s+DKL/);
    expect(merged[0]?.text).toMatch(/\(4\)\s*$/);
    expect(merged[0]?.text).not.toMatch(/∫/);
    expect(merged[1]?.text).toMatch(/=\s*∫\s*p\s*\(/);
    expect(merged[1]?.text).not.toMatch(/^∫/);
  });

  it("sanitizes C0 controls used as ε, matrix ellipsis, and overlines", () => {
    const dirty = node(
      "a",
      "paragraph",
      "zγ = γx + \u000f and \u000f ∼ N (0, I)",
      166,
    );
    const cleaned = sanitizeMathControls(dirty);
    expect(cleaned.text).toBe("zγ = γx + ε and ε ∼ N (0, I)");

    const matrix = sanitizeMathControls(
      node("m", "paragraph", "B11 B12 \u0004 \u0004 \u0004 B1m", 200),
    );
    expect(matrix.text).toMatch(/B12\s*⋯\s*B1m/);
    expect(matrix.text).not.toMatch(/\u0004/);

    const spaceGroup = sanitizeMathControls(
      node("s", "paragraph", "cubic, F43\u0016 m symmetry", 220),
    );
    expect(spaceGroup.text).toMatch(/F43\u0304m/);
    expect(spaceGroup.text).not.toMatch(/\u0016/);

    const ratio = sanitizeMathControls(node("r", "paragraph", "EGB \u0001 Ebulk", 240));
    expect(ratio.text).toBe("EGB / Ebulk");
    const wrapped = sanitizeMathControls(node("w", "paragraph", "\u0012 \u0013 Ea", 260));
    expect(wrapped.text).toBe("(Ea)");
    const eth = sanitizeMathControls(
      node("e", "equation", "∇ · qðxÞ = 0, ð14Þ", 280),
    );
    expect(eth.text).toMatch(/\(14\)\s*$/);
    expect(eth.text).toMatch(/q\(x\)/);
    const greek = sanitizeMathControls(node("g", "paragraph", "lðθÞ = wE + wF", 300));
    expect(greek.text).toBe("l(θ) = wE + wF");
    const open = sanitizeMathControls(node("o", "paragraph", "Xl = vil: ð19", 320));
    expect(open.text).toBe("Xl = vil: (19)");
  });

  it("promotes a numbered display when a leading ∫ glyph crumb is glued on", () => {
    const merged = mergeMathematicalDisplayFragments([
      // Glyph sits inside the following body's x-span (native PDF layout).
      node("g", "paragraph", "∫", 200, 112, 8),
      node(
        "b",
        "paragraph",
        "gxi (at) ∪ gxj (at) = c sxi,ck (at) ∪ sxj,ck (at) (9)",
        204,
        110,
        320,
      ),
      node("c", "paragraph", "where the granule union is taken pointwise.", 240, 100, 300),
    ]);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/^∫/);
    expect(merged[0]?.text).toMatch(/\(9\)\s*$/);
    expect(merged[0]?.evidence.some((e) => e.label === "inline-math-glyph-display")).toBe(true);
  });

  it("reattaches a bare number to a piecewise cases display", () => {
    const merged = mergeMathematicalDisplayFragments([
      node(
        "a",
        "paragraph",
        "r(t) = 0.01 if the ball is in the 2 x 2 most central foveal patches",
        570,
        70,
        300,
      ),
      node(
        "b",
        "paragraph",
        "-0.05 if the ball is in the fovea, but not in one of the 2 x 2 -0.1 if the ball is outside of fovea",
        595,
        80,
        280,
      ),
      node("n", "paragraph", "(6)", 633, 280, 24),
      node("c", "paragraph", "The foveal controller has two branches.", 670, 60, 300),
    ]);
    expect(merged.some((n) => n.role === "equation" && /\(6\)\s*$/.test(n.text ?? ""))).toBe(true);
    expect(merged.some((n) => (n.text ?? "").trim() === "(6)")).toBe(false);
  });

  it("reattaches a right-column bare number across stacked-fraction crumbs", () => {
    const merged = mergeMathematicalDisplayFragments([
      node(
        "eq",
        "equation",
        "μθ(xt, t) = √ xt – √ ϵθ(xt, t) σt = βt := βt.",
        600,
        160,
        280,
      ),
      node("h", "heading", "1 – βt 1 – α¯t 1 – α¯t", 610, 214, 120),
      node("n", "paragraph", "(3)", 615, 560, 24),
      node("p", "paragraph", "In the final generation step the variance is set to zero.", 640, 36, 400),
    ]);
    expect(merged.some((n) => n.role === "equation" && /\(3\)\s*$/.test(n.text ?? ""))).toBe(true);
    expect(merged.some((n) => (n.text ?? "").trim() === "(3)")).toBe(false);
  });

  it("merges a summation index line i (1) onto the preceding display", () => {
    expect(isIndexedEquationNumber("i (1)")).toBe(true);
    const merged = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "∑ A(m, t) = log [t – t(i)]–d(i)", 276, 300, 220),
      node("b", "paragraph", "i (1)", 298, 311, 40),
      node("c", "paragraph", "Where t(i) is the creation time of the i-th trace.", 320, 36, 400),
    ]);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/^∑_i\s+A\(m/);
    expect(merged[0]?.text).toMatch(/\(1\)\s*$/);
    expect(merged).toHaveLength(2);
  });

  it("reattaches a right-column bare number to a weighted-sum display", () => {
    const merged = mergeMathematicalDisplayFragments([
      node(
        "a",
        "paragraph",
        "L(x) = 0.22f1 + 0.18f2 + 0.12f3 + 0.08f4 + 0.15f5 + 0.12f6 + 0.13f7,",
        700,
        300,
        220,
      ),
      node("b", "paragraph", "(13)", 715, 520, 24),
      node("c", "paragraph", "augmented by quadratic penalties.", 730, 300, 280),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/\(13\)\s*$/);
    expect(merged[0]?.evidence.some((e) => e.label === "bare-equation-number-merge")).toBe(true);
  });

  it("strips leading orphan √/∫ before English prose", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "√ Let p(zγ |x) be a Gaussian noise channel.", 100, 100, 360),
      node("b", "paragraph", "∫ The marginal is p(zγ ) = ∫ p(zγ |x)p(x)dx.", 140, 100, 360),
      node(
        "c",
        "paragraph",
        "∫ Note that the symbol “ ” in this context represents the union",
        180,
        100,
        360,
      ),
      node(
        "d",
        "paragraph",
        "√ A threshold fT = p · fmax is applied to exclude noise.",
        220,
        100,
        360,
      ),
    ]);
    expect(merged[0]?.text).toMatch(/^Let p\(zγ/);
    expect(merged[0]?.text).not.toMatch(/^√/);
    expect(merged[1]?.text).toMatch(/^The marginal is/);
    expect(merged[1]?.text).toMatch(/=\s*∫\s*p\s*\(/);
    expect(merged[1]?.text).not.toMatch(/^∫/);
    expect(merged[2]?.text).toMatch(/^Note that the symbol/);
    expect(merged[2]?.text).not.toMatch(/^∫/);
    expect(merged[3]?.text).toMatch(/^A threshold fT/);
    expect(merged[3]?.text).not.toMatch(/^√/);
  });

  it("promotes a single-line table-tagged numbered display and merges bare (n)", () => {
    const merged = mergeMathematicalDisplayFragments([
      node(
        "a",
        "table",
        "H′esm = Transformerseq (WprojH⊤esm)⊤ , H′esm ∈ RL×256",
        200,
        100,
        280,
      ),
      node("b", "paragraph", "(1)", 210, 420, 24),
      node("c", "table", "ai = w⊤attn tanh(Wattnh′i + battn) (2)", 250, 100, 280),
      node("d", "paragraph", "where ai is the attention weight.", 290, 100, 300),
    ]);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/\(1\)\s*$/);
    expect(merged[1]?.role).toBe("equation");
    expect(merged[1]?.text).toMatch(/\(2\)\s*$/);
    expect(merged.some((n) => (n.text ?? "").trim() === "(1)")).toBe(false);
  });

  it("promotes a numbered × exp display fragment", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "× exp(–Pmix,Clj ) (4)", 200, 100, 180),
      node("b", "paragraph", "where Pmix is the mixing probability.", 240, 100, 300),
    ]);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/\(4\)\s*$/);
  });

  it("promotes a numbered assignment display that has a single equals sign", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "yˆ = g(fR(R), fD(D), fC (C)) (2)", 200, 100, 280),
      node("b", "paragraph", "where g is a fusion head.", 230, 100, 300),
    ]);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/\(2\)\s*$/);
    expect(merged[0]?.evidence.some((e) => e.label === "numbered-display-equation")).toBe(true);
  });

  it("promotes numbered relation displays that lack an equals sign", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "f : S → ˆI (13)", 200, 100, 160),
      node("b", "paragraph", "Pe ≥ (15)", 240, 100, 120),
      node("c", "paragraph", "yˆi ∼ Pdraft(yi|ˆy<i, Ptotal) (7)", 280, 100, 220),
      node("d", "paragraph", "SmoothL1 p^p, t, b, pp, t, b (6)", 320, 100, 200),
      node("e", "paragraph", "where Pe is the error probability.", 360, 100, 300),
    ]);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/\(13\)\s*$/);
    expect(merged[1]?.role).toBe("equation");
    expect(merged[1]?.text).toMatch(/\(15\)\s*$/);
    expect(merged[2]?.role).toBe("equation");
    expect(merged[2]?.text).toMatch(/\(7\)\s*$/);
    expect(merged[3]?.role).toBe("equation");
    expect(merged[3]?.text).toMatch(/\(6\)\s*$/);
  });

  it("promotes a heading-tagged numbered display to equation", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "heading", "SNRA = P A (15)", 200, 100, 160),
      node("b", "paragraph", "where SNRA is the signal-to-noise ratio.", 240, 100, 300),
    ]);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/\(15\)\s*$/);
  });

  it("promotes a footnote-tagged numbered display to equation", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "footnote", "0 if Ltm ≤ Lmax Clmt = Ltm−Lmax (38)", 200, 100, 220),
      node("b", "paragraph", "where Clmt is the climate index.", 240, 100, 300),
    ]);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/\(38\)\s*$/);
  });

  it("demotes repeated radical-only crumbs away from equation", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "equation", "√ √ √ √", 200, 100, 80),
      node("b", "paragraph", "where the radical marks omitted matrix entries.", 240, 100, 300),
    ]);
    expect(merged[0]?.role).toBe("other");
    expect(merged[0]?.evidence.some((e) => e.label === "radical-crumb-demotion")).toBe(true);
  });

  it("promotes unnumbered ∑/∫ display lines without inventing a number", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "∑ X′i = w˜ ijX[j, ·]. j∈Nk(i)", 200, 100, 240),
      node("b", "paragraph", "where the weights are row-normalized.", 240, 100, 300),
    ]);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).not.toMatch(/\(\s*\d/);
    expect(
      merged[0]?.evidence.some((e) => e.label === "unnumbered-operator-display-equation"),
    ).toBe(true);
    expect(merged[1]?.role).toBe("paragraph");
  });

  it("normalizes vulgar-fraction equals and promotes the numbered Softmax display", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "^y ¼ Softmax(Wzatt þ b), (11)", 200, 100, 220),
      node("b", "paragraph", "where Softmax is applied row-wise.", 240, 100, 300),
    ]);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/=\s*Softmax/);
    expect(merged[0]?.text).toMatch(/Wzatt\s*\+\s*b/);
    expect(merged[0]?.text).not.toMatch(/¼|þ/);
    expect(merged[0]?.text).toMatch(/\(11\)\s*$/);
  });

  it("promotes eth-wrapped equation numbers after sanitize-before-merge", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "D = D0 exp ð3Þ", 200, 100, 200),
      node("b", "paragraph", "MSD t() = ri (0) ri ()t , ð1Þ", 240, 100, 220),
      node(
        "c",
        "paragraph",
        "Sustained response index = PSTH area Late=PSTH area Early ð4Þ",
        280,
        100,
        320,
      ),
      node("d", "paragraph", "where D0 is a prefactor.", 320, 100, 300),
    ]);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/\(3\)\s*$/);
    expect(merged[1]?.role).toBe("equation");
    expect(merged[1]?.text).toMatch(/\(1\)\s*$/);
    expect(merged[2]?.role).toBe("equation");
    expect(merged[2]?.text).toMatch(/\(4\)\s*$/);
    expect(merged.every((n) => !/[ðþÐÞ]/.test(n.text ?? ""))).toBe(true);
  });

  it("sanitizes eth-wrapped equation numbers before numbered-display promotion", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "MSD t() = ri (0) ri ()t , ð1Þ", 200, 100, 280),
      node("b", "paragraph", "D = D0 exp ð3", 240, 100, 200),
      node(
        "c",
        "paragraph",
        "Sustained response index = PSTH area Late=PSTH area Early ð4Þ",
        280,
        100,
        320,
      ),
    ]);
    expect(merged).toHaveLength(3);
    expect(merged.every((n) => n.role === "equation")).toBe(true);
    expect(merged[0]?.text).toMatch(/\(1\)\s*$/);
    expect(merged[1]?.text).toMatch(/\(3\)\s*$/);
    expect(merged[2]?.text).toMatch(/\(4\)\s*$/);
    expect(merged[0]?.text).not.toMatch(/[ðþÐÞ]/);
  });

  it("consumes orphan operator-index crumbs under min/max displays", () => {
    expect(isOrphanOperatorIndexCrumb("i i")).toBe(true);
    const merged = mergeMathematicalDisplayFragments([
      node(
        "a",
        "equation",
        "AAI = min xij, if j ∈ B and max xij, if j ∈ C (13)",
        597,
        138,
        340,
      ),
      node("b", "paragraph", "i i", 603, 176, 90),
      node("c", "paragraph", "where B and C are benefit and cost criteria.", 650, 118, 360),
    ]);
    expect(merged.some((n) => (n.text ?? "").trim() === "i i")).toBe(false);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/\(13\)\s*$/);
    expect(merged[0]?.text).not.toMatch(/\bi i\b/);
    expect(
      merged[0]?.evidence.some((e) => e.label === "orphan-operator-index-consume"),
    ).toBe(true);
  });

  it("reattaches a bare equation number to the preceding display formula", () => {
    const merged = mergeMathematicalDisplayFragments([
      node(
        "a",
        "equation",
        "SGENESISi (w) = w1Sintegrityi + w2Sentropyi + w3Sstructurali + w4Sethicsi",
        660,
        310,
        200,
      ),
      node("b", "paragraph", "(37)", 677, 531, 24),
      node("c", "paragraph", "where w = [w1, w2, w3, w4] are non-negative weights.", 700, 100, 400),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/\(37\)\s*$/);
    expect(merged[0]?.evidence.some((e) => e.label === "bare-equation-number-merge")).toBe(true);
    expect(merged[1]?.role).toBe("paragraph");
    // Do not invent a link when the formula already has a number.
    const alreadyNumbered = mergeMathematicalDisplayFragments([
      node("a", "equation", "Pfp ≤ 1 − e−kn/m (6)", 200, 100, 200),
      node("b", "paragraph", "(7)", 210, 400, 20),
    ]);
    expect(alreadyNumbered).toHaveLength(2);
    expect(alreadyNumbered[0]?.text).toMatch(/\(6\)\s*$/);
    expect(alreadyNumbered[1]?.text).toBe("(7)");
  });

  it("reattaches (n) to a Hadamard-product display using ⊙", () => {
    const merged = mergeMathematicalDisplayFragments([
      node(
        "a",
        "paragraph",
        "( c ) ( c ) Tcross = tanh LN(hseq)Wseq ⊙ tanh LN(hstr)Wstr ,",
        98.2,
        247.3,
        160.1,
      ),
      node("b", "paragraph", "(12)", 110.6, 558.2, 17.8),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/⊙/);
    expect(merged[0]?.text).toMatch(/\(12\)\s*$/);
  });

  it("promotes ∏…=… displays and reattaches a trailing bare (n)", () => {
    const merged = mergeMathematicalDisplayFragments([
      node(
        "a",
        "paragraph",
        "( ) ∏n ( ∣ ) P X1, X2, . . . , Xn = P Xi∣parent(Xi)",
        445.8,
        226.4,
        167.5,
      ),
      node("b", "paragraph", "(4)", 471.9, 563.8, 12.2),
      node("c", "paragraph", "i=1", 470.4, 308.1, 9.5),
    ]);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/\(4\)\s*$/);
    expect(merged[0]?.text).toMatch(/∏/);
  });

  it("reattaches orphan ∫ into a numbered dt efficiency equation", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "other", "∫ T", 640, 250, 20),
      node("b", "footnote", "1 sim PPV (t)", 650, 250, 40),
      node("c", "equation", "η = dt × 100 (42)", 660, 200, 120),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/=\s*∫/);
    expect(merged[0]?.text).toMatch(/\(42\)\s*$/);
    expect(
      merged[0]?.evidence.some((e) => e.label === "orphan-integral-dt-merge"),
    ).toBe(true);
  });

  it("reattaches a bare (n) painted before its unnumbered display body", () => {
    // epmc-robust-but-independent… p12: `(4)` then `GMV β0…`.
    const merged = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "Model 4", 248, 62, 40),
      node("b", "paragraph", "(4)", 254, 285, 16),
      node(
        "c",
        "paragraph",
        "GMV β0(intercept) + β1(Sex) + β2(Age) + β3(total GMV)",
        261,
        63,
        220,
      ),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.role).toBe("paragraph");
    expect(merged[0]?.text).toBe("Model 4");
    expect(merged[1]?.role).toBe("equation");
    expect(merged[1]?.text).toMatch(/\(4\)\s*$/);
    expect(merged[1]?.text).toMatch(/^GMV/);
    expect(
      merged[1]?.evidence.some((e) => e.label === "bare-equation-number-forward-merge"),
    ).toBe(true);
  });

  it("demotes decision-tree comparison crumbs painted as equations", () => {
    const merged = mergeMathematicalDisplayFragments([
      node("a", "equation", "≥ = ==", 408, 280, 40),
      node("b", "equation", "≥ yes AND Weight=", 520, 280, 80),
      node("c", "paragraph", "Induced rules from CN2 model for target class", 560, 100, 300),
    ]);
    expect(merged.every((n) => n.role !== "equation" || !/^[≥≤]/.test(n.text ?? ""))).toBe(true);
    expect(merged[0]?.role).toBe("other");
    expect(merged[1]?.role).toBe("other");
    expect(merged[0]?.evidence.some((e) => e.label === "rule-debris-demotion")).toBe(true);
  });

  it("promotes ∥…∥ numbered norms and merges an empty-bar opener", () => {
    // epmc-coropinn p6: `Di = ∥ ∥` + `∥ ∂xti ∥2 (5)` (pdf.js uses U+2225).
    const merged = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "Di = ∥ ∥", 115.3, 274.2, 40),
      node("b", "paragraph", "∥ ∂xti ∥2 (5)", 119.1, 295.2, 80),
      node(
        "c",
        "paragraph",
        "Here, i indexes a sampling point, t indexes the training iteration.",
        150.1,
        36,
        400,
      ),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/^Di\s*=\s*∥/);
    expect(merged[0]?.text).toMatch(/\(5\)\s*$/);
    expect(
      merged[0]?.evidence.some((e) => e.label === "incomplete-norm-opener-merge"),
    ).toBe(true);
    // Body alone still promotes when the opener is absent.
    const bodyOnly = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "∥ ∂xti ∥2 (5)", 119.1, 295.2, 80),
    ]);
    expect(bodyOnly).toHaveLength(1);
    expect(bodyOnly[0]?.role).toBe("equation");
  });

  it("reattaches (n) to a kinetics line mis-tagged as heading", () => {
    // epmc-physiology … p9: δCaSR… painted as heading + bare (17).
    const merged = mergeMathematicalDisplayFragments([
      node("a", "heading", "δCaSR,PTH + [Ca]γCaSR,PTH", 696.8, 360.8, 96.7),
      node("b", "paragraph", "(17)", 704.5, 558.2, 17.8),
      node(
        "c",
        "paragraph",
        "PTH concentration ([PTH]) in the blood is modeled by",
        756,
        48,
        236,
      ),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/\(17\)\s*$/);
    expect(merged[0]?.evidence.some((e) => e.label === "bare-equation-number-merge")).toBe(true);
    // Layer superscript `(0)` must not be treated as a display number.
    const layerZero = mergeMathematicalDisplayFragments([
      node("a", "equation", "h = σ W h + b , (22)", 520, 283, 71),
      node("b", "paragraph", "(0)", 561, 204, 8),
      node("c", "paragraph", "where σ(·) is the ReLU function and h = x.", 564, 36, 466),
    ]);
    expect(layerZero).toHaveLength(3);
    expect(layerZero[1]?.text).toBe("(0)");
  });

  it("reattaches (n) to a stacked function-call fraction painted as paragraph", () => {
    // epmc-disentangling … p9: CV as juxtaposed d(site…)/d(…) lines + bare (12).
    const merged = mergeMathematicalDisplayFragments([
      node(
        "a",
        "paragraph",
        "d(site(II), Li(II)) + d(site(III), Li(III)) d(site(I), Li(II)) d(site(II), Li(III))",
        372.7,
        317.1,
        233.2,
      ),
      node("b", "paragraph", "(12)", 385.7, 548.1, 13.2),
      node(
        "c",
        "paragraph",
        "where d(A, B) denotes the distance between A and B.",
        405.8,
        308.9,
        252.4,
      ),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.role).toBe("equation");
    expect(merged[0]?.text).toMatch(/\(12\)\s*$/);
    expect(merged[0]?.text).toMatch(/^d\(site\(II\)/);
    expect(merged[0]?.evidence.some((e) => e.label === "bare-equation-number-merge")).toBe(true);
    expect(merged[1]?.role).toBe("paragraph");
    expect(merged[1]?.text).toMatch(/^where d\(A, B\)/);
  });

  it("glues same-baseline enumeration (n) into prose instead of inventing an equation", () => {
    // LLM-healthcare p8: column crumbs `effects;` + `(3)` before `(4)` prose.
    const merged = mergeMathematicalDisplayFragments([
      node("a", "paragraph", "effects;", 81.5, 246, 26),
      node("b", "paragraph", "(3)", 81.5, 280, 11),
      node(
        "c",
        "paragraph",
        "user experience and acceptability; and (4) safety, equity, and",
        93.4,
        50,
        241,
      ),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.role).toBe("paragraph");
    expect(merged[0]?.text).toBe("effects; (3)");
    expect(
      merged[0]?.evidence.some((e) => e.label === "same-baseline-enumeration-number-merge"),
    ).toBe(true);
    expect(merged[1]?.role).toBe("paragraph");
    expect(merged[1]?.text).toMatch(/^user experience/);
  });

  it("glues bare (n) into a left-column citation bullet past a right-column wrap", () => {
    const merged = mergeMathematicalDisplayFragments([
      node(
        "bullet",
        "paragraph",
        "• Inclusive communications which address party orientation (54, 77), and political roles (",
        704.2,
        147.8,
        397,
      ),
      node(
        "wrap",
        "paragraph",
        "that had negative associations with CVI were political issues (i.e., purchase of vaccines)",
        717.7,
        304.6,
        240,
      ),
      node("n49", "paragraph", "(49)", 722.1, 154.8, 11),
      node(
        "next",
        "paragraph",
        "• Increased visibility of minority ethnic groups in the media (49)",
        731.1,
        147.8,
        132,
      ),
    ]);
    expect(merged.some((n) => n.id === "n49")).toBe(false);
    const host = merged.find((n) => n.id === "bullet");
    expect(host?.text).toMatch(/\(49\)\s*$/);
    expect(host?.evidence.some((e) => e.label === "same-baseline-enumeration-number-merge")).toBe(
      true,
    );
  });

  it("attaches bare (n) past a right-column numbered equation onto same-baseline dim…", () => {
    // BCI framework p6: left `dim(S)≤dim(A)` + bare `(8)` while right has `(9)`.
    const enq = "\u0005";
    const merged = mergeMathematicalDisplayFragments([
      node("dim", "paragraph", `dim (S) ${enq} dim (A)`, 566.9, 136.5, 68.5),
      node("head", "heading", "3.3 P3: principle of low-dimensional", 603.5, 49.4, 199.8),
      node("eq9", "equation", "At = AI (t) + Anoise (t) (9)", 556.8, 383.5, 162.4),
      node("n8", "paragraph", "(8)", 566.9, 280.1, 10.5),
      node("eq10", "paragraph", `dim (AI) ${enq} dim (At) (10)`, 591.1, 388.0, 158.0),
    ]);
    const eq8 = merged.find((n) => /\(8\)\s*$/.test((n.text ?? "").trim()));
    expect(eq8?.role).toBe("equation");
    expect(eq8?.text).toMatch(/dim \(S\)\s*≤\s*dim \(A\).*?\(8\)\s*$/);
    expect(merged.some((n) => n.id === "n8")).toBe(false);
    expect(merged.find((n) => n.id === "eq9")?.text).toMatch(/\(9\)\s*$/);
  });
});
