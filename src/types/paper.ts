export type BoundingBox = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TranslationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped";

export type BlockType =
  | "heading"
  | "paragraph"
  | "figure"
  | "table"
  | "equation"
  | "footnote"
  | "reference";

export type PaperBlock = {
  id: string;
  paperId: string;
  sectionId: string | null;
  type: BlockType;
  order: number;
  pageStart: number;
  pageEnd: number;
  boundingBoxes: BoundingBox[];
  original: string | null;
  translated: string | null;
  extractionConfidence: number | null;
  translationStatus: TranslationStatus;
  parentBlockId: string | null;
  metadata: Record<string, unknown>;
};

export type NormalizedSectionKind =
  | "abstract"
  | "introduction"
  | "related_work"
  | "method"
  | "results"
  | "discussion"
  | "conclusion"
  | "references"
  | "other";

export type Section = {
  id: string;
  paperId: string;
  parentSectionId: string | null;
  order: number;
  level: number;
  originalTitle: string;
  translatedTitle: string | null;
  normalizedKind: NormalizedSectionKind;
};

export type ProcessingStatus =
  | "queued"
  | "extracting"
  | "structuring"
  | "glossary"
  | "translating"
  | "ready"
  | "partial"
  | "failed";

export type PaperAuthor = {
  id: string;
  name: string;
  affiliationIds: string[];
};

export type PaperAffiliation = {
  id: string;
  name: string;
};

/** Citation fields beyond title/authors/venue/year/DOI (user-edited or fetched). */
export type PaperBibliography = {
  entryType?: "article" | "inproceedings" | "preprint" | "book" | "misc";
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  url?: string;
  arxivId?: string;
};

export type PaperReadStatus = "unread" | "reading" | "read";

export type Paper = {
  id: string;
  sourceFilePath: string;
  sourceFileName?: string;
  sourceStoredPath?: string | null;
  sourceFileHash: string;
  titleOriginal: string | null;
  titleTranslated: string | null;
  authors: string[];
  authorsStructured?: PaperAuthor[];
  affiliations?: PaperAffiliation[];
  keywords?: string[];
  doi?: string | null;
  bibliography?: PaperBibliography;
  publication: string | null;
  year: number | null;
  pageCount: number;
  processingStatus: ProcessingStatus;
  /** SQLite index flag: translation should resume without opening the package. */
  needsTranslationResume?: boolean;
  lastReadBlockId: string | null;
  lastReadOffset: number | null;
  favorite?: boolean;
  /** Library-level reading state (SQLite only, like favorite). */
  readStatus?: PaperReadStatus;
  /** User tags (SQLite only). */
  tags?: string[];
  lastOpenedAt?: string;
  packageRevision?: number;
  /** ISO timestamp when moved to Trash; null/undefined means active in library. */
  trashedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FigureMetadata = {
  imageUrl: string;
  captionOriginal: string;
  captionTranslated: string | null;
  figureNumber: string;
};

export type TableMetadata = {
  imageUrl?: string;
  tableNumber: string;
  captionOriginal: string;
  captionTranslated: string | null;
  /**
   * Native PDF cell rows retained for a source-only table fallback.  This is
   * intentionally small structural evidence, not a claim that every borderless
   * table was fully reconstructed.
   */
  tableRows?: Array<Array<{ text: string; x: number; width: number }>>;
};

export type EquationMetadata = {
  latex?: string;
  imageUrl?: string;
  equationNumber?: string;
};
