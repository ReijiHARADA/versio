import { describe, expect, it } from "vitest";
import { reconcileTranslationWarnings, stitchParagraphContinuations } from "../../services/pdfExtraction/projection/stitchParagraphs";
import type { PaperBlock } from "../../types/paper";

const block = (id: string, type: PaperBlock["type"], original: string, page = 1, metadata: Record<string, unknown> = {}): PaperBlock =>
  ({
    id,
    paperId: "p",
    sectionId: "s-body",
    type,
    order: 0,
    pageStart: page,
    pageEnd: page,
    boundingBoxes: [{ page, x: 40, y: 100, width: 300, height: 40 }],
    original,
    translated: null,
    extractionConfidence: null,
    translationStatus: "pending",
    parentBlockId: null,
    metadata,
  }) as PaperBlock;

const sections = [{ id: "s-body", normalizedKind: "body" }, { id: "s-ref", normalizedKind: "references" }];
const OPEN = "Search for relevant papers was conducted in four main databases. This was done to enhance efficiency in";
const CONTINUATION = "the screening process, and two reviewers resolved every disagreement by discussion.";

describe("stitchParagraphContinuations", () => {
  it("rejoins a paragraph interrupted by a figure, its caption and a running head", () => {
    const blocks = [
      block("a", "paragraph", OPEN, 2, { translationInputWarning: "段落の末尾が欠けている可能性があります" }),
      block("fig", "figure", "", 3),
      block("head", "paragraph", "Amoadu et al. BMC Psychology", 3),
      block("b", "paragraph", CONTINUATION, 3, { translationInputWarning: "段落の先頭が前段から続いている可能性があります" }),
    ];
    const out = stitchParagraphContinuations(blocks, sections);
    expect(out.map((b) => b.id)).toEqual(["a", "fig", "head"]);
    expect(out[0].original).toBe(`${OPEN} ${CONTINUATION}`);
    expect(out[0].pageEnd).toBe(3);
    expect(out[0].metadata.translationInputWarning).toBeUndefined();
    expect(out.map((b) => b.order)).toEqual([0, 1, 2]);
  });

  it("jumps over finished prose only from a real open paragraph, and never over an equation", () => {
    const complete = "Data extraction was handled independently by two researchers, who compared their tables and settled every difference before the synthesis began.";
    // A short or keyword-list paragraph does not look past finished prose; a real open paragraph does.
    expect(stitchParagraphContinuations([block("a", "paragraph", "Kim et al. BMC Medical Informatics and Decision Making (2026) 26:343"), block("c", "paragraph", complete), block("b", "paragraph", CONTINUATION)], sections)).toHaveLength(3);
    const keywords = `${OPEN.replace(/ in$/, ".")} Keywords Deep learning, Transfer learning, Hybrid model, Feature fusion, Computer-aided diagnosis`;
    expect(stitchParagraphContinuations([block("a", "paragraph", keywords), block("c", "paragraph", complete), block("b", "paragraph", CONTINUATION)], sections)).toHaveLength(3);
    const longOpen = `Two independent reviewers screened every record against the inclusion criteria. ${OPEN}`;
    expect(stitchParagraphContinuations([block("a", "paragraph", longOpen), block("c", "paragraph", complete), block("b", "paragraph", CONTINUATION)], sections).map((x) => x.id)).toEqual(["a", "c"]);
    expect(stitchParagraphContinuations([block("a", "paragraph", OPEN), block("eq", "equation", "x = y + z"), block("b", "paragraph", CONTINUATION)], sections)).toHaveLength(3);
  });

  it("jumps over a table's complete notes, but not over open prose after it", () => {
    const note = "Standard deviations are presented in parentheses. Lexical frequencies were taken from the corpus and matched across the two conditions.";
    const table = block("t", "table", "Variable Match Mismatch t p");
    const out = stitchParagraphContinuations([block("a", "paragraph", OPEN), table, block("n", "paragraph", note), block("b", "paragraph", CONTINUATION)], sections);
    expect(out.map((b) => b.id)).toEqual(["a", "t", "n"]);
    const open = "The intervention framework is based on behavioural theory and was delivered by trained nurses and ward managers across all of the participating wards in";
    // The open paragraph after the table is the one the continuation belongs to.
    const kept = stitchParagraphContinuations([block("a", "paragraph", OPEN), table, block("n", "paragraph", open), block("b", "paragraph", CONTINUATION)], sections);
    expect(kept.map((b) => b.id)).toEqual(["a", "t", "n"]);
    expect(kept[0].original).toBe(OPEN);
  });

  it("keeps finished sentences, colon introductions, lists and references apart", () => {
    const finished = "Search for relevant papers was conducted in four main databases and in two registries.";
    expect(stitchParagraphContinuations([block("a", "paragraph", finished), block("b", "paragraph", CONTINUATION)], sections)).toHaveLength(2);
    expect(stitchParagraphContinuations([block("a", "paragraph", "The inclusion criteria for the review were the following:"), block("b", "paragraph", CONTINUATION)], sections)).toHaveLength(2);
    expect(stitchParagraphContinuations([block("a", "paragraph", OPEN, 1, { listRole: "item" }), block("b", "paragraph", CONTINUATION)], sections)).toHaveLength(2);
    const ref = { ...block("a", "paragraph", OPEN), sectionId: "s-ref" };
    expect(stitchParagraphContinuations([ref, block("b", "paragraph", CONTINUATION)], sections)).toHaveLength(2);
  });

  it("joins a word broken at a line-end hyphen and keeps compound hyphens", () => {
    const out = stitchParagraphContinuations([block("a", "paragraph", "The models were trained with a carefully designed pre-"), block("b", "paragraph", "processing step for every dataset.")], sections);
    expect(out[0].original).toBe("The models were trained with a carefully designed preprocessing step for every dataset.");
    const compound = stitchParagraphContinuations([block("a", "paragraph", "We compare the results with several state-of-the-"), block("b", "paragraph", "art baselines on four benchmarks.")], sections);
    expect(compound[0].original).toBe("We compare the results with several state-of-the-art baselines on four benchmarks.");
  });

  it("does not reach beyond the next page", () => {
    expect(stitchParagraphContinuations([block("a", "paragraph", OPEN, 2), block("b", "paragraph", CONTINUATION, 4)], sections)).toHaveLength(2);
  });
});

describe("reconcileTranslationWarnings", () => {
  const TAIL = "段落の末尾が欠けている可能性があります";
  it("drops a warning that the final text no longer supports", () => {
    const repaired = block("a", "paragraph", "The repaired paragraph now ends with a full stop after the join.", 1, { translationInputWarning: TAIL });
    expect(reconcileTranslationWarnings([repaired])[0].metadata.translationInputWarning).toBeUndefined();
  });

  it("treats a colon lead-in as complete unless a lower-case paragraph continues it", () => {
    const lead = () => block("a", "paragraph", "Under the Poisson objective, the loss function is defined in Eq. 2:", 1, { translationInputWarning: TAIL });
    expect(reconcileTranslationWarnings([lead(), block("eq", "equation", "L = sum")])[0].metadata.translationInputWarning).toBeUndefined();
    expect(reconcileTranslationWarnings([lead(), block("i", "paragraph", "• first item", 1, { listRole: "item" })])[0].metadata.translationInputWarning).toBeUndefined();
    expect(reconcileTranslationWarnings([lead(), block("q", "paragraph", "“I could not have afforded the fees otherwise,” one student said.")])[0].metadata.translationInputWarning).toBeUndefined();
    expect(reconcileTranslationWarnings([lead(), block("h", "heading", "Results")])[0].metadata.translationInputWarning).toBeUndefined();
    expect(reconcileTranslationWarnings([lead(), block("c", "paragraph", "the sum of squared errors over every tree in the ensemble.")])[0].metadata.translationInputWarning).toBe(TAIL);
    expect(reconcileTranslationWarnings([lead(), block("w", "paragraph", "where β is the slope index of inequality.")])[0].metadata.translationInputWarning).toBeUndefined();
    expect(reconcileTranslationWarnings([lead(), block("l", "paragraph", "a. Research related to the topic has received attention.")])[0].metadata.translationInputWarning).toBeUndefined();
    const evaluatedAs = block("a", "paragraph", "Two advanced decomposition approaches were evaluated as", 1, { translationInputWarning: TAIL });
    expect(reconcileTranslationWarnings([evaluatedAs, block("l", "paragraph", "• Short-Time Fourier Transform (STFT) generates spectrograms.")])[0].metadata.translationInputWarning).toBeUndefined();
    const item = block("d", "paragraph", "d. The mechanisms by which SCFAs regulate cognitive impairment are summarized.", 1, { translationInputWarning: "段落の先頭が前段から続いている可能性があります" });
    expect(reconcileTranslationWarnings([item])[0].metadata.translationInputWarning).toBeUndefined();
    const ofLead = block("a", "paragraph", "In physical units, the parameter grid of the simulation consisted of", 1, { translationInputWarning: TAIL });
    expect(reconcileTranslationWarnings([ofLead, block("eq", "equation", "λ ∈ {0, 2, 4} m/s")])[0].metadata.translationInputWarning).toBeUndefined();
    const cell = block("c", "paragraph", "Australia efficient operating theatre", 5, { translationInputWarning: TAIL });
    expect(reconcileTranslationWarnings([block("t1", "table", "Study Country Aim", 5), cell, block("t2", "table", "Observational 2022", 5)])[1].metadata.translationInputWarning).toBeUndefined();
    const asLead = () => block("a", "paragraph", "The importance of feature j over the data subset is defined as", 1, { translationInputWarning: TAIL });
    expect(reconcileTranslationWarnings([asLead(), block("eq", "equation", "I = sum")])[0].metadata.translationInputWarning).toBeUndefined();
    const commaLead = () => block("a", "paragraph", "Given the transition from bin i to bin j, the joint distribution factorizes over time,", 1, { translationInputWarning: TAIL });
    expect(reconcileTranslationWarnings([commaLead(), block("eq", "equation", "p = prod")])[0].metadata.translationInputWarning).toBeUndefined();
    expect(reconcileTranslationWarnings([commaLead(), block("p", "paragraph", "and the rest follows.")])[0].metadata.translationInputWarning).toBe(TAIL);
    expect(reconcileTranslationWarnings([lead(), block("h", "heading", "TP + TN"), block("c", "paragraph", "recognition performance from two views.")])[0].metadata.translationInputWarning).toBeUndefined();
  });

  it("takes an (a) (b) (c) run of paragraphs as an enumeration, not sub-panel legends", () => {
    const sub = "図表のサブパネル説明が本文に混ざっている可能性があります";
    const run = reconcileTranslationWarnings([
      block("a", "paragraph", "(a) Avatar Response: Calm encouragement with gentle expressions and soft speech.", 1, { translationInputWarning: sub }),
      block("b", "paragraph", "(b) Environment Description: A tranquil forest environment with birdsong.", 1, { translationInputWarning: sub }),
    ]);
    expect(run.map((b) => b.metadata.translationInputWarning)).toEqual([undefined, undefined]);
    expect(reconcileTranslationWarnings([block("a", "paragraph", "(a) Avatar Response: Calm encouragement with gentle expressions and soft speech.", 1, { translationInputWarning: sub })])[0].metadata.translationInputWarning).toBe(sub);
  });

  it("keeps other defects of an introduced lead-in and leaves context warnings and list items alone", () => {
    const hyphen = reconcileTranslationWarnings([block("a", "paragraph", "The state of the of robot that is optimized in the local window of the map is defined as:"), block("eq", "equation", "x")]);
    expect(hyphen[0].metadata.translationInputWarning).toMatch(/機能語/);
    const context = block("a", "paragraph", "A complete sentence.", 1, { translationInputWarning: "後続ブロックが前段の文を継続している可能性があります" });
    expect(reconcileTranslationWarnings([context])[0].metadata.translationInputWarning).toMatch(/後続/);
    const item = (text: string) => block("a", "paragraph", text, 1, { listRole: "item", translationInputWarning: "段落の末尾が欠けている可能性があります" });
    expect(reconcileTranslationWarnings([item("• risk factors in the investment portfolio;")])[0].metadata.translationInputWarning).toBeUndefined();
    expect(reconcileTranslationWarnings([item("• the material available, so it must be checked and")])[0].metadata.translationInputWarning).toMatch(/末尾/);
  });
});

describe("stitchParagraphContinuations through a short inline formula", () => {
  it("joins the formula and the lower-case rest of the sentence", () => {
    const out = stitchParagraphContinuations([
      block("a", "paragraph", "To focus on salient attributes of each type, the concatenated features", 12),
      block("e", "equation", "Fmulti ∈ RH×W×C", 12),
      block("b", "paragraph", "are passed through attribute-specific attention modules.", 12),
    ], []);
    expect(out).toHaveLength(1);
    expect(out[0].original).toBe("To focus on salient attributes of each type, the concatenated features Fmulti ∈ RH×W×C are passed through attribute-specific attention modules.");
  });

  it("also continues a list item cut at the formula", () => {
    const out = stitchParagraphContinuations([
      block("a", "paragraph", "3. Type-Specific Feature Aggregation To focus on salient attributes of each type, the concatenated features", 12, { listRole: "item" }),
      block("e", "equation", "Fmulti ∈ RH×W×C", 12),
      block("b", "paragraph", "are passed through attribute-specific attention modules.", 12),
    ], []);
    expect(out).toHaveLength(1);
  });

  it("keeps a numbered display or one after a lead-in apart", () => {
    const lead = (text: string) => block("a", "paragraph", text, 1);
    const rest = block("b", "paragraph", "where x is the input of the layer.", 1);
    expect(stitchParagraphContinuations([lead("The output of each attention layer is computed as"), block("e", "equation", "y = Wx"), rest], [])).toHaveLength(3);
    expect(stitchParagraphContinuations([lead("The output of each attention layer follows the update"), block("e", "equation", "y = Wx (3)"), rest], [])).toHaveLength(3);
  });
});

describe("stitchParagraphContinuations into a term after an unpunctuated word", () => {
  it("joins a long paragraph cut after a verb to the next one opening with an acronym", () => {
    const out = stitchParagraphContinuations([
      block("a", "paragraph", "Many algorithms have been proposed for cooperative tasks among agents in recent years. Given its proven stability in complex cooperative tasks, we selected", 2),
      block("b", "paragraph", "MAPPO under the CTDE paradigm as the foundational reactive execution baseline.", 3),
    ], []);
    expect(out).toHaveLength(1);
  });
});

describe("stitchParagraphContinuations into a list lead-in", () => {
  it("joins the lower-case rest of the sentence that introduces a list, and keeps the lead-in role", () => {
    const out = stitchParagraphContinuations([
      block("a", "paragraph", "The model was selected for its use in prior literature and for its diversity in", 8),
      block("b", "paragraph", "task (diseased vs. no disease). These modifications are:", 8, { listRole: "intro" }),
      block("c", "paragraph", "• the final layer is replaced", 8, { listRole: "item" }),
    ], []);
    expect(out.map((b) => b.id)).toEqual(["a", "c"]);
    expect(out[0].metadata.listRole).toBe("intro");
  });
});

describe("stitchParagraphContinuations past a table note", () => {
  it("joins the rest of the sentence across a table and its unfinished note", () => {
    const blocks = [
      block("a", "paragraph", "Patients with anxiety were older, had chronic conditions and lower levels of education. They", 4),
      block("t1", "table", "Table 1 Baseline characteristics", 5),
      block("f", "footnote", "*SD Standard deviation **IQR Interquartile range", 5),
      block("t", "table", "Table 2 Results of the regression models", 6),
      block("n", "paragraph", "Model adjusted for age, gender, prior depression and education CI 95% confidence interval", 6),
      block("b", "paragraph", "also exhibited significantly lower EQ VAS scores than those without anxiety.", 6),
    ];
    const out = stitchParagraphContinuations(blocks, []);
    expect(out[0].original).toMatch(/They also exhibited/);
    expect(out.find((b) => b.id === "n")?.original).toMatch(/interval$/);
  });
});

describe("stitchParagraphContinuations through a body line typed as an equation", () => {
  it("joins the line and the lower-case rest of the sentence", () => {
    const sections = [{ id: "s-body", normalizedKind: "body" }];
    const a = block("a", "paragraph", "The trial was conducted in an outpatient clinic of the University hospital Magdeburg, Ger-");
    const eq = block("eq", "equation", "many. Eligible patients were adults (≥ 18 years) with (1)");
    const b = block("b", "paragraph", "a reported prior infection confirmed by a test.");
    expect(stitchParagraphContinuations([a, eq, b], sections)[0].original).toBe("The trial was conducted in an outpatient clinic of the University hospital Magdeburg, Germany. Eligible patients were adults (≥ 18 years) with (1) a reported prior infection confirmed by a test.");
    expect(stitchParagraphContinuations([a, block("eq2", "equation", "y = f(x) + g(x) (1)"), b], sections)).toHaveLength(3);
  });
});

describe("reconcileTranslationWarnings on supporting information", () => {
  it("reads a trailing file type as the end of the entry", () => {
    const entry = block("s", "paragraph", "S1 File. Corpus data and concordances prepared in accordance with journal policy. (ZIP)", 1, { translationInputWarning: "段落の末尾が欠けている可能性があります" });
    expect(reconcileTranslationWarnings([entry])[0].metadata.translationInputWarning).toBeUndefined();
    const video = block("v", "paragraph", "S2 Video. The robot walking on gravel. (MP4)", 1);
    expect(reconcileTranslationWarnings([video])[0].metadata.translationInputWarning).toBeUndefined();
  });
});

describe("reconcileTranslationWarnings around display equations", () => {
  it("looks past equation debris and accepts a where-clause after the equation", () => {
    const lead = block("a", "paragraph", "Under the Poisson objective, the loss function is defined in Eq. 2:", 1, { translationInputWarning: "段落の末尾が欠けている可能性があります" });
    const where = block("w", "paragraph", "where θ denotes the set of tree parameters and λ is an L2 regularisation term.", 1, { translationInputWarning: "段落の先頭が前段から続いている可能性があります" });
    const out = reconcileTranslationWarnings([lead, block("d", "paragraph", "1 Xn"), block("eq", "equation", "L(θ) = Σ"), where]);
    expect(out[0].metadata.translationInputWarning).toBeUndefined();
    expect(out[3].metadata.translationInputWarning).toBeUndefined();
    const orphan = reconcileTranslationWarnings([block("p", "paragraph", "A complete sentence before the cut."), where]);
    expect(orphan[1].metadata.translationInputWarning).toMatch(/先頭/);
  });

  it("treats an equation left as a short paragraph as the display", () => {
    const where = block("w", "paragraph", "where TP denotes the number of answers correctly marked as relevant.", 1, { translationInputWarning: "段落の先頭が前段から続いている可能性があります" });
    expect(reconcileTranslationWarnings([block("eq", "paragraph", "TP + FP (1)"), where])[1].metadata.translationInputWarning).toBeUndefined();
    expect(reconcileTranslationWarnings([block("p", "paragraph", "and the results were given in"), where])[1].metadata.translationInputWarning).toMatch(/先頭/);
  });
});

describe("stitchParagraphContinuations after a paragraph that cannot end", () => {
  const sections = [{ id: "s-body", normalizedKind: "body" }];
  it("joins a continuation that starts with a number or closes an open parenthesis", () => {
    const a = block("a", "paragraph", "Almost all companies monitored driving hours for light drivers (82.1% versus");
    const b = block("b", "paragraph", "25.0%; p = .03) and for heavy drivers the share was even higher.");
    expect(stitchParagraphContinuations([a, block("f", "figure", ""), b], sections)[0].original).toMatch(/versus 25\.0%/);
    const c = block("c", "paragraph", "Many findings in psychology are reproducible (Open Science");
    const d = block("d", "paragraph", "Collaboration, 2015). In addition, there have been several replication efforts.");
    expect(stitchParagraphContinuations([c, d], sections)).toHaveLength(1);
  });

  it("takes the very next paragraph when it opens with a term", () => {
    const a = block("a", "paragraph", "The full configuration achieves a BLEU gain of 2.54, which is 0.15 higher than the");
    expect(stitchParagraphContinuations([a, block("b", "paragraph", "Transformer+CAM configuration (2.39) without the graph module.")], sections)).toHaveLength(1);
    expect(stitchParagraphContinuations([a, block("f", "footnote", "1 / 20"), block("b", "paragraph", "NMT models all adopt the encoder–decoder architecture.")], sections)).toHaveLength(3);
  });

  it("does not take an upper-case paragraph, a list item, a numbered heading or a footnote as the continuation", () => {
    const a = block("a", "paragraph", "We report the results of the memory cue and forgetting of gist and");
    for (const text of ["Results of the forgetting rate differed between the groups.", "(i) the noise is normally distributed", "3 Results and discussion", "7 https://example.org/library/page"]) {
      expect(stitchParagraphContinuations([a, block("b", "paragraph", text)], sections)).toHaveLength(2);
    }
  });
});

describe("stitchParagraphContinuations across mistyped blocks", () => {
  const sections = [{ id: "s-body", normalizedKind: "body" }];
  it("takes back prose typed as an equation and a table reference read as a caption", () => {
    const a = block("a", "paragraph", "Digital tools span 12 categories and 87 subcategories, with applications spanning prevention,");
    const eq = block("eq", "equation", "diagnosis, treatment, and long-term disease management (3).");
    expect(stitchParagraphContinuations([a, eq], sections)[0].original).toMatch(/prevention, diagnosis, treatment/);
    const b = block("b", "paragraph", "The ten most cited articles, published between 2014 and 2024, are listed in");
    const t = block("t", "table", "Table 7. For instance, Dubey S et al. from the Institute of Post");
    const c = block("c", "paragraph", "Graduate Medical Education reported the largest trial.");
    const out = stitchParagraphContinuations([b, t, c], sections);
    expect(out).toHaveLength(1);
    expect(out[0].original).toMatch(/listed in Table 7\. For instance, .* Institute of Post Graduate Medical/);
  });

  it("keeps real equations and captions", () => {
    const a = block("a", "paragraph", "The loss is minimised with respect to the parameters of");
    expect(stitchParagraphContinuations([a, block("eq", "equation", "x = y + z (3)")], sections)).toHaveLength(2);
    const b = block("b", "paragraph", "Participants were recruited from three clinics and");
    expect(stitchParagraphContinuations([b, block("t", "table", "Table 2. Baseline characteristics", 1, { tableRows: [["a"]] })], sections)).toHaveLength(2);
  });
});

describe("stitchParagraphContinuations past full-page figures", () => {
  it("reaches a continuation two pages on when only figures lie between", () => {
    const sections = [{ id: "s-body", normalizedKind: "body" }];
    const a = block("a", "paragraph", "The link between supportive leadership and personal hope is strengthened in the presence", 4);
    const b = block("b", "paragraph", "of a high psychosocial safety climate in the workplace.", 6);
    const figs = [block("f1", "figure", "Fig. 1", 5), block("f2", "figure", "Fig. 2", 5), block("f3", "figure", "Fig. 3", 6)];
    expect(stitchParagraphContinuations([a, ...figs, b], sections)[0].original).toMatch(/presence of a high/);
    expect(stitchParagraphContinuations([a, block("p", "paragraph", "Short label", 5), b], sections)).toHaveLength(3);
  });

  it("looks past a page-number footer on the way to full-page floats", () => {
    const sections = [{ id: "s-body", normalizedKind: "body" }];
    const a = block("a", "paragraph", "The other prioritized targets may also be relevant, but the data do not demonstrate that OTA directly regulates", 4);
    const b = block("b", "paragraph", "these targets in the experimental models.", 6);
    const between = [block("n", "footnote", "13 / 17", 4), block("f1", "figure", "Fig. 10", 5), block("f2", "figure", "Fig. 11", 6)];
    expect(stitchParagraphContinuations([a, ...between, b], sections)[0].original).toMatch(/regulates these targets/);
  });
  it("joins a full-width prose line typed as an equation, but not a centred display", () => {
    const a = block("a", "paragraph", "Participants reported somatic complaints such as rapid physical exhaustion after exertion", 5);
    const line = { ...block("e", "equation", "(M = 3.79, SD = 1.18), concentration difficulties (M = 3.31,", 5), boundingBoxes: [{ page: 5, x: 40, y: 150, width: 296, height: 10 }] };
    const b = block("b", "paragraph", "SD = 1.17), and memory difficulties (M = 3.21, SD = 1.20) were reported by most participants.", 5);
    expect(stitchParagraphContinuations([a, line, b], sections).map((x) => x.id)).toEqual(["a"]);
    const display = { ...line, boundingBoxes: [{ page: 5, x: 120, y: 150, width: 140, height: 10 }] };
    expect(stitchParagraphContinuations([a, display, b], sections).map((x) => x.id)).toEqual(["a", "e", "b"]);
  });

  it("keeps a paragraph that ends with et al. open", () => {
    const a = block("a", "paragraph", "Implementation science may help once evidence is mobilised and practice improved (Rapport et al.", 15);
    const head = block("h", "paragraph", "International Journal of Language & Communication Disorders, 2026", 15);
    const b = block("b", "paragraph", "2022). The extent to which curricula embrace research evidence remains unclear.", 15);
    expect(stitchParagraphContinuations([a, head, b], sections)[0].original).toMatch(/et al\. 2022\)\./);
  });
  it("continues an open paragraph in a bracket, unless a lower-case continuation follows", () => {
    const a = block("a", "paragraph", "Among the articles in the data set, women had high middle authorship rates and low first authorship", 1);
    const b = block("b", "paragraph", "(1.9%–2.1%) and higher last authorship rates than men in every field.", 2);
    expect(stitchParagraphContinuations([a, block("n", "footnote", "1 / 29", 1), b], sections).map((x) => x.id)).toEqual(["a", "n"]);
    const note = block("t", "paragraph", "(Compl). Scores are up to 5, higher is better.", 2);
    const c = block("c", "paragraph", "based model, in addition to two variants of our method.", 2);
    expect(stitchParagraphContinuations([a, note, c], sections).map((x) => x.id)).toEqual(["a", "t"]);
  });
  it("continues an open paragraph in a number right after it, but not in a numbered item", () => {
    const a = block("a", "paragraph", "For the external testing dataset, all scans were conducted on the same", 14);
    const b = block("b", "paragraph", "1.5 T Signa MRI scanner with the same acquisition protocol.", 14);
    expect(stitchParagraphContinuations([a, b], sections).map((x) => x.id)).toEqual(["a"]);
    const item = block("c", "paragraph", "2. The Quick Propagation algorithm enhances training speed.", 14);
    expect(stitchParagraphContinuations([a, item], sections).map((x) => x.id)).toEqual(["a", "c"]);
  });
});
