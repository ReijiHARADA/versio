import type { BoundingBox, PaperBlock } from "../types/paper";
import type { CanonicalDocument, CanonicalRole } from "../services/pdfExtraction/canonical/types";

/** A portable parser result. It deliberately does not claim to be ground truth. */
export type ExtractionSnapshot = {
  schemaVersion: 1;
  kind: "paper-reader-extraction-snapshot";
  createdAt: string;
  parser: { id: string; version: string };
  source: { paperId: string; fileName: string; fileHash: string; pageCount: number };
  pages: Array<{ page: number; width: number; height: number; rotation?: number }>;
  canonical: CanonicalDocument;
  projection: { blocks: PaperBlock[] };
};

export type ReviewStatus = "unreviewed" | "in-progress" | "complete";
export type ReviewVerdict = "correct" | "incorrect";
export type ErrorType =
  | "reading-order"
  | "merge"
  | "split"
  | "role"
  | "missing"
  | "extra"
  | "relation"
  | "text-corruption";
export type Severity = "minor" | "major" | "critical";

/**
 * Page completeness is intentionally dimension-specific. A completed visual
 * pass is not automatically exhaustive enough to calculate every metric.
 */
export type PageCoverage = {
  predictedComplete: boolean;
  goldComplete: boolean;
  /** Every evaluated block has an explicitly human-authored gold text. */
  textComplete: boolean;
  paragraphBoundariesComplete: boolean;
  readingOrderComplete: boolean;
  relationsComplete: boolean;
  tablesComplete: boolean;
  formulasComplete: boolean;
};

/**
 * `text` is the human-authored linear reading used for string NED. `latex`
 * remains optional and is reserved for visual CDM evaluation; neither value
 * is inferred from the parser output.
 */
/** A reviewed equation may be an extracted node or a human-added missing region. */
export type GoldFormulaReview = { nodeId?: string; missingRegionId?: string; text?: string; latex?: string };
export type GoldTableReview = { nodeId: string; tree: { tag: string; text?: string; children?: unknown[] } };

export type BlockReview = {
  id: string;
  page: number;
  /** Stable only within the snapshot identified below; never used as a gold ID. */
  predictedNodeId?: string;
  predictedBlockId?: string;
  targetRegion?: BoundingBox;
  /** Human-authored reference text. Never fall back to the parser output. */
  goldText?: string;
  textAnchor?: { text: string; prefix?: string; suffix?: string };
  correctRole?: CanonicalRole;
  verdict: ReviewVerdict;
  errorTypes: ErrorType[];
  severity: Severity;
  comment?: string;
  createdAt: string;
  updatedAt: string;
};

/** A gold-side element absent from this parser's output. */
export type MissingRegionReview = {
  id: string;
  page: number;
  region: BoundingBox;
  correctRole: CanonicalRole;
  textAnchor?: { text: string; prefix?: string; suffix?: string };
  comment?: string;
  createdAt: string;
};

export type RelationReview = {
  id: string;
  page: number;
  relationKind: string;
  fromNodeId: string;
  toNodeId: string;
  verdict: ReviewVerdict;
  comment?: string;
};

/** Review of a predicted boundary between two adjacent projected paragraphs. */
export type ParagraphBoundaryReview = {
  id: string;
  page: number;
  leftNodeId: string;
  rightNodeId: string;
  verdict: ReviewVerdict;
  comment?: string;
};

export type PageReview = {
  page: number;
  status: ReviewStatus;
  coverage: PageCoverage;
  blockReviews: BlockReview[];
  missingRegions: MissingRegionReview[];
  relationReviews: RelationReview[];
  paragraphBoundaryReviews: ParagraphBoundaryReview[];
  /** Human-authored canonical node IDs in correct reading order. */
  goldReadingOrder?: string[];
  /** Human-authored pairs of canonical node IDs separated by a paragraph boundary. */
  goldParagraphBoundaries?: Array<[string, string]>;
  /** Human-authored [caption node, figure/table node] pairs on this page. */
  goldCaptionRelations?: Array<[string, string]>;
  goldFormulas?: GoldFormulaReview[];
  goldTables?: GoldTableReview[];
  updatedAt: string;
};

/** Human-authored labels. This must never be synthesized from a snapshot. */
export type ExtractionReview = {
  schemaVersion: 1;
  kind: "paper-reader-extraction-review";
  source: ExtractionSnapshot["source"];
  snapshot: Pick<ExtractionSnapshot, "schemaVersion" | "createdAt" | "parser">;
  pages: PageReview[];
  createdAt: string;
  updatedAt: string;
};

export type EvaluationBundle = {
  schemaVersion: 1;
  kind: "paper-reader-extraction-evaluation";
  snapshot: ExtractionSnapshot;
  review: ExtractionReview;
};

export const CANONICAL_ROLES: CanonicalRole[] = [
  "title", "author", "affiliation", "abstract", "heading", "paragraph", "figure", "table",
  "caption", "equation", "footnote", "citation", "reference", "header", "footer", "copyright",
  "page-number", "other",
];

export const ERROR_TYPES: ErrorType[] = [
  "reading-order", "merge", "split", "role", "missing", "extra", "relation", "text-corruption",
];

export function emptyPageReview(page: number): PageReview {
  return {
    page,
    status: "unreviewed",
    coverage: {
      predictedComplete: false,
      goldComplete: false,
      textComplete: false,
      paragraphBoundariesComplete: false,
      readingOrderComplete: false,
      relationsComplete: false,
      tablesComplete: false,
      formulasComplete: false,
    },
    blockReviews: [],
    missingRegions: [],
    relationReviews: [],
    paragraphBoundaryReviews: [],
    updatedAt: new Date().toISOString(),
  };
}

export function newReview(snapshot: ExtractionSnapshot): ExtractionReview {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    kind: "paper-reader-extraction-review",
    source: snapshot.source,
    snapshot: { schemaVersion: snapshot.schemaVersion, createdAt: snapshot.createdAt, parser: snapshot.parser },
    pages: Array.from({ length: snapshot.source.pageCount }, (_, index) => emptyPageReview(index + 1)),
    createdAt: now,
    updatedAt: now,
  };
}

export function isEvaluationBundle(value: unknown): value is EvaluationBundle {
  const candidate = value as Partial<EvaluationBundle> | null;
  return candidate?.kind === "paper-reader-extraction-evaluation" &&
    candidate.snapshot?.kind === "paper-reader-extraction-snapshot" &&
    candidate.review?.kind === "paper-reader-extraction-review" &&
    candidate.snapshot.source.fileHash === candidate.review.source.fileHash;
}
