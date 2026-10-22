import type { TreeNode } from "./standardMetrics";

export type BenchmarkSplit = "development" | "validation" | "heldout";
export type AnnotationState = "none" | "partial" | "complete";
export type BenchmarkRole = "title" | "author" | "affiliation" | "abstract" | "heading" | "paragraph" | "figure" | "table" | "caption" | "equation" | "footnote" | "reference" | "other";
export type BenchmarkRegion = { page: number; x: number; y: number; width: number; height: number };

/** Human-authored, parser-independent gold. Do not generate this from a snapshot. */
export type ExtractionBenchmarkGold = {
  schemaVersion: 1;
  kind: "paper-reader-extraction-benchmark-gold";
  id: string;
  source: { fileHash: string; fileName?: string };
  split: BenchmarkSplit;
  /** Identical publisher/template/source family must not cross this boundary. */
  leakageGroup: string;
  attributes: { publisher?: string; venue?: string; discipline?: string; layout?: string; language?: string };
  /** Pages deliberately completed by a human; predictions are filtered to them. */
  annotatedPages: number[];
  coverage: {
    text: AnnotationState; blocks: AnnotationState; readingOrder: AnnotationState;
    paragraphBoundaries: AnnotationState; captionRelations: AnnotationState; tables: AnnotationState; formulas: AnnotationState;
  };
  blocks?: Array<{ id: string; role: BenchmarkRole; region: BenchmarkRegion; text?: string }>;
  readingOrder?: string[];
  paragraphBoundaries?: Array<[string, string]>;
  captionRelations?: Array<[string, string]>;
  tables?: Array<{ id: string; region: BenchmarkRegion; tree: TreeNode }>;
  formulas?: Array<{ id: string; region: BenchmarkRegion; latex: string }>;
};

/** Common adapter output for Paper Reader, Docling, GROBID, etc. */
export type ExtractionBenchmarkPrediction = {
  schemaVersion: 1;
  kind: "paper-reader-extraction-benchmark-prediction";
  id: string;
  parser: { id: string; version: string };
  source: { fileHash: string };
  blocks: Array<{ id: string; role: BenchmarkRole; region: BenchmarkRegion; text?: string }>;
  readingOrder?: string[];
  paragraphBoundaries?: Array<[string, string]>;
  captionRelations?: Array<[string, string]>;
  tables?: Array<{ id: string; region: BenchmarkRegion; tree: TreeNode }>;
  formulas?: Array<{ id: string; region: BenchmarkRegion; latex: string; cdm?: number }>;
};

export type BenchmarkManifest = {
  schemaVersion: 1;
  kind: "paper-reader-extraction-benchmark-manifest";
  defaultRegressionIds: string[];
  documents: Array<Pick<ExtractionBenchmarkGold, "id" | "split" | "leakageGroup" | "attributes"> & { goldPath?: string; snapshotPath?: string }>;
};
