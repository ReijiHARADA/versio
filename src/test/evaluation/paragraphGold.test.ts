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

describe("paragraph breaks the PDF prints", () => {
  it("accepts a JATS paragraph split where the print starts a new one", () => {
    const first = "The first part of the study recruited forty participants from three clinics and measured their gait at baseline.";
    const second = "Participants then stepped to music beats to hit targets, and their gait speed was measured again after six weeks.";
    const gold = jatsParagraphs(doc(`<p>${first} ${second}</p>`));
    const blocks = [{ id: "a", text: first, warning: null }, { id: "b", text: second, warning: null }];
    expect(alignParagraphs(gold, blocks).paragraphs[0].verdict).toBe("split");
    expect(alignParagraphs(gold, [blocks[0], { ...blocks[1], indent: true }]).paragraphs[0].verdict).toBe("intact");
    expect(alignParagraphs(gold, [{ ...blocks[0], shortEnd: true }, blocks[1]]).paragraphs[0].verdict).toBe("intact");
  });
});

describe("warnings that name the defect", () => {
  it("takes a tail warning on a block missing the paragraph's end as right, not as a false alarm", () => {
    const text = "The participants completed the questionnaire twice, once before and once after the six-week training, and their answers were compared across the three groups with a mixed model that accounted for clinic and age.";
    const gold = jatsParagraphs(doc(`<p>${text}</p>`));
    const cut = text.replace(/ that accounted for clinic and age\.$/, "");
    const tail = "段落の末尾が欠けている可能性があります";
    expect(alignParagraphs(gold, [{ id: "b", text: cut, warning: tail }]).blocks[0].verdict).toBe("fragment");
    expect(alignParagraphs(gold, [{ id: "b", text, warning: tail }]).blocks[0].verdict).toBe("complete");
  });
});

describe("hosted paragraphs", () => {
  it("counts a gold paragraph set whole as a footnote as intact", () => {
    const xml = doc(`<p>This work was supported by the National Science Foundation under award 1234567 and by the regional research council, which had no role in the study design, data collection or the decision to publish.</p>`);
    const gold = jatsParagraphs(xml);
    const note = { id: "f", text: gold[0].text, warning: null };
    expect(alignParagraphs(gold, []).paragraphs[0].verdict).toBe("missing");
    expect(alignParagraphs(gold, [], [note]).paragraphs[0].verdict).toBe("intact");
  });
});

describe("lists inside a paragraph", () => {
  it("splits the paragraph at the list, as the Reader shows it", () => {
    const xml = doc(`<p>The contributions are as follows:<list><list-item><p>A new model.</p></list-item></list>These results open a new line of work.</p>`);
    expect(jatsParagraphs(xml).map((p) => p.text)).toEqual(["The contributions are as follows:", "These results open a new line of work.", "A new model."]);
  });
});

describe("tokens", () => {
  it("separates a citation number from the word whether it is spaced or not", () => {
    expect(tokens("explored in29.")).toEqual(tokens("explored in 29."));
    expect(tokens("Scopus1, IEEE2")).toEqual(["scopus", "1", "ieee", "2"]);
  });
});
});
