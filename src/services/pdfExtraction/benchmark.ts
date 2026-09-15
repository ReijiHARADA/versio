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
    authorAffiliationF1?: number;
    sourceIntegrityRate: number;
    fusedTitle: string;
    fusedTitleConfidence: number;
    canonicalTitle?: string | null;
    rotatedNativeItemCount?: number;
    rotatedLineCount?: number;
  };

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
  const figures = extracted.canonical.nodes
    .filter((node) => node.role === "caption" && /^figure|^fig\.?/i.test(node.text ?? ""))
    .map((node) => node.text ?? "")
    .concat(input.blocks.filter((b) => b.role === "figure_caption").map((b) => b.text));
  const tables = extracted.canonical.nodes
    .filter((node) => node.role === "caption" && /^(?:table|表)/i.test(node.text ?? ""))
    .map((node) => node.text ?? "")
    .concat(input.blocks.filter((b) => b.role === "table_caption").map((b) => b.text));
  const canonicalTitle =
    extracted.canonical.nodes.find((n) => n.role === "title")?.text ?? null;
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
      ? substringRecall(tables, gold.tableCaptions)
      : undefined,
    tableRegionRecall: gold?.tableRegions
      ? substringRecall(structuredTableCaptions, gold.tableRegions)
      : undefined,
    tableRegionPrecision: gold?.completeAnnotations && gold.tableRegions
      ? substringPrecision(structuredTableCaptions, gold.tableRegions)
      : undefined,
    listItemRecall: gold?.listItems
      ? substringRecall(
          extracted.blocks.filter((b) => b.type === "paragraph").map((b) => b.original ?? ""),
          gold.listItems
        )
      : undefined,
    listItemPrecision: gold?.completeAnnotations && gold.listItems
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
    fusedTitle: fused.text,
    fusedTitleConfidence: fused.confidence,
    canonicalTitle,
    rotatedNativeItemCount: input.pages
      .flatMap((page) => page.textItems)
      .filter((item) => Math.abs(item.rotation ?? 0) >= 45).length,
    rotatedLineCount: input.blocks
      .flatMap((block) => block.lines)
      .filter((line) => Math.abs(line.rotation ?? 0) >= 45).length,
  };
}
