import { describe, expect, it } from "vitest";
import { analyzeStructure } from "../../services/structureService";
import { extractFromPages } from "../../services/pdfExtraction/pipeline/extractAcademicPdf";
import { FIXTURES } from "../readingOrder/builders";
import { grobidEnricher } from "../../services/pdfExtraction/enrichers/grobid";
import { doclingEnricher } from "../../services/pdfExtraction/enrichers/docling";
import { nativeDocumentFromExtracted } from "../../services/pdfExtraction/native/fromExtracted";
import { generateGenericCandidates } from "../../services/pdfExtraction/generic/candidates";
import { splitFlattenedList } from "../../services/pdfExtraction/projection/toPaper";
import { detectPageColumns, reconstructDocument } from "../../services/pdfLayout";
import { extractPdfPages } from "../readingOrder/extractPdf";
import fs from "node:fs";
import path from "node:path";

describe("canonical extraction pipeline", () => {
  it("keeps a short diagram annotation out of an adjacent prose paragraph", async () => {
    const pdf = path.resolve("test-data/real-papers/cognitive-psychology-gpt3.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({ pages, paperId: "diagram-annotation-boundary", filePath: pdf, fileHash: "diagram-annotation-boundary", metadata: { pageCount: pages.length } });
    const contaminated = result.blocks.filter((block) => /Linda is 31/.test(block.original ?? ""));
    expect(contaminated.some((block) => /A:\s*Option 2/.test(block.original ?? ""))).toBe(false);
    expect(result.blocks.some((block) => block.original?.trim() === "A: Option 2.")).toBe(true);
  }, 60_000);

  it("does not link a table caption to a nearby figure in a mixed thesis page", async () => {
    const pdf = path.resolve("test-fixtures/real-papers/pending-pdfs/ergonomics-fatigue-and-occupational-safety-in-short-haul-light-transport.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({ pages, paperId: "thesis-table-figure-boundary", filePath: pdf, fileHash: "thesis-table-figure-boundary", metadata: { pageCount: pages.length } });
    const tableCaption = result.canonical.nodes.find((node) => /^Table 4\.1:/i.test(node.text ?? ""));
    expect(tableCaption?.role).toBe("caption");
    expect(tableCaption?.text).not.toMatch(/Driver fatigue a problem/);
    expect(result.canonical.nodes.some((node) => node.role === "table" && /n\s+No\s+Minor\s+Substantial\s+Major/.test(node.text ?? ""))).toBe(true);
    const relation = result.canonical.relations.find((candidate) => candidate.kind === "CAPTION_OF" && candidate.from === tableCaption?.id);
    const target = relation ? result.canonical.nodes.find((node) => node.id === relation.to) : undefined;
    expect(target?.role).not.toBe("figure");
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
    expect(pageFourteen.length).toBeGreaterThan(10);
    expect(pageFourteen.every((block) => block.type === "table")).toBe(true);
    expect(pageFourteen.every((block) => block.translationStatus === "skipped")).toBe(true);
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

  it("recognizes CJK checkmark comparison rows without promoting nearby prose", async () => {
    const pdf = path.resolve("test-data/real-papers/ergonomics-human-factors-ihci.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages, paperId: "cjk-checkmark-table", filePath: pdf, fileHash: "cjk-checkmark-table",
      metadata: { pageCount: pages.length },
    });
    const rows = result.blocks.filter((block) => block.pageStart === 11 && /√/.test(block.original));
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((block) => block.type === "table")).toBe(true);
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
