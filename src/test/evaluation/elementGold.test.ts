import { describe, expect, it } from "vitest";
import { jatsElementGold } from "../../evaluation/elementGold/jats";
import { latexElementDraft } from "../../evaluation/elementGold/latex";
import { scoreElements } from "../../evaluation/elementGold/score";
import { printedWords, snapToPrinted } from "../../evaluation/elementGold/snap";

const LONG = "The participants completed a series of tasks in a quiet room while their responses were recorded by the experimenter for later analysis of accuracy and speed.";

const JATS = `<article><front><journal-meta><journal-title-group><journal-title>Frontiers in Testing</journal-title></journal-title-group></journal-meta>
<article-meta><article-id pub-id-type="doi">10.1/x</article-id><title-group><article-title>A Study</article-title></title-group>
<contrib-group><contrib contrib-type="author"><name><surname>Smith</surname><given-names>Jane</given-names></name></contrib></contrib-group>
<aff id="a1">Dept of Things, Univ A, City</aff><author-notes><fn><p>These authors contributed equally to the work reported here.</p></fn></author-notes>
<permissions><license><license-p>This is an open-access article under CC BY.</license-p></license></permissions>
<abstract><p>${LONG}</p></abstract></article-meta></front>
<body><sec><label>1</label><title>Introduction</title><p>${LONG} See <ext-link xlink:href="https://example.org/data">data</ext-link>.</p>
<sec><label>1.1</label><title>Background</title><p>${LONG}</p><disp-formula id="e1">x=1</disp-formula></sec></sec>
<fig id="f1"><label>Figure 1</label><caption><title>Overview of the setup.</title></caption></fig>
<table-wrap id="t1"><label>Table 1</label><caption><p>Results by group.</p></caption><table><tr><th>Group</th><th>Score</th></tr><tr><td>A</td><td>0.91</td></tr></table>
<table-wrap-foot><fn><p>Table note.</p></fn></table-wrap-foot></table-wrap></body>
<back><fn-group><fn id="n1"><p>Competing interests: none declared by any of the authors.</p></fn></fn-group><ref-list><ref><mixed-citation>Doe J. A prior study of the same things. 2020.</mixed-citation></ref></ref-list></back></article>`;

describe("jatsElementGold", () => {
  const g = jatsElementGold(JATS, { id: "epmc-x", license: "cc by", sourceUrl: "" });
  it("collects front matter, headings with depth and body elements", () => {
    expect(g.title).toBe("A Study");
    expect(g.authors).toEqual(["Jane Smith"]);
    expect(g.venue).toBe("Frontiers in Testing");
    expect(g.doi).toBe("10.1/x");
    expect(g.permissions).toContain("open-access");
    expect(g.headings).toEqual([{ text: "1 Introduction", level: 1 }, { text: "1.1 Background", level: 2 }]);
    expect(g.figures.map((f) => f.label)).toEqual(["Figure 1"]);
    expect(g.tables[0].cells).toEqual(expect.arrayContaining(["Group", "Score", "A", "0.91"]));
    expect(g.equations).toBe(1);
    expect(g.links).toEqual(["https://example.org/data"]);
    expect(g.references).toHaveLength(1);
  });
  it("keeps author notes as footnotes but leaves table footnotes and uncited back notes out", () => {
    expect(g.footnotes).toEqual(["These authors contributed equally to the work reported here."]);
  });
});

describe("latexElementDraft", () => {
  const tex = String.raw`\documentclass{article}
\title{Neat Results}\author{Jane Smith \and Bo Chen}
\begin{document}\maketitle
\begin{abstract}${LONG}\end{abstract}
\section{Introduction}
${LONG}\footnote{Code at \url{https://example.org/code}.}

${LONG}
\begin{equation}a=b\end{equation}
continued after the equation without a blank line.
\subsection{Setup}
\begin{itemize}\item ${LONG}\end{itemize}
\begin{table}\caption{Main results.}\begin{tabular}{ll}\toprule Model & F1 \\ \midrule Ours & 91.2 \\ \end{tabular}\end{table}
\end{document}`;
  const d = latexElementDraft({ mainTex: tex, bbl: null }, { id: "arxiv-x", source: "arxiv", license: "CC BY 4.0", sourceUrl: "" });
  it("splits paragraphs at blank lines and list items, keeping display math inside its paragraph", () => {
    expect(d.paragraphs, JSON.stringify(d.paragraphs)).toHaveLength(4);
    expect(d.paragraphs[2]).toMatch(/continued after the equation/);
    expect(d.headings).toEqual([{ text: "Introduction", level: 1 }, { text: "Setup", level: 2 }]);
    expect(d.equations).toBe(1);
    expect(d.footnotes).toEqual(["Code at."]);
    expect(d.links).toEqual(["https://example.org/code"]);
    expect(d.tables[0]).toMatchObject({ caption: "Main results.", cells: ["Model", "F1", "Ours", "91.2"] });
  });
});

describe("snapToPrinted", () => {
  it("takes the printed words inside the draft's extent, keeping short printed-only runs", () => {
    const printed = printedWords(`Running Header 12\nPrior work by Smith et al. [3, 4] measured recog-\nnition speed in large groups of adults. Next paragraph starts here.`);
    const r = snapToPrinted("Prior work by Smith et al. measured recognition speed in large groups of adults.", printed);
    expect(r.text).toBe("Prior work by Smith et al 3 4 measured recognition speed in large groups of adults");
    expect(snapToPrinted("The present results hold.", printedWords("the data. The present results hold. More text follows here.")).text).toBe("The present results hold");
    expect(r.matched).toBe(1);
  });
});

describe("scoreElements", () => {
  it("drops unprinted gold and finds headings regardless of numbering", () => {
    const g = jatsElementGold(JATS, { id: "epmc-x", license: "", sourceUrl: "" });
    const printed = `A Study Jane Smith Dept of Things, Univ A, City 1. Introduction ${LONG} 1.1. Background Overview of the setup. Table 1 Results by group.`;
    const s = scoreElements(g, [
      { id: "h1", type: "heading", text: "1. Introduction" },
      { id: "p1", type: "paragraph", text: `${LONG} Dept of Things, Univ A, City` },
      { id: "t1", type: "table", text: "Table 1 Results by group.", cells: ["Group", "Score", "A", "0.91"] },
    ], { title: "A Study", authors: ["Jane Smith"], publication: null, doi: "10.1/x" }, printed);
    expect(s.title).toEqual({ gold: 1, found: 1 });
    expect(s.headings).toEqual({ gold: 2, found: 1 });
    const runIn = scoreElements(g, [{ id: "p", type: "paragraph", text: `1.1 Background. ${LONG}` }], { title: null, authors: [], publication: null, doi: null }, printed);
    expect(runIn.headings.found).toBe(1);
    expect(s.venue.gold).toBe(0); // journal title not printed in this PDF text
    expect(s.tableCells).toEqual({ gold: 4, found: 4 });
    expect(s.figures).toEqual({ gold: 1, found: 0 });
  });
});
