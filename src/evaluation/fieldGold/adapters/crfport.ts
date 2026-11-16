/** Evaluation-only adapter for the ported GROBID 0.9.1 CRF reference models. */
import { parseCitation } from "../../../services/pdfExtraction/crf/citation";
import { segmentReferences, type RefLine } from "../../../services/pdfExtraction/crf/segmentReferences";
import type { FieldName, FieldPrediction, FieldRecord } from "../types";

const OTHER: FieldName[] = ["title", "authors", "authorAffiliation", "emails", "captions"];
const empty = (): FieldRecord => ({ title: null, authors: [], affiliations: [], emails: [], captions: [], references: [] });

export function predictionFromCrfPort(id: string, language: "en" | "ja", lines: RefLine[], elapsedMs: number): FieldPrediction {
  const unavailableFields: FieldName[] = language === "ja" ? [...OTHER, "references"] : OTHER;
  return { id, parser: "crfport", parserVersion: "grobid-0.9.1-port", elapsedMs, unavailableFields, fields: { ...empty(), references: language === "ja" ? [] : segmentReferences(lines).map(parseCitation) } };
}
