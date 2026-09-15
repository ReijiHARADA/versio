import { hasSourceTextIntegrity, type LayoutBlock } from "../pdfLayout";
import type { ExtractedPage } from "../pdfService";
import { evidenceFromPages } from "./evidence";
import { detectFormat } from "./formats";
import { fuseTitle } from "./fusion";
import { parseGrobidHeaderTei } from "./grobid/tei";
import {
  pairwiseOrderAccuracy,
  relationAccuracy,
  relationPrecision,
  setScores,
  substringRecall,
  substringPrecision,
  titleExactMatch,
} from "./metrics";
import { classifyDocument, scannedByItemAverage } from "./pageClass";
import type { FormatId } from "./types";
import { extractFromPages } from "./pipeline/extractAcademicPdf";

export type PartialGroundTruth = {
  id: string;
  /** True only when the listed structural labels are exhaustive. */
  completeAnnotations?: boolean;
  /** List annotations are often partial even when heading annotations are exhaustive. */
  completeListAnnotations?: boolean;
  title?: string;
  authors?: string[];
  affiliations?: string[];
  headings?: string[];
  tokensInOrder?: [string, string];
  figureCaptions?: string[];
  tableCaptions?: string[];
  tableRegions?: string[];
  listItems?: string[];
  authorAffiliation?: Array<{ from: string; to: string }>;
  headingHierarchy?: Array<{ from: string; to: string }>;
  figureCaptionRelations?: Array<{ from: string; to: string }>;
  tableCaptionRelations?: Array<{ from: string; to: string }>;
};

export type BaselinePaperReport = {
  id: string;
  filename: string;
  formatApplied: FormatId;
  formatScores: Record<FormatId, number>;
  formatReason: string;
  catalogFormatFamily?: string;
  pageKind: ReturnType<typeof classifyDocument>;
  scannedByItemAverage: boolean;
  titlePredicted: string | null;
  titleExact?: boolean;
  authorF1?: number;
  affiliationF1?: number;
    headingRecall?: number;
    headingPrecision?: number;
    headingHierarchyAccuracy?: number;
    headingHierarchyPrecision?: number;
    readingOrderPair?: number;
    figureCaptionRecall?: number;
    tableCaptionRecall?: number;
    tableRegionRecall?: number;
    tableRegionPrecision?: number;
    listItemRecall?: number;
    listItemPrecision?: number;
    figureCaptionRelation?: number;
    tableCaptionRelation?: number;
    tableCaptionRelationRecall?: number;
    tableCaptionRelationPrecision?: number;
    authorAffiliationF1?: number;
    sourceIntegrityRate: number;
    /** Canonical nodes retain a page anchor and at least one native bbox. */
    canonicalProvenanceRate: number;
    fusedTitle: string;
    fusedTitleConfidence: number;
    canonicalTitle?: string | null;
    rotatedNativeItemCount?: number;
    rotatedLineCount?: number;
    /** Native PDFs may flatten one table row into one text item. */
    flattenedNumericRowCount?: number;
    chartLabelNodeCount?: number;
};

function uniqueTexts(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function evaluateBaselinePaper(input: {
  id: string;
  filename: string;
  pages: ExtractedPage[];
  blocks: LayoutBlock[];
  catalogFormatFamily?: string;
  catalogTitle?: string;
  grobidTei?: string;
  groundTruth?: PartialGroundTruth;
}): BaselinePaperReport {
  const evidence = evidenceFromPages(input.pages);
  const detection = detectFormat(evidence);
  const grobid = input.grobidTei ? parseGrobidHeaderTei(input.grobidTei) : null;
  const fused = fuseTitle(
    evidence.titleCandidates,
    detection.applied === "generic"
      ? []
      : [
          {
            source: "format-profile",
            label: `${detection.applied}-title-region`,
            confidence: detection.scores[detection.applied],
          },
        ],
    grobid?.title
  );

  const titles = input.blocks.filter((b) => b.role === "title").map((b) => b.text);
  const authors = input.blocks.filter((b) => b.role === "author").map((b) => b.text);
  const affiliations = input.blocks
    .filter((b) => b.role === "affiliation")
    .map((b) => b.text);
  const gold = input.groundTruth;
  const expectedTitle = gold?.title ?? input.catalogTitle;
  const extracted = extractFromPages({
    pages: input.pages,
    paperId: `bench-${input.id}`,
    filePath: input.filename,
    fileHash: input.id,
    metadata: { title: input.catalogTitle, pageCount: input.pages.length },
  });
  const headings = extracted.canonical.nodes
    .filter((node) => node.role === "heading")
    .map((node) => node.text ?? "");
  // Structural metrics must evaluate the same resolved layer consumed by the
  // reader. LayoutBlock roles are useful diagnostics, but can differ from
  // canonical roles when native PDF streams interleave or rotate captions.
  const figures = uniqueTexts(extracted.canonical.nodes
    .filter((node) => node.role === "caption" && /^figure|^fig\.?/i.test(node.text ?? ""))
    .map((node) => node.text ?? "")
    .concat(input.blocks.filter((b) => b.role === "figure_caption").map((b) => b.text)));
  const tables = uniqueTexts(extracted.canonical.nodes
    .filter((node) => node.role === "caption" && /^(?:table|表)/i.test(node.text ?? ""))
    .map((node) => node.text ?? "")
    .concat(input.blocks.filter((b) => b.role === "table_caption").map((b) => b.text)));
  const canonicalTitle =
    extracted.canonical.nodes.find((n) => n.role === "title")?.text ?? null;
  const flattenedNumericRowCount = extracted.canonical.nodes.filter((node) => {
    const text = (node.text ?? "").trim();
    return node.role === "paragraph" && node.pageStart === node.pageEnd &&
      text.length <= 180 && /^[+−-]?\d/.test(text) &&
      (text.match(/\d/g) ?? []).length / Math.max(text.length, 1) >= 0.22 &&
      !/[.!?]$/.test(text) && (text.match(/[A-Za-z]{2,}/g) ?? []).length <= 2;
  }).length;
  const chartLabelNodeCount = extracted.canonical.nodes.filter((node) =>
    node.evidence.some((evidence) => evidence.label === "repeated-numeric-chart-label")
  ).length;
  const captionRels = extracted.canonical.relations.filter((r) => r.kind === "CAPTION_OF");
  const affRels = extracted.canonical.relations.filter((r) => r.kind === "AFFILIATED_WITH");
  const childRels = extracted.canonical.relations.filter((r) => r.kind === "CHILD_OF");
  const regionCaptionIds = new Set(
    extracted.canonical.relations
      .filter((r) => r.kind === "CAPTION_OF")
      .filter((r) => {
        const region = extracted.canonical.nodes.find((node) => node.id === r.to);
        return region?.role === "table" && region.confidence >= 0.75;
      })
      .map((r) => r.from)
  );
  const structuredTableCaptions = extracted.canonical.nodes
    .filter((node) => regionCaptionIds.has(node.id))
    .map((node) => node.text ?? "");

  return {
    id: input.id,
    filename: input.filename,
    formatApplied: detection.applied,
    formatScores: detection.scores,
    formatReason: detection.reason,
    catalogFormatFamily: input.catalogFormatFamily,
    pageKind: classifyDocument(input.pages),
    scannedByItemAverage: scannedByItemAverage(input.pages),
    // Report the resolver's logical title, which may span multiple native
    // lines. Using the first layout block understated wrapped titles.
    titlePredicted: canonicalTitle ?? titles[0] ?? null,
    titleExact: expectedTitle
      ? titleExactMatch(canonicalTitle ?? titles.join(" "), expectedTitle)
      : undefined,
    authorF1:
      gold?.authors && gold.authors.length > 0
        ? setScores(authors, gold.authors).f1
        : undefined,
    affiliationF1:
      gold?.affiliations && gold.affiliations.length > 0
        ? setScores(affiliations, gold.affiliations).f1
        : undefined,
    headingRecall: gold?.headings
      ? substringRecall(headings, gold.headings)
      : undefined,
    headingPrecision: gold?.completeAnnotations && gold.headings
      ? substringPrecision(headings, gold.headings)
      : undefined,
    // Several fixtures deliberately provide only a heading-presence check.
    // An empty hierarchy in partial ground truth means "not annotated", not
    // "the document has no hierarchy"; treating resolver relations as false
    // positives would corrupt the cross-paper benchmark average.
    headingHierarchyAccuracy: gold?.headingHierarchy && gold.headingHierarchy.length > 0
      ? relationAccuracy(
          childRels.map((r) => ({
            from: extracted.canonical.nodes.find((n) => n.id === r.from)?.text ?? "",
            to: extracted.canonical.nodes.find((n) => n.id === r.to)?.text ?? "",
          })),
          gold.headingHierarchy
        )
      : undefined,
    headingHierarchyPrecision: gold?.completeAnnotations && gold.headingHierarchy && gold.headingHierarchy.length > 0
      ? relationPrecision(
          childRels.map((r) => ({
            from: extracted.canonical.nodes.find((n) => n.id === r.from)?.text ?? "",
            to: extracted.canonical.nodes.find((n) => n.id === r.to)?.text ?? "",
          })),
          gold.headingHierarchy
        )
      : undefined,
    readingOrderPair: gold?.tokensInOrder
      ? pairwiseOrderAccuracy(extracted.blocks.map((b) => b.original ?? ""), [
          gold.tokensInOrder,
        ])
      : undefined,
    figureCaptionRecall: gold?.figureCaptions
      ? substringRecall(figures, gold.figureCaptions)
      : undefined,
    tableCaptionRecall: gold?.tableCaptions
      // Include captions proven by a CAPTION_OF relation even when the
      // native text omits the literal "Table" label (e.g. rotated tables).
      // Keep unrelated figure captions out by using only table-linked nodes.
      ? substringRecall(uniqueTexts(tables.concat(structuredTableCaptions)), gold.tableCaptions)
      : undefined,
    tableRegionRecall: gold?.tableRegions
      ? substringRecall(structuredTableCaptions, gold.tableRegions)
      : undefined,
    tableRegionPrecision: gold?.completeAnnotations && gold.tableRegions
      ? substringPrecision(structuredTableCaptions, gold.tableRegions)
      : undefined,
    tableCaptionRelationRecall:
      gold?.tableCaptions && gold.tableCaptions.length > 0
        ? gold.tableCaptions.filter((expectedCaption) => {
            const captionNode = extracted.canonical.nodes.find(
              (node) => node.role === "caption" &&
                (node.text ?? "").toLowerCase().includes(expectedCaption.toLowerCase())
            );
            return captionNode
              ? captionRels.some(
                  (relation) =>
                    relation.from === captionNode.id &&
                    extracted.canonical.nodes.find((node) => node.id === relation.to)?.role === "table"
                )
              : false;
          }).length / gold.tableCaptions.length
        : undefined,
    tableCaptionRelationPrecision:
      captionRels.filter((relation) => {
        const caption = extracted.canonical.nodes.find((node) => node.id === relation.from);
        return caption?.role === "caption" && /^(?:table|表)/i.test(caption.text ?? "");
      }).length > 0
        ? captionRels.filter((relation) => {
            const caption = extracted.canonical.nodes.find((node) => node.id === relation.from);
            return caption?.role === "caption" && /^(?:table|表)/i.test(caption.text ?? "") &&
              extracted.canonical.nodes.find((node) => node.id === relation.to)?.role === "table";
          }).length /
          captionRels.filter((relation) => {
            const caption = extracted.canonical.nodes.find((node) => node.id === relation.from);
            return caption?.role === "caption" && /^(?:table|表)/i.test(caption.text ?? "");
          }).length
        : undefined,
    listItemRecall: gold?.listItems
      ? substringRecall(
          extracted.blocks.filter((b) => b.type === "paragraph").map((b) => b.original ?? ""),
          gold.listItems
        )
      : undefined,
    listItemPrecision: gold?.completeListAnnotations && gold.listItems
      ? substringPrecision(
          extracted.blocks
            .filter((b) => b.type === "paragraph" && b.metadata?.listRole === "item")
            .map((b) => b.original ?? ""),
          gold.listItems
        )
      : undefined,
    figureCaptionRelation:
      gold?.figureCaptionRelations && gold.figureCaptionRelations.length > 0
        ? relationAccuracy(
            captionRels.map((r) => ({ from: r.from, to: r.to })),
            gold.figureCaptionRelations
          )
        : captionRels.length > 0
          ? 1
          : undefined,
    tableCaptionRelation:
      gold?.tableCaptionRelations && gold.tableCaptionRelations.length > 0
        ? relationAccuracy(
            captionRels
              .filter((r) => extracted.canonical.nodes.find((n) => n.id === r.to)?.role === "table")
              .map((r) => ({ from: r.from, to: r.to })),
            gold.tableCaptionRelations
          )
        : undefined,
    authorAffiliationF1:
      gold?.authorAffiliation && gold.authorAffiliation.length > 0
        ? relationAccuracy(
            affRels.map((r) => ({
              from: extracted.canonical.nodes.find((n) => n.id === r.from)?.text ?? "",
              to: extracted.canonical.nodes.find((n) => n.id === r.to)?.text ?? "",
            })),
            gold.authorAffiliation
          )
        : undefined,
    sourceIntegrityRate:
      input.blocks.length === 0
        ? 1
        : input.blocks.filter(hasSourceTextIntegrity).length / input.blocks.length,
    canonicalProvenanceRate:
      extracted.canonical.nodes.length === 0
        ? 1
        : extracted.canonical.nodes.filter((node) =>
            Number.isFinite(node.sourceAnchor.page) &&
            node.sourceAnchor.boundingBoxes.length > 0 &&
            node.boundingBoxes.length > 0 &&
            node.pageStart <= node.pageEnd
          ).length / extracted.canonical.nodes.length,
    fusedTitle: fused.text,
    fusedTitleConfidence: fused.confidence,
    canonicalTitle,
    flattenedNumericRowCount,
    chartLabelNodeCount,
    rotatedNativeItemCount: input.pages
      .flatMap((page) => page.textItems)
      .filter((item) => Math.abs(item.rotation ?? 0) >= 45).length,
    rotatedLineCount: input.blocks
      .flatMap((block) => block.lines)
      .filter((line) => Math.abs(line.rotation ?? 0) >= 45).length,
  };
}
