import { describe, expect, it } from "vitest";
import { alignParagraphs, jatsParagraphs, tokens } from "../../evaluation/extractionAudit/paragraphGold";

const doc = (body: string) => `<article><front></front><body>${body}</body></article>`;

describe("jatsParagraphs", () => {
  it("splits a paragraph at a display formula, as the Reader shows it", () => {
    const xml = doc(`<p>The loss is defined as:<disp-formula id="e1"><mml:math><mml:mi>L</mml:mi></mml:math><tex-math>L = x</tex-math></disp-formula>where <inline-formula><tex-math>x</tex-math></inline-formula> denotes the input.</p><p>Plain paragraph.</p>`);
    expect(jatsParagraphs(xml).map((p) => [p.text, p.hasDisplayFormula])).toEqual([
      ["The loss is defined as:", true],
      ["where \u2063 denotes the input.", true],
      ["Plain paragraph.", false],
    ]);
  });

describe("markup boundaries", () => {
  it("matches the prose around an inline formula and a cross-reference printed in another form", () => {
    const xml = doc(`<p>The scores of the ith sample <inline-formula><tex-math>y_i</tex-math></inline-formula> were pooled across the five study sites and compared with the national reference values reported earlier (<xref ref-type="fig" rid="f1">Fig. S13</xref>) for every age group and both sexes in the cohort.</p>`);
    const gold = jatsParagraphs(xml);
    const printed = "The scores of the ith sample yi were pooled across the five study sites and compared with the national reference values reported earlier (Figure 10) for every age group and both sexes in the cohort.";
    expect(alignParagraphs(gold, [{ id: "b", text: printed, warning: null }]).paragraphs[0].verdict).toBe("intact");
  });
});

describe("tokens", () => {
  it("separates a citation number from the word whether it is spaced or not", () => {
    expect(tokens("explored in29.")).toEqual(tokens("explored in 29."));
    expect(tokens("Scopus1, IEEE2")).toEqual(["scopus", "1", "ieee", "2"]);
  });
});
});
