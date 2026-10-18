import { describe, expect, it } from "vitest";
import { analyzeStructure } from "../../services/structureService";
import { extractFromPages, suppressImageBackedTableFragments } from "../../services/pdfExtraction/pipeline/extractAcademicPdf";
import type { PaperBlock } from "../../types/paper";
import { FIXTURES } from "../readingOrder/builders";
import { grobidEnricher } from "../../services/pdfExtraction/enrichers/grobid";
import { doclingEnricher } from "../../services/pdfExtraction/enrichers/docling";
import { nativeDocumentFromExtracted } from "../../services/pdfExtraction/native/fromExtracted";
import { generateGenericCandidates } from "../../services/pdfExtraction/generic/candidates";
import { projectCanonicalToPaper, splitFlattenedList } from "../../services/pdfExtraction/projection/toPaper";
import { attachLinesToBlocks } from "../../data/package/layoutFromExtraction";
import { detectPageColumns, figureImageRect, reconstructDocument, type LayoutBlock, type PageColumnLayout } from "../../services/pdfLayout";
import { extractPdfPages } from "../readingOrder/extractPdf";
import fs from "node:fs";
import path from "node:path";

describe("canonical extraction pipeline", () => {
  it("crops compact ruled table rows together with their table caption", () => {
    const layout: PageColumnLayout = {
      page: 6, pageWidth: 612, pageHeight: 792, isMultiColumn: true,
      gutterX: 300, leftX: 52, rightX: 310,
    };
    const rowBlock = (text: string, x: number, width: number): LayoutBlock => ({
      role: "paragraph",
      text,
      pageStart: 6,
      pageEnd: 6,
      column: "right",
      bbox: { page: 6, x, y: 132, width, height: 64 },
      lines: Array.from({ length: 6 }, (_, index) => ({
        text: `${text}-${index}`,
        items: [], page: 6, column: "right", x, y: 132 + index * 11,
        width, height: 8, fontSize: 8,
        bbox: { page: 6, x, y: 132 + index * 11, width, height: 8 },
      })),
    });
    const caption: LayoutBlock = {
      role: "table_caption", text: "Table 3. Finger functions.", pageStart: 6, pageEnd: 6,
      column: "right", bbox: { page: 6, x: 310, y: 206, width: 230, height: 18 }, lines: [],
    };
    const crop = figureImageRect(caption, [rowBlock("Finger Thumb Finger1", 341, 24), rowBlock("Function Call tapped contact", 389, 106), caption], layout);
    expect(crop).toMatchObject({ page: 6, y: 124, height: 74 });
  });

  it("crops a compact table stream below an above-table caption", () => {
    const layout: PageColumnLayout = {
      page: 6, pageWidth: 612, pageHeight: 792, isMultiColumn: true,
      gutterX: 300, leftX: 52, rightX: 310,
    };
    const row = (text: string, y: number): LayoutBlock => ({
      role: "paragraph", text, pageStart: 6, pageEnd: 6, column: "left",
      bbox: { page: 6, x: 55, y, width: 126, height: 8 },
      lines: [{ text, items: [], page: 6, column: "left", x: 55, y, width: 126, height: 8, fontSize: 8, bbox: { page: 6, x: 55, y, width: 126, height: 8 } }],
    });
    const caption: LayoutBlock = {
      role: "table_caption", text: "Table 2. Results.", pageStart: 6, pageEnd: 6,
      column: "left", bbox: { page: 6, x: 50, y: 362, width: 236, height: 8 }, lines: [],
    };
    const crop = figureImageRect(caption, [caption, row("Gist cue 0.82 0.77", 396), row("Detailed cue 0.84 0.77", 411), row("Low interest 0.80 0.68", 426)], layout);
    expect(crop).toMatchObject({ page: 6, y: 372, height: 70 });
  });

  it("crops full-column numeric cell rows below a compact table caption", () => {
    const layout: PageColumnLayout = {
      page: 6, pageWidth: 612, pageHeight: 792, isMultiColumn: true,
      gutterX: 300, leftX: 52, rightX: 310,
    };
    const row = (text: string, y: number): LayoutBlock => ({
      role: "paragraph", text, pageStart: 6, pageEnd: 6, column: "left",
      bbox: { page: 6, x: 52, y, width: 238, height: 8 },
      lines: [{ text, items: [
        { text: "Age", x: 52, y, width: 24, height: 8, fontSize: 8, fontName: "body", page: 6 },
        { text: "66.3", x: 145, y, width: 22, height: 8, fontSize: 8, fontName: "body", page: 6 },
        { text: "70.0", x: 202, y, width: 22, height: 8, fontSize: 8, fontName: "body", page: 6 },
        { text: "0.368", x: 252, y, width: 28, height: 8, fontSize: 8, fontName: "body", page: 6 },
      ], page: 6, column: "left", x: 52, y, width: 238, height: 8, fontSize: 8, bbox: { page: 6, x: 52, y, width: 238, height: 8 } }],
    });
    const caption: LayoutBlock = {
      role: "table_caption", text: "TABLE 2 | Baseline characteristics", pageStart: 6, pageEnd: 6,
      column: "left", bbox: { page: 6, x: 52, y: 68, width: 210, height: 8 }, lines: [],
    };
    const crop = figureImageRect(caption, [caption, row("Age 66.3 70.0 0.368", 87), row("Height 162.0 162.0 0.986", 102), row("BMI 28.0 27.4 0.693", 117)], layout);
    expect(crop).toMatchObject({ page: 6, y: 78, height: 55 });
  });

  it("hides caption-owned table fragments only after a rendered table crop is available", () => {
    const caption = {
      id: "table-caption",
      paperId: "p",
      order: 1,
      type: "table",
      original: "Table 3. Finger functions.",
      translated: null,
      translationStatus: "skipped",
      pageStart: 6,
      pageEnd: 6,
      boundingBoxes: [{ page: 6, x: 310, y: 206, width: 230, height: 18 }],
      parentBlockId: null,
      extractionConfidence: 0.95,
      metadata: { imageUrl: "data:image/jpeg;base64,crop", tableNumber: "Table 3", captionOriginal: "Table 3. Finger functions.", captionTranslated: null, column: "right" },
    } as PaperBlock;
    const column = {
      id: "table-column",
      paperId: "p",
      order: 0,
      type: "table",
      original: "Finger Thumb Finger1 Finger2",
      translated: null,
      translationStatus: "skipped",
      pageStart: 6,
      pageEnd: 6,
      boundingBoxes: [{ page: 6, x: 341, y: 132, width: 24, height: 64 }],
      parentBlockId: null,
      extractionConfidence: 0.995,
      metadata: { tableNumber: "Table", captionOriginal: "", captionTranslated: null, figureKey: "table-region-g-121", column: "right" },
    } as PaperBlock;
    const retainedWithoutCrop = suppressImageBackedTableFragments([{ ...caption, metadata: { ...caption.metadata, imageUrl: "" } }, column]);
    expect(retainedWithoutCrop).toHaveLength(2);
    expect(suppressImageBackedTableFragments([column, caption])).toEqual([caption]);
  });

  it("hides a source-fallback table region after its numbered caption receives an image", () => {
    const caption = {
      id: "table-caption", paperId: "p", order: 1, type: "table", original: "Table 2. Values.",
      translated: null, translationStatus: "skipped", pageStart: 5, pageEnd: 5,
      boundingBoxes: [{ page: 5, x: 314, y: 405, width: 231, height: 16 }], parentBlockId: null,
      extractionConfidence: 0.95,
      metadata: { imageUrl: "data:image/jpeg;base64,crop", tableNumber: "Table 2", captionOriginal: "Table 2. Values.", captionTranslated: null, column: "right" },
    } as PaperBlock;
    const fallback = {
      id: "table-region-fallback", paperId: "p", order: 0, type: "table", original: "Error dist. Finger 1 Finger 2",
      translated: null, translationStatus: "skipped", pageStart: 5, pageEnd: 5,
      boundingBoxes: [{ page: 5, x: 320, y: 333, width: 219, height: 10 }], parentBlockId: null,
      extractionConfidence: 0.995,
      metadata: { tableSourceFallback: true, column: "right", evidence: [{ label: "table-region-member" }] },
    } as PaperBlock;
    expect(suppressImageBackedTableFragments([fallback, caption])).toEqual([caption]);
  });

  it("hides caption-owned table fragments below an above-table caption", () => {
    const caption = {
      id: "table-caption", paperId: "p", order: 0, type: "table", original: "Table 2. Values.",
      translated: null, translationStatus: "skipped", pageStart: 5, pageEnd: 5,
      boundingBoxes: [{ page: 5, x: 314, y: 205, width: 231, height: 16 }], parentBlockId: null,
      extractionConfidence: 0.95,
      metadata: { imageUrl: "data:image/jpeg;base64,crop", tableNumber: "Table 2", captionOriginal: "Table 2. Values.", captionTranslated: null, column: "right" },
    } as PaperBlock;
    const fallback = {
      id: "table-region-below", paperId: "p", order: 1, type: "table", original: "Group A 0.42 0.57",
      translated: null, translationStatus: "skipped", pageStart: 5, pageEnd: 5,
      boundingBoxes: [{ page: 5, x: 320, y: 240, width: 219, height: 10 }], parentBlockId: null,
      extractionConfidence: 0.995,
      metadata: { tableSourceFallback: true, column: "right", evidence: [{ label: "table-region-member" }] },
    } as PaperBlock;
    expect(suppressImageBackedTableFragments([caption, fallback])).toEqual([caption]);
  });

  it("suppresses a cross-column table fragment through its canonical caption relation", () => {
    const caption = {
      id: "table-caption", paperId: "p", order: 0, type: "table", original: "Table 2. Values.",
      translated: null, translationStatus: "skipped", pageStart: 5, pageEnd: 5,
      boundingBoxes: [{ page: 5, x: 52, y: 76, width: 233, height: 18 }], parentBlockId: null,
      extractionConfidence: 0.95,
      metadata: { imageUrl: "data:image/jpeg;base64,crop", tableNumber: "Table 2", captionOriginal: "Table 2. Values.", captionTranslated: null, column: "left", captionOf: "g-42" },
    } as PaperBlock;
    const rightColumnFragment = {
      id: "table-region-right", paperId: "p", order: 1, type: "table", original: "R² 0.9996",
      translated: null, translationStatus: "skipped", pageStart: 5, pageEnd: 5,
      boundingBoxes: [{ page: 5, x: 545, y: 134, width: 70, height: 10 }], parentBlockId: null,
      extractionConfidence: 0.995,
      metadata: { figureKey: "table-region-g-42", canonicalNodeId: "g-42", column: "right" },
    } as PaperBlock;
    expect(suppressImageBackedTableFragments([caption, rightColumnFragment])).toEqual([caption]);
  });

  it("hides table-like text extracted inside an image-backed figure region", () => {
    const figure = {
      id: "figure-caption", paperId: "p", order: 1, type: "figure", original: "Figure 1. Vignette tasks.",
      translated: null, translationStatus: "pending", pageStart: 2, pageEnd: 2,
      boundingBoxes: [{ page: 2, x: 56, y: 300, width: 480, height: 34 }], parentBlockId: null,
      extractionConfidence: 0.95,
      metadata: {
        imageUrl: "data:image/jpeg;base64,crop", captionOriginal: "Figure 1. Vignette tasks.",
        figureNumber: "Figure 1", column: "single", regionBoundingBoxes: [{ page: 2, x: 56, y: 70, width: 480, height: 230 }],
      },
    } as PaperBlock;
    const fragment = {
      id: "figure-text-fragment", paperId: "p", order: 0, type: "table", original: "Linda is 31 years old...",
      translated: null, translationStatus: "skipped", pageStart: 2, pageEnd: 2,
      boundingBoxes: [{ page: 2, x: 70, y: 92, width: 186, height: 70 }], parentBlockId: null,
      extractionConfidence: 0.96,
      metadata: { tableSourceFallback: true, column: "single" },
    } as PaperBlock;
    expect(suppressImageBackedTableFragments([fragment, figure])).toEqual([figure]);
  });

  it("keeps a short diagram annotation out of an adjacent prose paragraph", async () => {
    const pdf = path.resolve("test-data/real-papers/cognitive-psychology-gpt3.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({ pages, paperId: "diagram-annotation-boundary", filePath: pdf, fileHash: "diagram-annotation-boundary", metadata: { pageCount: pages.length } });
    const contaminated = result.blocks.filter((block) => /Linda is 31/.test(block.original ?? ""));
    expect(contaminated.some((block) => /A:\s*Option 2/.test(block.original ?? ""))).toBe(false);
    expect(result.blocks.some((block) => block.original?.trim() === "A: Option 2.")).toBe(true);
  }, 60_000);

  it("does not promote a wrapped single-span vignette paragraph to a table", async () => {
    const pdf = path.resolve("test-data/real-papers/cognitive-psychology-gpt3.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "single-span-vignette-boundary",
      filePath: pdf,
      fileHash: "single-span-vignette-boundary",
      metadata: { pageCount: pages.length },
    });
    const vignette = result.blocks.find((block) => block.original.startsWith("Linda is 31 years old"));
    expect(vignette?.type).toBe("paragraph");
    expect(vignette?.translationStatus).toBe("pending");
    for (const prefix of ["Q: Which option is the most probable?", "- Option 1: Linda is a bank teller."]) {
      const block = result.blocks.find((candidate) => candidate.original.startsWith(prefix));
      expect(block?.type).toBe("paragraph");
    }
  }, 60_000);

  it("does not link a table caption to a nearby figure in a mixed thesis page", async () => {
    const pdf = path.resolve("test-fixtures/real-papers/pending-pdfs/ergonomics-fatigue-and-occupational-safety-in-short-haul-light-transport.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({ pages, paperId: "thesis-table-figure-boundary", filePath: pdf, fileHash: "thesis-table-figure-boundary", metadata: { pageCount: pages.length } });
    // The thesis contents page also lists `Table 4.1` with a trailing page
    // number. That navigation entry is correctly `other`; assert the actual
    // table caption in the body rather than depending on document order.
    const tableCaption = result.canonical.nodes.find((node) =>
      /^Table 4\.1:/i.test(node.text ?? "") &&
      !/\.{3,}\s*\d+\s*$/u.test(node.text ?? "")
    );
    expect(tableCaption?.role).toBe("caption");
    expect(tableCaption?.text).not.toMatch(/Driver fatigue a problem/);
    expect(result.canonical.nodes.some((node) => node.role === "table" && /n\s+No\s+Minor\s+Substantial\s+Major/.test(node.text ?? ""))).toBe(true);
    const relation = result.canonical.relations.find((candidate) => candidate.kind === "CAPTION_OF" && candidate.from === tableCaption?.id);
    const target = relation ? result.canonical.nodes.find((node) => node.id === relation.to) : undefined;
    expect(target?.role).not.toBe("figure");
    // This table's number and title are visually on one line but emitted as
    // incompatible native y coordinates. Keep the repaired caption as its
    // own table block instead of allowing same-baseline grid aggregation to
    // swallow it into a flattened source-only row.
    const hierarchicalCaption = result.canonical.nodes.find((node) =>
      node.role === "caption" && node.text === "Table 2.5: Light truck crash rates in NSW in 2000 and 2011"
    );
    expect(hierarchicalCaption).toBeDefined();
    expect(result.blocks.some((block) =>
      block.type === "table" && block.metadata.captionOriginal === hierarchicalCaption?.text &&
      block.metadata.detachedCaptionTitleRepaired === true
    )).toBe(true);
  }, 60_000);

  it("keeps an unedited author-copy notice out of body paragraphs", async () => {
    const pdf = path.resolve("test-fixtures/real-papers/pending-pdfs/computational-linguistics-nlp-translation.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages, paperId: "author-copy-notice", filePath: pdf, fileHash: "author-copy-notice",
      metadata: { pageCount: pages.length },
    });
    const notice = result.blocks.find((block) => /unedited author(?:’|')s copy/i.test(block.original ?? ""));
    expect(notice).toBeDefined();
    expect(notice?.original).not.toMatch(/As computing systems have become increasingly important/i);
    expect(result.blocks.some((block) => block.type === "paragraph" && /As computing systems have become increasingly important/i.test(block.original ?? "") && /unedited author(?:’|')s copy/i.test(block.original ?? ""))).toBe(false);
  }, 60_000);
  it("deduplicates a repeated native title layer", async () => {
    const pdf = path.resolve("test-data/real-papers/hfe-healthcare-scoping-2024.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({ pages, paperId: "repeated-title-layer", filePath: pdf, fileHash: "repeated-title-layer", metadata: { pageCount: pages.length } });
    const title = result.canonical.nodes.find((node) => node.role === "title");
    expect(title?.text).toBe("Principles for the conduct of human factors/ergonomics in healthcare: a scoping study of the published evidence");
  }, 60_000);

  it("keeps boxed abstract prose out of table fallback blocks", async () => {
    const pdf = path.resolve("test-data/real-papers/hfe-healthcare-scoping-2024.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({ pages, paperId: "boxed-abstract-prose", filePath: pdf, fileHash: "boxed-abstract-prose", metadata: { pageCount: pages.length } });
    const packaged = attachLinesToBlocks(result.blocks, result.layoutBlocks);
    const pageOne = packaged.filter((block) => block.pageStart === 1);
    expect(pageOne.some((block) => block.type === "paragraph" && /Principles for the conduct of human factors\/ergonomics/.test(block.original ?? ""))).toBe(true);
    expect(pageOne.some((block) => block.type === "paragraph" && /up to the fundamental principles/.test(block.original ?? ""))).toBe(true);
    expect(pageOne.some((block) => block.type === "table" && /Sharafkhani.*Background|WHAT IS ALREADY KNOWN.*Background/i.test(block.original ?? ""))).toBe(false);
    expect(pageOne.filter((block) => block.type === "table").some((block) => block.metadata.demotionReason === "weak-repeated-prose-grid")).toBe(false);
  }, 60_000);

  it("does not project vector figure labels as headings", async () => {
    const pdf = path.resolve("test-data/real-papers/interpreting-neural-networks.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({ pages, paperId: "vector-label-role", filePath: pdf, fileHash: "vector-label-role", metadata: { pageCount: pages.length } });
    const labels = result.canonical.nodes.filter((node) => /F1 F2 F3 F4 F5/.test(node.text ?? ""));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((node) => node.role === "other")).toBe(true);
  }, 60_000);

  it("merges wrapped Elsevier author rows without swallowing affiliations", async () => {
    const pdf = path.resolve("test-data/real-papers/medical-deep-learning-meta-review.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({ pages, paperId: "wrapped-elsevier-authors", filePath: pdf, fileHash: "wrapped-elsevier-authors", metadata: { pageCount: pages.length } });
    const authors = result.canonical.nodes.filter((node) => node.role === "author").map((node) => node.text ?? "").join(" ");
    expect(authors).toContain("Jan Egger");
    expect(authors).toContain("Christina Gsaxner");
    expect(authors).toContain("Jens Kleesiek");
    expect(authors).not.toContain("German Cancer Consortium");
  }, 60_000);

  it("keeps the wear-scale correlation matrix as skipped table blocks", async () => {
    const pdf = path.resolve("test-data/real-papers/wear-scale.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "wear-scale-table-regression",
      filePath: pdf,
      fileHash: "wear-scale-table-regression",
      metadata: { pageCount: pages.length },
    });
    const pageFourteen = result.blocks.filter((block) => block.pageStart === 14);
    // A numbered caption can now own a consolidated table region, so the
    // source-only projection need not expose every native cell separately.
    expect(pageFourteen.length).toBeGreaterThan(0);
    expect(pageFourteen.every((block) => block.type === "table")).toBe(true);
    expect(pageFourteen.every((block) => block.translationStatus === "skipped")).toBe(true);
    expect(pageFourteen.some((block) => /D1|Cronbach/.test(block.original ?? ""))).toBe(true);
  }, 60_000);

  it("keeps a multi-sentence statistical paragraph beside OzCHI tables translatable", async () => {
    const pdf = path.resolve("test-data/real-papers/ozchi-finger-specific-touch.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "ozchi-statistical-prose-regression",
      filePath: pdf,
      fileHash: "ozchi-statistical-prose-regression",
      metadata: { pageCount: pages.length },
    });
    const prose = result.blocks.find((block) =>
      /When considering the time taken for different fingers to tap targets/.test(block.original ?? "")
    );
    expect(prose?.type).toBe("paragraph");
    expect(prose?.translationStatus).toBe("pending");
    expect(prose?.original).toContain("p=0.007");
  }, 60_000);

  it("keeps split web access dates attached to their footnote URL", async () => {
    const pdf = path.resolve("test-data/real-papers/ozchi-finger-specific-touch.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "ozchi-access-date-footnote-regression",
      filePath: pdf,
      fileHash: "ozchi-access-date-footnote-regression",
      metadata: { pageCount: pages.length },
    });
    const matching = result.blocks.filter((block) => /gartner|accessed 29\.9\.2014/i.test(block.original ?? ""));
    expect(matching).toHaveLength(1);
    expect(matching[0].type).toBe("footnote");
    expect(matching[0].original).toContain("accessed 29.9.2014)");
  }, 60_000);

  it("keeps wrapped table-caption prose out of table cells", async () => {
    const pdf = path.resolve("test-data/real-papers/ozchi-finger-specific-touch.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "ozchi-caption-continuation-regression",
      filePath: pdf,
      fileHash: "ozchi-caption-continuation-regression",
      metadata: { pageCount: pages.length },
    });
    const caption = result.canonical.nodes.find((node) =>
      /^Table 2\. Significance/.test(node.text ?? "")
    );
    expect(caption?.role).toBe("caption");
    expect(caption?.text).toContain("of visual target between different fingers");
    expect(caption?.text).toContain("Significant vaues bolded.");
    expect(result.canonical.nodes.some((node) =>
      node.role === "table" && /of visual target between different fingers|^bolded\.$/.test(node.text ?? "")
    )).toBe(false);
  }, 60_000);

  it("reconstructs parallel OzCHI Table 3 columns before its reader image crop is available", async () => {
    const pdf = path.resolve("test-data/real-papers/ozchi-finger-specific-touch.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "ozchi-table-image-regression",
      filePath: pdf,
      fileHash: "ozchi-table-image-regression",
      metadata: { pageCount: pages.length },
    });
    const caption = result.blocks.find((block) =>
      /^Table 3\. Finger specific functions/i.test(block.original ?? "")
    );
    const cells = result.blocks.filter((block) =>
      /^(?:Finger Function Thumb Call tapped contact|Finger Thumb Finger1|Function Call tapped contact)/.test(block.original ?? "")
    );
    expect(caption?.type).toBe("table");
    expect(cells).toHaveLength(1);
    expect(cells.every((block) => block.type === "table" && block.translationStatus === "skipped")).toBe(true);
    expect(cells[0].metadata.tableRows).toEqual([
      [{ text: "Finger", x: expect.any(Number), width: expect.any(Number) }, { text: "Function", x: expect.any(Number), width: expect.any(Number) }],
      [{ text: "Thumb", x: expect.any(Number), width: expect.any(Number) }, { text: "Call tapped contact", x: expect.any(Number), width: expect.any(Number) }],
      [{ text: "Finger1", x: expect.any(Number), width: expect.any(Number) }, { text: "Open tapped contacts contact card", x: expect.any(Number), width: expect.any(Number) }],
      [{ text: "Finger2", x: expect.any(Number), width: expect.any(Number) }, { text: "Open “open apps” pop-up", x: expect.any(Number), width: expect.any(Number) }],
      [{ text: "Finger3", x: expect.any(Number), width: expect.any(Number) }, { text: "Delete the tapped contact", x: expect.any(Number), width: expect.any(Number) }],
      [{ text: "Finger4", x: expect.any(Number), width: expect.any(Number) }, { text: "Open global help view", x: expect.any(Number), width: expect.any(Number) }],
    ]);

    const imageBackedCaption: PaperBlock = {
      ...caption!,
      metadata: { ...caption!.metadata, imageUrl: "data:image/jpeg;base64,table" },
    };
    const visible = suppressImageBackedTableFragments(
      result.blocks.map((block) => (block.id === imageBackedCaption.id ? imageBackedCaption : block))
    );
    expect(visible.some((block) => /^(?:Finger Function Thumb Call tapped contact|Finger Thumb Finger1|Function Call tapped contact)/.test(block.original ?? ""))).toBe(false);
    expect(visible.some((block) => block.id === imageBackedCaption.id)).toBe(true);
  }, 60_000);

  it("does not absorb a neighbouring prose line into OzCHI Table 5 rows", async () => {
    const pdf = path.resolve("test-data/real-papers/ozchi-finger-specific-touch.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "ozchi-table-prose-contamination-regression",
      filePath: pdf,
      fileHash: "ozchi-table-prose-contamination-regression",
      metadata: { pageCount: pages.length },
    });
    const packagedBlocks = attachLinesToBlocks(result.blocks, result.layoutBlocks);
    const table = packagedBlocks.find((block) => /^Table 5\./.test(block.original ?? ""));
    expect(table?.type).toBe("table");
    const rows = (table?.metadata.tableRows ?? []) as Array<Array<{ text: string }>>;
    expect(rows.flat().some((cell) => /Friedman.{0,20}test indicated|significant differences were perceived/i.test(cell.text))).toBe(false);
    expect(rows.flat().some((cell) => cell.text === "0.594")).toBe(true);
    expect(rows.flat().some((cell) => cell.text === "0.760")).toBe(true);
    expect(rows.flat().some((cell) => cell.text === "Gallery")).toBe(true);
    expect(rows.some((row) => row.length >= 5 && row[0]?.text === "Phonebook")).toBe(true);
    expect(rows.flat().some((cell) => /Delete the tapped|Open global help/i.test(cell.text))).toBe(false);
  }, 60_000);

  it("groups borderless OzCHI matrix cells under their caption in source-only mode", async () => {
    const pdf = path.resolve("test-data/real-papers/ozchi-finger-specific-touch.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "ozchi-borderless-matrix-regression",
      filePath: pdf,
      fileHash: "ozchi-borderless-matrix-regression",
      metadata: { pageCount: pages.length },
    });
    for (const number of ["1", "5"]) {
      const table = result.blocks.find((block) => new RegExp(`^Table ${number}\\.`).test(block.original ?? ""));
      expect(table?.type).toBe("table");
      expect(table?.metadata.tableRows?.length).toBeGreaterThanOrEqual(8);
      expect(table?.metadata.tableRows?.flat().some((cell) => /Finger|Thumb|0\\.000|0\\.594/.test(cell.text))).toBe(true);
      expect(result.blocks.some((block) => block.original === "Finger 1" && block.pageStart === table?.pageStart)).toBe(false);
    }
  }, 60_000);

  it("keeps midpoint-spanning single-column thesis prose out of table fallback", async () => {
    const pdf = path.resolve("test-data/real-papers/marketing-is-digital-advertising-effective-under-conditions-of-low-attention-the.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    expect(detectPageColumns(pages[59]).isMultiColumn).toBe(false);
    const result = extractFromPages({
      pages,
      paperId: "single-column-marketing-prose-regression",
      filePath: pdf,
      fileHash: "single-column-marketing-prose-regression",
      metadata: { pageCount: pages.length },
    });
    const prose = result.blocks.find((block) =>
      /Moreover, the establishment of brand salience/.test(block.original ?? "")
    );
    expect(prose?.type).toBe("paragraph");
    expect(prose?.translationStatus).toBe("pending");
    expect(prose?.original).toContain("advertising produces the effects.");
  }, 60_000);

  it("keeps table-of-contents leader entries out of table cards", async () => {
    const pdf = path.resolve("test-data/real-papers/ergonomics-fatigue-and-occupational-safety-in-short-haul-light-transport.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "contents-leader-regression",
      filePath: pdf,
      fileHash: "contents-leader-regression",
      metadata: { pageCount: pages.length },
    });
    const entry = result.blocks.find((block) => /2\.4 The current research \.{4,}52/.test(block.original ?? ""));
    expect(entry?.type).not.toBe("table");
    expect(entry?.translationStatus).toBe("skipped");
    const wrappedEntry = result.canonical.nodes.find((node) =>
      node.pageStart === 5 && /3 Work characteristics associated with injury/.test(node.text ?? "")
    );
    expect(wrappedEntry?.role).toBe("other");
    expect(wrappedEntry?.evidence.some((evidence) => evidence.label === "table-of-contents-entry")).toBe(true);
  }, 60_000);

  it("keeps symbolic assignment matrices out of table cards", async () => {
    const pdf = path.resolve("test-data/real-papers/linguistics-language-model-physics.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "mathematical-assignment-regression",
      filePath: pdf,
      fileHash: "mathematical-assignment-regression",
      metadata: { pageCount: pages.length },
    });
    const display = result.blocks.find((block) =>
      /𝑥 = 1 2 3 3 1 3/.test(block.original ?? "") && block.pageStart === 10
    );
    expect(display?.type).toBe("equation");
    expect(display?.translationStatus).toBe("skipped");
  }, 60_000);

  it("does not promote math-paper prose fragments to tables without a caption", async () => {
    const pdf = path.resolve("test-data/real-papers/linguistics-language-model-physics.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "math-prose-grid-regression",
      filePath: pdf,
      fileHash: "math-prose-grid-regression",
      metadata: { pageCount: pages.length },
    });
    const prose = result.canonical.nodes.filter((node) =>
      node.pageStart === 10 && /In Result 4, we used|by only reading/.test(node.text ?? "")
    );
    expect(prose.length).toBe(2);
    expect(prose.every((node) => node.role === "paragraph")).toBe(true);
  }, 60_000);

  it("retains an ordinary two-column proceedings page as two columns", async () => {
    const pdf = path.resolve("test-data/real-papers/ozchi-finger-specific-touch.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    expect(detectPageColumns(pages[4]).isMultiColumn).toBe(true);
  }, 60_000);

  it("keeps a multi-part vector figure caption in one figure block", async () => {
    const pdf = path.resolve("test-data/real-papers/cognitive-psychology-gpt3.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "gpt3-figure-caption-regression",
      filePath: pdf,
      fileHash: "gpt3-figure-caption-regression",
      metadata: { pageCount: pages.length },
    });
    const figure = result.blocks.find((block) => block.type === "figure" && block.original?.startsWith("Figure 3."));
    expect(figure?.original).toContain("Human data taken from Zaller");
    expect(result.blocks.filter((block) => block.original?.startsWith("Human data taken from Zaller")).length).toBe(0);
    expect(result.canonical.nodes.some((node) => node.role === "paragraph" && /\bThe model A B$/.test(node.text ?? ""))).toBe(false);
    expect(result.canonical.nodes.some((node) => node.role === "paragraph" && /Linda Cab Hospital|Toma Test Wason/.test(node.text ?? ""))).toBe(false);
  }, 60_000);

  it("does not absorb numbered procedure steps into a figure caption", async () => {
    const pdf = path.resolve("test-data/real-papers/linguistics-language-model-physics.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "caption-procedure-boundary-regression",
      filePath: pdf,
      fileHash: "caption-procedure-boundary-regression",
      metadata: { pageCount: pages.length },
    });
    const figure = result.canonical.nodes.find((node) => node.role === "caption" && /^Figure 3:/i.test(node.text ?? ""));
    expect(figure?.text).toContain("CFG visual comparisons");
    expect(figure?.text).not.toMatch(/\b2\. For each layer\b/);
    expect(result.canonical.nodes.some((node) => node.role === "paragraph" && /^2\. For each layer\b/.test(node.text ?? ""))).toBe(true);
  }, 60_000);

  it("recognizes unpunctuated legacy Fig. captions and keeps their continuation", async () => {
    const pdf = path.resolve("test-data/real-papers/significant-other.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "legacy-fig-caption-regression",
      filePath: pdf,
      fileHash: "legacy-fig-caption-regression",
      metadata: { pageCount: pages.length },
    });
    expect(result.canonical.nodes.some((node) => node.role === "caption" && /^Fig\.2\s+Otto Künzli/.test(node.text ?? ""))).toBe(true);
    const fig3 = result.canonical.nodes.find((node) => node.role === "caption" && /^Fig\.3\s+Iris Eichenberg/.test(node.text ?? ""));
    expect(fig3?.text).toContain("Photographer Ron Zijlstra");
    expect(result.canonical.nodes.some((node) => node.role === "paragraph" && /^Fig\.2\s+Otto Künzli/.test(node.text ?? ""))).toBe(false);
  }, 60_000);

  it("does not absorb following body prose into interactive jewellery figure captions", async () => {
    const pdf = path.resolve("test-data/real-papers/interactive-jewellery.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "interactive-jewellery-caption-boundary-regression",
      filePath: pdf,
      fileHash: "interactive-jewellery-caption-boundary-regression",
      metadata: { pageCount: pages.length },
    });
    const captions = result.canonical.nodes.filter((node) => node.role === "caption" && /^Figure\s+\d+/i.test(node.text ?? ""));
    expect(captions.length).toBeGreaterThanOrEqual(10);
    expect(captions.find((node) => /^Figure 1\./i.test(node.text ?? ""))?.text).toBe("Figure 1. Jewellery framework");
    expect(captions.find((node) => /^Figure 2\./i.test(node.text ?? ""))?.text).not.toMatch(/Bernhard Schobinger’s Flaschenhalskette/);
    expect(captions.find((node) => /^Figure 5\./i.test(node.text ?? ""))?.text).toBe("Figure 5. Framework Interactive Jewellery");
    expect(result.paper.affiliations.some((affiliation) => /Department of Industrial Design.*Eindhoven University of Technology.*Netherlands/i.test(affiliation.name))).toBe(true);
    expect(result.paper.affiliations.some((affiliation) => /Faculty of Design.*University of Technology Sydney.*Australia/i.test(affiliation.name))).toBe(true);
    expect(result.paper.affiliations.some((affiliation) => /Duncan of Jordanstone.*University of Dundee/i.test(affiliation.name))).toBe(true);
    expect(result.paper.affiliations.some((affiliation) => /Australian Research.*Macquarie University/i.test(affiliation.name))).toBe(true);
    expect(result.canonical.nodes.some((node) =>
      /\d[\d,*†‡§∗·\s,;:()\[\]{}]*[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i.test(node.text ?? "") &&
      ["paragraph", "abstract"].includes(node.role)
    )).toBe(false);
    expect(result.blocks.some((block) => /@/.test(block.original ?? ""))).toBe(false);
    const jewelleryContinuation = result.canonical.nodes.find((node) => /jewellery:\s*some conscious, other/i.test(node.text ?? ""));
    expect(jewelleryContinuation?.role).not.toBe("title");
    expect(jewelleryContinuation?.text).toMatch(/^It is through the interaction with a piece of jewellery/);
    const consciousParagraph = result.blocks.find((block) => /some conscious, other/i.test(block.original ?? ""));
    expect(consciousParagraph?.original).toMatch(/some conscious, other unaware, some private and other social/i);
    // These markers are embedded in native prose lines, not physical list
    // starts. Keep the abstract as one semantic paragraph so `1)` does not
    // manufacture four fragments or leave a trailing source-only block.
    const abstractDirections = result.blocks.filter((block) =>
      /(?:^|\s)[1-4][.)]\s/.test(block.original ?? "") && block.pageStart === 1
    );
    expect(abstractDirections.length).toBeGreaterThanOrEqual(1);
    expect(abstractDirections.every((block) => block.translationStatus === "pending")).toBe(true);
    expect(abstractDirections.filter((block) => /(?:^|\n)\s*[1-4][.)]\s/.test(block.original ?? "")).length).toBe(0);
    expect(result.blocks.some((block) => block.original?.trim() === "1,2,3,4")).toBe(false);
    expect(result.blocks.some((block) => block.pageStart === 1 && block.original?.trim() === "44")).toBe(false);
  }, 60_000);

  it("keeps a fragmented multi-column review table out of paragraph translation", async () => {
    const pdf = path.resolve("test-fixtures/real-papers/pending-pdfs/covid-ml-review.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "fragmented-review-table-regression",
      filePath: pdf,
      fileHash: "fragmented-review-table-regression",
      metadata: { pageCount: pages.length },
    });
    const tableRows = result.blocks.filter((block) => block.pageStart === 5 && /^(?:\[18\]|\[19\]|ARIMA model of order \(1,1,0\) for con-)/.test(block.original ?? ""));
    expect(tableRows.length).toBeGreaterThan(0);
    expect(tableRows.every((block) => block.type === "table" || block.translationStatus === "skipped")).toBe(true);
    const numericTableMix = result.blocks.find((block) => block.pageStart === 5 && /R \(Confirmed Case- Italy\)/.test(block.original ?? ""));
    expect(numericTableMix?.type).toBe("table");
    expect(numericTableMix?.translationStatus).toBe("skipped");
    expect(result.blocks.some((block) => block.pageStart === 5 && block.type === "paragraph" && block.original?.startsWith("In order to model"))).toBe(true);
  }, 60_000);

  it("separates multilingual superscript author rows from the article title", async () => {
    const pdf = path.resolve("test-data/real-papers/linguistics-the-role-of-applied-linguistics-and-language-discourse-analysis-in-eng.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "multilingual-title-author-boundary-regression",
      filePath: pdf,
      fileHash: "multilingual-title-author-boundary-regression",
      metadata: { pageCount: pages.length },
    });
    const title = result.canonical.nodes.find((node) => node.role === "title" && /взаимосвязь прикладной/u.test(node.text ?? ""));
    expect(title?.text).toBe("взаимосвязь прикладной лингвистики и лингводискурсивного анализа с практикой преподавания английского языка");
    expect(title?.text).not.toContain("ненгах");
  }, 60_000);

  it("separates flattened IEEE authors, funding, and editor credit", async () => {
    const pdf = path.resolve("test-fixtures/real-papers/pending-pdfs/hci-user-experience-design-using-machine-learning-a-systematic-review.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "ieee-flattened-masthead-regression",
      filePath: pdf,
      fileHash: "ieee-flattened-masthead-regression",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(expect.arrayContaining([
      "ABDALLAH M. H. ABBAS",
      "KHAIRIL IMRAN GHAUTH",
      "CHOO-YEE TING",
    ]));
    expect(result.paper.affiliations.some((item) => /^This work was supported/i.test(item.name))).toBe(false);
    expect(result.canonical.nodes.some((node) => node.role === "other" && /associate editor coordinating.*approving/i.test(node.text ?? ""))).toBe(true);
    expect(result.canonical.nodes.some((node) => node.role === "paragraph" && /^approving it for publication/i.test(node.text ?? ""))).toBe(false);
    expect(result.canonical.nodes.some((node) => node.role === "paragraph" && /experience design, UX, ED, machine learning, ML, HCI, UX design, user interaction, user behavior\./i.test(node.text ?? ""))).toBe(true);
  }, 60_000);

  it("keeps a captionless method/goal table out of paragraph translation", async () => {
    const pdf = path.resolve("test-data/real-papers/education-learning-analytics.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "captionless-method-table-regression",
      filePath: pdf,
      fileHash: "captionless-method-table-regression",
      metadata: { pageCount: pages.length },
    });
    const rows = result.blocks.filter((block) => block.pageStart === 18 && /^(?:To find causal relationship|To identify groups of similar|Knowledge tracing required)/i.test(block.original ?? ""));
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((block) => block.type === "table")).toBe(true);
    expect(rows.every((block) => block.translationStatus === "skipped")).toBe(true);
    const header = result.blocks.find((block) => block.pageStart === 18 && /^Method Goal\/description/.test(block.original ?? ""));
    const proseCell = result.blocks.find((block) => block.pageStart === 18 && /^Distillation of data/.test(block.original ?? ""));
    const precedingNarrative = result.blocks.find((block) => block.pageStart === 18 && /^There is a wide range of popular methods/.test(block.original ?? ""));
    expect(header?.type).toBe("table");
    expect(proseCell?.type).toBe("table");
    expect(precedingNarrative?.type).toBe("paragraph");
  }, 60_000);

  it("separates a compact left-column table from adjacent right-column prose", async () => {
    const pdf = path.resolve("test-data/real-papers/cognitive-memory-cues.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "parallel-table-body-regression",
      filePath: pdf,
      fileHash: "parallel-table-body-regression",
      metadata: { pageCount: pages.length },
    });
    const bodyLead = result.canonical.nodes.find((node) =>
      node.pageStart === 7 && node.text?.startsWith("In this study, there was a significant difference between gist memory")
    );
    const bodyContinuation = result.canonical.nodes.find((node) =>
      node.pageStart === 7 && node.text?.startsWith("In this study, there was a significant difference between gist memory") &&
      node.text?.includes("and detailed memory at 10 min")
    );
    const inlineBodyContinuation = result.canonical.nodes.find((node) =>
      node.pageStart === 7 && node.text?.startsWith("forgetting rate of gist and detailed memories. The results showed that they were")
    );
    expect(bodyLead?.role).toBe("paragraph");
    // The left-side statistics table sits physically between these two right
    // column lines. It must remain a table while the unfinished prose sentence
    // becomes one translation unit.
    expect(bodyContinuation?.role).toBe("paragraph");
    expect(result.canonical.nodes.some((node) =>
      node.pageStart === 7 && node.text?.startsWith("and detailed memory at 10 min")
    )).toBe(false);
    expect(inlineBodyContinuation?.role).toBe("paragraph");
    expect(result.canonical.nodes.some((node) =>
      node.pageStart === 7 && node.role === "table" && /and detailed memory at 10 min|interest and memory type \[F|they were not significantly correlated/i.test(node.text ?? "")
    )).toBe(false);
    expect(result.blocks.some((block) =>
      block.pageStart === 7 && block.type === "table" && /^Memory cue 4\.670 0\.039 0\.143/.test(block.original ?? "")
    )).toBe(true);
  }, 60_000);

  it("preserves multi-column questionnaire cells when a table node was flattened", async () => {
    const pdf = path.resolve("test-data/real-papers/cognitive-memory-cues.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "flattened-questionnaire-table-regression",
      filePath: pdf,
      fileHash: "flattened-questionnaire-table-regression",
      metadata: { pageCount: pages.length },
    });
    const packagedBlocks = attachLinesToBlocks(result.blocks, result.layoutBlocks);
    const block = packagedBlocks.find((candidate) => candidate.pageStart === 4 && candidate.metadata.captionOriginal === "TABLE 1 Examples of the stimuli.");
    const rows = block?.metadata.tableRows as Array<Array<{ text: string }>> | undefined;
    expect(block?.type).toBe("table");
    expect(rows?.some((row) => row.some((cell) => cell.text === "A. A little boy") && row.some((cell) => cell.text === "A. White"))).toBe(true);
    expect(rows?.some((row) => row.some((cell) => cell.text === "B. A nanny") && row.some((cell) => cell.text === "B. Yellow"))).toBe(true);
    // Question cells can outrank the table role because they are sentence
    // shaped. They still belong to the caption-owned grid when their native
    // bbox is inside the dense table region.
    expect(rows?.flat().some((cell) => cell.text === "Besides the couple, who else is the main character in the clip?")).toBe(true);
    expect(packagedBlocks.some((candidate) => candidate.pageStart === 4 && candidate.type === "paragraph" &&
      /Besides the couple, who else is the main character/.test(candidate.original ?? ""))).toBe(false);
    const imageBacked = result.blocks.map((candidate) => candidate.metadata.captionOriginal === "TABLE 1 Examples of the stimuli."
      ? { ...candidate, metadata: { ...candidate.metadata, imageUrl: "data:image/png;base64,table" } }
      : candidate);
    const visibleWithCrop = suppressImageBackedTableFragments(imageBacked)
      .filter((candidate) => candidate.pageStart === 4 && candidate.type === "table");
    expect(visibleWithCrop).toHaveLength(1);
  }, 60_000);

  it("does not append a repeated top-margin proceedings URL to body paragraphs", async () => {
    const pdf = path.resolve("test-data/real-papers/marketing-the-impact-of-online-advertising-on-consumer-choice-consumption-traps-.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "repeated-proceedings-url",
      filePath: pdf,
      fileHash: "repeated-proceedings-url",
      metadata: { pageCount: pages.length },
    });
    expect(result.canonical.nodes.some((node) => node.role === "paragraph" && /cpcig-conferences\.com/i.test(node.text ?? ""))).toBe(false);
  }, 60_000);

  it("does not stitch a displaced statistics-table header into body prose", async () => {
    const pdf = path.resolve("test-data/real-papers/marketing-platform.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "displaced-table-header",
      filePath: pdf,
      fileHash: "displaced-table-header",
      metadata: { pageCount: pages.length },
    });
    expect(result.canonical.nodes.some((node) => node.role === "paragraph" && /Variable\s+N\s+Mean\s+Std\.\s+Min\s+Max/i.test(node.text ?? ""))).toBe(false);
  }, 60_000);

  it("keeps repeated journal ISSN headers out of body paragraphs", async () => {
    const pdf = path.resolve("test-data/real-papers/hci-development-of-user-interface-user-experience-using-design-thinking-ap.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "repeated-issn-header",
      filePath: pdf,
      fileHash: "repeated-issn-header",
      metadata: { pageCount: pages.length },
    });
    expect(result.canonical.nodes.some((node) => node.role === "paragraph" && /journal-isi\.org/i.test(node.text ?? ""))).toBe(false);
  }, 60_000);

  it("keeps an asymmetric article-info rail separate from the abstract", async () => {
    const pdf = path.resolve("test-data/real-papers/medical-deep-learning-meta-review.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "asymmetric-article-info-rail",
      filePath: pdf,
      fileHash: "asymmetric-article-info-rail",
      metadata: { pageCount: pages.length },
    });
    const abstract = result.canonical.nodes.find((node) => /Deep learning has remarkably impacted/.test(node.text ?? ""));
    expect(abstract?.text).toMatch(/^Deep learning has remarkably impacted/);
    expect(abstract?.text).not.toMatch(/\bpa\s+tient\b/);
    expect(abstract?.text).not.toMatch(/^tient data/);
  }, 60_000);

  it("prefers the article title over an Elsevier venue masthead", async () => {
    const pdf = path.resolve("test-data/real-papers/medical-deep-learning-meta-review.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "elsevier-venue-masthead",
      filePath: pdf,
      fileHash: "elsevier-venue-masthead",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.titleOriginal).toBe("Medical deep learning—A systematic meta-review");
  }, 60_000);

  it("drops punctuation-only interleaved column fragments before a new sentence", () => {
    const textItems = [
      { text: ".-", x: 270, y: 120, width: 10, height: 8, fontSize: 9, fontName: "Times", page: 1 },
      { text: "tively, some tasks were evaluated.", x: 282, y: 120, width: 180, height: 8, fontSize: 9, fontName: "Times", page: 1 },
      { text: "The results were consistent.", x: 270, y: 135, width: 150, height: 8, fontSize: 9, fontName: "Times", page: 1 },
    ];
    const blocks = reconstructDocument([{ pageNumber: 1, width: 540, height: 700, textItems }]).blocks;
    expect(blocks.map((block) => block.text).join(" ")).not.toContain(".-");
  });

  it("uses typography evidence to keep a separated all-caps section heading out of table projection", async () => {
    const pdf = path.resolve("test-data/real-papers/detecting-statistical-interactions.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "all-caps-heading-table-guard",
      filePath: pdf,
      fileHash: "all-caps-heading-table-guard",
      metadata: { pageCount: pages.length },
    });
    const heading = result.canonical.nodes.find((node) =>
      node.text === "H COMPARISONS WITH LOGISTIC REGRESSION BASELINES"
    );
    expect(heading?.role).toBe("heading");
  }, 60_000);

  it("recognizes CJK checkmark comparison rows without promoting nearby prose", async () => {
    const pdf = path.resolve("test-data/real-papers/ergonomics-human-factors-ihci.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages, paperId: "cjk-checkmark-table", filePath: pdf, fileHash: "cjk-checkmark-table",
      metadata: { pageCount: pages.length },
    });
    // Adjacent checkmark rows may be merged into one table node; require the
    // comparison matrix to stay table-typed with multiple √ cells preserved.
    const rows = result.blocks.filter((block) => block.pageStart === 11 && /√/.test(block.original));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((block) => block.type === "table")).toBe(true);
    const checkmarks = rows.reduce((count, block) => count + (block.original.match(/√/g) ?? []).length, 0);
    expect(checkmarks).toBeGreaterThanOrEqual(3);
    expect(result.blocks.some((block) => block.pageStart === 11 && block.type === "paragraph" && block.original.includes("其次"))).toBe(true);
    expect(result.canonical.nodes.some((node) => node.role === "caption" && node.text?.startsWith("表 3"))).toBe(true);
  }, 30_000);

  it("splits repeated dash bullets without splitting a single inline dash", () => {
    expect(splitFlattenedList("– First item – Second item – Third item")).toEqual([
      "– First item",
      "– Second item",
      "– Third item",
    ]);
    expect(splitFlattenedList("A model-based approach – with a caveat.")).toEqual([
      "A model-based approach – with a caveat.",
    ]);
    expect(splitFlattenedList("Our contributions are: • First item • Second item")).toEqual([
      "Our contributions are:", "• First item", "• Second item",
    ]);
    expect(splitFlattenedList("The options are: (a) alpha (b) beta (c) gamma")).toEqual([
      "The options are: (a) alpha (b) beta (c) gamma",
    ]);
    expect(splitFlattenedList("The options are:\n(a) alpha\n(b) beta\n(c) gamma")).toEqual([
      "The options are:", "(a) alpha", "(b) beta", "(c) gamma",
    ]);
  });

  it("keeps numeric multi-item summary rows out of heading role", () => {
    const textItems = [
      { text: "54 English", x: 120, y: 120, width: 70, height: 8, fontSize: 9, fontName: "Helvetica-Bold", page: 1 },
      { text: "90.5%", x: 240, y: 120, width: 40, height: 8, fontSize: 9, fontName: "Helvetica-Bold", page: 1 },
    ];
    const candidates = generateGenericCandidates([{ pageNumber: 1, width: 500, height: 700, textItems }]).candidates;
    const row = candidates.find((candidate) => candidate.text.includes("54 English"));
    expect(row?.role).toBe("paragraph");
    expect(row?.roleScores.heading ?? 0).toBeLessThan(0.68);
  });

  it("promotes hierarchical subsection labels even at body font size", () => {
    const textItems = [
      { text: "4.3", x: 80, y: 180, width: 18, height: 8, fontSize: 9, fontName: "Body", page: 1 },
      { text: "Battery", x: 103, y: 180, width: 42, height: 8, fontSize: 9, fontName: "Body", page: 1 },
      { text: "The battery section begins with ordinary prose.", x: 80, y: 198, width: 260, height: 8, fontSize: 9, fontName: "Body", page: 1 },
    ];
    const candidates = generateGenericCandidates([{ pageNumber: 1, width: 500, height: 700, textItems }]).candidates;
    const heading = candidates.find((candidate) => candidate.text === "4.3 Battery");
    expect(heading?.role).toBe("heading");
    expect(heading?.roleScores.heading ?? 0).toBeGreaterThan(0.68);
  });

  it("keeps wide native column lines assigned to their column", () => {
    const textItems = Array.from({ length: 10 }, (_, row) => [
      { text: `Left column sentence ${row} with enough words for layout detection.`, x: 40, y: 120 + row * 18, width: 280, height: 8, fontSize: 8, fontName: "Body", page: 1 },
      { text: `Right column sentence ${row} with enough words for layout detection.`, x: 304, y: 120 + row * 18, width: 280, height: 8, fontSize: 8, fontName: "Body", page: 1 },
    ]).flat();
    textItems.push({ text: "A spanning abstract line remains across both columns.", x: 40, y: 80, width: 540, height: 8, fontSize: 8, fontName: "Body", page: 1 });
    const page = { pageNumber: 1, width: 595, height: 790, textItems };
    expect(detectPageColumns(page).isMultiColumn).toBe(true);
    const blocks = reconstructDocument([page]).blocks;
    expect(blocks.every((block) => ["left", "right", "spanning"].includes(block.column))).toBe(true);
    expect(blocks.some((block) => block.column === "left")).toBe(true);
    expect(blocks.some((block) => block.column === "right")).toBe(true);
    expect(blocks.some((block) => block.column === "spanning")).toBe(true);
  });

  it("detects word-level columns when masthead lines dominate the page", () => {
    const textItems = Array.from({ length: 10 }, (_, row) => [
      ...["Left", "column", "body", String(row)].map((text, index) => ({
        text, x: 52 + index * 28, y: 300 + row * 14, width: 22, height: 8,
        fontSize: 8, fontName: "Body", page: 1,
      })),
      ...["Right", "column", "body", String(row)].map((text, index) => ({
        text, x: 318 + index * 28, y: 300 + row * 14, width: 22, height: 8,
        fontSize: 8, fontName: "Body", page: 1,
      })),
    ]).flat();
    textItems.push({ text: "A full-width title", x: 52, y: 90, width: 480, height: 12, fontSize: 16, fontName: "Title", page: 1 });
    expect(detectPageColumns({ pageNumber: 1, width: 595, height: 790, textItems }).isMultiColumn).toBe(true);
  });

  it("does not promote a header rail with sparse right-side text to two columns", () => {
    const textItems = Array.from({ length: 12 }, (_, row) => [
      { text: `Body ${row} left`, x: 88, y: 280 + row * 14, width: 72, height: 8, fontSize: 8, fontName: "Body", page: 1 },
      ...(row < 5 ? [{ text: `Header ${row}`, x: 304, y: 280 + row * 14, width: 56, height: 8, fontSize: 8, fontName: "Body", page: 1 }] : []),
    ]).flat();
    expect(detectPageColumns({ pageNumber: 1, width: 595, height: 790, textItems }).isMultiColumn).toBe(false);
  });

  it("preserves repeated values in distinct native table cells", () => {
    const page = { pageNumber: 1, width: 500, height: 700, textItems: [
      { text: "42", x: 80, y: 180, width: 16, height: 8, fontSize: 9, fontName: "Body", page: 1 },
      { text: "42", x: 220, y: 180, width: 16, height: 8, fontSize: 9, fontName: "Body", page: 1 },
    ] };
    const text = reconstructDocument([page]).blocks.map((block) => block.text).join(" ");
    expect((text.match(/42/g) ?? []).length).toBe(2);
  });

  it("preserves native text when inferring two x-bands inside one paragraph stream", () => {
    const left = ["Left one", "Left two", "Left three", "Left four"];
    const right = ["Right one", "Right two", "Right three", "Right four"];
    const textItems = left.flatMap((text, index) => [
      { text, x: 48, y: 300 + index * 16, width: 150, height: 8, fontSize: 8, fontName: "Body", page: 1 },
      { text: right[index], x: 320, y: 300 + index * 16, width: 150, height: 8, fontSize: 8, fontName: "Body", page: 1 },
    ]);
    const blocks = reconstructDocument([{ pageNumber: 1, width: 540, height: 790, textItems }]).blocks;
    const reconstructed = blocks.map((block) => block.text).join(" ");
    for (const token of [...left, ...right]) expect(reconstructed).toContain(token);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks.every((block) => block.text.length > 0 && block.lines.length > 0)).toBe(true);
  });

  it("projects Japanese conference headings with CHILD_OF parents", () => {
    const pages = FIXTURES["japanese-conference"]();
    const result = extractFromPages({
      pages,
      paperId: "ja",
      filePath: "/tmp/ja.pdf",
      fileHash: "h",
      metadata: { pageCount: 1 },
    });
    expect(result.paper.titleOriginal).toMatch(/情報採餌理論/);
    const intro = result.sections.find((s) => /1 はじめに/.test(s.originalTitle));
    const sub = result.sections.find((s) => /2\.1/.test(s.originalTitle));
    expect(intro).toBeTruthy();
    expect(sub?.parentSectionId).toBe(intro?.id);
    expect(result.canonical.relations.some((r) => r.kind === "CHILD_OF")).toBe(true);
    expect(result.canonical.relations.some((r) => r.kind === "READS_BEFORE")).toBe(true);
    expect(result.canonical.relations.some((r) => r.kind === "CAPTION_OF")).toBe(true);
    expect(result.blocks.some((b) => b.type === "figure")).toBe(true);
    expect(result.blocks[0]?.metadata.sourceAnchor).toBeTruthy();
    expect(result.blocks[0]?.metadata.evidence).toBeTruthy();
  });

  it("coalesces identical native caption candidates before projection", () => {
    const pages = FIXTURES["full-width-figure"]();
    const caption = pages[0].textItems.find((item) => /FWFIG_CAPTION/.test(item.text));
    expect(caption).toBeTruthy();
    pages[0].textItems.push({ ...caption!, x: caption!.x + 2, y: caption!.y + 1 });
    const result = extractFromPages({ pages, paperId: "caption-dedupe", filePath: "/tmp/c.pdf", fileHash: "h", metadata: { pageCount: 1 } });
    const captions = result.canonical.nodes.filter((node) => node.role === "caption" && /FWFIG_CAPTION/.test(node.text ?? ""));
    expect(captions).toHaveLength(1);
    expect((captions[0]?.text?.match(/FWFIG_CAPTION/g) ?? []).length).toBe(1);
  });

  it("keeps analyzeStructure as a projection wrapper", () => {
    const pages = FIXTURES["classification-index"]();
    const viaWrapper = analyzeStructure(pages, "p", "/tmp/c.pdf", "h", { pageCount: 1 });
    const viaPipeline = extractFromPages({
      pages,
      paperId: "p",
      filePath: "/tmp/c.pdf",
      fileHash: "h",
      metadata: { pageCount: 1 },
    });
    expect(viaWrapper.paper.titleOriginal).toBe(viaPipeline.paper.titleOriginal);
    expect(viaWrapper.blocks.map((b) => b.type)).toEqual(
      viaPipeline.blocks.map((b) => b.type)
    );
  });

  it("does not attach heading evidence to metadata blocks", () => {
    const candidates = generateGenericCandidates(FIXTURES["single-column"]()).candidates;
    const title = candidates.find((candidate) => candidate.role === "title");
    expect(title).toBeTruthy();
    expect(title?.roleScores.heading).toBeUndefined();
  });

  it("emits page-local grid evidence for captionless numeric rows", () => {
    const textItems = Array.from({ length: 6 }, (_, row) => [
      { text: `R${row + 1}`, x: 80, y: 120 + row * 18, width: 18, height: 8, fontSize: 8, fontName: "Body", page: 1 },
      { text: `${(1.1 + row / 10).toFixed(2)}`, x: 180, y: 120 + row * 18, width: 30, height: 8, fontSize: 8, fontName: "Body", page: 1 },
      { text: `${(2.2 + row / 10).toFixed(2)}`, x: 240, y: 120 + row * 18, width: 30, height: 8, fontSize: 8, fontName: "Body", page: 1 },
      { text: `${(3.3 + row / 10).toFixed(2)}`, x: 300, y: 120 + row * 18, width: 30, height: 8, fontSize: 8, fontName: "Body", page: 1 },
    ]).flat();
    const candidates = generateGenericCandidates([{ pageNumber: 1, width: 500, height: 700, textItems }]).candidates;
    expect(candidates.filter((candidate) => (candidate.roleScores.table ?? 0) >= 0.94).length).toBeGreaterThanOrEqual(6);
  });

  it("recognizes a native one-item-per-line grid when x bands repeat", () => {
    const rows = [
      ["Finger", "Function"], ["Thumb", "Call tapped contact"],
      ["Finger1", "Open tapped contacts"], ["Finger2", "Open apps"],
      ["Finger3", "Delete contact"], ["Finger4", "Open help view"],
    ];
    const textItems = [
      { text: "Table 3. Finger functions", x: 80, y: 100, width: 150, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
      ...rows.flatMap(([left, right], index) => [
        { text: left, x: 80, y: 125 + index * 14, width: 70, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
        { text: right, x: 180, y: 125 + index * 14, width: 120, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
      ]),
    ];
    const result = extractFromPages({
      pages: [{ pageNumber: 1, width: 500, height: 700, textItems }],
      paperId: "flattened-grid", filePath: "/tmp/flattened-grid.pdf", fileHash: "flattened-grid", metadata: { pageCount: 1 },
    });
    const region = result.canonical.nodes.find((node) => node.role === "table" && node.structuralLabel?.startsWith("Table 3"));
    expect(region?.boundingBoxes.length).toBeGreaterThan(0);
    expect(result.canonical.relations.some((relation) => relation.kind === "CAPTION_OF" && relation.to === region?.id)).toBe(true);
  });

  it("recognizes a captioned flattened multi-cell grid", () => {
    const textItems = [
      { text: "Table 4. Summary", x: 80, y: 100, width: 140, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
      ...Array.from({ length: 7 }, (_, row) => [
        { text: `Method${row + 1}`, x: 80, y: 125 + row * 14, width: 52, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
        { text: row % 2 ? "Camera" : "Sensor", x: 155, y: 125 + row * 14, width: 48, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
        { text: `${10 + row}`, x: 225, y: 125 + row * 14, width: 20, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
        { text: `${80 + row}.5%`, x: 285, y: 125 + row * 14, width: 34, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
      ]).flat(),
    ];
    const result = extractFromPages({
      pages: [{ pageNumber: 1, width: 500, height: 700, textItems }],
      paperId: "captioned-grid", filePath: "/tmp/captioned-grid.pdf", fileHash: "captioned-grid", metadata: { pageCount: 1 },
    });
    const region = result.canonical.nodes.find((node) => node.role === "table" && node.structuralLabel?.startsWith("Table 4"));
    expect(region).toBeTruthy();
    expect(result.blocks.some((block) => block.type === "table" && block.original?.includes("Method1"))).toBe(true);
  });

  it("keeps low-angle numeric matrix fragments out of heading role", () => {
    const textItems = Array.from({ length: 8 }, (_, row) => ({
      text: `${(row + 1).toFixed(2)} ${(row + 2).toFixed(2)} ${(row + 3).toFixed(2)} R${row + 1}`,
      x: 180,
      y: 120 + row * 18,
      width: 180,
      height: 8,
      fontSize: 8,
      fontName: "Body",
      rotation: (row % 4) * 5,
      page: 1,
    }));
    const candidates = generateGenericCandidates([{ pageNumber: 1, width: 500, height: 700, textItems }]).candidates;
    expect(candidates.every((candidate) => candidate.role !== "heading")).toBe(true);
  });

  it("keeps repeated chart-axis labels out of table evidence", () => {
    const textItems = Array.from({ length: 5 }, (_, index) => ({
      text: `${(index * 0.005).toFixed(3)}`,
      x: 70,
      y: 120 + index * 18,
      width: 30,
      height: 8,
      fontSize: 8,
      fontName: "Helvetica",
      page: 1,
    }));
    const candidates = generateGenericCandidates([
      { pageNumber: 1, width: 500, height: 700, textItems },
    ]).candidates;
    const chartLabels = candidates.filter((candidate) =>
      candidate.evidence.some((evidence) => evidence.label === "repeated-numeric-chart-label")
    );
    expect(chartLabels.length).toBeGreaterThanOrEqual(3);
    expect(chartLabels.every((candidate) => (candidate.roleScores.table ?? 0) < 0.94)).toBe(true);
    const projected = extractFromPages({
      pages: [{ pageNumber: 1, width: 500, height: 700, textItems }],
      paperId: "chart-labels",
      filePath: "/tmp/chart.pdf",
      fileHash: "chart",
      metadata: { pageCount: 1 },
    });
    expect(projected.blocks.filter((block) => block.metadata.translationInputWarning?.includes("chart label"))
      .every((block) => block.translationStatus === "skipped")).toBe(true);
  });

  it("emits vector-figure evidence for compact labels mixed with prose", () => {
    const textItems = [
      { text: "The participant completed the task and the", x: 70, y: 120, width: 190, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      { text: "Linda", x: 310, y: 132, width: 28, height: 7, fontSize: 7, fontName: "Figure", page: 1 },
      { text: "Cab", x: 350, y: 132, width: 20, height: 7, fontSize: 7, fontName: "Figure", page: 1 },
      { text: "Hospital", x: 390, y: 132, width: 38, height: 7, fontSize: 7, fontName: "Figure", page: 1 },
      { text: "Toma", x: 310, y: 144, width: 24, height: 7, fontSize: 7, fontName: "Figure", page: 1 },
      { text: "Test", x: 350, y: 144, width: 22, height: 7, fontSize: 7, fontName: "Figure", page: 1 },
      { text: "Wason", x: 390, y: 144, width: 28, height: 7, fontSize: 7, fontName: "Figure", page: 1 },
      { text: "continued in the study.", x: 70, y: 156, width: 115, height: 10, fontSize: 10, fontName: "Body", page: 1 },
    ];
    const candidates = generateGenericCandidates([{ pageNumber: 1, width: 500, height: 700, textItems }]).candidates;
    expect(candidates.some((candidate) => candidate.evidence.some((e) => e.label === "vector-figure-label-cluster"))).toBe(true);
  });

  it("keeps a long multi-sentence results paragraph out of vector-figure evidence", () => {
    const textItems = [
      { text: "The first condition showed a reliable increase in", x: 72, y: 120, width: 230, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      { text: "performance across all participants. The second condition", x: 300, y: 120, width: 190, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      { text: "produced a smaller effect than the baseline and", x: 96, y: 135, width: 220, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      { text: "remained stable throughout the follow-up. The final", x: 320, y: 135, width: 170, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      { text: "analysis confirmed that this pattern was consistent", x: 120, y: 150, width: 225, height: 10, fontSize: 10, fontName: "Body", page: 1 },
      { text: "with the observations from the previous experiment", x: 350, y: 150, width: 165, height: 10, fontSize: 10, fontName: "Body", page: 1 },
    ];
    const candidates = generateGenericCandidates([{ pageNumber: 1, width: 540, height: 700, textItems }]).candidates;
    const prose = candidates.find((candidate) => candidate.text.includes("The first condition"));
    expect(prose?.evidence.some((evidence) => evidence.label === "vector-figure-label-cluster")).toBe(false);
    expect(prose?.roleScores.other ?? 0).toBeLessThan(0.82);
  });

  it("does not promote a possessive vector-figure fragment to a title", () => {
    const candidates = generateGenericCandidates([{
      pageNumber: 1,
      width: 540,
      height: 790,
      textItems: [
        { text: "A General Study of Human-AI Interaction", x: 70, y: 60, width: 390, height: 14, fontSize: 16, fontName: "Title", page: 1 },
        { text: "Author Example", x: 190, y: 88, width: 100, height: 8, fontSize: 9, fontName: "Body", page: 1 },
        { text: "'s Emphasis of Human-AI Interaction Guidelines", x: 230, y: 190, width: 240, height: 13, fontSize: 15, fontName: "ChartTitle", page: 1 },
      ],
    }]).candidates;
    const fragment = candidates.find((candidate) => candidate.text.startsWith("'s Emphasis"));
    expect(fragment?.evidence.some((evidence) => evidence.label === "vector-figure-label-cluster")).toBe(true);
    expect(fragment?.roleScores.other).toBeGreaterThanOrEqual(0.82);
  });


  it("does not promote rotated numeric cell bands to headings", () => {
    const textItems = Array.from({ length: 10 }, (_, index) => ({
      text: index % 2 === 0 ? `R${index / 2 + 1}` : `0.${index + 1}`,
      x: 120 + index * 7,
      y: 260,
      width: 24,
      height: 8,
      fontSize: 8,
      fontName: "Helvetica",
      rotation: 90,
      page: 1,
    }));
    const candidates = generateGenericCandidates([{ pageNumber: 1, width: 500, height: 700, textItems }]).candidates;
    expect(candidates.every((candidate) => (candidate.roleScores.heading ?? 0) < 0.68)).toBe(true);
  });

  it("does not promote sentence-shaped prose beside a table caption", () => {
    const textItems = [
      { text: "Table 1. Results", x: 80, y: 100, width: 100, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
      { text: "In the curves shown in Figure 1 we compare the response across conditions.", x: 80, y: 125, width: 260, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
      { text: "The", x: 80, y: 125, width: 18, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
      { text: "results", x: 180, y: 125, width: 28, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
    ];
    const candidates = generateGenericCandidates([{ pageNumber: 1, width: 500, height: 700, textItems }]).candidates;
    const prose = candidates.find((candidate) => candidate.text.includes("curves shown"));
    expect(prose?.roleScores.table ?? 0).toBeLessThan(0.94);
  });

  it("keeps math-rich prose with fragmented native spans out of the table role", async () => {
    const pdf = path.resolve("test-data/real-papers/economics-regularized-deepiv.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "math-prose-not-table",
      filePath: pdf,
      fileHash: "math-prose-not-table",
      metadata: { pageCount: pages.length },
    });
    const prose = result.canonical.nodes.find((node) => /Hellinger distance/.test(node.text ?? ""));
    expect(prose?.role).toBe("paragraph");
    const theoremFragment = result.canonical.nodes.find((node) =>
      node.pageStart === 23 && /with probability at least/.test(node.text ?? "")
    );
    expect(theoremFragment?.role).not.toBe("table");
    expect(theoremFragment?.evidence.some((evidence) => evidence.label === "mathematical-clause-continuation")).toBe(true);
    const greekFragment = result.canonical.nodes.find((node) =>
      node.pageStart === 24 && (node.text ?? "").trim() === "α2 α"
    );
    expect(greekFragment?.role).not.toBe("table");
    expect(greekFragment?.evidence.some((evidence) => evidence.label === "fragmented-mathematical-display")).toBe(true);
  }, 60_000);

  it("keeps a figure-adjacent numeric label matrix out of the captionless table fallback", async () => {
    const pdf = path.resolve("test-data/real-papers/linguistics-language-model-physics.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "figure-label-not-table",
      filePath: pdf,
      fileHash: "figure-label-not-table",
      metadata: { pageCount: pages.length },
    });
    const labels = result.canonical.nodes.find((node) => /truth GPT GPT_rel GPT_rot GPT_pos GPT_uni/.test(node.text ?? ""));
    expect(labels?.role).toBe("other");
    const repeatedPanels = result.canonical.nodes.find((node) =>
      /lay1 lay1 lay2 lay2 lay3 lay3 lay4 lay4 lay5 lay5/.test(node.text ?? "") &&
      /position-based attention pattern/.test(node.text ?? "")
    );
    expect(repeatedPanels?.role).toBe("other");
    expect(repeatedPanels?.evidence.some((evidence) => evidence.label === "dense-vector-panel")).toBe(true);
    const multiPanelTicks = result.canonical.nodes.find((node) =>
      /h1 h2 h3 h4 h5 h6 h7 h8 h9 h10 h11 h12.*-10 0\.025/.test(node.text ?? "")
    );
    expect(multiPanelTicks?.role).toBe("other");
    expect(multiPanelTicks?.evidence.some((evidence) => evidence.label === "dense-vector-panel")).toBe(true);
    const microPanelLabel = result.canonical.nodes.find((node) =>
      node.pageStart === 34 && (node.text ?? "").trim() === "lay1 lay1"
    );
    expect(microPanelLabel?.role).toBe("other");
    expect(microPanelLabel?.evidence.some((evidence) => evidence.label === "dense-vector-panel")).toBe(true);
    const repeatedHorizontalPanelLabel = result.canonical.nodes.find((node) =>
      node.pageStart === 34 && (node.text ?? "").trim() === "for GPTrel over cfg3b data for GPTrel over cfg3b data"
    );
    expect(repeatedHorizontalPanelLabel?.role).toBe("other");
    expect(repeatedHorizontalPanelLabel?.evidence.some((evidence) => evidence.label === "dense-vector-panel")).toBe(true);
    const captionBoundPanelLabel = result.canonical.nodes.find((node) =>
      node.pageStart === 32 && (node.text ?? "").trim() === "lay1 lay1"
    );
    expect(captionBoundPanelLabel?.role).toBe("other");
    expect(captionBoundPanelLabel?.evidence.some((evidence) => evidence.label === "figure-panel-label")).toBe(true);
    const captionBoundVectorGrid = result.canonical.nodes.find((node) =>
      node.pageStart === 39 && /(?:^|\s)9 8 9 9 8 9 8 11(?:\s|$)/.test(node.text ?? "")
    );
    expect(captionBoundVectorGrid?.role).toBe("other");
    expect(captionBoundVectorGrid?.evidence.some((evidence) => evidence.label === "figure-panel-label")).toBe(true);
    const formula = result.canonical.nodes.find((node) => /\|S\| x∈S len\(x\)\+1/.test(node.text ?? ""));
    expect(formula?.role).toBe("equation");
    // Figure 10 is a vector dynamic-programming diagram. Its glyph matrix
    // must not render as a source-only table.
    const diagram = result.canonical.nodes.find((node) => /𝐷𝑃2 𝑡,15/.test(node.text ?? ""));
    expect(diagram?.role).toBe("other");
    expect(diagram?.evidence.some((evidence) => evidence.label === "figure-caption-vector-diagram")).toBe(true);
  }, 60_000);

  it("keeps a prose line out of a caption-adjacent table region", () => {
    const rows = ["A 1.2 3.4", "B 2.3 4.5", "C 3.4 5.6"].flatMap((row, index) => {
      const [label, first, second] = row.split(" ");
      return [
        { text: label, x: 80, y: 160 + index * 14, width: 20, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
        { text: first, x: 180, y: 160 + index * 14, width: 30, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
        { text: second, x: 240, y: 160 + index * 14, width: 30, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
      ];
    });
    const result = extractFromPages({
      pages: [{ pageNumber: 1, width: 500, height: 700, textItems: [
        { text: "Table 1. Results", x: 80, y: 100, width: 120, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
        { text: "This sentence explains the experiment and should remain prose.", x: 80, y: 125, width: 260, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
        ...rows,
      ] }],
      paperId: "table-region-prose", filePath: "/tmp/table.pdf", fileHash: "table", metadata: { pageCount: 1 },
    });
    const prose = result.canonical.nodes.find((node) => node.text?.startsWith("This sentence"));
    const region = result.canonical.nodes.find((node) => node.role === "table" && !node.text);
    expect(prose?.role).toBe("paragraph");
    expect(region?.boundingBoxes[0]?.y).toBeGreaterThan(130);
  });

  it("demotes narrative sentences that inherit a table role near a matrix", () => {
    const bbox = { page: 1, x: 80, y: 200, width: 300, height: 12 };
    const node = (id: string, role: "table" | "paragraph", text: string, y: number) => ({
      id,
      role,
      text,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [{ ...bbox, y }],
      confidence: 0.99,
      evidence: [] as const,
      sourceAnchor: { page: 1, boundingBoxes: [{ ...bbox, y }] },
    });
    const projected = projectCanonicalToPaper({
      canonical: {
        nodes: [
          node("t1", "table", "Thumb 0.000 0.151 0.028 0.000", 160),
          node(
            "p1",
            "table",
            "When considering the time taken for different fingers to tap targets (Figure 6) and examining the smallest size, comfort remains highest.",
            200
          ),
          node(
            "p2",
            "table",
            "thumb-finger 2 and thumb-finger 3. Thus, we can confirm H1 for most parts.",
            220
          ),
        ],
        relations: [],
        source: { pageCount: 1 },
        pageCount: 1,
        diagnostics: {
          layoutConfidence: 1,
          readingOrderConfidence: 1,
          textIntegrityConfidence: 1,
          semanticConfidence: 1,
          formatConfidence: 1,
          relationConfidence: 1,
          columnConfidence: 1,
          unicodeConfidence: 1,
          paragraphConfidence: 1,
        },
        format: {
          applied: "generic",
          scores: { generic: 1, acm: 0, ieee: 0, "springer-lncs": 0, jstage: 0 },
          reason: "test",
        },
        formatId: "generic",
        pageKind: "native-text",
      },
      paperId: "narrative-table-demote",
      filePath: "/tmp/narrative-table.pdf",
      fileHash: "narrative-table",
      metadata: { pageCount: 1 },
      layoutBlocks: [],
      layouts: [],
      baseFontSize: 10,
    });
    const matrix = projected.blocks.find((block) => block.original?.startsWith("Thumb 0.000"));
    const when = projected.blocks.find((block) => block.original?.startsWith("When considering"));
    const thus = projected.blocks.find((block) => block.original?.includes("Thus, we can confirm"));
    expect(matrix?.type).toBe("table");
    expect(when?.type).toBe("paragraph");
    expect(thus?.type).toBe("paragraph");
  });

  it("preserves table identity without projecting synthetic region text", () => {
    const result = extractFromPages({
      pages: [{ pageNumber: 1, width: 500, height: 700, textItems: [
        { text: "Table 9", x: 80, y: 100, width: 45, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
        { text: "Summary of methods", x: 130, y: 100, width: 120, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
        ...["A 1", "B 2", "C 3"].flatMap((text, i) => text.split(" ").map((part, j) => ({ text: part, x: 80 + j * 100, y: 125 + i * 14, width: 30, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 }))),
      ] }],
      paperId: "table-identity", filePath: "/tmp/table-identity.pdf", fileHash: "table-identity", metadata: { pageCount: 1 },
    });
    const region = result.canonical.nodes.find((node) => node.role === "table" && node.structuralLabel?.startsWith("Table 9"));
    expect(region?.text ?? null).toBeNull();
    expect(region?.structuralLabel).toContain("Table 9");
    expect(region?.boundingBoxes.length).toBeGreaterThan(0);
    // Cell crumbs under a numbered Table N caption must not become extra table blocks.
    const tableBlocks = result.blocks.filter((block) => block.type === "table");
    expect(tableBlocks).toHaveLength(1);
    expect(tableBlocks[0]?.original).toMatch(/^Table 9\b/);
  });

  it("marks standalone bullet blocks as list items", () => {
    const result = extractFromPages({
      pages: [{ pageNumber: 1, width: 500, height: 700, textItems: [
        { text: "• First contribution", x: 80, y: 120, width: 160, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
        { text: "• Second contribution", x: 80, y: 140, width: 170, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
      ] }],
      paperId: "bullet-items", filePath: "/tmp/bullets.pdf", fileHash: "bullets", metadata: { pageCount: 1 },
    });
    const items = result.blocks.filter((block) => block.original?.startsWith("•"));
    expect(items).toHaveLength(2);
    expect(items.every((block) => block.metadata.listRole === "item")).toBe(true);
  });

  it("keeps running references such as Table 4 shows as paragraph text", () => {
    const pages = [{
      pageNumber: 1,
      width: 500,
      height: 700,
      textItems: [{
        text: "Table 4 shows the results obtained for dummy data 1.",
        x: 80, y: 120, width: 260, height: 8, fontSize: 8, fontName: "Helvetica", page: 1,
      }],
    }];
    const block = reconstructDocument(pages).blocks[0];
    expect(block?.role).toBe("paragraph");
  });

  it("ends a caption before a cell-like equation line", () => {
    const pages = [{
      pageNumber: 1,
      width: 500,
      height: 700,
      textItems: [
        { text: "Table 2", x: 80, y: 100, width: 45, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
        { text: "Equations used for fitting", x: 130, y: 100, width: 130, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
        ...["y = Cxα", "y = KVmax/(m+x)", "y = 1/(1+Kx^d)", "p < 0.001", "R² = 0.92", "n = 20", "β = 0.4", "γ = 0.8"].map((text, i) => ({
          text, x: 80 + (i % 4) * 90, y: 125 + Math.floor(i / 4) * 14, width: 70, height: 8, fontSize: 8, fontName: "Helvetica", page: 1,
        })),
      ],
    }];
    const blocks = reconstructDocument(pages).blocks;
    expect(blocks.some((block) => block.role === "table_caption" && block.text.includes("Table 2"))).toBe(true);
    expect(blocks.some((block) => block.role !== "table_caption" && block.text.includes("y = Cx"))).toBe(true);
  });

  it("does not run GROBID or Docling without a local service", () => {
    const pages = FIXTURES["single-column"]();
    const native = nativeDocumentFromExtracted(pages, { pageCount: 1 });
    const ctx = { native, pages };
    expect(grobidEnricher.shouldRun(ctx)).toBe(false);
    expect(doclingEnricher.shouldRun(ctx)).toBe(false);
  });
});

  it("recognizes a high-font CJK title without Latin characters", () => {
    const pages = [{ pageNumber: 1, width: 500, height: 700, textItems: [
      { text: "智能人机交互的人因工程途径", x: 100, y: 100, width: 220, height: 16, fontSize: 16, fontName: "Title", page: 1 },
      { text: "这是正文段落，包含足够的普通文字用于基准字体估计。", x: 80, y: 150, width: 260, height: 9, fontSize: 9, fontName: "Body", page: 1 },
    ] }];
    const result = reconstructDocument(pages);
    expect(result.blocks[0]?.role).toBe("title");
  });

  it("splits IEEE Abstract— body into heading + abstract", () => {
    const item = (text: string, x: number, y: number, fontSize = 10) => ({
      text, x, y, width: text.length * fontSize * 0.5, height: fontSize, fontSize, fontName: "Body", page: 1,
    });
    for (const abstractLine of [
      "Abstract—Deep learning has been widely used for medical image segmentation and many papers report success.",
      "Abstract-Vocabulary acquisition is an important task in second language acquisition field which has been studied.",
    ]) {
      const pages = [{
        pageNumber: 1,
        width: 540,
        height: 700,
        textItems: [
          item(abstractLine, 50, 120, 10),
          item("1. Introduction", 50, 200, 12),
          item("We survey the field across modalities.", 50, 230, 10),
        ],
      }];
      const extracted = extractFromPages({
        pages,
        paperId: "ieee-abstract-emdash",
        filePath: "/tmp/ieee-abstract.pdf",
        fileHash: "ieee-abstract",
        metadata: { pageCount: 1 },
      });
      expect(extracted.canonical.nodes.some((n) => n.role === "heading" && /^Abstract$/i.test(n.text ?? ""))).toBe(true);
      expect(extracted.canonical.nodes.some((n) => n.role === "abstract")).toBe(true);
      expect(extracted.canonical.nodes.some((n) => n.role === "paragraph" && /^Abstract[—–-]/i.test(n.text ?? ""))).toBe(false);
    }
  });

  it("does not classify multi-column Japanese memorial prose as tables", async () => {
    const pdf = path.resolve(
      "test-fixtures/real-papers/pending-pdfs/cognitive-psychology-a-tribute-to-the-memory-of-professor-neisser-the-godfather-of-cognitiv.pdf"
    );
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "neisser-tribute-prose",
      filePath: pdf,
      fileHash: "neisser-tribute-prose",
      metadata: { pageCount: pages.length },
    });
    const tables = result.canonical.nodes.filter((node) => node.role === "table");
    expect(tables).toEqual([]);
    expect(result.canonical.nodes.some((node) => node.role === "paragraph" && /Neisser/.test(node.text ?? ""))).toBe(true);
  }, 60_000);

  it("keeps academic Using-to titles instead of vignette option lines", async () => {
    const pdf = path.resolve("test-data/real-papers/cognitive-psychology-gpt3.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "gpt3-using-title",
      filePath: pdf,
      fileHash: "gpt3-using-title",
      metadata: { pageCount: pages.length },
    });
    const title = result.canonical.nodes.find((node) => node.role === "title")?.text ?? "";
    expect(title).toMatch(/Using cognitive psychology to understand GPT-3/i);
    expect(title).not.toMatch(/Option\s*\d+/i);
  }, 60_000);

  it("prefers the article title over a Cureus tool-line title", async () => {
    const pdf = path.resolve(
      "test-fixtures/real-papers/pending-pdfs/epmc-code-free-automated-machine-learning-for-referable-glaucoma-classificati.pdf"
    );
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "cureus-tool-title",
      filePath: pdf,
      fileHash: "cureus-tool-title",
      metadata: { pageCount: pages.length },
    });
    const title = result.canonical.nodes.find((node) => node.role === "title")?.text ?? "";
    expect(title).not.toMatch(/^Using Google Cloud/i);
    expect(title).toMatch(/Code-Free Automated Machine Learning/i);
  }, 60_000);

  it("recovers article title when the native title is an arXiv stamp", () => {
    const item = (text: string, x: number, y: number, fontSize: number, fontName = "Body") => ({
      text, x, y, width: Math.max(20, text.length * fontSize * 0.45), height: fontSize, fontSize, fontName, page: 1,
    });
    const pages = [{
      pageNumber: 1,
      width: 612,
      height: 792,
      textItems: [
        item("arXiv:2408.01927v1 [eess.SP] 4 Aug 2024", 40, 40, 16, "StampFont"),
        item("Step-to-Charge: Resonant Human Body Powering for Wearables", 80, 90, 14, "TitleFont"),
        item("Arunashish Datta and Shreyas Sen", 80, 130, 11),
        item("Abstract", 80, 180, 12, "BoldFont"),
        item("Current limits of harvested energy in wearables are governed by physical limits of available energy.", 80, 210, 10),
      ],
    }];
    const extracted = extractFromPages({
      pages,
      paperId: "arxiv-stamp-title",
      filePath: "/tmp/arxiv-stamp.pdf",
      fileHash: "arxiv-stamp",
      metadata: { pageCount: 1 },
    });
    const title = extracted.canonical.nodes.find((node) => node.role === "title")?.text ?? "";
    expect(title).not.toMatch(/^arXiv:/i);
    expect(title).toMatch(/Step-to-Charge/i);
  });

  it("promotes Cyrillic ALL-CAPS section labels that share body font size", () => {
    const item = (text: string, x: number, y: number, fontSize = 11, fontName = "BodyFont") => ({
      text, x, y, width: Math.max(12, text.length * fontSize * 0.45), height: fontSize, fontSize, fontName, page: 1,
    });
    const pages = [{
      pageNumber: 1,
      width: 540,
      height: 700,
      textItems: [
        item("СЕНЗОРНИ МАРКЕТИНГ – ИНТЕГРИСАЊЕ ЧУЛА", 80, 60, 14, "TitleFont"),
        item("Ivana Author", 80, 100, 10),
        item("УВОДНЕ НАПОМЕНЕ", 80, 160, 11),
        item("Сензорни маркетинг је савремени приступ брендирању који користи чула потрошача у комуникацији.", 80, 200, 11),
        item("ЗАКЉУЧАК", 80, 320, 11),
        item("Резултати показују да интегрисање чула побољшава препознатљивост бренда у дужем периоду.", 80, 360, 11),
      ],
    }];
    const extracted = extractFromPages({
      pages,
      paperId: "cyrillic-allcaps-heading",
      filePath: "/tmp/cyrillic-heading.pdf",
      fileHash: "cyrillic-heading",
      metadata: { pageCount: 1 },
    });
    const headings = extracted.canonical.nodes
      .filter((node) => node.role === "heading")
      .map((node) => (node.text ?? "").trim());
    expect(headings).toContain("УВОДНЕ НАПОМЕНЕ");
    expect(headings).toContain("ЗАКЉУЧАК");
  });

  it("demotes diagram micro-labels that look like headings", () => {
    // Figure annotation crumbs (Q, VM, PA:) share display size with captions but
    // are not section structure. Numbered subheads stay eligible.
    const item = (text: string, x: number, y: number, fontSize: number, fontName = "FigureFont") => ({
      text, x, y, width: Math.max(8, text.length * fontSize * 0.55), height: fontSize, fontSize, fontName, page: 1,
    });
    const pages = [{
      pageNumber: 1,
      width: 540,
      height: 700,
      textItems: [
        item("Methods", 50, 80, 14, "BoldFont"),
        item("We evaluate three aggregation pathways.", 50, 110, 10, "BodyFont"),
        item("Q", 80, 200, 12),
        item("W", 120, 200, 12),
        item("VM", 160, 200, 12),
        item("X∞", 200, 200, 12),
        item("PA:", 80, 240, 11),
        item("pixel accuracy under the protocol.", 120, 240, 10, "BodyFont"),
        item("3.1 Aggregation", 50, 300, 12, "BoldFont"),
        item("The block combines query and value streams.", 50, 330, 10, "BodyFont"),
      ],
    }];
    const extracted = extractFromPages({
      pages,
      paperId: "diagram-micro-heading",
      filePath: "/tmp/diagram-micro.pdf",
      fileHash: "diagram-micro",
      metadata: { pageCount: 1 },
    });
    const headings = extracted.blocks
      .filter((block) => block.type === "heading")
      .map((block) => (block.original ?? "").trim());
    expect(headings).toContain("3.1 Aggregation");
    expect(headings.some((text) => /^(Q|W|VM|PA:|X∞|A B)$/.test(text))).toBe(false);
  });

  it("does not promote figure panel tags or camelCase legend mash as headings", () => {
    const item = (text: string, x: number, y: number, fontSize: number, fontName = "BodyFont") => ({
      text, x, y, width: Math.max(8, text.length * fontSize * 0.5), height: fontSize, fontSize, fontName, page: 1,
    });
    const pages = [{
      pageNumber: 1,
      width: 540,
      height: 700,
      textItems: [
        item("Using Cognitive Psychology to Understand Models", 50, 40, 15, "TitleFont"),
        item("Ada Researcher", 50, 70, 10),
        item("Abstract", 50, 110, 12, "BoldFont"),
        item("We compare human and model decisions across vignettes in a controlled setting.", 50, 140, 10),
        item("Results", 50, 200, 13, "BoldFont"),
        item("Model accuracy tracks human patterns on framing tasks.", 50, 230, 10),
        item("Figure 1. Panel overview of decision tasks.", 50, 320, 9, "CaptionFont"),
        item("A B", 80, 360, 10),
        item("HumansDavinci", 80, 390, 10),
        item("Mean regret", 80, 420, 10),
        item("Discussion", 50, 500, 13, "BoldFont"),
        item("These patterns suggest the model mirrors several human biases in aggregate.", 50, 530, 10),
      ],
    }];
    const extracted = extractFromPages({
      pages,
      paperId: "figure-panel-heading",
      filePath: "/tmp/figure-panel.pdf",
      fileHash: "figure-panel",
      metadata: { pageCount: 1 },
    });
    const headings = extracted.canonical.nodes
      .filter((node) => node.role === "heading")
      .map((node) => (node.text ?? "").trim());
    expect(headings).toContain("Results");
    expect(headings).toContain("Discussion");
    expect(headings.some((text) => /^(A B|HumansDavinci|Mean regret)$/.test(text))).toBe(false);
  });

  it("keeps lowercase colon lead-ins with italic quotes as body, not headings", () => {
    // ACM-style stream: body font lead-in + italic quote on one baseline.
    // Title-Case metadata labels (Background:) must still split as headings.
    const body = (text: string, x: number, y: number, width: number, fontName: string) => ({
      text, x, y, width, height: 9, fontSize: 9.5, fontName, page: 1,
    });
    const pages = [{
      pageNumber: 1,
      width: 540,
      height: 700,
      textItems: [
        body("Background:", 50, 120, 70, "LabelFont"),
        body("Touch input is studied across several devices and ages.", 125, 120, 280, "BodyFont"),
        body("follows:", 50, 200, 40, "BodyFont"),
        body("“I think it could be quite confusing to remember which finger.”", 95, 200, 300, "ItalicFont"),
        body("triggered:", 50, 240, 50, "BodyFont"),
        body("“I want to be more careful in sharing images.”", 105, 240, 280, "ItalicFont"),
        body("following comment:", 50, 280, 90, "BodyFont"),
        body("“There is too high risk of accidentally deleting something.”", 145, 280, 260, "ItalicFont"),
      ],
    }];
    const layout = reconstructDocument(pages);
    expect(layout.blocks.some((block) => block.role === "heading" && /^Background:$/i.test(block.text))).toBe(true);
    expect(layout.blocks.some((block) => block.role === "heading" && /^(follows|triggered|following comment):$/i.test(block.text.trim()))).toBe(false);

    const extracted = extractFromPages({
      pages,
      paperId: "lowercase-colon-lead-in",
      filePath: "/tmp/lowercase-colon.pdf",
      fileHash: "lowercase-colon",
      metadata: { pageCount: 1 },
    });
    expect(extracted.blocks.some((block) => block.type === "heading" && /^(follows|triggered|following comment):$/i.test((block.original ?? "").trim()))).toBe(false);
    expect(extracted.blocks.some((block) => /follows:/i.test(block.original ?? "") && block.type === "paragraph")).toBe(true);
  });

  it("prefers a clean Latin title over a contaminated Cyrillic masthead", async () => {
    const pdf = path.resolve(
      "test-fixtures/real-papers/pending-pdfs/marketing-digital-marketing-consumer-behavior.pdf"
    );
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "ru-digital-marketing-title",
      filePath: pdf,
      fileHash: "ru-digital-marketing-title",
      metadata: { pageCount: pages.length },
    });
    const title = result.canonical.nodes.find((node) => node.role === "title")?.text ?? "";
    expect(title).toMatch(/digital marketing/i);
    expect(title).not.toMatch(/канд\.|Аннотация|Бутковская/i);
  }, 60_000);

  it("rejects chapter body prose as the title when a section heading exists", async () => {
    const pdf = path.resolve(
      "test-fixtures/real-papers/pending-pdfs/cognitive-psychology-attention-and-entrepreneurial-cognition.pdf"
    );
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "chapter-body-title",
      filePath: pdf,
      fileHash: "chapter-body-title",
      metadata: { pageCount: pages.length },
    });
    const title = result.canonical.nodes.find((node) => node.role === "title")?.text ?? "";
    expect(title).not.toMatch(/^While there are/i);
    expect(title.toLowerCase()).toMatch(/attention/);
  }, 60_000);

  it("recovers a thesis cover title instead of the copyright sheet", async () => {
    const pdf = path.resolve(
      "test-fixtures/real-papers/pending-pdfs/marketing-is-digital-advertising-effective-under-conditions-of-low-attention-the.pdf"
    );
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "thesis-copyright-title",
      filePath: pdf,
      fileHash: "thesis-copyright-title",
      metadata: { pageCount: pages.length },
    });
    const title = result.canonical.nodes.find((node) => node.role === "title")?.text ?? "";
    expect(title).not.toMatch(/copyright/i);
    expect(title).toMatch(/digital advertising/i);
    expect(title).toMatch(/low attention/i);
  }, 90_000);

  it("keeps a date-range narrative title instead of PRISMA table chrome", async () => {
    const pdf = path.resolve(
      "test-fixtures/real-papers/pending-pdfs/epmc-gaze-and-eye-tracking-perspectives-for-psychological-research-a-narrativ.pdf"
    );
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "gaze-date-range-title",
      filePath: pdf,
      fileHash: "gaze-date-range-title",
      metadata: { pageCount: pages.length },
    });
    const title = result.canonical.nodes.find((node) => node.role === "title")?.text ?? "";
    expect(title).toMatch(/Gaze and Eye-Tracking Perspectives/i);
    expect(title).not.toMatch(/inclusion criteria|gray literature|Employment of eye-tracking/i);
  }, 60_000);

  it("splits plain Materials and Methods / Results section labels", async () => {
    const pdf = path.resolve(
      "test-fixtures/real-papers/pending-pdfs/ergonomics-risk-factors-for-occupational-fatigue-in-construction-workers-a-system.pdf"
    );
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "fatigue-section-split",
      filePath: pdf,
      fileHash: "fatigue-section-split",
      metadata: { pageCount: pages.length },
    });
    const headings = result.canonical.nodes
      .filter((node) => node.role === "heading")
      .map((node) => (node.text ?? "").trim());
    expect(headings.some((h) => /^Materials And Methods$/i.test(h))).toBe(true);
    expect(headings.some((h) => /^Results And Discussions$/i.test(h))).toBe(true);
  }, 60_000);

  it("demotes figure micro-labels on a real survey PDF", async () => {
    const pdf = path.resolve(
      "test-fixtures/real-papers/pending-pdfs/medical-image-segmentation-deep-learning.pdf"
    );
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "medical-micro-heading",
      filePath: pdf,
      fileHash: "medical-micro-heading",
      metadata: { pageCount: pages.length },
    });
    const micro = result.canonical.nodes.filter((node) =>
      node.role === "heading" && /^(?:Q|W|VM|ASPP|GAP|DQ|HQ|WQ|V|Fold|MSD|Non|N|Nte|Task)$/.test((node.text ?? "").trim())
    );
    expect(micro).toEqual([]);
  }, 60_000);

  it("rejoins an interrupted native title around publication metadata", async () => {
    const pdf = path.resolve("test-fixtures/real-papers/pending-pdfs/linguistics-eco-linguistics-in-english-reviewing-the-role-of-language-in-environme.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "title-continuation-publication-rail",
      filePath: pdf,
      fileHash: "title-continuation-publication-rail",
      metadata: { pageCount: pages.length },
    });
    expect(result.canonical.nodes.find((node) => node.role === "title")?.text)
      .toBe("Eco-Linguistics in English: Reviewing the role of language in environmental discourse");
  }, 60_000);
