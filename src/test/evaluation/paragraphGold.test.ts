import { describe, expect, it } from "vitest";
import { jatsParagraphs, tokens } from "../../evaluation/extractionAudit/paragraphGold";

const doc = (body: string) => `<article><front></front><body>${body}</body></article>`;

describe("jatsParagraphs", () => {
  it("splits a paragraph at a display formula, as the Reader shows it", () => {
    const xml = doc(`<p>The loss is defined as:<disp-formula id="e1"><mml:math><mml:mi>L</mml:mi></mml:math><tex-math>L = x</tex-math></disp-formula>where <inline-formula><tex-math>x</tex-math></inline-formula> denotes the input.</p><p>Plain paragraph.</p>`);
    expect(jatsParagraphs(xml).map((p) => [p.text, p.hasDisplayFormula])).toEqual([
      ["The loss is defined as:", true],
      ["where denotes the input.", true],
      ["Plain paragraph.", false],
    ]);
  });

describe("tokens", () => {
  it("separates a citation number from the word whether it is spaced or not", () => {
    expect(tokens("explored in29.")).toEqual(tokens("explored in 29."));
    expect(tokens("Scopus1, IEEE2")).toEqual(["scopus", "1", "ieee", "2"]);
  });
});
});
