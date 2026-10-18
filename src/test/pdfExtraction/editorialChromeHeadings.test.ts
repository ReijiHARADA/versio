import { describe, expect, it } from "vitest";
import { demoteEditorialChromeHeadings } from "../../services/pdfExtraction/resolver/documentResolver";
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
});
