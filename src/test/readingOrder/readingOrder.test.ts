import { describe, expect, it } from "vitest";
import { reconstructDocument, type LayoutBlock, hasSourceTextIntegrity, isEquationLine, isFigureCaption, isTableCaption, composeSpacingAccents, looksLikeAuthorList } from "../../services/pdfLayout";
import type { ExtractedPage } from "../../services/pdfService";
import { FIXTURES } from "./builders";

function tokensInOrder(haystack: string, tokens: string[]): void {
  let from = 0;
  for (const token of tokens) {
    const idx = haystack.indexOf(token, from);
    expect(idx, `expected ${token} after previous token`).toBeGreaterThanOrEqual(0);
    from = idx + token.length;
  }
}

function joined(blocks: LayoutBlock[]): string {
  return blocks.map((b) => b.text).join("\n");
}

function bodyBlocks(blocks: LayoutBlock[]): LayoutBlock[] {
  return blocks.filter(
    (b) => b.role !== "header" && b.role !== "footer" && b.role !== "copyright"
  );
}

/** Left/right lines must not alternate one-by-one on a simple two-column page. */
function columnRuns(blocks: LayoutBlock[]): string[] {
  return bodyBlocks(blocks)
    .filter((b) => b.column === "left" || b.column === "right")
    .map((b) => b.column);
}

function assertNoLineInterleave(runs: string[]): void {
  const compact: string[] = [];
  for (const col of runs) {
    if (compact[compact.length - 1] !== col) compact.push(col);
  }
  const flips = compact.length;
  expect(
    flips,
    `column sequence ${runs.join(",")} looks interleaved`
  ).toBeLessThanOrEqual(4);
}

describe("Japanese figure and table captions", () => {
  it("recognizes 図 and 表 captions but not in-sentence 図 N の", () => {
    expect(isFigureCaption("図 1: 視聴覚情報処理過程と記憶に関する認知モデル")).toBe(
      true
    );
    expect(isFigureCaption("図1：先行研究で利用された映像の一例")).toBe(true);
    expect(isFigureCaption("Figure 2. A workshop layout.")).toBe(true);
    expect(isFigureCaption("Fig. 1, The general areas for wearable objects")).toBe(true);
    expect(isFigureCaption("Figure 3, Even simple motions change body shape")).toBe(true);
    expect(isFigureCaption("FIGURE 1 | Experimental design of the dual-task study.")).toBe(true);
    expect(isFigureCaption("FIGURE 1PRISMA flow diagram of study selection.")).toBe(true);
    expect(isFigureCaption("Fig. 2lexico-grammatical features of register")).toBe(true);
    expect(isFigureCaption("Figure 3 “日” family ECM.")).toBe(true);
    expect(isFigureCaption("Figure 2 shows the distribution of scores.")).toBe(false);
    expect(isFigureCaption("Table 6 summarises different segmentation methods")).toBe(false);
    expect(isTableCaption("Table 6 summarises different segmentation methods")).toBe(false);
    expect(isTableCaption("Table 1 lists the results of the experiment.")).toBe(false);
    expect(isTableCaption("TABLE 1 List of corpus data used in the research.")).toBe(true);
    expect(isFigureCaption("図 3 の1行目に示す応答")).toBe(false);
    expect(isTableCaption("表 1: 被験者の内訳")).toBe(true);
    expect(isTableCaption("Table 1. Participant demographics")).toBe(true);
    expect(isTableCaption("TABLE 2 | Baseline characteristics")).toBe(true);
    expect(isTableCaption("Table 5 Factor reliabilities for smart clothing")).toBe(true);
    expect(isTableCaption("Table 7 (continued)")).toBe(true);
    expect(isTableCaption("Table 1 (Continued).")).toBe(true);
    expect(isTableCaption("Table 2.5: Light truck crash rates")).toBe(true);
    expect(isTableCaption("Table A.3.1 Nested appendix result")).toBe(true);
    expect(isTableCaption("Table A6: Additional study on model size")).toBe(true);
    expect(isTableCaption("Table S2. Primer sequences")).toBe(true);
    expect(isFigureCaption("Figure A3: Error analysis")).toBe(true);
    expect(isFigureCaption("Fig. S1. Study flow")).toBe(true);
    expect(isTableCaption("Table A6 shows the full results")).toBe(false);
  });

  it("rejoins a visually shared caption whose native title has a broken vertical coordinate", () => {
    const { blocks } = reconstructDocument([{
      pageNumber: 1,
      width: 612,
      height: 792,
      textItems: [
        { text: "Table 2.5:", x: 68, y: 539, width: 56, height: 12, fontSize: 12, fontName: "CaptionBold", page: 1 },
        // The source PDF paints this beside the identifier but records it
        // with an unrelated baseline. The repair must use native style and
        // left alignment, not assume adjacent y coordinates.
        { text: "Light truck crash rates in NSW in 2000 and 2011", x: 68, y: 468, width: 274, height: 12, fontSize: 12, fontName: "CaptionBold", page: 1 },
        { text: "Crashes", x: 68, y: 516, width: 44, height: 10, fontSize: 10, fontName: "Body", page: 1 },
        { text: "93", x: 210, y: 516, width: 12, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      ],
    }]);
    expect(blocks.some((block) =>
      block.role === "table_caption" &&
      block.text === "Table 2.5: Light truck crash rates in NSW in 2000 and 2011"
    )).toBe(true);
    expect(blocks.some((block) => block.role === "paragraph" && /Light truck crash rates/.test(block.text))).toBe(false);
  });
});

describe("font-transition inline labels", () => {
  it("separates a short styled label from a complete sentence on the same baseline", () => {
    const { lines, blocks } = reconstructDocument([{
      pageNumber: 4,
      width: 612,
      height: 792,
      textItems: [
        { text: "Errors", x: 63, y: 493, width: 25, height: 9, fontSize: 8.8, fontName: "g_d0_f12", page: 4 },
        { text: "Given that AI systems fundamentally lack the kind of de-", x: 96, y: 493, width: 245, height: 9, fontSize: 8.8, fontName: "g_d0_f3", page: 4 },
      ],
    }]);
    expect(lines.some((line) => line.text === "Errors")).toBe(true);
    expect(lines.some((line) => line.text.startsWith("Given that AI systems"))).toBe(true);
    expect(blocks.some((block) => block.role === "heading" && block.text === "Errors")).toBe(true);
    expect(blocks.some((block) => block.role === "paragraph" && block.text.startsWith("Given that AI systems"))).toBe(true);
  });
});

describe("byline superscripts in the same line", () => {
  const it8 = (text: string, x: number, y: number, width: number, fontSize: number) =>
    ({ text, x, y, width, height: fontSize, fontSize, fontName: "f", page: 1 });
  const lineText = (items: ReturnType<typeof it8>[]) =>
    reconstructDocument([{ pageNumber: 1, width: 612, height: 792, textItems: items }]).lines.map((l) => l.text).join(" | ");
  it("puts the comma back at a raised affiliation marker, not at a subscript", () => {
    expect(lineText([it8("Zhenhua Liu", 81, 120, 66, 12), it8("1", 147, 115.6, 4, 8), it8("Tong Zhu", 158, 120, 49, 12), it8("1", 207, 115.6, 4, 8)]))
      .toMatch(/Zhenhua Liu,\s*1?\s*Tong Zhu/);
    expect(lineText([it8("Accuracy F", 81, 120, 60, 12), it8("1", 141, 124, 4, 8), it8("MCC", 158, 120, 30, 12)])).not.toMatch(/F,/);
  });
});

describe("isEquationLine", () => {
  it("keeps a numbered displayed equation", () => {
    expect(isEquationLine("P = I × V ± Δ (1)")).toBe(true);
  });

  it("rejects hyphenated English, query strings, and bibliography URLs", () => {
    const samples = [
      "take into account a jewellery-, memory- and interaction-",
      "not yet been worn as ‘jewellery-to-be’ and states ‘the term ‘jewellery-to-be’ also carries with it notions of the jewel",
      "Unger-de Boer formulated a multi-disciplinary framework",
      "The jewellery-, interaction- and memory-perspective",
      "implications of this from a jewellery-, interaction- and",
      "interaction-, jewellery- and memory-perspective.",
      "on the hand-palm-side of the ring. To take a picture one",
      "rather expect a rubbing- or polishing-like action. The",
      "is a dot on the milky-way-like interface of the uploading",
      "integrate the jewellery-, interaction- and memory-",
      "proposals uses state-of-the-art technology when it comes to",
      "qualities, instead of using state-of-the-art technology",
      "golsteijn.pdf?ip=131.155.2.68&id=2639194&acc=AC",
      "CFID=556020003&CFTOKEN=28091657&__acm__=",
      "http://www.tednoten.com/work/portfolio/haunted-by-",
      "153–169. http://doi.org/10.1007/s00779-009-0279-7",
      "https://www.artefactgroup.com/content/work/purple-awearable-locket-for-the-21st-century/",
    ];
    for (const sample of samples) {
      expect(isEquationLine(sample), sample).toBe(false);
    }
  });

  it("rejects scientific prose fragments with inline units or citations", () => {
    const samples = [
      "mum of 100 − 200μW depending upon the available energy. Further,",
      "5 − 200μW/cm3 for piezoelectric) [2, 3]. Thus, studies have been conducted",
      "CR = 0.99), self-expression (AVE = 0.56; CR = 0.96), consequences",
      "(2.53±0.37), sound complexity (2.32±0.29), and emotional levels (valence 3.08±0.58 and arousal 2.49±0.37).",
      "(valence 3.08±0.58 and arousal 2.49±0.37).",
      "+ CL RL +",
    ];
    for (const sample of samples) expect(isEquationLine(sample), sample).toBe(false);
  });
});

describe("PDF reading order regression", () => {
  it("separates an embedded publisher license tail from body prose", () => {
    const mixed = `${"This abstract contains a sufficiently long body paragraph that should remain translatable. ".repeat(3)}ThisnationalworkLicense.is licensed under a Creative Commons Attribution-NoDerivatives 4.0 International license. ©ACM 2025`;
    const { blocks } = reconstructDocument([{
      pageNumber: 1, width: 612, height: 792,
      textItems: [{ text: mixed, x: 54, y: 300, width: 500, height: 10, fontSize: 10, fontName: "Body", page: 1 }],
    }]);
    const body = blocks.find((block) => block.role === "paragraph" && block.text.includes("This abstract"));
    const chrome = blocks.find((block) => block.role === "copyright");
    expect(body?.text).not.toContain("ThisnationalworkLicense");
    expect(chrome?.text).toContain("ThisnationalworkLicense");
  });

  it("keeps a narrow publication-rail date out of a body line on the same baseline", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 1, width: 612, height: 792,
      textItems: [
        { text: "15 February 2023", x: 74, y: 406, width: 55, height: 8, fontSize: 7, fontName: "Rail", page: 1 },
        { text: "participants had to mark the correct arrangement of building blocks, and a construction", x: 208, y: 408, width: 344, height: 9, fontSize: 9, fontName: "Body", page: 1 },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    const body = blocks.find((block) => block.text.includes("participants had to mark"));
    expect(body?.text).not.toContain("15 February 2023");
    expect(blocks.some((block) => block.text.includes("15 February 2023"))).toBe(true);
  });

  it("keeps repeated short sidebar labels apart from word-level body spans on the same baselines", () => {
    const pageNumber = 1;
    const sideLabels = ["Patient data", "Pathology", "Detection", "Segmentation", "Registration"];
    const bodyLines = [
      "publications. Hence, a complete overview of the field of medical learning is almost impossible to",
      "obtain and acquiring a full overview of medical sub-fields is becoming increasingly more difficult. Never-",
      "theless, several review and survey articles about medical deep learning have been published within the",
      "last few years. They focus, in general, on specific medical scenarios, like the analysis of medical images",
      "containing specific pathologies. The purpose of the review is to summarize the field of medical learning.",
    ];
    const textItems = bodyLines.flatMap((line, lineIndex) => {
      let x = 202;
      return line.split(/\s+/).map((word) => {
        const width = Math.max(3, word.length * 3.8);
        const item = { text: word, x, y: 100 + lineIndex * 9, width, height: 7.2, fontSize: 7.2, fontName: "Body", page: pageNumber };
        x += width + 3;
        return item;
      });
    });
    const { blocks } = reconstructDocument([{
      pageNumber,
      width: 595,
      height: 792,
      textItems: [
        ...sideLabels.map((text, index) => ({
          text,
          x: 38,
          y: 100 + index * 9,
          width: text.length * 3.2,
          height: 6.4,
          fontSize: 6.4,
          fontName: "Rail",
          page: pageNumber,
        })),
        ...textItems,
      ],
    }]);
    const body = blocks.find((block) => block.text.includes("publications."));
    const railBlocks = blocks.filter((block) => sideLabels.some((label) => block.text.includes(label)));

    expect(body?.text).toContain("the analysis of medical images");
    expect(body?.text).not.toContain("Patient data");
    expect(body?.text).not.toContain("Pathology");
    expect(blocks.some((block) => block.text.includes("Registration"))).toBe(true);
    expect(railBlocks.length).toBeGreaterThan(0);
    expect(railBlocks.every((block) => !block.text.includes("publications."))).toBe(true);
  });

  it("does not let a comma-ended sidebar absorb a same-height body continuation", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 1, width: 612, height: 792,
      textItems: [
        { text: "This article was submitted to", x: 56, y: 339, width: 105, height: 8, fontSize: 7, fontName: "Rail", page: 1 },
        { text: "Cognition,", x: 56, y: 348, width: 47, height: 8, fontSize: 7, fontName: "Rail", page: 1 },
        { text: "encoding for task-irrelevant items was enhanced when presented with", x: 222, y: 349, width: 315, height: 9, fontSize: 9, fontName: "Body", page: 1 },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    const body = blocks.find((block) => block.text.includes("encoding for task-irrelevant items"));
    const sidebar = blocks.find((block) => block.text.includes("This article was submitted"));

    expect(body?.text).toContain("encoding for task-irrelevant items");
    expect(body?.text).not.toContain("Cognition");
    expect(sidebar?.text).toContain("Cognition,");
  });

  it("keeps a multi-column cite rail from merging into the left body column", () => {
    // BMJ Open-style page: leftX≈147 abstract column, cite rail at x≈40, and a
    // right strengths column. Wrapped cite lines nearly touch the body origin.
    // Repeated wide left/right pairs seed detectPageColumns(leftX≈147).
    const columnPairs = Array.from({ length: 6 }, (_, index) => {
      const y = 430 + index * 14;
      return [
        {
          text: `Left body sentence number ${index} about airway training outcomes and planning.`,
          x: 147,
          y,
          width: 190,
          height: 9,
          fontSize: 9,
          fontName: "Body",
          page: 1,
        },
        {
          text: `Right strengths bullet number ${index} about metrics and observation.`,
          x: 377,
          y,
          width: 170,
          height: 9,
          fontSize: 9,
          fontName: "Body",
          page: 1,
        },
      ];
    }).flat();
    const pages: ExtractedPage[] = [{
      pageNumber: 1,
      width: 595,
      height: 794,
      textItems: [
        { text: "Open access", x: 44, y: 33, width: 55, height: 10, fontSize: 10, fontName: "Hdr", page: 1 },
        { text: "Protocol", x: 506, y: 33, width: 40, height: 10, fontSize: 10, fontName: "Hdr", page: 1 },
        { text: "Effect of simulation-based human factors training", x: 147, y: 80, width: 320, height: 18, fontSize: 18, fontName: "Title", page: 1 },
        { text: "Abid Ali Jamali", x: 147, y: 200, width: 90, height: 11, fontSize: 11, fontName: "Author", page: 1 },
        { text: "To cite: Jamali AA,", x: 41, y: 320, width: 78, height: 8, fontSize: 8, fontName: "Rail", page: 1 },
        { text: "ABSTRACT", x: 147, y: 318, width: 55, height: 10, fontSize: 10, fontName: "Head", page: 1 },
        { text: "STRENGTHS AND LIMITATIONS OF THIS STUDY", x: 365, y: 318, width: 180, height: 10, fontSize: 10, fontName: "Head", page: 1 },
        { text: "Introduction", x: 147, y: 340, width: 48, height: 9, fontSize: 9, fontName: "Body", page: 1 },
        { text: "Up to 40% of major complications during", x: 198, y: 340, width: 150, height: 9, fontSize: 9, fontName: "Body", page: 1 },
        { text: "This study uses a structured design.", x: 377, y: 340, width: 160, height: 9, fontSize: 9, fontName: "Body", page: 1 },
        { text: "simulation-based human", x: 41, y: 352, width: 74, height: 8, fontSize: 8, fontName: "Rail", page: 1 },
        { text: "airway management result from human factors.", x: 147, y: 352, width: 188, height: 9, fontSize: 9, fontName: "Body", page: 1 },
        { text: "study protocol for a quasi-", x: 41, y: 387, width: 78, height: 8, fontSize: 8, fontName: "Rail", page: 1 },
        { text: "of complications reduced. Simulation-based teaching", x: 147, y: 387, width: 177, height: 9, fontSize: 9, fontName: "Body", page: 1 },
        { text: "experimental pre-post study at", x: 41, y: 398, width: 95, height: 8, fontSize: 8, fontName: "Rail", page: 1 },
        { text: "provides real-time situations and allows healthcare", x: 147, y: 398, width: 190, height: 9, fontSize: 9, fontName: "Body", page: 1 },
        { text: "Protected by copyright, including for uses related to text and data mining.", x: 569, y: 159, width: 200, height: 9, fontSize: 9, fontName: "Edge", page: 1 },
        ...columnPairs,
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    const intro = blocks.find((block) => /Up to 40% of major complications/i.test(block.text));
    const bodyContinuation = blocks.find((block) => /of complications reduced/i.test(block.text));
    const scrambled = blocks.filter((block) =>
      /quasi-\s*of complications|study protocol for a quasi-\s*of complications|Protected by copyright/i.test(block.text) &&
      block.role === "paragraph"
    );

    expect(intro?.text).toMatch(/Up to 40% of major complications/);
    expect(intro?.text).not.toMatch(/study protocol for a quasi-/i);
    expect(bodyContinuation?.text).toMatch(/of complications reduced/);
    expect(bodyContinuation?.text).not.toMatch(/study protocol for a quasi-/i);
    expect(scrambled).toHaveLength(0);
    expect(blocks.some((block) => block.role === "chrome" && /Protected by copyright/i.test(block.text))).toBe(true);
  });

  it("joins a standalone figure label and caption fragments across native column bands", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 1, width: 612, height: 792,
      textItems: [
        { text: "FIGURE 5", x: 55, y: 100, width: 28, height: 6, fontSize: 5.5, fontName: "Small", page: 1 },
        { text: "Mean scores of the achieved points in the respective memory task per group. The error bars depict the standard deviation from group mean. Significant", x: 55, y: 110, width: 472, height: 7, fontSize: 7, fontName: "Caption", page: 1 },
        { text: "differences between groups are marked, respectively, (* p<0.05, ** p<0.01, *** p<0.001).", x: 55, y: 119, width: 250, height: 7, fontSize: 7, fontName: "Caption", page: 1 },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    const caption = blocks.find((block) => block.role === "figure_caption");
    expect(caption?.text).toContain("FIGURE 5");
    expect(caption?.text).toContain("Significant differences between groups");
    expect(caption?.text).toContain("p<0.001");
  });

  it("stitches an unfinished paragraph across a page boundary", () => {
    const longPrefix = "Examination of the distribution of targets that were not tapped within the time limit indicated that the corners of the screen are generally prone to errors. One";
    const pages: ExtractedPage[] = [
      {
        pageNumber: 1, width: 612, height: 792,
        textItems: [{ text: longPrefix, x: 54, y: 750, width: 500, height: 10, fontSize: 10, fontName: "Body", page: 1 }],
      },
      {
        pageNumber: 2, width: 612, height: 792,
        textItems: [{ text: "exception to this is the low miss rate observed in the central region.", x: 54, y: 110, width: 500, height: 10, fontSize: 10, fontName: "Body", page: 2 }],
      },
    ];
    const { blocks } = reconstructDocument(pages);
    const paragraphs = blocks.filter((b) => b.role === "paragraph");
    expect(paragraphs.map((b) => b.text).join(" ")).toContain("One exception to this");
    expect(paragraphs).toHaveLength(1);
  });

  it("stitches an abstract continuation past an author metadata line", () => {
    const pages: ExtractedPage[] = [
      {
        pageNumber: 1, width: 612, height: 792,
        textItems: [
          { text: `${"The Internet offers possibilities for scientific disciplines. ".repeat(12)} registers can be`, x: 54, y: 750, width: 500, height: 10, fontSize: 10, fontName: "Body", page: 1 },
          { text: "& Veronika Laippala", x: 54, y: 770, width: 300, height: 8, fontSize: 8, fontName: "Author", page: 1 },
        ],
      },
      {
        pageNumber: 2, width: 612, height: 792,
        textItems: [{ text: "placed in a continuum based on the discriminative importance of lexis and grammar.", x: 54, y: 110, width: 500, height: 10, fontSize: 8, fontName: "Body", page: 2 }],
      },
    ];
    const { blocks } = reconstructDocument(pages);
    const paragraph = blocks.find((block) => block.text.includes("registers can be placed in a continuum"));
    expect(paragraph?.pageStart).toBe(1);
    expect(paragraph?.pageEnd).toBe(2);
  });

  it("stitches an author-year citation split at a page boundary", () => {
    const pages: ExtractedPage[] = [
      {
        pageNumber: 1, width: 612, height: 792,
        textItems: [{ text: "Household production theory has underlined the active role of consumers in creating value for themselves and their direct circle of family and friends (Becker 1965; Da et al. 2015; Greenwood et al. 2005; Muth", x: 54, y: 750, width: 500, height: 10, fontSize: 10, fontName: "Body", page: 1 }],
      },
      {
        pageNumber: 2, width: 612, height: 792,
        textItems: [{ text: "1966), the prominent shift is that other consumers also benefit from these activities.", x: 54, y: 110, width: 500, height: 10, fontSize: 10, fontName: "Body", page: 2 }],
      },
    ];
    const { blocks } = reconstructDocument(pages);
    const paragraph = blocks.find((block) => block.text.includes("Muth 1966), the prominent shift"));
    expect(paragraph?.pageStart).toBe(1);
    expect(paragraph?.pageEnd).toBe(2);
  });

  it("stitches a connector ending across pages without joining a new sentence", () => {
    const pages: ExtractedPage[] = [
      {
        pageNumber: 1, width: 612, height: 792,
        textItems: [{ text: "We plan to more widely explore use cases and to", x: 54, y: 750, width: 500, height: 10, fontSize: 10, fontName: "Body", page: 1 }],
      },
      {
        pageNumber: 2, width: 612, height: 792,
        textItems: [{ text: "gain a better understanding of its utility in a real life use context.", x: 54, y: 110, width: 500, height: 10, fontSize: 10, fontName: "Body", page: 2 }],
      },
    ];
    const { blocks } = reconstructDocument(pages);
    const paragraphs = blocks.filter((b) => b.role === "paragraph");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].text).toContain("to gain a better understanding");
  });

  it("stitches a proper-name phrase split at a page boundary", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 1, width: 612, height: 792, textItems: [
        { text: "Body temperature is an important vital sign which can indicate fever and is known to be correlated with activities such as eating, exercise and stress. However, continuous temperature monitoring poses a significant challenge. We present Thermal", x: 54, y: 700, width: 500, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      ] },
      { pageNumber: 2, width: 612, height: 792, textItems: [
        { text: "Earring, a first-of-its-kind smart earring that enables a reliable wearable solution for continuous temperature monitoring.", x: 54, y: 110, width: 500, height: 10, fontSize: 10, fontName: "Body", page: 2 },
      ] },
    ];
    const { blocks } = reconstructDocument(pages);
    const paragraph = blocks.find((block) => block.role === "paragraph");
    expect(paragraph?.text).toContain("present Thermal Earring, a first-of-its-kind");
    expect(paragraph?.pageStart).toBe(1);
    expect(paragraph?.pageEnd).toBe(2);
  });

  it("does not attach a short publisher mark at the page edge to lowercase prose", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 1, width: 612, height: 792, textItems: [
        { text: "1 3", x: 504, y: 745, width: 17, height: 15, fontSize: 15, fontName: "PublisherMark", page: 1 },
      ] },
      { pageNumber: 2, width: 612, height: 792, textItems: [
        { text: "means also that the application is intended for the personal use of the worker.", x: 51, y: 64, width: 238, height: 10, fontSize: 10, fontName: "Body", page: 2 },
      ] },
    ];
    const { blocks } = reconstructDocument(pages);
    expect(blocks.some((block) => block.text.includes("1 3 means also"))).toBe(false);
    expect(blocks.some((block) => block.text.startsWith("means also that the application"))).toBe(true);
  });

  it("skips a repeated edge mark and joins the actual cross-page paragraph continuation", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 1, width: 612, height: 792, textItems: [
        { text: "The design gives workers personal feedback", x: 338, y: 700, width: 220, height: 10, fontSize: 10, fontName: "Body", page: 1 },
        { text: "1 3", x: 504, y: 745, width: 17, height: 15, fontSize: 15, fontName: "PublisherMark", page: 1 },
      ] },
      { pageNumber: 2, width: 612, height: 792, textItems: [
        { text: "means also that the application is intended for personal use.", x: 54, y: 64, width: 280, height: 10, fontSize: 10, fontName: "Body", page: 2 },
        { text: "1 3", x: 52, y: 745, width: 17, height: 15, fontSize: 15, fontName: "PublisherMark", page: 2 },
      ] },
    ];
    const { blocks } = reconstructDocument(pages);
    const paragraph = blocks.find((block) => block.text.includes("The design gives workers"));
    expect(paragraph?.text).toContain("feedback means also that the application");
    expect(paragraph?.pageStart).toBe(1);
    expect(paragraph?.pageEnd).toBe(2);
    expect(blocks.some((block) => block.role === "footer" && block.text === "1 3")).toBe(true);
  });

  it("stitches same-column text split by a nearby affiliation line", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 1,
      width: 612,
      height: 792,
      textItems: [
        { text: "Wearable Device Acceptance", x: 390, y: 70, width: 180, height: 21, fontSize: 18, fontName: "Title", page: 1 },
        { text: "A. Researcher and B. Scientist", x: 390, y: 120, width: 180, height: 12, fontSize: 10, fontName: "Body", page: 1 },
        { text: "The wearable acceptability range is a useful instrument for consumer research", x: 185, y: 245, width: 328, height: 11, fontSize: 10, fontName: "Body", page: 1 },
        { text: "and in this study we aimed to introduce an extended", x: 185, y: 257, width: 320, height: 11, fontSize: 10, fontName: "Body", page: 1 },
        { text: "Department of Events and Hospitality Apparel", x: 56, y: 262, width: 95, height: 11, fontSize: 10, fontName: "Body", page: 1 },
        { text: "WEAR Scale to the apparel field by applying a revised instrument", x: 185, y: 269, width: 326, height: 11, fontSize: 10, fontName: "Body", page: 1 },
        { text: "with four dimensions for use in product development research.", x: 185, y: 281, width: 326, height: 11, fontSize: 10, fontName: "Body", page: 1 },
        { text: "Management, Iowa State University", x: 56, y: 286, width: 95, height: 11, fontSize: 10, fontName: "Body", page: 1 },
        { text: "Introduction", x: 185, y: 330, width: 120, height: 12, fontSize: 12, fontName: "Heading", page: 1 },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    const paragraph = blocks.find((block) => block.role === "paragraph" && block.text.includes("introduce an extended"));

    expect(paragraph?.text).toContain("extended WEAR Scale to the apparel field");
    expect(blocks.some((block) => block.role === "affiliation" && block.text.includes("Department of Events"))).toBe(true);
  });

  it("separates a narrow affiliation sidebar from body text near the top of a page", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 1,
      width: 612,
      height: 792,
      textItems: [
        { text: "Wearable Device Acceptance", x: 390, y: 70, width: 180, height: 21, fontSize: 18, fontName: "Title", page: 1 },
        { text: "A. Researcher and B. Scientist", x: 390, y: 120, width: 180, height: 12, fontSize: 10, fontName: "Body", page: 1 },
        { text: "The wearable acceptability range (WEAR) Scale has been a useful tool used in con‑", x: 185, y: 245, width: 328, height: 11, fontSize: 10, fontName: "Body", page: 1 },
        { text: "Department of Events, and Hospitality Apparel,", x: 56, y: 250, width: 78, height: 11, fontSize: 10, fontName: "Body", page: 1 },
        { text: "sumer behaviour and product development research to better identify the social", x: 185, y: 262, width: 320, height: 11, fontSize: 10, fontName: "Body", page: 1 },
        { text: "Management, Iowa State University, 31 Mackay Hall,", x: 56, y: 274, width: 78, height: 11, fontSize: 10, fontName: "Body", page: 1 },
        { text: "acceptance of wearable devices in this study.", x: 185, y: 274, width: 326, height: 11, fontSize: 10, fontName: "Body", page: 1 },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    const paragraphs = blocks.filter((block) => block.role === "paragraph");
    const body = paragraphs.find((block) => block.text.includes("consumer behaviour"));
    const affiliation = blocks.find((block) => block.text.includes("Department of Events"));
    const affiliationContinuation = blocks.find((block) => block.text.includes("Mackay Hall"));

    expect(body).toBeDefined();
    expect(body?.text).toContain("consumer behaviour");
    expect(body?.text).not.toContain("Department of Events");
    expect(body?.text).not.toContain("Mackay Hall");
    expect(affiliation).toBeDefined();
    expect(affiliationContinuation).toBeDefined();
    expect(affiliationContinuation?.text).not.toContain("consumer behaviour");
  });

  it("excludes native text embedded inside a figure image", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 1, width: 612, height: 792,
      imagePlacements: [{ id: "figure-1", x: 180, y: 180, width: 240, height: 180 }],
      textItems: [
        { text: "Body text remains", x: 54, y: 120, width: 180, height: 10, fontSize: 10, fontName: "Body", page: 1 },
        { text: "Embedded figure label", x: 220, y: 240, width: 120, height: 10, fontSize: 9, fontName: "FigureFont", page: 1 },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    const text = blocks.map((block) => block.text).join(" ");
    expect(text).toContain("Body text remains");
    expect(text).not.toContain("Embedded figure label");
  });

  it("reads a two-column page down the left column before the right column", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 1,
      width: 612,
      height: 792,
      textItems: Array.from({ length: 8 }, (_, index) => [
        { text: `LEFT_${index + 1}`, x: 54, y: 120 + index * 16, width: 220, height: 10, fontSize: 10, fontName: "Body", page: 1 },
        { text: `RIGHT_${index + 1}`, x: 338, y: 120 + index * 16, width: 220, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      ]).flat(),
    }];
    const { blocks, layouts } = reconstructDocument(pages);
    expect(layouts[0]?.isMultiColumn).toBe(true);
    const text = blocks.map((block) => block.text).join(" ");
    expect(text.indexOf("LEFT_1")).toBeLessThan(text.indexOf("RIGHT_1"));
    expect(text.indexOf("LEFT_8")).toBeLessThan(text.indexOf("RIGHT_1"));
  });

  it("joins an unfinished left-column sentence to a lowercase right-column continuation", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 1, width: 612, height: 792,
      textItems: [
        ...Array.from({ length: 8 }, (_, index) => ({ text: `left_${index}`, x: 54, y: 120 + index * 16, width: 220, height: 10, fontSize: 10, fontName: "Body", page: 1 })),
        ...Array.from({ length: 8 }, (_, index) => ({ text: index === 0 ? "the remaining clause" : `right_${index}`, x: 338, y: 120 + index * 16, width: 220, height: 10, fontSize: 10, fontName: "Body", page: 1 })),
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    expect(blocks.some((block) => block.text.includes("left_7 the remaining clause"))).toBe(true);
  });

  it("stitches a paragraph that starts low in the left column and continues at the top right", () => {
    const leftFiller = Array.from({ length: 7 }, (_, index) => ({
      text: `Independent left-column paragraph ${index} contains complete prose and ends here.`,
      x: 54,
      y: 120 + index * 64,
      width: 238,
      height: 10,
      fontSize: 10,
      fontName: "Body",
      page: 1,
    }));
    const leftFragment = [
      { text: "Within sharing economies, firms and consumers take on different production activities in the value chain, and", x: 54, y: 650, width: 238, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      { text: "we introduce two dimensions that capture how consumers co-produce value. The first dimension describes the", x: 54, y: 666, width: 238, height: 10, fontSize: 10, fontName: "Body", page: 1 },
    ];
    const rightContinuation = [
      { text: "extent to which consumers are active as co-producers in the value creation process.", x: 338, y: 100, width: 238, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      { text: "The second dimension captures the production activity and its organization.", x: 338, y: 124, width: 238, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      ...Array.from({ length: 6 }, (_, index) => ({
        text: `Independent right-column paragraph ${index} contains complete prose and ends here.`,
        x: 338,
        y: 190 + index * 64,
        width: 238,
        height: 10,
        fontSize: 10,
        fontName: "Body",
        page: 1,
      })),
    ];
    const { blocks } = reconstructDocument([{
      pageNumber: 1,
      width: 612,
      height: 792,
      textItems: [...leftFiller, ...leftFragment, ...rightContinuation],
    }]);
    const stitched = blocks.find((block) => block.text.includes("The first dimension describes"));
    expect(stitched?.text).toContain("the extent to which consumers are active");
    expect(stitched?.pageStart).toBe(1);
    expect(stitched?.pageEnd).toBe(1);
  });

  it("stitches an unfinished paragraph across consecutive pages", () => {
    const pages: ExtractedPage[] = [
      {
        pageNumber: 1, width: 612, height: 792,
        textItems: [
          { text: "The distribution of targets was examined carefully and the", x: 54, y: 620, width: 420, height: 10, fontSize: 10, fontName: "Body", page: 1 },
        ],
      },
      {
        pageNumber: 2, width: 612, height: 792,
        textItems: [
          { text: "results were consistent across participants.", x: 54, y: 200, width: 260, height: 10, fontSize: 10, fontName: "Body", page: 2 },
        ],
      },
    ];
    const { blocks } = reconstructDocument(pages);
    const paragraph = blocks.find((block) => block.text.includes("distribution of targets"));
    expect(paragraph?.text).toContain("the results were consistent");
    expect(paragraph?.pageStart).toBe(1);
    expect(paragraph?.pageEnd).toBe(2);
  });

  it("does not stitch an independent uppercase paragraph across pages", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 1, width: 612, height: 792, textItems: [
        { text: "The preceding paragraph ends without punctuation and", x: 54, y: 620, width: 320, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      ] },
      { pageNumber: 2, width: 612, height: 792, textItems: [
        { text: "Results were reported for all participants.", x: 54, y: 200, width: 260, height: 10, fontSize: 10, fontName: "Body", page: 2 },
      ] },
    ];
    const { blocks } = reconstructDocument(pages);
    expect(blocks.some((block) => block.text.includes("preceding paragraph") && block.text.includes("Results were"))).toBe(false);
  });

  it("keeps a page-boundary list continuation separate from an unfinished lead", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 1, width: 612, height: 792, textItems: [
        { text: "The procedure consists of the following task", x: 54, y: 700, width: 300, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      ] },
      { pageNumber: 2, width: 612, height: 792, textItems: [
        { text: "– entering a phrase five times with a stylus", x: 54, y: 120, width: 260, height: 10, fontSize: 10, fontName: "Body", page: 2 },
      ] },
    ];
    const { blocks } = reconstructDocument(pages);
    expect(blocks.some((block) => block.text.includes("following task") && block.text.includes("entering a phrase"))).toBe(false);
    expect(blocks.some((block) => block.text.includes("entering a phrase"))).toBe(true);
  });

  it("stitches a right-column tail to the next page's left-column continuation", () => {
    const page1Items = [
      ...Array.from({ length: 6 }, (_, i) => ({ text: `left filler ${i}.`, x: 54, y: 120 + i * 16, width: 180, height: 10, fontSize: 10, fontName: "Body", page: 1 })),
      { text: "The final clause of the analysis was reported and", x: 338, y: 700, width: 220, height: 10, fontSize: 10, fontName: "Body", page: 1 },
    ];
    const page2Items = [
      { text: "the interpretation remained stable across groups.", x: 54, y: 120, width: 240, height: 10, fontSize: 10, fontName: "Body", page: 2 },
      ...Array.from({ length: 5 }, (_, i) => ({ text: `right filler ${i}.`, x: 338, y: 120 + i * 16, width: 180, height: 10, fontSize: 10, fontName: "Body", page: 2 })),
    ];
    const { blocks } = reconstructDocument([{ pageNumber: 1, width: 612, height: 792, textItems: page1Items }, { pageNumber: 2, width: 612, height: 792, textItems: page2Items }]);
    expect(blocks.some((block) => block.text.includes("reported and the interpretation"))).toBe(true);
  });

  it("splits independent top-of-page columns when the right column starts a new sentence", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 1, width: 612, height: 792,
      textItems: [
        ...Array.from({ length: 6 }, (_, index) => ({ text: `left bullet ${index}.`, x: 54, y: 60 + index * 16, width: 220, height: 10, fontSize: 10, fontName: "Body", page: 1 })),
        ...Array.from({ length: 6 }, (_, index) => ({ text: index === 0 ? "Independent section begins here." : `right prose ${index}`, x: 338, y: 60 + index * 16, width: 220, height: 10, fontSize: 10, fontName: "Body", page: 1 })),
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    expect(blocks.some((block) => block.text.includes("left bullet 5.") && block.text.includes("Independent section"))).toBe(false);
  });

  it("preserves native rotation as line provenance without dropping rotated text", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 4,
      width: 612,
      height: 792,
      textItems: [
        { text: "Table", x: 120, y: 300, width: 24, height: 8, fontSize: 8, fontName: "Helvetica", page: 4, rotation: 90 },
        { text: "6", x: 120, y: 288, width: 6, height: 8, fontSize: 8, fontName: "Helvetica", page: 4, rotation: 90 },
      ],
    }];
    const { lines } = reconstructDocument(pages);
    expect(lines.some((line) => line.text.includes("Table") && line.rotation === 90)).toBe(true);
  });

  it("keeps overlapping rotated figure labels out of the same translation block", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 4,
      width: 612,
      height: 792,
      textItems: [
        { text: "Time services based on context", x: 303.6, y: 170.1, width: 61.1, height: 4.7, fontSize: 4.7, fontName: "FigureLabel", page: 4, rotation: -81.85 },
        { text: "Scope services when in doubt", x: 298.3, y: 174, width: 58, height: 4.7, fontSize: 4.7, fontName: "FigureLabel", page: 4, rotation: -79.92 },
        { text: "Assume subversive use", x: 257.7, y: 530.8, width: 45.5, height: 4.7, fontSize: 4.7, fontName: "FigureLabel", page: 4, rotation: 69.39 },
        { text: "Background errors", x: 330.7, y: 533.7, width: 35.6, height: 4.7, fontSize: 4.7, fontName: "FigureLabel", page: 4, rotation: 90.92 },
      ],
    }];
    const { blocks, lines } = reconstructDocument(pages);
    for (const [a, b] of [
      ["Time services", "Scope services"],
      ["Assume subversive", "Background errors"],
    ]) {
      expect(lines.some((line) => line.text.includes(a) && line.text.includes(b))).toBe(false);
      expect(blocks.some((block) => block.text.includes(a) && block.text.includes(b))).toBe(false);
    }
  });

  it("keeps a rotated caption label with its title line", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 4,
      width: 612,
      height: 792,
      textItems: [
        { text: "Table 6", x: 120, y: 300, width: 32, height: 8, fontSize: 8, fontName: "Helvetica", page: 4, rotation: 90 },
        { text: "Inter-item correlation matrix", x: 120, y: 312, width: 120, height: 8, fontSize: 8, fontName: "Helvetica", page: 4, rotation: 90 },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    const caption = blocks.find((block) => block.role === "table_caption");
    expect(caption?.text).toContain("Table 6");
    expect(caption?.text).toContain("Inter-item correlation matrix");
  });

  it("keeps a reverse-direction rotated caption label with its title line", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 4,
      width: 612,
      height: 792,
      textItems: [
        // Some PDFs advance the native text matrix in the opposite direction
        // along a 90° baseline. Reading order must use that baseline rather
        // than screen Y ordering.
        { text: "Table 6", x: 120, y: 724, width: 32, height: 8, fontSize: 8, fontName: "Helvetica", page: 4, rotation: 90 },
        { text: "Inter-item correlation matrix", x: 120, y: 692, width: 120, height: 8, fontSize: 8, fontName: "Helvetica", page: 4, rotation: 90 },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    const caption = blocks.find((block) => block.role === "table_caption");
    expect(caption?.text).toContain("Table 6");
    expect(caption?.text).toContain("Inter-item correlation matrix");
  });

  it("keeps every block reproducible from native source lines", () => {
    for (const build of Object.values(FIXTURES)) {
      const { blocks } = reconstructDocument(build());
      expect(blocks.every(hasSourceTextIntegrity)).toBe(true);
    }
  });

  it("preserves native text across mixed x-band input", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 7,
      width: 612,
      height: 792,
      textItems: [
        { text: "Left alpha continues", x: 54, y: 420, width: 92, height: 9, fontSize: 9, fontName: "Body", page: 7 },
        { text: "Right beta begins", x: 330, y: 420, width: 96, height: 9, fontSize: 9, fontName: "Body", page: 7 },
        { text: "Left gamma result.", x: 54, y: 438, width: 88, height: 9, fontSize: 9, fontName: "Body", page: 7 },
        { text: "Right delta result.", x: 330, y: 438, width: 92, height: 9, fontSize: 9, fontName: "Body", page: 7 },
        { text: "Left epsilon note.", x: 54, y: 456, width: 86, height: 9, fontSize: 9, fontName: "Body", page: 7 },
        { text: "Right zeta note.", x: 330, y: 456, width: 88, height: 9, fontSize: 9, fontName: "Body", page: 7 },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    const text = blocks.map((block) => block.text).join(" ");
    for (const token of ["Left alpha", "Left gamma", "Left epsilon", "Right beta", "Right delta", "Right zeta"]) {
      expect(text).toContain(token);
    }
    expect(blocks.every(hasSourceTextIntegrity)).toBe(true);
    expect(blocks.filter((block) => block.role === "paragraph").length).toBeGreaterThan(0);
  });

  it("keeps inferred x-band splits source-complete when bands contain punctuation and numbers", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 8, width: 612, height: 792,
      textItems: [
        { text: "Left sentence continues", x: 54, y: 320, width: 110, height: 9, fontSize: 9, fontName: "Body", page: 8 },
        { text: "Right result p < 0.001.", x: 330, y: 320, width: 110, height: 9, fontSize: 9, fontName: "Body", page: 8 },
        { text: "with a second clause.", x: 54, y: 338, width: 100, height: 9, fontSize: 9, fontName: "Body", page: 8 },
        { text: "Table 2 3.14 42%", x: 330, y: 338, width: 100, height: 9, fontSize: 9, fontName: "Body", page: 8 },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    const text = blocks.map((block) => block.text).join(" ");
    for (const token of ["Left sentence", "with a second clause.", "Right result", "0.001", "Table 2", "3.14", "42%"]) {
      expect(text).toContain(token);
    }
    expect(blocks.every(hasSourceTextIntegrity)).toBe(true);
  });

  it("does not merge a rotated grid band with a wide rotated note", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 14,
      width: 595,
      height: 791,
      textItems: [
        ...Array.from({ length: 6 }, (_, row) => ({
          text: `R${row + 1} 0.${row + 1} 0.${row + 2}`,
          x: 180 + row * 12,
          y: 120,
          width: 32,
          height: 8,
          fontSize: 8,
          fontName: "Body",
          page: 14,
          rotation: 90,
        })),
        {
          text: "Cronbach alpha and factor definition note outside the table.",
          x: 430,
          y: 120,
          width: 260,
          height: 8,
          fontSize: 8,
          fontName: "Body",
          page: 14,
          rotation: 90,
        },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    const note = blocks.find((block) => block.text.includes("Cronbach"));
    expect(note).toBeTruthy();
    expect(note?.text).not.toMatch(/R1.*Cronbach|Cronbach.*R1/);
  });

  it("separates a short prose note from a rotated grid band", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 14,
      width: 595,
      height: 791,
      textItems: [
        ...Array.from({ length: 6 }, (_, row) => ({
          text: `R${row + 1} 0.${row + 1}`,
          x: 180 + row * 12,
          y: 120,
          width: 32,
          height: 8,
          fontSize: 8,
          fontName: "Body",
          page: 14,
          rotation: 90,
        })),
        {
          text: "See note below.",
          x: 430,
          y: 120,
          width: 90,
          height: 8,
          fontSize: 8,
          fontName: "Body",
          page: 14,
        },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    const note = blocks.find((block) => block.text.includes("See note below"));
    expect(note).toBeTruthy();
    expect(note?.text).not.toMatch(/R1.*See note|See note.*R1/);
  });

  it("does not remerge a rotated native line with following prose", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 14,
      width: 612,
      height: 792,
      textItems: [
        { text: "Table 6 0.93 0.41", x: 160, y: 300, width: 90, height: 8, fontSize: 8, fontName: "Helvetica", page: 14, rotation: 90 },
        { text: "resulted in creation of a revised scale for smart apparel.", x: 420, y: 305, width: 170, height: 10, fontSize: 10, fontName: "Body", page: 14 },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    expect(blocks.some((block) => block.text.includes("Table 6") && block.text.includes("resulted"))).toBe(false);
    expect(blocks.some((block) => block.text.includes("resulted in creation"))).toBe(true);
  });

  it("stitches an unambiguously continued paragraph across adjacent pages", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 5, width: 612, height: 792, textItems: [{ text: "PAGE_END Examination of the distribution of targets showed errors. One", x: 54, y: 704, width: 500, height: 10, fontSize: 10, fontName: "Helvetica", page: 5 }] },
      { pageNumber: 6, width: 612, height: 792, textItems: [{ text: "exception to this is the low miss rate under the controlled condition.", x: 54, y: 86, width: 500, height: 10, fontSize: 10, fontName: "Helvetica", page: 6 }] },
    ];
    const { blocks } = reconstructDocument(pages);
    const stitched = blocks.find((block) => block.text.includes("PAGE_END"));
    expect(stitched?.text).toContain("One exception to this");
    expect(stitched?.pageStart).toBe(5);
    expect(stitched?.pageEnd).toBe(6);
    expect(stitched?.lines.map((line) => line.page)).toEqual([5, 6]);
    expect(stitched?.bbox.y).toBe(86);
    expect((stitched?.bbox.y ?? 0) + (stitched?.bbox.height ?? 0)).toBeGreaterThan(704);
  });

  it("stitches a right-column paragraph into the next page's left column", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 1, width: 612, height: 792, textItems: Array.from({ length: 8 }, (_, index) => ({
        text: `RIGHT_${index}`, x: 338, y: 620 + index * 10, width: 220, height: 8, fontSize: 8, fontName: "Body", page: 1,
      })) },
      { pageNumber: 2, width: 612, height: 792, textItems: Array.from({ length: 8 }, (_, index) => ({
        text: index === 0 ? "continues with the remaining sentence" : `LEFT_${index}`,
        x: 54, y: 86 + index * 10, width: 220, height: 8, fontSize: 8, fontName: "Body", page: 2,
      })) },
    ];
    const { blocks } = reconstructDocument(pages);
    const stitched = blocks.find((block) => block.text.includes("continues with"));
    expect(stitched?.pageStart).toBe(1);
    expect(stitched?.pageEnd).toBe(2);
    expect(stitched?.text).toContain("RIGHT_7 continues");
    expect(stitched?.lines.map((line) => line.page)).toContain(1);
    expect(stitched?.lines.map((line) => line.page)).toContain(2);
  });

  it("does not join an independent capitalized paragraph on the next page", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 5, width: 612, height: 792, textItems: [{ text: "PAGE_END The prior paragraph ends without a terminal mark", x: 54, y: 704, width: 500, height: 10, fontSize: 10, fontName: "Helvetica", page: 5 }] },
      { pageNumber: 6, width: 612, height: 792, textItems: [{ text: "Independent evidence begins a new paragraph with a capital letter.", x: 54, y: 86, width: 500, height: 10, fontSize: 10, fontName: "Helvetica", page: 6 }] },
    ];
    const { blocks } = reconstructDocument(pages);
    expect(blocks.filter((block) => block.role === "paragraph")).toHaveLength(2);
    expect(joined(blocks)).not.toContain("mark Independent evidence");
  });

  it("keeps an inline publisher-date annotation out of a body line", () => {
    const page: ExtractedPage = {
      pageNumber: 1,
      width: 595,
      height: 782,
      textItems: [
        { text: "MARGIN_BODY_A Recent research suggests that", x: 155, y: 273, width: 378, height: 9, fontSize: 9, fontName: "Body", page: 1 },
        { text: "Published: xx xx xxxx", x: 9, y: 277, width: 76, height: 8.5, fontSize: 8.5, fontName: "Meta", page: 1 },
        { text: "MARGIN_BODY_B the experiment evaluates the proposed method without metadata in the prose.", x: 155, y: 284, width: 382, height: 9, fontSize: 9, fontName: "Body", page: 1 },
      ],
    };
    const { blocks } = reconstructDocument([page]);
    const text = joined(blocks);
    expect(text).not.toContain("Published: xx xx xxxx");
    expect(text).toContain("MARGIN_BODY_A");
    expect(text).toContain("MARGIN_BODY_B");
  });

  it("separates a bold inline subsection label from following prose", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 2, width: 612, height: 792,
      textItems: [
        { text: "Subjects.", x: 90, y: 180, width: 48, height: 10, fontSize: 9, fontName: "Helvetica-Bold", page: 2 },
        { text: "Participants completed the task in a quiet laboratory setting.", x: 144, y: 180, width: 300, height: 10, fontSize: 9, fontName: "Helvetica", page: 2 },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    expect(blocks.some((b) => b.role === "heading" && b.text === "Subjects.")).toBe(true);
    expect(blocks.some((b) => b.role === "paragraph" && b.text.includes("Participants completed"))).toBe(true);
  });

  it("splits a DOI-bearing publisher line before trailing body prose", () => {
    const page: ExtractedPage = {
      pageNumber: 1, width: 612, height: 792,
      textItems: [{ text: "Copyright 2024 ACM http://dx.doi.org/10.1000/example First body sentence starts here and continues as ordinary prose.", x: 54, y: 300, width: 500, height: 9, fontSize: 7, fontName: "Meta", page: 1 }],
    };
    const { blocks } = reconstructDocument([page]);
    expect(blocks.some((b) => b.text.includes("doi.org"))).toBe(true);
    expect(blocks.some((b) => b.text.includes("First body sentence"))).toBe(true);
    expect(blocks.every(hasSourceTextIntegrity)).toBe(true);
  });

  it("joins a wrapped affiliation without absorbing the following body", () => {
    const items = [
      { text: "Affiliation Fixture Paper", x: 54, y: 80, width: 260, height: 18, fontSize: 16, fontName: "Title-Bold", page: 1 },
      { text: "Ada Lovelace", x: 54, y: 115, width: 100, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      { text: "Department of Computing, University of Example and", x: 54, y: 132, width: 300, height: 8, fontSize: 8, fontName: "Body", page: 1 },
      { text: "Research Centre, Example City, Japan", x: 54, y: 143, width: 240, height: 8, fontSize: 8, fontName: "Body", page: 1 },
      { text: "Abstract", x: 54, y: 165, width: 80, height: 10, fontSize: 10, fontName: "Body-Bold", page: 1 },
      { text: "This is the first body sentence with enough words to establish ordinary prose.", x: 54, y: 185, width: 480, height: 10, fontSize: 10, fontName: "Body", page: 1 },
    ];
    const { blocks } = reconstructDocument([{ pageNumber: 1, width: 612, height: 792, textItems: items }]);
    const affiliation = blocks.find((block) => block.role === "affiliation");
    expect(affiliation?.text).toContain("Research Centre");
    expect(blocks.some((block) => block.role === "paragraph" && block.text.startsWith("This is the first body"))).toBe(true);
  });

  it("keeps a spanning affiliation band ahead of two-column body text", () => {
    const page: ExtractedPage = {
      pageNumber: 1, width: 612, height: 792,
      textItems: [
        { text: "Geometry Boundary Study", x: 54, y: 70, width: 420, height: 18, fontSize: 17, fontName: "Title-Bold", page: 1 },
        { text: "Ada Lovelace and Alan Turing", x: 54, y: 102, width: 220, height: 10, fontSize: 10, fontName: "Body", page: 1 },
        { text: "Department of Computing, Example University", x: 54, y: 120, width: 360, height: 8, fontSize: 8, fontName: "Body", page: 1 },
        { text: "Abstract", x: 54, y: 150, width: 70, height: 10, fontSize: 11, fontName: "Body-Bold", page: 1 },
        { text: "ABSTRACT_BAND This abstract spans the page before two-column body content begins.", x: 54, y: 168, width: 500, height: 9, fontSize: 9, fontName: "Body", page: 1 },
        { text: "Introduction", x: 54, y: 220, width: 100, height: 10, fontSize: 11, fontName: "Body-Bold", page: 1 },
        { text: "LEFT_BODY This left column paragraph remains after the abstract.", x: 54, y: 245, width: 230, height: 9, fontSize: 9, fontName: "Body", page: 1 },
        { text: "RIGHT_BODY This right column paragraph follows the left column.", x: 318, y: 245, width: 230, height: 9, fontSize: 9, fontName: "Body", page: 1 },
      ],
    };
    const { blocks } = reconstructDocument([page]);
    const affiliation = blocks.find((b) => b.role === "affiliation");
    const abstract = blocks.find((b) => /ABSTRACT_BAND/.test(b.text));
    expect(affiliation?.text).toContain("Example University");
    expect(affiliation && abstract && blocks.indexOf(affiliation) < blocks.indexOf(abstract)).toBe(true);
    expect(blocks.filter((b) => b.role === "paragraph").some((b) => /Example University/.test(b.text))).toBe(false);
    const body = joined(bodyBlocks(blocks));
    tokensInOrder(body, ["ABSTRACT_BAND", "LEFT_BODY", "RIGHT_BODY"]);
  });

  it("keeps a long CJK abstract line out of masthead affiliation", () => {
    const items = [
      { text: "智能人机交互的人因工程途径", x: 54, y: 80, width: 260, height: 18, fontSize: 16, fontName: "Title-Bold", page: 1 },
      { text: "许 为", x: 54, y: 112, width: 80, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      { text: "（浙江大学 心理科学研究中心，杭州 310058）", x: 54, y: 130, width: 300, height: 9, fontSize: 9, fontName: "Body", page: 1 },
      { text: "摘要 本文从以用户为中心的设计理念出发，在分析智能人机交互的人因特征的基础上，提出一个协同认知系统的新框架。", x: 54, y: 155, width: 500, height: 9, fontSize: 9, fontName: "Body", page: 1 },
    ];
    const { blocks } = reconstructDocument([{ pageNumber: 1, width: 612, height: 792, textItems: items }]);
    const abstract = blocks.find((block) => block.text.startsWith("摘要"));
    expect(abstract?.role).toBe("paragraph");
    expect(abstract?.role).not.toBe("affiliation");
  });

  it("does not stitch author metadata into a body paragraph across pages", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 1, width: 612, height: 792, textItems: [
        { text: "Metadata Paper", x: 54, y: 80, width: 240, height: 18, fontSize: 16, fontName: "Title-Bold", page: 1 },
        { text: "Ada Lovelace", x: 54, y: 112, width: 100, height: 10, fontSize: 10, fontName: "Body", page: 1 },
        { text: "Department of Computing, University of Example", x: 54, y: 130, width: 300, height: 8, fontSize: 8, fontName: "Body", page: 1 },
        { text: "Jörg Gross and Franziska Emmerling contributed equally to this work. Correspondence and requests for materials should be addressed to J.G. (email: mail@example.org)", x: 54, y: 720, width: 500, height: 8, fontSize: 8, fontName: "Body", page: 1 },
      ] },
      { pageNumber: 2, width: 612, height: 792, textItems: [
        { text: "been broadly associated with adaptive behaviour in the study.", x: 54, y: 86, width: 500, height: 10, fontSize: 10, fontName: "Body", page: 2 },
      ] },
    ];
    const { blocks } = reconstructDocument(pages);
    expect(joined(blocks)).not.toContain("mail@example.org) been");
  });

  it("keeps an attached numbered small-type footnote out of body prose", () => {
    const textItems = [
      { text: "Body paragraph with enough ordinary content to establish body type and layout.", x: 54, y: 560, width: 480, height: 10, fontSize: 10, fontName: "Helvetica", page: 1 },
      { text: "1Please contact the corresponding author for supplementary study material.", x: 54, y: 710, width: 480, height: 7, fontSize: 7, fontName: "Helvetica", page: 1 },
      { text: "Further footnote details remain in the same small type.", x: 54, y: 719, width: 480, height: 7, fontSize: 7, fontName: "Helvetica", page: 1 },
    ];
    const { blocks } = reconstructDocument([{ pageNumber: 1, width: 612, height: 792, textItems }]);
    const note = blocks.find((block) => block.text.startsWith("1Please contact"));
    expect(note?.role).toBe("footnote");
    expect(blocks.some((block) => block.role === "paragraph" && block.text.startsWith("1Please contact"))).toBe(false);
  });

  it("does not classify numeric measurement prose as a footnote", () => {
    const { blocks } = reconstructDocument([{
      pageNumber: 1,
      width: 612,
      height: 792,
      textItems: [{
        text: "180 bpm, which equals 1 Hz to 3 Hz). This line stands out distinctly",
        x: 54,
        y: 696,
        width: 240,
        height: 9,
        fontSize: 8.8,
        fontName: "Helvetica",
        page: 1,
      }],
    }]);
    expect(blocks[0]?.role).toBe("paragraph");
  });

  it("classifies a small author running header by top-of-page geometry", () => {
    const { blocks } = reconstructDocument([{
      pageNumber: 2,
      width: 612,
      height: 792,
      textItems: [{ text: "Author et al.", x: 520, y: 67, width: 50, height: 7, fontSize: 7, fontName: "Helvetica", page: 2 }],
    }]);
    expect(blocks[0]?.role).toBe("header");
  });

  it("classifies a publisher title with page suffix as a running header", () => {
    const body = Array.from({ length: 20 }, (_, index) => ({
      text: `Body line ${index} contains enough ordinary words to establish the page font baseline.`,
      x: 54,
      y: 160 + index * 12,
      width: 300,
      height: 11,
      fontSize: 10,
      fontName: "Helvetica",
      page: 2,
    }));
    const { blocks } = reconstructDocument([{
      pageNumber: 2,
      width: 612,
      height: 792,
      textItems: [
        { text: "A Smart Necklace for Silent Speech Recognition • 192:3", x: 320, y: 67, width: 230, height: 7, fontSize: 7, fontName: "Helvetica", page: 2 },
        ...body,
      ],
    }]);
    expect(blocks[0]?.role).toBe("header");
  });

  it("splits a body-style heading that is repeated at the start of its following prose", () => {
    const textItems = [
      "Vignette-based investigations",
      "For the vignette-based investigations, we collected canonical scenarios and recorded the model response.",
      "The following sentence continues the ordinary body paragraph with enough words for stable layout classification.",
    ].map((text, index) => ({
      text,
      x: 54,
      y: 120 + index * 12,
      width: 500,
      height: 11,
      fontSize: 10,
      fontName: "Helvetica",
      page: 2,
    }));
    const pages: ExtractedPage[] = [{ pageNumber: 2, width: 612, height: 792, textItems }];
    const { blocks } = reconstructDocument(pages);
    expect(blocks.find((block) => block.text === "Vignette-based investigations")?.role).toBe("heading");
    expect(blocks.some((block) => block.role === "paragraph" && block.text.startsWith("For the vignette-based investigations"))).toBe(true);
  });

  it("does not split ordinary prose which merely repeats a phrase later in the sentence", () => {
    const textItems = [
      "The Vignette-based investigations include several scenarios that are compared in the experiment.",
      "For the vignette-based investigations, participants recorded a response after each scenario.",
    ].map((text, index) => ({ text, x: 54, y: 120 + index * 12, width: 500, height: 11, fontSize: 10, fontName: "Helvetica", page: 1 }));
    const { blocks } = reconstructDocument([{ pageNumber: 1, width: 612, height: 792, textItems }]);
    expect(blocks.filter((block) => block.role === "heading")).toHaveLength(0);
  });

  it("does not promote a numbered heading fused with its first sentence", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 1,
      width: 612,
      height: 792,
      textItems: [{
        text: "6.2.1 Example participant results. Figure 10 shows the participant's signal.",
        x: 54,
        y: 120,
        width: 480,
        height: 10,
        fontSize: 10,
        fontName: "Helvetica",
        page: 1,
      }],
    }];
    const { blocks } = reconstructDocument(pages);
    expect(blocks.some((block) => block.role === "heading")).toBe(false);
    expect(blocks.find((block) => block.text.includes("Figure 10"))?.role).toBe("paragraph");
  });

  it("splits a native font transition into a numbered subsection heading", () => {
    const items = [
      { text: "Earlier prose ends", x: 54, y: 180, width: 120, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      { text: "here.", x: 178, y: 180, width: 28, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      { text: "2.1.", x: 220, y: 180, width: 24, height: 10, fontSize: 10, fontName: "HeadingFace", page: 1 },
      { text: "Subsection", x: 247, y: 180, width: 58, height: 10, fontSize: 10, fontName: "HeadingFace", page: 1 },
    ];
    const { blocks } = reconstructDocument([{ pageNumber: 1, width: 612, height: 792, textItems: items }]);
    expect(blocks.some((block) => block.role === "heading" && block.text.includes("2.1."))).toBe(true);
  });

  it("single-column keeps linear order", () => {
    const { blocks } = reconstructDocument(FIXTURES["single-column"]());
    const text = joined(bodyBlocks(blocks));
    tokensInOrder(text, ["SINGLECOL_P1", "SINGLECOL_P2", "SINGLECOL_P3"]);
    expect(blocks.some((b) => b.column === "left" && b.role === "paragraph")).toBe(
      false
    );
  });

  it("basic-two-column reads left column then right column", () => {
    const { blocks, layouts } = reconstructDocument(
      FIXTURES["basic-two-column"]()
    );
    expect(layouts[0]?.isMultiColumn).toBe(true);
    const text = joined(bodyBlocks(blocks));
    tokensInOrder(text, [
      "LEFTCOL_A",
      "LEFTCOL_H",
      "RIGHTCOL_A",
      "RIGHTCOL_H",
    ]);
    expect(text.indexOf("RIGHTCOL_A")).toBeGreaterThan(text.indexOf("LEFTCOL_H"));
    assertNoLineInterleave(columnRuns(blocks));
  });

  it("ACM-style two-column keeps spanning masthead then left then right", () => {
    const { blocks, layouts } = reconstructDocument(
      FIXTURES["ACM-style-two-column"]()
    );
    expect(layouts[0]?.isMultiColumn).toBe(true);
    const text = joined(bodyBlocks(blocks));
    tokensInOrder(text, [
      "ACMSTYLE Interactive",
      "ACMSTYLE_ABS",
      "ACMSTYLE_L1",
      "ACMSTYLE_L8",
      "ACMSTYLE_R1",
      "ACMSTYLE_R8",
    ]);
    assertNoLineInterleave(columnRuns(blocks));
  });

  it("keeps spanning metadata from splitting an established two-column page", () => {
    const page = FIXTURES["ACM-style-two-column"]()[0];
    page.textItems.push({
      text: "arXiv:2401.12345v1 [cs.HC] 12 Jan 2024",
      x: 54,
      y: 500,
      width: 504,
      height: 8,
      fontSize: 7,
      fontName: "Meta",
      page: 1,
    });
    const { blocks } = reconstructDocument([page]);
    const text = joined(bodyBlocks(blocks));
    expect(text.indexOf("ACMSTYLE_L8")).toBeLessThan(text.indexOf("ACMSTYLE_R1"));
  });

  it("full-width title is spanning and not absorbed into a column paragraph", () => {
    const { blocks } = reconstructDocument(FIXTURES["full-width-title"]());
    const title = blocks.find((b) => b.role === "title");
    expect(title?.text).toMatch(/ACMSTYLE Interactive Jewelry/);
    expect(title?.column === "spanning" || title?.column === "single").toBe(true);
    const mixed = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /ACMSTYLE Interactive Jewelry/.test(b.text) &&
        /ACMSTYLE_L1/.test(b.text)
    );
    expect(mixed).toBeUndefined();
  });

  it("full-width figure caption is not mixed into body paragraphs", () => {
    const { blocks } = reconstructDocument(FIXTURES["full-width-figure"]());
    const caption = blocks.find((b) => b.role === "figure_caption");
    expect(caption?.text).toContain("FWFIG_CAPTION");
    const text = joined(bodyBlocks(blocks));
    tokensInOrder(text, ["FWFIG_L8", "FWFIG_R8", "FWFIG_CAPTION", "FWFIG_L9"]);
    const mixed = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /FWFIG_CAPTION/.test(b.text) &&
        /FWFIG_L1|FWFIG_R1/.test(b.text)
    );
    expect(mixed).toBeUndefined();
  });

  it("figure inside a column stays in that column and is not body text", () => {
    const { blocks } = reconstructDocument(
      FIXTURES["figure-inside-column"]()
    );
    const caption = blocks.find((b) => b.role === "figure_caption");
    expect(caption?.text).toContain("FIGCOL_CAPTION");
    expect(caption?.column).toBe("left");
    const mixed = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /FIGCOL_CAPTION/.test(b.text) &&
        /FIGCOL_R1/.test(b.text)
    );
    expect(mixed).toBeUndefined();
    const text = joined(bodyBlocks(blocks));
    expect(text.indexOf("FIGCOL_L1")).toBeLessThan(text.indexOf("FIGCOL_CAPTION"));
    expect(text.indexOf("FIGCOL_CAPTION")).toBeLessThan(text.indexOf("FIGCOL_L3"));
  });

  it("complex first page drops header/footer/copyright from body", () => {
    const { blocks } = reconstructDocument(FIXTURES["complex-first-page"]());
    const text = joined(blocks);
    expect(text).not.toMatch(/Proceedings of TEI 2024/);
    expect(
      blocks.some(
        (b) =>
          (b.role === "paragraph" || b.role === "heading") &&
          /Permission to make digital or hard copies/.test(b.text)
      )
    ).toBe(false);
    const body = joined(bodyBlocks(blocks));
    expect(body).toContain("COMPLEX_ABS");
    expect(body).toContain("COMPLEX_L1");
    expect(body).toContain("COMPLEX_R1");
    tokensInOrder(body, ["COMPLEX_L8", "COMPLEX_R1"]);
    const affiliation = blocks.find((b) => /Example Institute College/.test(b.text));
    const abstract = blocks.find((b) => /COMPLEX_ABS/.test(b.text));
    expect(affiliation?.role).toBe("affiliation");
    expect(abstract && affiliation && blocks.indexOf(affiliation) < blocks.indexOf(abstract)).toBe(true);
    expect(body).toContain("Example Institute College");
    expect(blocks.filter((b) => b.role === "paragraph").some((b) => /Example Institute College/.test(b.text))).toBe(false);
  });

  it("footnote is not merged into mid-column body", () => {
    const { blocks } = reconstructDocument(FIXTURES["footnote"]());
    const text = joined(bodyBlocks(blocks));
    expect(text).toContain("FOOTNOTE_MARK");
    const note = blocks.find((b) => b.role === "footnote");
    expect(note?.text).toContain("FOOTNOTE_MARK");
    const mixed = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /FOOTNOTE_MARK/.test(b.text) &&
        /FOOT_L1/.test(b.text)
    );
    expect(mixed).toBeUndefined();
  });

  it("table caption stays a table_caption block", () => {
    const { blocks } = reconstructDocument(FIXTURES["table-caption"]());
    const caption = blocks.find((b) => b.role === "table_caption");
    expect(caption?.text).toContain("Table 1");
    expect(
      blocks.some((b) => b.role === "paragraph" && /Table 1/.test(b.text) && /TABLE_L1/.test(b.text))
    ).toBe(false);
  });

  it("displayed equation is not absorbed into a paragraph", () => {
    const { blocks } = reconstructDocument(FIXTURES["equation"]());
    const equation = blocks.find((b) => b.role === "equation");
    expect(equation?.text).toMatch(/P = I/);
    expect(
      blocks.some((b) => b.role === "paragraph" && /P = I/.test(b.text) && /EQ_L1/.test(b.text))
    ).toBe(false);
  });

  it("does not treat a sentence starting with Figure N, as a caption", () => {
    const { blocks } = reconstructDocument(FIXTURES["false-caption-sentence"]());
    expect(blocks.some((b) => b.role === "figure_caption")).toBe(false);
    expect(
      joined(bodyBlocks(blocks))
    ).toMatch(/Figure 2, the body itself blocks/);
  });

  it("references heading is not absorbed into a paragraph", () => {
    const { blocks } = reconstructDocument(FIXTURES["references"]());
    const heading = blocks.find(
      (b) => b.role === "heading" && /^references$/i.test(b.text.trim())
    );
    expect(heading).toBeDefined();
    const absorbed = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /References/.test(b.text) &&
        /REF_BODY/.test(b.text)
    );
    expect(absorbed).toBeUndefined();
    const bibAsHeading = blocks.find(
      (b) => b.role === "heading" && /REFENTRY_/.test(b.text)
    );
    expect(bibAsHeading).toBeUndefined();
  });

  it("does not treat a wrapped grant number as a section heading", () => {
    const { blocks } = reconstructDocument(FIXTURES["acknowledgment-grant"]());
    const grantHeading = blocks.find(
      (b) => b.role === "heading" && /016\.128\.303/.test(b.text)
    );
    expect(grantHeading).toBeUndefined();
    const support = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /STW VIDI grant number/.test(b.text) &&
        /016\.128\.303/.test(b.text)
    );
    expect(support).toBeDefined();
    expect(support?.text).toContain("Elise van den Hoven");
    const ackHeading = blocks.find(
      (b) => b.role === "heading" && /^acknowledgements?$/i.test(b.text.trim())
    );
    expect(ackHeading).toBeDefined();
  });

  it("page-1 title is a title, not a heading, and emails stay in the masthead", () => {
    const { blocks } = reconstructDocument(FIXTURES["ACM-style-two-column"]());
    const title = blocks.find((b) => b.role === "title");
    expect(title?.text).toMatch(/ACMSTYLE Interactive Jewelry/);
    expect(
      blocks.some(
        (b) => b.role === "heading" && /ACMSTYLE Interactive Jewelry/.test(b.text)
      )
    ).toBe(false);
    expect(
      blocks.some((b) => b.role === "heading" && /@example\.ac\.uk/.test(b.text))
    ).toBe(false);
    expect(blocks.some((b) => b.role === "author" && /Ada Lovelace/.test(b.text))).toBe(
      true
    );
    expect(
      blocks.some((b) => b.role === "affiliation" && /University of Example/.test(b.text))
    ).toBe(true);
  });

  it("rejoins a hanging title across a Title-Case line without absorbing the author", () => {
    const { blocks } = reconstructDocument([{
      pageNumber: 1,
      width: 612,
      height: 792,
      textItems: [
        { text: "4th International Conference on Education, Management and Computing Technology (ICEMCT 2017)", x: 72, y: 48, width: 460, height: 11, fontSize: 11, fontName: "Meta", page: 1 },
        { text: "Research on the Effects of Different Listening Process Models in", x: 72, y: 84, width: 420, height: 14, fontSize: 14, fontName: "Title", page: 1 },
        { text: "Listening Comprehension and Memory Based on Cognitive Psychology", x: 72, y: 100, width: 420, height: 14, fontSize: 14, fontName: "Title", page: 1 },
        { text: "Qiuxia Guo", x: 72, y: 122, width: 90, height: 14, fontSize: 14, fontName: "Title", page: 1 },
        { text: "Nanchang Institute of Science &Technology, Nanchang 330108, China", x: 72, y: 141, width: 380, height: 11, fontSize: 11, fontName: "Body", page: 1 },
        { text: "Abstract. In order to explore the effects of listening process models.", x: 72, y: 200, width: 460, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      ],
    }]);
    const title = blocks.find((block) =>
      block.role === "title" && /Listening Process Models/.test(block.text)
    );
    expect(title?.text).toBe(
      "Research on the Effects of Different Listening Process Models in Listening Comprehension and Memory Based on Cognitive Psychology"
    );
    expect(blocks.some((block) => block.role === "title" && /Qiuxia Guo/.test(block.text))).toBe(false);
    expect(blocks.some((block) => block.role === "author" && block.text === "Qiuxia Guo")).toBe(true);
  });

  it("separates a small caps publisher badge from a large title continuation", () => {
    const { blocks } = reconstructDocument([{
      pageNumber: 1,
      width: 612,
      height: 842,
      textItems: [
        { text: "Motor engagement enhances", x: 222, y: 150, width: 286, height: 21, fontSize: 20.9, fontName: "Display", page: 1 },
        { text: "OPEN ACCESS", x: 57, y: 175.8, width: 47, height: 7, fontSize: 7, fontName: "Metadata", page: 1 },
        { text: "incidental memory for", x: 222, y: 175.5, width: 216, height: 21, fontSize: 20.9, fontName: "Display", page: 1 },
        { text: "Pietro Spataro,", x: 57, y: 199.5, width: 47, height: 7, fontSize: 7, fontName: "Author", page: 1 },
        { text: "task-irrelevant items", x: 222, y: 199.5, width: 198, height: 21, fontSize: 20.9, fontName: "Display", page: 1 },
        { text: "Example University", x: 57, y: 208, width: 100, height: 7, fontSize: 7, fontName: "Affiliation", page: 1 },
        { text: "A sentence from the abstract follows here.", x: 222, y: 325, width: 316, height: 9, fontSize: 9, fontName: "Body", page: 1 },
      ],
    }]);
    const title = blocks.find((block) => block.role === "title");
    expect(title?.text).toContain("Motor engagement enhances incidental memory for task-irrelevant items");
    expect(blocks.some((block) => block.role === "title" && block.text.includes("OPEN ACCESS"))).toBe(false);
  });

  it("hyphenated English and bibliography URLs are not displayed equations", () => {
    const { blocks } = reconstructDocument(FIXTURES["hyphenated-prose"]());
    expect(blocks.some((b) => b.role === "equation")).toBe(false);
    const prose = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /jewellery-, memory- and interaction-/.test(b.text)
    );
    expect(prose?.text).toMatch(/interaction-perspectives/);
    expect(
      blocks.some(
        (b) => b.role === "paragraph" && /Unger-de Boer formulated/.test(b.text)
      )
    ).toBe(true);
    expect(
      blocks.some((b) => b.role === "paragraph" && /doi\.org\/10\.1007/.test(b.text))
    ).toBe(true);
  });

  it("ACM classification catalog lines are paragraphs, not section headings", () => {
    const { blocks } = reconstructDocument(FIXTURES["classification-index"]());
    const catalog = blocks.find((b) => /H\.5\.m/.test(b.text));
    expect(catalog?.role).toBe("paragraph");
    expect(
      blocks.some((b) => b.role === "heading" && /H\.5\.m/.test(b.text))
    ).toBe(false);
    expect(
      blocks.some(
        (b) =>
          b.role === "heading" && /^ACM Classification Keywords$/i.test(b.text.trim())
      )
    ).toBe(true);
    const prose = blocks.find((b) => /CLASSIFIX_INTRO/.test(b.text));
    expect(prose?.role).toBe("paragraph");
  });

  it("Japanese conference papers get numbered headings, 図 captions, and authors", () => {
    const { blocks } = reconstructDocument(FIXTURES["japanese-conference"]());
    const headings = blocks.filter((b) => b.role === "heading").map((b) => b.text);
    expect(headings.some((t) => /1 はじめに/.test(t))).toBe(true);
    expect(headings.some((t) => /2\.1 視聴覚情報処理と記憶/.test(t))).toBe(true);
    expect(headings.some((t) => /2\.2 関連研究/.test(t))).toBe(true);
    expect(headings.some((t) => /^参考文献$/.test(t.trim()))).toBe(true);
    expect(
      headings.some((t) => /Acquisition process of visual-auditory/.test(t))
    ).toBe(false);
    expect(headings.some((t) => /Kurihara Yuta/.test(t))).toBe(false);
    expect(headings.some((t) => /視線誘導部から情報付加部/.test(t))).toBe(false);

    const caption = blocks.find((b) => b.role === "figure_caption");
    expect(caption?.text).toContain("JACAPTION");
    expect(blocks.some((b) => b.role === "table_caption" && /JATABLE/.test(b.text))).toBe(
      true
    );
    expect(
      blocks.some(
        (b) => b.role === "figure_caption" && /図 3 の1行目/.test(b.text)
      )
    ).toBe(false);

    expect(blocks.some((b) => b.role === "author" && /栗原 勇太/.test(b.text))).toBe(
      true
    );
    expect(blocks.some((b) => b.role === "title" && /情報採餌理論/.test(b.text))).toBe(
      true
    );
    const affiliation = blocks.find((b) => b.role === "affiliation" && /東京大学/.test(b.text));
    expect(affiliation).toBeDefined();
    expect(blocks.some((b) => b.role === "paragraph" && /東京大学/.test(b.text) && b !== affiliation)).toBe(false);
    expect(
      blocks.some(
        (b) =>
          (b.role === "paragraph" || b.role === "heading") && /^J-040$/.test(b.text.trim())
      )
    ).toBe(false);
  });

  it("every named fixture produces at least one block", () => {
    for (const [name, build] of Object.entries(FIXTURES)) {
      const { blocks } = reconstructDocument(build());
      expect(blocks.length, name).toBeGreaterThan(0);
    }
  });

  it("reattaches Title Case wraps that look like person-name heuristics", () => {
    // Frontiers mastheads continue a large title as Title Case topic lines
    // (`…Work-Related` / `Human Computer Interaction` / `Questionnaire`).
    const line = (text: string, y: number, fontSize = 21) => ({
      text,
      x: 220,
      y,
      width: Math.min(300, text.length * fontSize * 0.52),
      height: fontSize,
      fontSize,
      fontName: "Title",
      page: 1,
    });
    const { blocks } = reconstructDocument([
      {
        pageNumber: 1,
        width: 595,
        height: 842,
        textItems: [
          line("Digital wellbeing experience in", 150),
          line("the workplace: development and", 174),
          line("validation of the Work-Related", 198),
          line("Human Computer Interaction", 222),
          line("Questionnaire", 246),
          {
            text: "A. Author",
            x: 220,
            y: 290,
            width: 70,
            height: 11,
            fontSize: 11,
            fontName: "Author",
            page: 1,
          },
          {
            text: "Abstract body text that is long enough to anchor body font detection for the page layout heuristics.",
            x: 220,
            y: 340,
            width: 320,
            height: 10,
            fontSize: 10,
            fontName: "Body",
            page: 1,
          },
        ],
      },
    ]);
    const title = blocks.find((b) => b.role === "title");
    expect(title?.text).toContain("Work-Related Human Computer Interaction Questionnaire");
    expect(blocks.filter((b) => b.role === "title")).toHaveLength(1);
  });

  it("does not treat title-continuation Study/Photographs lines as person names", () => {
    // Regression for Cureus wraps: `Fundus Photographs: A Proof-of-Concept Study`
    // used to match looksLikePersonName and block same-font title reattachment.
    const line = (text: string, y: number, fontSize = 21) => ({
      text,
      x: 183,
      y,
      width: Math.min(360, text.length * fontSize * 0.48),
      height: fontSize,
      fontSize,
      fontName: "Title",
      page: 1,
    });
    const { blocks } = reconstructDocument([
      {
        pageNumber: 1,
        width: 612,
        height: 792,
        textItems: [
          line("Automated Screening From Retinal", 80),
          line("Fundus Photographs: A Proof-of-Concept Study", 108),
          line("Using Google Cloud Vertex AI", 136),
          {
            text: "A. Author",
            x: 183,
            y: 180,
            width: 70,
            height: 11,
            fontSize: 11,
            fontName: "Author",
            page: 1,
          },
          {
            text: "Abstract body text that is long enough to anchor body font detection for the page layout heuristics used here.",
            x: 183,
            y: 240,
            width: 360,
            height: 10,
            fontSize: 10,
            fontName: "Body",
            page: 1,
          },
        ],
      },
    ]);
    const joined = blocks.map((b) => b.text).join("\n");
    expect(joined).toMatch(/Automated Screening From Retinal/);
    expect(joined).toMatch(/Fundus Photographs: A Proof-of-Concept Study/);
    expect(joined).toMatch(/Using Google Cloud Vertex AI/);
    // Prefer one contiguous masthead block rather than three orphan author lines.
    const masthead = blocks.filter(
      (b) =>
        /Fundus Photographs|Using Google Cloud|Automated Screening From Retinal/i.test(b.text),
    );
    expect(masthead.some((b) => /Fundus Photographs/i.test(b.text) && /Using Google Cloud/i.test(b.text))).toBe(
      true,
    );
  });

  it("rejoins a hanging `… and` title with an interrogative continuation line", () => {
    // Frontiers wraps: `… What Transfers and` + `What Doesn't` used to match
    // looksLikePersonName and drop the continuation from every block.
    const line = (text: string, y: number, fontSize = 21) => ({
      text,
      x: 178,
      y,
      width: Math.min(380, text.length * fontSize * 0.45),
      height: fontSize,
      fontSize,
      fontName: "Title",
      page: 1,
    });
    const { blocks } = reconstructDocument([
      {
        pageNumber: 1,
        width: 612,
        height: 792,
        textItems: [
          line("Exploring the Spatial Relationships", 148),
          line("Between Real and Virtual", 171),
          line("Experiences: What Transfers and", 194),
          line("What Doesn’t", 217),
          {
            text: "Gregory D. Clemenson, Lulian Wang, Zeqian Mao",
            x: 178,
            y: 243,
            width: 320,
            height: 9,
            fontSize: 9,
            fontName: "Author",
            page: 1,
          },
          {
            text: "Abstract body text that is long enough to anchor body font detection for the page layout heuristics used here.",
            x: 178,
            y: 290,
            width: 360,
            height: 10,
            fontSize: 10,
            fontName: "Body",
            page: 1,
          },
        ],
      },
    ]);
    const title = blocks.find((b) => b.role === "title");
    expect(title?.text).toMatch(/What Transfers and What Doesn/i);
    expect(blocks.some((b) => b.role === "author" && /^What Doesn/i.test(b.text.trim()))).toBe(false);
  });

  it("keeps spaced word-per-span display titles that wrap across a gutter", () => {
    // Nature-style mastheads emit one item per word with ~0.09em gaps. A
    // wrap line in the left column plus a same-baseline right fragment must
    // not become `Activevision…` or permute to `…linked in the…to category`.
    const words = [
      { text: "Active", x: 40, w: 74 },
      { text: "vision", x: 117, w: 71 },
      { text: "is", x: 190, w: 19 },
      { text: "linked", x: 212, w: 74 },
      { text: "to", x: 289, w: 26 },
      { text: "category", x: 318, w: 105 },
      { text: "selectivity", x: 426, w: 121 },
    ];
    const wrap = [
      { text: "in", x: 40, w: 23 },
      { text: "the", x: 66, w: 40 },
      { text: "individual", x: 108, w: 120 },
      { text: "brain", x: 230, w: 63 },
    ];
    const item = (
      text: string,
      x: number,
      y: number,
      width: number,
      fontSize = 26,
    ) => ({
      text,
      x,
      y,
      width,
      height: fontSize,
      fontSize,
      fontName: "Title",
      page: 1,
    });
    const { blocks } = reconstructDocument([
      {
        pageNumber: 1,
        width: 595,
        height: 842,
        textItems: [
          ...words.map((w) => item(w.text, w.x, 134, w.w)),
          ...wrap.map((w) => item(w.text, w.x, 162, w.w)),
          item("A. Author", 40, 210, 80, 11),
          item(
            "Abstract body text that is long enough to anchor body font detection for the page.",
            40,
            280,
            400,
            10,
          ),
        ],
      },
    ]);
    const title = blocks.find((b) => b.role === "title");
    expect(title?.text).toBe(
      "Active vision is linked to category selectivity in the individual brain",
    );
  });

  it("rejoins large stacked cover-title lines even when a middle span looks person-shaped", () => {
    const item = (text: string, y: number, fontSize = 32) => ({
      text,
      x: 78,
      y,
      width: text.length * fontSize * 0.5,
      height: fontSize,
      fontSize,
      fontName: "Title",
      page: 1,
    });
    const { blocks } = reconstructDocument([
      {
        pageNumber: 1,
        width: 612,
        height: 792,
        textItems: [
          item("Intelligent", 185),
          item("Human Computer", 223),
          item("Interaction", 261),
          {
            text: "LNCS 10688",
            x: 52,
            y: 262,
            width: 80,
            height: 12,
            fontSize: 12,
            fontName: "Body",
            page: 1,
          },
          {
            text: "Abstract body text that is long enough to anchor body font detection for the page.",
            x: 40,
            y: 340,
            width: 400,
            height: 10,
            fontSize: 10,
            fontName: "Body",
            page: 1,
          },
        ],
      },
    ]);
    const title = blocks.find((b) => b.role === "title");
    expect(title?.text).toBe("Intelligent Human Computer Interaction");
  });
});

describe("composeSpacingAccents", () => {
  it("composes LaTeX spacing accents and cedillas", () => {
    expect(composeSpacingAccents("D´ıaz and N´u˜nez-Barra, Qu´ebec, Franc¸ois")).toBe("Díaz and Núñez-Barra, Québec, François");
    expect(composeSpacingAccents("``quoted'' text")).toBe("``quoted'' text");
    expect(composeSpacingAccents("Hamiltonian H˜k")).toBe("Hamiltonian H˜k");
  });
});

describe("looksLikeAuthorList", () => {
  it("accepts AASTeX bylines with inline affiliation numbers", () => {
    expect(looksLikeAuthorList("Kotomi Taniguchi,1 Ryan M. Lau,2, 3 Takashi Onaka,4 Macarena Garcia Marin,5 Hideo Matsuhara,6")).toBe(true);
    expect(looksLikeAuthorList("IT30340 Mitacs Accelerate, and the Wallenberg AI, Autonomous Systems and Software Program (WASP), Sweden")).toBe(false);
  });
});
