import { describe, expect, it } from "vitest";
import { reconstructDocument, type LayoutBlock, hasSourceTextIntegrity, isEquationLine, isFigureCaption, isTableCaption } from "../../services/pdfLayout";
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
    expect(isFigureCaption("図 3 の1行目に示す応答")).toBe(false);
    expect(isTableCaption("表 1: 被験者の内訳")).toBe(true);
    expect(isTableCaption("Table 1. Participant demographics")).toBe(true);
    expect(isTableCaption("Table 5 Factor reliabilities for smart clothing")).toBe(true);
    expect(isTableCaption("Table 7 (continued)")).toBe(true);
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
      "+ CL RL +",
    ];
    for (const sample of samples) expect(isEquationLine(sample), sample).toBe(false);
  });
});

describe("PDF reading order regression", () => {
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

  it("separates a narrow affiliation sidebar from body text near the top of a page", () => {
    const pages: ExtractedPage[] = [{
      pageNumber: 1,
      width: 612,
      height: 792,
      textItems: [
        { text: "The wearable acceptability range (WEAR) Scale has been a useful tool used in con-", x: 185, y: 245, width: 328, height: 11, fontSize: 10, fontName: "Body", page: 1 },
        { text: "Department of Events, and Hospitality Apparel,", x: 56, y: 250, width: 78, height: 11, fontSize: 10, fontName: "Body", page: 1 },
        { text: "sumer behaviour and product development research to better identify the social", x: 185, y: 262, width: 320, height: 11, fontSize: 10, fontName: "Body", page: 1 },
        { text: "Management, Iowa State University, 31 Mackay Hall,", x: 56, y: 274, width: 78, height: 11, fontSize: 10, fontName: "Body", page: 1 },
        { text: "acceptance of wearable devices in this study.", x: 185, y: 274, width: 326, height: 11, fontSize: 10, fontName: "Body", page: 1 },
      ],
    }];
    const { blocks } = reconstructDocument(pages);
    const paragraphs = blocks.filter((block) => block.role === "paragraph");
    const bodyText = paragraphs.map((block) => block.text).join(" ");
    console.log(blocks.map((block) => ({ role: block.role, column: block.column, text: block.text, lines: block.lines.map((line) => ({ x: line.x, y: line.y, width: line.width, column: line.column })) })));

    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(bodyText).toContain("con- sumer behaviour");
    expect(bodyText).not.toContain("Department of Events");
    expect(bodyText).not.toContain("Mackay Hall");
    expect(paragraphs.some((block) => block.text.includes("Department of Events"))).toBe(true);
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
});
