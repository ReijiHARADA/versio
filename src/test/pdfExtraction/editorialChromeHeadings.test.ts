import { describe, expect, it } from "vitest";
import { demoteEditorialChromeHeadings, isProseRowAsHeading } from "../../services/pdfExtraction/resolver/documentResolver";
import type { CanonicalNode } from "../../services/pdfExtraction/canonical/types";

function heading(text: string, page = 2): CanonicalNode {
  return {
    id: `h-${text.slice(0, 12)}-${page}`,
    role: "heading",
    text,
    pageStart: page,
    pageEnd: page,
    confidence: 0.9,
    evidence: [],
    boundingBoxes: [{ page, x: 40, y: 120, width: 200, height: 14 }],
    sourceAnchor: { page, boundingBoxes: [], normalizedTextHash: text },
  } as CanonicalNode;
}

describe("demoteEditorialChromeHeadings", () => {
  it("demotes ODE and chem crumbs while keeping section headings", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("Introduction"),
      heading("cACE = cACE,0 · (1 –"),
      heading("d[PTH]"),
      heading("= kVIP · P1C1V + P1C2V – ℓVIP · VIP ,"),
      heading("[AT1R – AngII]γAT1R,RANKL"),
      heading("Discussion"),
    ]);
    const roles = Object.fromEntries(nodes.map((n) => [n.text, n.role]));
    expect(roles.Introduction).toBe("heading");
    expect(roles.Discussion).toBe("heading");
    expect(roles["cACE = cACE,0 · (1 –"]).not.toBe("heading");
    expect(roles["d[PTH]"]).not.toBe("heading");
    expect(roles["= kVIP · P1C1V + P1C2V – ℓVIP · VIP ,"]).not.toBe("heading");
    expect(roles["[AT1R – AngII]γAT1R,RANKL"]).not.toBe("heading");
  });

  it("demotes Copyright and / KEYWORDS CITATION sidebar crumbs", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("Copyright and"),
      heading("Reuse: Copyright and Moral Rights remain with the author(s) and/or"),
      heading("KEYWORDS CITATION"),
      heading("1 Introduction"),
    ]);
    expect(nodes.find((n) => n.text === "Copyright and")?.role).toBe("copyright");
    expect(nodes.find((n) => n.text?.startsWith("Reuse:"))?.role).toBe("copyright");
    expect(nodes.find((n) => n.text === "KEYWORDS CITATION")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "1 Introduction")?.role).toBe("heading");
  });

  it("demotes funding / peer-review chrome rails", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("Funding: This research was funded with"),
      heading("Published: Peer Review History: PLOS recognizes the benefits of transparency in peer review"),
      heading("Declaration of generative AI and AI-assisted technologies"),
      heading("Materials and methods"),
    ]);
    expect(nodes.find((n) => n.text.startsWith("Funding"))?.role).not.toBe("heading");
    expect(nodes.find((n) => n.text.startsWith("Published"))?.role).not.toBe("heading");
    expect(nodes.find((n) => n.text.startsWith("Declaration"))?.role).not.toBe("heading");
    expect(nodes.find((n) => n.text === "Materials and methods")?.role).toBe("heading");
  });

  it("demotes glued Frontiers RECEIVED/ACCEPTED/PUBLISHED date rails", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("RECEIVED 03 March 2026 ACCEPTED 06 March 2026 KEYWORDS PUBLISHED 23 March 2026"),
      heading("RECEIVED 23 March 2026 REVISED 01 May 2026 ACCEPTED 11 May 2026 PUBLISHED 05 June 2026"),
      heading("1 Introduction"),
    ]);
    expect(nodes.find((n) => n.text.startsWith("RECEIVED 03"))?.role).not.toBe("heading");
    expect(nodes.find((n) => n.text.startsWith("RECEIVED 23"))?.role).not.toBe("heading");
    expect(nodes.find((n) => n.text === "1 Introduction")?.role).toBe("heading");
  });

  it("demotes glued KEYWORDS COPYRIGHT sidebar labels", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("KEYWORDS COPYRIGHT"),
      heading("Introduction"),
    ]);
    expect(nodes.find((n) => n.text === "KEYWORDS COPYRIGHT")?.role).not.toBe("heading");
    expect(nodes.find((n) => n.text === "Introduction")?.role).toBe("heading");
  });

  it("demotes Keywords: / Index Terms chrome labels with a trailing colon", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("Keywords:"),
      heading("Index Terms"),
      heading("Keywords: information visualization, adaptation, cognitive style"),
      heading("Introduction"),
    ]);
    expect(nodes.find((n) => n.text === "Keywords:")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "Index Terms")?.role).toBe("other");
    expect(nodes.find((n) => n.text.startsWith("Keywords: information"))?.role).toBe("other");
    expect(nodes.find((n) => n.text === "Introduction")?.role).toBe("heading");
  });

  it("demotes running author headers and F-stat crumbs", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("106 D. A. SHEPHERD AND H. PATZELT"),
      heading("5.83 F"),
      heading("Results"),
      heading("High Levels of Top-Down Attention Allocation and Recognizing"),
    ]);
    expect(nodes.find((n) => n.text.startsWith("106"))?.role).toBe("other");
    expect(nodes.find((n) => n.text === "5.83 F")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "Results")?.role).toBe("heading");
    expect(
      nodes.find((n) => n.text.startsWith("High Levels"))?.role,
    ).toBe("heading");
  });

  it("demotes degree/institution crumbs from the outline", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("Abstract:"),
      heading("1 Doctorand, Universitatea Pedagogică de"),
      heading("Introducere"),
    ]);
    expect(nodes.find((n) => n.text.startsWith("1 Doctorand"))?.role).toBe("other");
    expect(nodes.find((n) => n.text === "Introducere")?.role).toBe("heading");
  });

  it("demotes journal type rails and geo chrome", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("Article"),
      heading("Article ll"),
      heading("Research Article"),
      heading("UNITED STATES OF AMERICA"),
      heading("11 frontiersin.org"),
      heading("Introduction"),
    ]);
    expect(nodes.find((n) => n.text === "Article")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "Article ll")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "Research Article")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "UNITED STATES OF AMERICA")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "11 frontiersin.org")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "Introduction")?.role).toBe("heading");
  });

  it("demotes p-value table rails mistaken for headings", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("0.004 <0.001 Reasoning-oriented LLMs"),
      heading("0.183 <0.001 <0.001 <0.001 General-purpose LLMs"),
      heading("Cutoff overlap results"),
      heading("Results"),
    ]);
    expect(nodes.find((n) => n.text.startsWith("0.004"))?.role).toBe("other");
    expect(nodes.find((n) => n.text.startsWith("0.183"))?.role).toBe("other");
    expect(nodes.find((n) => n.text === "Cutoff overlap results")?.role).toBe("heading");
    expect(nodes.find((n) => n.text === "Results")?.role).toBe("heading");
  });

  it("demotes glued table column-header rails", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("Risk Category Example Causes Potential Consequences"),
      heading("Level of How this Study"),
      heading("What It Reflects"),
      heading("High Levels of Top-Down Attention Allocation"),
      heading("Results"),
    ]);
    expect(nodes.find((n) => n.text.startsWith("Risk Category"))?.role).toBe("other");
    expect(nodes.find((n) => n.text.startsWith("Level of"))?.role).toBe("other");
    expect(nodes.find((n) => n.text === "What It Reflects")?.role).toBe("other");
    expect(nodes.find((n) => n.text.startsWith("High Levels"))?.role).toBe("heading");
    expect(nodes.find((n) => n.text === "Results")?.role).toBe("heading");
  });

  it("demotes BMJ Open running footer chrome and dated stamps", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("Downloaded from"),
      heading("24 September 2026."),
      heading("Protected by copyright, including for uses related to text and data mining"),
      heading("Methods and analysis This will be a quasi- experimental study with a pre-post design"),
      heading("INTRODUCTION"),
      heading("Objectives"),
    ]);
    expect(nodes.find((n) => n.text === "Downloaded from")?.role).toBe("copyright");
    expect(nodes.find((n) => n.text === "24 September 2026.")?.role).toBe("other");
    expect(nodes.find((n) => n.text.startsWith("Protected by copyright"))?.role).toBe("copyright");
    expect(nodes.find((n) => n.text.startsWith("Methods and analysis"))?.role).toBe("paragraph");
    expect(nodes.find((n) => n.text === "INTRODUCTION")?.role).toBe("heading");
    expect(nodes.find((n) => n.text === "Objectives")?.role).toBe("heading");
  });

  it("demotes Frontiers / IEEE journal running headers from the outline", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("Frontiers in Psychology"),
      heading("Frontiers Bae"),
      heading("Frontiers in Li and Cui"),
      heading("IEEE XPLORE"),
      heading("11 frontiersin.org"),
      heading("1 Introduction"),
    ]);
    expect(nodes.find((n) => n.text === "Frontiers in Psychology")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "Frontiers Bae")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "Frontiers in Li and Cui")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "IEEE XPLORE")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "11 frontiersin.org")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "1 Introduction")?.role).toBe("heading");
  });

  it("demotes bare TABLE captions and glued column headers from the outline", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("TABLE 2"),
      heading("Dimension Interview item"),
      heading("4.2 Data analysis"),
    ]);
    expect(nodes.find((n) => n.text === "TABLE 2")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "Dimension Interview item")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "4.2 Data analysis")?.role).toBe("heading");
  });

  it("demotes Results-of prose wraps from the outline", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("Results of EFA indicated that AI Emotional Engagement consists of three"),
      heading("1 Introduction"),
      heading("Results"),
    ]);
    expect(nodes.find((n) => n.text.startsWith("Results of EFA"))?.role).toBe("paragraph");
    expect(nodes.find((n) => n.text === "1 Introduction")?.role).toBe("heading");
    expect(nodes.find((n) => n.text === "Results")?.role).toBe("heading");
  });

  it("maps bare COPYRIGHT labels to copyright role", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("COPYRIGHT"),
      heading("COPYRIGHT STATEMENT"),
      heading("AUTHENTICITY STATEMENT"),
      heading("ORIGINALITY STATEMENT"),
      heading("Copyright:"),
      heading("Copyright (1998) Society for Neuroscience."),
      heading("Copyright © 2022 Bueckle, Buehling, Shih and Börner."),
      heading("Results"),
    ]);
    expect(nodes.find((n) => n.text === "COPYRIGHT")?.role).toBe("copyright");
    expect(nodes.find((n) => n.text === "COPYRIGHT STATEMENT")?.role).toBe("copyright");
    expect(nodes.find((n) => n.text === "AUTHENTICITY STATEMENT")?.role).toBe("copyright");
    expect(nodes.find((n) => n.text === "ORIGINALITY STATEMENT")?.role).toBe("copyright");
    expect(nodes.find((n) => n.text === "Copyright:")?.role).toBe("copyright");
    expect(nodes.find((n) => n.text.startsWith("Copyright (1998)"))?.role).toBe("copyright");
    expect(nodes.find((n) => n.text.startsWith("Copyright © 2022"))?.role).toBe("copyright");
    expect(nodes.find((n) => n.text === "Results")?.role).toBe("heading");
  });

  it("demotes conceptual-framework figure captions from the outline", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading(
        "Conceptual framework illustrating the impact of human factors training on paediatric airway management",
      ),
      heading("METHODOLOGY"),
    ]);
    expect(nodes.find((n) => n.text.startsWith("Conceptual framework"))?.role).toBe("other");
    expect(nodes.find((n) => n.text === "METHODOLOGY")?.role).toBe("heading");
  });

  it("demotes lone math/OCR glyph headings", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("Results"),
      heading("Þ"),
      heading("Methods"),
    ]);
    expect(nodes.find((n) => n.text === "Results")?.role).toBe("heading");
    expect(nodes.find((n) => n.text === "Methods")?.role).toBe("heading");
    expect(nodes.find((n) => n.text === "Þ")?.role).not.toBe("heading");
  });

  it("demotes Nature Check for updates and Graphical Abstract chrome", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("Check for updates"),
      heading("GRAPHICAL ABSTRACT"),
      heading("Abbreviations"),
      heading("STUDY PROTOCOL"),
      heading("Parameter Value"),
      heading("1 Introduction"),
      heading("Results"),
    ]);
    expect(nodes.find((n) => n.text === "Check for updates")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "GRAPHICAL ABSTRACT")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "Abbreviations")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "STUDY PROTOCOL")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "Parameter Value")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "1 Introduction")?.role).toBe("heading");
    expect(nodes.find((n) => n.text === "Results")?.role).toBe("heading");
  });

  it("demotes table throughput metric cells from the outline", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("2019 118.80 GPixels/sec"),
      heading("10.26 GPixel/sec"),
      heading("1996 0.80 GPixels/sec"),
      heading("2. WHY DOES VIRTUAL REALITY HELP?"),
      heading("Results"),
    ]);
    expect(nodes.find((n) => n.text.startsWith("2019"))?.role).toBe("other");
    expect(nodes.find((n) => n.text.startsWith("10.26"))?.role).toBe("other");
    expect(nodes.find((n) => n.text.startsWith("1996"))?.role).toBe("other");
    expect(nodes.find((n) => n.text.startsWith("2. WHY"))?.role).toBe("heading");
    expect(nodes.find((n) => n.text === "Results")?.role).toBe("heading");
  });

  it("demotes Frontiers body-lead and structured-abstract wraps from the outline", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("Background and objective: This scoping review systematically mapped current"),
      heading("Methods:"),
      heading("Guided by the PRISMA-ScR framework, a systematic search of Chinese"),
      heading("Fishermen primarily refer to laborers who live and work"),
      heading("Exclusion criteria"),
      heading("Project Content"),
      heading("1 Introduction"),
      heading("2.1 Methodology introduction"),
      heading("3.3 Influencing factors: shared"),
    ]);
    expect(nodes.find((n) => n.text.startsWith("Background and objective"))?.role).toBe("paragraph");
    expect(nodes.find((n) => n.text === "Methods:")?.role).toBe("paragraph");
    expect(nodes.find((n) => n.text.startsWith("Guided by the PRISMA"))?.role).toBe("paragraph");
    expect(nodes.find((n) => n.text.startsWith("Fishermen primarily"))?.role).toBe("paragraph");
    expect(nodes.find((n) => n.text === "Exclusion criteria")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "Project Content")?.role).toBe("other");
    expect(nodes.find((n) => n.text === "1 Introduction")?.role).toBe("heading");
    expect(nodes.find((n) => n.text === "2.1 Methodology introduction")?.role).toBe("heading");
    expect(nodes.find((n) => n.text.startsWith("3.3 Influencing"))?.role).toBe("heading");
  });

  it("keeps layout-owned parent sections even after same-page subsections", () => {
    const nodes = demoteEditorialChromeHeadings([
      heading("5.3 IPMA analysis", 14),
      heading("5. Results", 14),
      heading("6 Discussion", 14),
    ]);
    // Without inline-split evidence the parent stays (geometry/order is separate).
    expect(nodes.find((n) => n.text === "5. Results")?.role).toBe("heading");
  });

  it("demotes Frontiers SEM effect-size cells spilled into the outline", () => {
    const caption: CanonicalNode = {
      id: "cap-t6",
      role: "caption",
      text: "TABLE 6 F-squared.",
      pageStart: 14,
      pageEnd: 14,
      confidence: 0.9,
      evidence: [],
      boundingBoxes: [{ page: 14, x: 40, y: 80, width: 160, height: 12 }],
      sourceAnchor: { page: 14, boundingBoxes: [] },
    } as CanonicalNode;
    const nodes = demoteEditorialChromeHeadings([
      caption,
      heading("Psychological resilience Employee wellbeing", 14),
      heading("0.107 (small–medium) 0.000 (none)", 14),
      heading("0.444 (large) 0.112 (medium)", 14),
      heading("6 Discussion", 14),
    ]);
    expect(nodes.find((n) => n.text?.startsWith("Psychological resilience"))?.role).not.toBe("heading");
    expect(nodes.find((n) => n.text?.startsWith("0.107"))?.role).not.toBe("heading");
    expect(nodes.find((n) => n.text?.startsWith("0.444"))?.role).not.toBe("heading");
    expect(nodes.find((n) => n.text === "6 Discussion")?.role).toBe("heading");
  });
});

describe("isProseRowAsHeading", () => {
  it("flags credit rows and wrapped lines that open on a number and a citation", () => {
    expect(isProseRowAsHeading("YWM: Data curation, Formal")).toBe(true);
    expect(isProseRowAsHeading("FH: Writing – review & editing. JA:")).toBe(true);
    expect(isProseRowAsHeading("2.6 (Berry et al., 2020), defined as an apnea–hypopnea index (AHI)")).toBe(true);
  });

  it("keeps real section titles", () => {
    expect(isProseRowAsHeading("2.6 Data curation")).toBe(false);
    expect(isProseRowAsHeading("Methods: Visualization of the data")).toBe(false);
    expect(isProseRowAsHeading("3.1 (Sub)sampling strategy")).toBe(false);
  });
});
