import { describe, expect, it } from "vitest";
import { extractFromPages } from "../../services/pdfExtraction/pipeline/extractAcademicPdf";
import { FIXTURES } from "../readingOrder/builders";

describe("stacked derivative equation extraction", () => {
  it("merges d/dγ crumbs, √ glyph, superscript [2], and orphan γ,γ) without inventing numbers", () => {
    const pages = FIXTURES["stacked-derivative-equation"]();
    const result = extractFromPages({
      pages,
      paperId: "stacked-derivative-equation",
      filePath: "stacked-derivative-equation.pdf",
      fileHash: "stacked-derivative-equation",
      metadata: { pageCount: pages.length },
    });
    const nodes = result.canonical.nodes;
    const texts = nodes.map((n) => `${n.role}:${n.text ?? ""}`);

    // Lone √ is not a standalone paragraph, and is stripped before English prose.
    expect(nodes.some((n) => n.role === "paragraph" && (n.text ?? "").trim() === "√")).toBe(false);
    const gaussian = nodes.find((n) => /Gaussian noise channel/.test(n.text ?? ""));
    expect(gaussian?.role).toBe("paragraph");
    expect(gaussian?.text).toMatch(/^Let p\(/);
    expect(gaussian?.text).not.toMatch(/^√/);

    // Stacked derivative becomes one numbered equation.
    const eq1 = nodes.find((n) => /\(1\)\s*$/.test((n.text ?? "").trim()));
    expect(eq1?.role).toBe("equation");
    expect(eq1?.text).toMatch(/d\/dγ/);
    expect(eq1?.text).toMatch(/I\(x;/);
    // The resolver keeps layout baseline boxes for reading order and a
    // separate glyph envelope only for visual inspection. Both must survive
    // the fragment merge that produces this equation.
    expect(eq1?.overlayBoundingBoxes?.length).toBeGreaterThan(0);
    expect(nodes.some((n) => (n.text ?? "").trim() === "d")).toBe(false);
    expect(nodes.some((n) => (n.text ?? "").trim() === "dγ")).toBe(false);

    // Superscript bracket is not a table and is absorbed.
    expect(nodes.some((n) => n.role === "table" && /\[\s*2\s*\]/.test(n.text ?? ""))).toBe(false);
    const eq2 = nodes.find((n) => /\(2\)\s*$/.test((n.text ?? "").trim()) || /‖.*²/.test(n.text ?? ""));
    expect(eq2?.role).toBe("equation");
    expect(eq2?.text).toMatch(/²|\(2\)/);

    // Orphan underbrace tail is consumed and stripped after the equation number.
    expect(nodes.some((n) => (n.text ?? "").trim() === "γ,γ)")).toBe(false);
    const eq3 = nodes.find((n) => /\(3\)/.test(n.text ?? ""));
    expect(eq3?.role).toBe("equation");
    expect(eq3?.text).toMatch(/\(3\)\s*$/);
    expect(eq3?.text).not.toMatch(/γ\s*,\s*γ\)\s*$/);

    // Linearized eq.(4) becomes d/dγ … (4); ∫ moves into the marginal integrand.
    const eq4Index = nodes.findIndex((n) => /\(4\)\s*$/.test((n.text ?? "").trim()));
    const eq4 = eq4Index >= 0 ? nodes[eq4Index] : undefined;
    expect(eq4?.role).toBe("equation");
    expect(eq4?.text).toMatch(/^d\/dγ\s+DKL/);
    expect(eq4?.text).not.toMatch(/∫/);
    const marginalIndex = nodes.findIndex((n) => /The marginal is/i.test(n.text ?? ""));
    const marginal = marginalIndex >= 0 ? nodes[marginalIndex] : undefined;
    expect(marginal?.text).toMatch(/=\s*∫\s*p\s*\(/);
    expect(marginal?.text).not.toMatch(/^∫/);
    // Centered lowercase-leading display must stay before left-aligned prose.
    expect(eq4Index).toBeGreaterThanOrEqual(0);
    expect(marginalIndex).toBeGreaterThan(eq4Index);

    // Do not invent extra equation numbers.
    const numbers = (texts.join("\n").match(/\(\s*[1-4]\s*\)/g) ?? []).length;
    expect(numbers).toBeGreaterThanOrEqual(4);
  });
});
