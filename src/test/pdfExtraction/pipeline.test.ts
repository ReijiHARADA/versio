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

describe("canonical extraction pipeline", () => {
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
