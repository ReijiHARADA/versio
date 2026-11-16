import { describe, expect, it } from "vitest";
import { predictionFromApple, type ProbeOutput } from "../../evaluation/fieldGold/adapters/apple";

const b = (y: number) => ({ x: 0.1, y, w: 0.8, h: 0.02 });
const probe = (fmAvailable: boolean): ProbeOutput => ({
  fmAvailable,
  pages: [
    { page: 1, title: "Vision Title", paragraphs: [{ text: "Figure 2: Overview of the system.", bbox: b(0.5) }, { text: "表1 実験条件", bbox: b(0.4) }], lists: [], tables: 0 },
    {
      page: 2,
      paragraphs: [
        { text: "Body text that is not a reference at all.", bbox: b(0.9) },
        { text: "References", bbox: b(0.6) },
        { text: "Smith J. Deep models of reading. Nature. 2020.", bbox: b(0.5) },
      ],
      lists: [
        { items: ["Lee A. Another paper on jewellery. CHI 2019."], bbox: b(0.3) },
        { items: ["An unrelated list above the heading item."], bbox: b(0.8) },
      ],
      tables: 0,
    },
  ],
  header: fmAvailable ? { title: "LLM Title", authors: [{ name: "Jane Smith", affiliationKeys: ["a1"] }], affiliations: [{ key: "a1", text: "U Tokyo" }], emails: ["j@u.ac.jp"] } : null,
});

describe("predictionFromApple", () => {
  it("marks header fields unavailable without the on-device model and uses the Vision title", () => {
    const p = predictionFromApple("x", probe(false), 5);
    expect(p.unavailableFields).toEqual(["authors", "authorAffiliation", "emails"]);
    expect(p.fields.title).toBe("Vision Title");
  });
  it("uses the LLM header when available", () => {
    const p = predictionFromApple("x", probe(true), 5);
    expect(p.unavailableFields).toEqual([]);
    expect(p.fields.title).toBe("LLM Title");
    expect(p.fields.authors[0].affiliationKeys).toEqual(["a1"]);
  });
  it("finds captions with labels, including Japanese", () => {
    expect(predictionFromApple("x", probe(false), 5).fields.captions).toEqual([
      { kind: "figure", label: "Figure 2", text: "Overview of the system." },
      { kind: "table", label: "Table 1", text: "実験条件" },
    ]);
  });
  it("collects references after the heading, including list items below it", () => {
    expect(predictionFromApple("x", probe(false), 5).fields.references.map((r) => r.raw)).toEqual([
      "Smith J. Deep models of reading. Nature. 2020.",
      "Lee A. Another paper on jewellery. CHI 2019.",
    ]);
  });
});
