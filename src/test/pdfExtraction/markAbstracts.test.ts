import { describe, expect, it } from "vitest";
import { markAbstracts } from "../../services/pdfExtraction/resolver/documentResolver";
import type { CanonicalNode } from "../../services/pdfExtraction/canonical/types";

function node(
  role: CanonicalNode["role"],
  text: string,
  opts: { page?: number; x?: number; y?: number } = {},
): CanonicalNode {
  const page = opts.page ?? 1;
  const x = opts.x ?? 200;
  const y = opts.y ?? 100;
  return {
    id: `n-${role}-${text.slice(0, 12)}-${y}`,
    role,
    text,
    pageStart: page,
    pageEnd: page,
    confidence: 0.9,
    evidence: [],
    boundingBoxes: [{ page, x, y, width: 200, height: 12 }],
    sourceAnchor: { page, boundingBoxes: [], normalizedTextHash: text },
  } as CanonicalNode;
}

describe("markAbstracts", () => {
  it("keeps BMC structured-abstract bodies that begin with Methods for…", () => {
    const nodes = markAbstracts([
      node("heading", "Abstract", { y: 230, x: 200 }),
      node("heading", "Background", { y: 248, x: 200 }),
      node(
        "paragraph",
        "Methods for analyzing protein sequence similarity focus mainly on identifying homologous regions.",
        { y: 260, x: 200 },
      ),
      node("heading", "Results", { y: 280, x: 200 }),
      node(
        "paragraph",
        "In this research, we developed a new method incorporating three alignment strategies.",
        { y: 295, x: 200 },
      ),
      node("heading", "Conclusion", { y: 320, x: 200 }),
      node(
        "paragraph",
        "Our method introduces novel strategies that enhance the search for compositionally biased motifs.",
        { y: 335, x: 200 },
      ),
    ]);
    expect(nodes.filter((n) => n.role === "abstract").map((n) => n.text?.slice(0, 24))).toEqual([
      "Background",
      "Methods for analyzing pr",
      "Results",
      "In this research, we dev",
      "Conclusion",
      "Our method introduces no",
    ]);
  });

  it("keeps BMJ ABSTRACT+Introduction band despite sidebar cite crumbs", () => {
    const nodes = markAbstracts([
      node("heading", "ABSTRACT", { y: 100, x: 200 }),
      node("copyright", "Robin B, et al. Inequitably", { y: 110, x: 40 }),
      node("heading", "Introduction", { y: 120, x: 200 }),
      node(
        "paragraph",
        "Patient safety is a central pillar of healthcare quality. However, with repeated examples of failure in care.",
        { y: 140, x: 200 },
      ),
      node(
        "paragraph",
        "Methods and analysis A scoping review of empirical and grey literature will be conducted following the framework.",
        { y: 180, x: 200 },
      ),
      node("heading", "INTRODUCTION", { y: 220, x: 200 }),
      node(
        "paragraph",
        "Patient safety is a central pillar of health-care quality and defined as the avoidance of harm.",
        { y: 240, x: 200 },
      ),
    ]);
    const abs = nodes.filter((n) => n.role === "abstract").map((n) => (n.text ?? "").slice(0, 28));
    expect(abs).toEqual(
      expect.arrayContaining([
        "Introduction",
        "Patient safety is a central ",
        "Methods and analysis A scopi",
      ]),
    );
    expect(nodes.find((n) => n.text === "INTRODUCTION")?.role).toBe("heading");
  });

  it("keeps bare Results/Discussion as body headings after a plain abstract", () => {
    const nodes = markAbstracts([
      node("heading", "Abstract", { y: 110 }),
      node(
        "paragraph",
        "We compare human and model decisions across vignettes in a controlled setting.",
        { y: 140 },
      ),
      node("heading", "Results", { y: 200 }),
      node(
        "paragraph",
        "Model accuracy tracks human patterns on framing tasks.",
        { y: 230 },
      ),
      node("heading", "Discussion", { y: 500 }),
      node(
        "paragraph",
        "These patterns suggest the model mirrors several human biases in aggregate.",
        { y: 530 },
      ),
    ]);
    expect(nodes.find((n) => n.text === "Results")?.role).toBe("heading");
    expect(nodes.find((n) => n.text === "Discussion")?.role).toBe("heading");
    expect(nodes.filter((n) => n.role === "abstract").map((n) => n.text?.slice(0, 20))).toEqual([
      "We compare human and",
    ]);
  });

  it("opens a structured band when bare Abstract arrives as rival title", () => {
    const nodes = markAbstracts([
      node("title", "Abstract", { y: 300, x: 198 }),
      node("heading", "Background", { y: 330, x: 198 }),
      node(
        "paragraph",
        "In background noise, speakers adapt their speech production, giving rise to Lombard speech.",
        { y: 350, x: 198 },
      ),
      node(
        "paragraph",
        "Chen F, Kollmeier B (2026) Spectro-temporal vs. spectral features to predict the lombard gain",
        { y: 360, x: 36 },
      ),
      node(
        "paragraph",
        "and reproduction in any medium, provided the 1 Introduction original author and source are credited.",
        { page: 2, y: 100, x: 36 },
      ),
      node(
        "paragraph",
        "Speech intelligibility (SI) depends on the acoustic cues that carry linguistic information.",
        { page: 2, y: 120, x: 198 },
      ),
    ]);
    const roles = nodes.map((n) => ({ role: n.role, text: n.text?.slice(0, 40) }));
    expect(roles[0]).toEqual({ role: "heading", text: "Abstract" });
    expect(nodes.filter((n) => n.role === "abstract").map((n) => n.text?.slice(0, 24))).toEqual([
      "Background",
      "In background noise, spe",
    ]);
    expect(nodes.find((n) => n.text?.startsWith("Speech intelligibility"))?.role).toBe(
      "paragraph",
    );
    expect(nodes.find((n) => n.text?.startsWith("Chen F"))?.role).toBe("paragraph");
  });

  it("keeps PLOS Abstract band when Background/Methods arrive as other", () => {
    const nodes = markAbstracts([
      node("heading", "Abstract", { y: 282, x: 200 }),
      node("paragraph", "a1111111111 a1111111111", { y: 289, x: 36 }),
      node("other", "Background", { y: 324, x: 200 }),
      node(
        "paragraph",
        "Mental illness is a global problem that receives less attention.",
        { y: 341, x: 200 },
      ),
      node("copyright", "Citation:", { y: 375, x: 36 }),
      node(
        "paragraph",
        "Despite health professionals’ participation in traditional healing.",
        { y: 383, x: 200 },
      ),
      node("other", "Methods", { y: 459, x: 200 }),
      node(
        "paragraph",
        "A cross-sectional study was conducted with clinicians in two regions.",
        { y: 480, x: 200 },
      ),
    ]);
    expect(nodes.filter((n) => n.role === "abstract").map((n) => n.text?.slice(0, 24))).toEqual([
      "Background",
      "Mental illness is a glob",
      "Despite health professio",
      "Methods",
      "A cross-sectional study ",
    ]);
    expect(nodes.find((n) => n.text?.startsWith("a1111111111"))?.role).toBe("paragraph");
  });

  it("opens Abstract band from PLOS country + trailing Abstract chrome", () => {
    const nodes = markAbstracts([
      node(
        "paragraph",
        "University Affiliated First Hospital, CHINA Abstract",
        { y: 507, x: 200 },
      ),
      node(
        "paragraph",
        "We investigate the association between multimodal retinal imaging parameters with prevalent and incident atrial fibrillation (AF).",
        { y: 530, x: 200 },
      ),
      node("heading", "Introduction", { y: 620, x: 200 }),
    ]);
    expect(nodes.find((n) => n.text === "Abstract")?.role).toBe("heading");
    expect(
      nodes.find((n) => n.text?.startsWith("We investigate the association"))?.role,
    ).toBe("abstract");
    expect(nodes.find((n) => n.text === "Introduction")?.role).toBe("heading");
  });
});
