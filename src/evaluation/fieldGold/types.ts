/** Field-level extraction gold: the "fine detail" items users actually notice. */
export type FieldName = "title" | "authors" | "authorAffiliation" | "emails" | "captions" | "references";

export type FieldRecord = {
  title: string | null;
  authors: Array<{ name: string; affiliationKeys: string[] }>;
  affiliations: Array<{ key: string; text: string }>;
  emails: string[];
  captions: Array<{ kind: "figure" | "table"; label: string | null; text: string }>;
  references: Array<{ raw: string; title?: string; year?: string; doi?: string }>;
};

export type GoldSource = "europepmc" | "arxiv" | "jstage" | "manual";

export type FieldGold = {
  id: string;
  source: GoldSource;
  language: "en" | "ja";
  discipline: string;
  pdfPath: string;
  pdfSha256: string;
  /** Only these fields are scored; other fields are unreliable for this source. */
  trustedFields: FieldName[];
  fields: FieldRecord;
};

export type ParserId = "versio" | "grobid" | "apple";

export type FieldPrediction = {
  id: string;
  parser: ParserId;
  parserVersion: string;
  elapsedMs: number;
  /** Fields the parser could not produce (service down, model unavailable). Not scored. */
  unavailableFields: FieldName[];
  fields: FieldRecord;
};

export type PRF = { precision: number; recall: number; f1: number; gold: number; predicted: number };

export type FieldScores = {
  title?: { exact: 0 | 1; similarity: number };
  authors?: PRF;
  authorAffiliation?: PRF;
  emails?: PRF;
  captions?: PRF & { labelAccuracy: number | null };
  /** Field accuracies are over matched references whose gold has that field; null when none do. */
  references?: PRF & { countRatio: number; titleAccuracy: number | null; yearAccuracy: number | null; doiAccuracy: number | null };
};
