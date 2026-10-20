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

    // Lone √ is not a standalone paragraph.
    expect(nodes.some((n) => n.role === "paragraph" && (n.text ?? "").trim() === "√")).toBe(false);
    expect(nodes.some((n) => (n.text ?? "").includes("√") && /Gaussian noise channel/.test(n.text ?? ""))).toBe(
      true,
    );

    // Stacked derivative becomes one numbered equation.
    const eq1 = nodes.find((n) => /\(1\)\s*$/.test((n.text ?? "").trim()));
    expect(eq1?.role).toBe("equation");
    expect(eq1?.text).toMatch(/d\/dγ/);
    expect(eq1?.text).toMatch(/I\(x;/);
    expect(nodes.some((n) => (n.text ?? "").trim() === "d")).toBe(false);
    expect(nodes.some((n) => (n.text ?? "").trim() === "dγ")).toBe(false);

    // Superscript bracket is not a table and is absorbed.
    expect(nodes.some((n) => n.role === "table" && /\[\s*2\s*\]/.test(n.text ?? ""))).toBe(false);
    const eq2 = nodes.find((n) => /\(2\)\s*$/.test((n.text ?? "").trim()) || /‖.*²/.test(n.text ?? ""));
    expect(eq2?.role).toBe("equation");
    expect(eq2?.text).toMatch(/²|\(2\)/);

    // Orphan tail joins the preceding numbered display.
    expect(nodes.some((n) => (n.text ?? "").trim() === "γ,γ)")).toBe(false);
    const eq3 = nodes.find((n) => /\(3\)/.test(n.text ?? ""));
    expect(eq3?.role).toBe("equation");
    expect(eq3?.text).toContain("γ,γ)");

    // Do not invent extra equation numbers.
    const numbers = (texts.join("\n").match(/\(\s*[1-3]\s*\)/g) ?? []).length;
    expect(numbers).toBeGreaterThanOrEqual(3);
  });
});
