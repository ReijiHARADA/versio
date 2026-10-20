import type { CanonicalRole } from "../services/pdfExtraction/canonical/types";
import { CANONICAL_ROLES, type ExtractionReview, type ExtractionSnapshot, type PageReview } from "./schema";

export type Score = { precision: number | null; recall: number | null; f1: number | null; evaluated: number };
export type RoleReport = Record<string, Score>;
export type PageReport = { page: number; status: PageReview["status"]; roles: RoleReport; paragraphBoundaries: Score; readingOrder: Score; relations: Score; notes: string[] };
export type EvaluationReport = {
  schemaVersion: 1;
  generatedAt: string;
  source: ExtractionSnapshot["source"];
  parser: ExtractionSnapshot["parser"];
  pages: PageReport[];
  roles: RoleReport;
  paragraphBoundaries: Score;
  readingOrder: Score;
  relations: Score;
  notes: string[];
};

type Counts = { tp: number; fp: number; fn: number; precisionKnown: boolean; recallKnown: boolean };
// Include roles that are only represented by a human-reported missing region.
const roles = (_snapshot: ExtractionSnapshot): CanonicalRole[] => CANONICAL_ROLES;

function score(counts: Counts): Score {
  const precision = counts.precisionKnown
    ? (counts.tp + counts.fp === 0 ? 1 : counts.tp / (counts.tp + counts.fp)) : null;
  const recall = counts.recallKnown
    ? (counts.tp + counts.fn === 0 ? 1 : counts.tp / (counts.tp + counts.fn)) : null;
  return {
    precision,
    recall,
    f1: precision !== null && recall !== null ? (precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall)) : null,
    evaluated: counts.tp + counts.fp + counts.fn,
  };
}

function roleCounts(snapshot: ExtractionSnapshot, review: PageReview, role: CanonicalRole): Counts {
  const predicted = snapshot.canonical.nodes.filter((node) => node.pageStart <= review.page && node.pageEnd >= review.page && node.role === role);
  const labels = review.blockReviews;
  const reviewByNode = new Map(labels.filter((item) => item.predictedNodeId).map((item) => [item.predictedNodeId!, item]));
  let tp = 0;
  let fp = 0;
  let fn = review.missingRegions.filter((item) => item.correctRole === role).length;
  for (const node of predicted) {
    const label = reviewByNode.get(node.id);
    if (!label) continue;
    const intended = label.correctRole ?? node.role;
    const isMatch = label.verdict === "correct" && intended === node.role;
    if (isMatch) tp += 1;
    else {
      fp += 1;
      if (intended === role && !label.errorTypes.includes("extra")) fn += 1;
    }
  }
  // A role correction (for example predicted heading → gold paragraph) is a
  // gold-side false negative for the corrected role even though that node is
  // absent from the prediction set for this role.
  for (const label of labels) {
    if (label.correctRole !== role || label.verdict === "correct") continue;
    const predictedNode = label.predictedNodeId
      ? snapshot.canonical.nodes.find((node) => node.id === label.predictedNodeId)
      : undefined;
    if (predictedNode?.role !== role && !label.errorTypes.includes("extra")) fn += 1;
  }
  // A role precision denominator is valid only after all predictions on the page
  // have been checked. This prevents an unreviewed node becoming a silent TP.
  if (review.coverage.predictedComplete) {
    for (const node of predicted) if (!reviewByNode.has(node.id)) fp += 1;
  }
  return { tp, fp, fn, precisionKnown: review.status === "complete" && review.coverage.predictedComplete,
    recallKnown: review.status === "complete" && review.coverage.goldComplete };
}

function relationCounts(snapshot: ExtractionSnapshot, review: PageReview, kind: "CAPTION_OF" | "READS_BEFORE"): Counts {
  const onPage = snapshot.canonical.relations.filter((relation) => {
    if (relation.kind !== kind) return false;
    const from = snapshot.canonical.nodes.find((node) => node.id === relation.from);
    return from?.pageStart === review.page;
  });
  const complete = kind === "READS_BEFORE" ? review.coverage.readingOrderComplete : review.coverage.relationsComplete;
  const labels = new Map(review.relationReviews.map((item) => [`${item.relationKind}/${item.fromNodeId}/${item.toNodeId}`, item]));
  let tp = 0;
  let fp = 0;
  for (const relation of onPage) {
    const label = labels.get(`${relation.kind}/${relation.from}/${relation.to}`);
    if (label?.verdict === "correct") tp += 1;
    else if (label?.verdict === "incorrect" || complete) fp += 1;
  }
  // Missing gold relations can be recorded as an incorrect relation with IDs
  // from the snapshot when applicable; relation completeness makes that count usable.
  const fn = review.relationReviews.filter((item) => item.relationKind === kind && item.verdict === "incorrect" &&
    !onPage.some((relation) => relation.kind === item.relationKind && relation.from === item.fromNodeId && relation.to === item.toNodeId)).length;
  return { tp, fp, fn, precisionKnown: review.status === "complete" && complete,
    recallKnown: review.status === "complete" && complete };
}

function paragraphBoundaryCounts(review: PageReview): Counts {
  const labels = review.paragraphBoundaryReviews;
  let tp = labels.filter((item) => item.verdict === "correct").length;
  let fp = labels.filter((item) => item.verdict === "incorrect").length;
  // A merge label indicates at least one absent paragraph boundary. A split
  // label indicates an additional predicted boundary. These are conservative
  // unit counts; reviewers may add a boundary record for each additional case.
  const merge = review.blockReviews.filter((item) => item.errorTypes.includes("merge")).length;
  const split = review.blockReviews.filter((item) => item.errorTypes.includes("split")).length;
  fp += split;
  return { tp, fp, fn: merge, precisionKnown: review.status === "complete" && review.coverage.paragraphBoundariesComplete,
    recallKnown: review.status === "complete" && review.coverage.paragraphBoundariesComplete };
}

function combine(scores: Counts[]): Score {
  const eligiblePrecision = scores.filter((item) => item.precisionKnown);
  const eligibleRecall = scores.filter((item) => item.recallKnown);
  const tpPrecision = eligiblePrecision.reduce((sum, item) => sum + item.tp, 0);
  const fp = eligiblePrecision.reduce((sum, item) => sum + item.fp, 0);
  const tpRecall = eligibleRecall.reduce((sum, item) => sum + item.tp, 0);
  const fn = eligibleRecall.reduce((sum, item) => sum + item.fn, 0);
  const precision = eligiblePrecision.length ? (tpPrecision + fp === 0 ? 1 : tpPrecision / (tpPrecision + fp)) : null;
  const recall = eligibleRecall.length ? (tpRecall + fn === 0 ? 1 : tpRecall / (tpRecall + fn)) : null;
  return { precision, recall, f1: precision !== null && recall !== null ? (precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall)) : null,
    // Keep the reviewed-unit count visible even when only precision or recall
    // is eligible. It is an audit denominator, not a claim of completeness.
    evaluated: scores.reduce((sum, item) => sum + item.tp + item.fp + item.fn, 0) };
}

export function evaluateReview(snapshot: ExtractionSnapshot, review: ExtractionReview): EvaluationReport {
  if (snapshot.source.fileHash !== review.source.fileHash) throw new Error("Review and snapshot are for different PDFs.");
  const allRoles = roles(snapshot);
  const pageReports = review.pages.map((page) => {
    const pageRoles = Object.fromEntries(allRoles.map((role) => [role, score(roleCounts(snapshot, page, role))]));
    const notes = page.status !== "complete" ? ["Page is not complete; metrics are N/A."] : [];
    return { page: page.page, status: page.status, roles: pageRoles, paragraphBoundaries: score(paragraphBoundaryCounts(page)),
      readingOrder: score(relationCounts(snapshot, page, "READS_BEFORE")), relations: score(relationCounts(snapshot, page, "CAPTION_OF")), notes };
  });
  const aggregateRoles = Object.fromEntries(allRoles.map((role) => [role,
    combine(review.pages.map((page) => roleCounts(snapshot, page, role)))
  ]));
  const completePages = review.pages.filter((page) => page.status === "complete").length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: snapshot.source,
    parser: snapshot.parser,
    pages: pageReports,
    roles: aggregateRoles,
    paragraphBoundaries: combine(review.pages.map(paragraphBoundaryCounts)),
    readingOrder: combine(review.pages.map((page) => relationCounts(snapshot, page, "READS_BEFORE"))),
    relations: combine(review.pages.map((page) => relationCounts(snapshot, page, "CAPTION_OF"))),
    notes: [
      `${completePages}/${review.pages.length} pages have been marked complete.`,
      "Precision requires predictedComplete; recall requires goldComplete. Missing completeness produces N/A, never 100%.",
      "Paragraph-boundary and reading-order scores use explicit reviewed predicted pairs. Merge/split labels contribute conservative boundary false negatives/positives.",
    ],
  };
}
