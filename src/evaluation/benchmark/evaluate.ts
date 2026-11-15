import type { ExtractionBenchmarkGold, ExtractionBenchmarkPrediction } from "./schema";
import { blockF1, boundaryF1, characterErrorRate, formulaCdmUnavailable, intersectionOverUnion, normalizedEditDistance, readingOrderEditDistance, tableTeds, type MetricScore } from "./standardMetrics";
import { validateBenchmarkGold, validateBenchmarkPrediction } from "./validate";

export type BenchmarkDimension = MetricScore & { name: string };
export type BenchmarkDocumentReport = {
  id: string; sourceHash: string; split: ExtractionBenchmarkGold["split"]; attributes: ExtractionBenchmarkGold["attributes"]; parser: ExtractionBenchmarkPrediction["parser"];
  blockF1: BenchmarkDimension | null; textCer: BenchmarkDimension | null; textNed: BenchmarkDimension | null;
  readingOrder: BenchmarkDimension | null; paragraphBoundaries: BenchmarkDimension | null;
  captionRelations: BenchmarkDimension | null;
  tableTeds: BenchmarkDimension | null; formulaNed: BenchmarkDimension | null; formulaCdm: BenchmarkDimension | null;
  criticalFailures: string[];
};

const unavailable = (name: string, why: string): BenchmarkDimension => ({ name, value: null, evaluated: 0, reason: why });
const average = (name: string, values: MetricScore[]): BenchmarkDimension => {
  const known = values.filter((item) => item.value !== null) as Array<MetricScore & { value: number }>;
  return known.length ? { name, value: known.reduce((sum, item) => sum + item.value, 0) / known.length, evaluated: known.reduce((sum, item) => sum + item.evaluated, 0) }
    : unavailable(name, "No complete annotations for this metric.");
};

function matchRegions<
  P extends { id: string; region: { page: number; x: number; y: number; width: number; height: number } },
  G extends { id: string; region: { page: number; x: number; y: number; width: number; height: number } },
>(predicted: P[], gold: G[], threshold = 0.5): Array<{ predicted: P; gold: G }> {
  const candidates = predicted.flatMap((item) => gold.map((reference) => ({ item, reference, iou: intersectionOverUnion(item.region, reference.region) })))
    .filter((candidate) => candidate.iou >= threshold).sort((left, right) => right.iou - left.iou);
  const candidatesByPrediction = new Map<string, typeof candidates>();
  for (const candidate of candidates) candidatesByPrediction.set(candidate.item.id, [...(candidatesByPrediction.get(candidate.item.id) ?? []), candidate]);
  const matchedPredictionByGold = new Map<string, string>();
  const matchPrediction = (predictionId: string, visitedGold = new Set<string>()): boolean => {
    for (const candidate of candidatesByPrediction.get(predictionId) ?? []) {
      if (visitedGold.has(candidate.reference.id)) continue;
      visitedGold.add(candidate.reference.id);
      const previousPrediction = matchedPredictionByGold.get(candidate.reference.id);
      if (!previousPrediction || matchPrediction(previousPrediction, visitedGold)) {
        matchedPredictionByGold.set(candidate.reference.id, predictionId);
        return true;
      }
    }
    return false;
  };
  for (const item of predicted) matchPrediction(item.id);
  return [...matchedPredictionByGold.entries()].flatMap(([goldId, predictionId]) => {
    const candidate = candidatesByPrediction.get(predictionId)?.find((item) => item.reference.id === goldId);
    return candidate ? [{ predicted: candidate.item, gold: candidate.reference }] : [];
  });
}

export function evaluateBenchmarkDocument(gold: ExtractionBenchmarkGold, prediction: ExtractionBenchmarkPrediction): BenchmarkDocumentReport {
  const validation = validateBenchmarkGold(gold); if (validation.length) throw new Error(`Invalid benchmark gold for ${gold.id}: ${validation.join(" ")}`);
  const predictionValidation = validateBenchmarkPrediction(prediction); if (predictionValidation.length) throw new Error(`Invalid benchmark prediction for ${prediction.id}: ${predictionValidation.join(" ")}`);
  if (gold.id !== prediction.id || gold.source.fileHash !== prediction.source.fileHash) throw new Error("Gold and prediction must have the same document ID and file hash.");
  const scopedPrediction = { ...prediction, blocks: prediction.blocks.filter((block) => gold.annotatedPages.includes(block.region.page)) };
  const block = gold.coverage.blocks === "complete" && gold.blocks
    ? (() => { const score = blockF1(scopedPrediction.blocks, gold.blocks); return { name: "block_f1", value: score.f1, evaluated: score.evaluated }; })()
    : unavailable("block_f1", "Block annotations are not complete.");
  // Role is part of layout/block F1, but text/order/boundary quality should
  // remain measurable when the same region merely has the wrong role.
  const matched = gold.blocks && gold.coverage.blocks === "complete" ? blockF1(scopedPrediction.blocks, gold.blocks, { requireSameRole: false }).matches : [];
  const goldById = new Map((gold.blocks ?? []).map((item) => [item.id, item]));
  const predictionById = new Map(scopedPrediction.blocks.map((item) => [item.id, item]));
  const textPairs = matched.flatMap((item) => {
    const reference = goldById.get(item.goldId)?.text; const predicted = predictionById.get(item.predictedId)?.text;
    return reference !== undefined && predicted !== undefined ? [{ reference, predicted }] : [];
  });
  const textNeds = textPairs.map((item) => normalizedEditDistance(item.predicted, item.reference));
  // CER has reference-length denominator; aggregate it directly rather than averaging pages.
  const referenceCharacters = textPairs.reduce((sum, item) => sum + item.reference.length, 0);
  const edits = textPairs.reduce((sum, item) => sum + (characterErrorRate(item.predicted, item.reference).value ?? 0) * item.reference.length, 0);
  const textCer = gold.coverage.text === "complete" && textPairs.length
    ? { name: "cer", value: referenceCharacters ? edits / referenceCharacters : null, evaluated: referenceCharacters, ...(referenceCharacters ? {} : { reason: "No reference characters." }) }
    : unavailable("cer", "Text annotations are not complete or have no matched text blocks.");
  const textNed = gold.coverage.text === "complete" ? average("ned", textNeds) : unavailable("ned", "Text annotations are not complete.");
  const scopedOrder = prediction.readingOrder?.filter((id) => predictionById.has(id));
  const predictionOrderIsComplete = scopedOrder !== undefined &&
    scopedOrder.length === scopedPrediction.blocks.length &&
    new Set(scopedOrder).size === scopedOrder.length;
  const reading = gold.coverage.readingOrder === "complete" && gold.readingOrder && gold.readingOrder.length >= 2 && predictionOrderIsComplete
    ? { name: "reading_order_edit_distance", ...readingOrderEditDistance(scopedOrder.map((id) => matched.find((match) => match.predictedId === id)?.goldId ?? `unmatched:${id}`), gold.readingOrder) }
    : unavailable("reading_order_edit_distance", "Reading-order annotations or the predicted full block order are not complete.");
  const scopedBoundaries = prediction.paragraphBoundaries?.filter(([left, right]) => predictionById.has(left) && predictionById.has(right));
  const boundaries = gold.coverage.paragraphBoundaries === "complete" && gold.paragraphBoundaries && gold.paragraphBoundaries.length > 0 && scopedBoundaries
    ? (() => { const converted = scopedBoundaries.map(([left, right]) => [matched.find((item) => item.predictedId === left)?.goldId ?? `unmatched:${left}`, matched.find((item) => item.predictedId === right)?.goldId ?? `unmatched:${right}`] as [string, string]); const score = boundaryF1(converted, gold.paragraphBoundaries); return { name: "paragraph_boundary_f1", value: score.f1, evaluated: score.evaluated }; })()
    : unavailable("paragraph_boundary_f1", "Paragraph-boundary annotations are not complete or contain no boundary units.");
  const scopedCaptionRelations = prediction.captionRelations?.filter(([caption, target]) => predictionById.has(caption) && predictionById.has(target));
  const captionRelations = gold.coverage.captionRelations === "complete" && gold.captionRelations && gold.captionRelations.length > 0 && scopedCaptionRelations
    ? (() => { const converted = scopedCaptionRelations.map(([caption, target]) => [matched.find((item) => item.predictedId === caption)?.goldId ?? `unmatched:${caption}`, matched.find((item) => item.predictedId === target)?.goldId ?? `unmatched:${target}`] as [string, string]); const score = boundaryF1(converted, gold.captionRelations); return { name: "caption_relation_f1", value: score.f1, evaluated: score.evaluated }; })()
    : unavailable("caption_relation_f1", "Caption-relation annotations are not complete or contain no relation units.");
  const tableMatches = gold.tables && prediction.tables ? matchRegions(prediction.tables, gold.tables) : [];
  const table = gold.coverage.tables === "complete" && gold.tables && prediction.tables
    ? average("table_teds", gold.tables.map((reference) => { const candidate = tableMatches.find((item) => item.gold.id === reference.id)?.predicted; return candidate ? tableTeds(candidate.tree, reference.tree) : { value: 0, evaluated: 1 }; }))
    : unavailable("table_teds", "Table annotations are not complete.");
  const formulaMatches = gold.formulas && prediction.formulas ? matchRegions(prediction.formulas, gold.formulas) : [];
  const formulaPairs = gold.coverage.formulas === "complete" && gold.formulas ? gold.formulas.map((reference) => ({ reference, predicted: formulaMatches.find((item) => item.gold.id === reference.id)?.predicted })) : [];
  // Prefer the human-authored linear text representation for Paper Reader;
  // fall back to LaTeX only when both sides actually provide it. This keeps a
  // raw PDF string from being misrepresented as TeX.
  const formulaNedPairs = formulaPairs.flatMap(({ reference, predicted }) => {
    if (reference.text?.trim()) return [{ reference: reference.text, predicted: predicted?.text ?? "" }];
    // A missing prediction is a real formula recall error even when the human
    // gold uses LaTeX. A present parser formula without LaTeX is different: it
    // has no compatible representation, so leave this metric N/A rather than
    // treating arbitrary linearized text as TeX.
    if (reference.latex?.trim() && !predicted) return [{ reference: reference.latex, predicted: "" }];
    if (reference.latex?.trim() && predicted?.latex?.trim()) return [{ reference: reference.latex, predicted: predicted.latex }];
    return [];
  });
  const formulaNed = formulaNedPairs.length === formulaPairs.length && formulaPairs.length
    ? average("formula_ned", formulaNedPairs.map((pair) => normalizedEditDistance(pair.predicted, pair.reference)))
    : unavailable("formula_ned", "Formula annotations are incomplete or the parser has no matching text/LaTeX representation.");
  const cdmValues = formulaPairs.flatMap(({ reference, predicted }) => reference.latex?.trim() && typeof predicted?.cdm === "number" ? [{ value: predicted.cdm, evaluated: 1 }] : []);
  const formulaCdm = cdmValues.length === formulaPairs.length && formulaPairs.length ? average("formula_cdm", cdmValues) : { name: "formula_cdm", ...formulaCdmUnavailable() };
  const criticalFailures = [
    block.value === 0 ? "No annotated blocks matched." : null,
    textCer.value !== null && textCer.value >= 0.25 ? "Text character error rate reaches 0.25." : null,
    reading.value !== null && reading.value > 0.25 ? "Reading-order edit distance exceeds 0.25." : null,
    boundaries.value === 0 ? "No annotated paragraph boundaries matched." : null,
    captionRelations.value === 0 ? "No annotated caption relations matched." : null,
    table.value === 0 ? "No annotated table structure matched." : null,
    formulaNed.value !== null && formulaNed.value > 0.25 ? "Formula normalized edit distance exceeds 0.25." : null,
  ].filter((item): item is string => Boolean(item));
  return { id: gold.id, sourceHash: gold.source.fileHash, split: gold.split, attributes: gold.attributes, parser: prediction.parser, blockF1: block, textCer, textNed, readingOrder: reading, paragraphBoundaries: boundaries, captionRelations, tableTeds: table, formulaNed, formulaCdm, criticalFailures };
}

export function assertNoLeakage(gold: ExtractionBenchmarkGold[]): void {
  const documentByGroup = new Map<string, { id: string; split: ExtractionBenchmarkGold["split"] }>();
  const sourceByHash = new Map<string, { id: string; split: ExtractionBenchmarkGold["split"] }>();
  const documentIds = new Set<string>();
  for (const document of gold) {
    if (documentIds.has(document.id)) throw new Error(`Benchmark document ID ${document.id} appears more than once.`);
    documentIds.add(document.id);
    const previousGroup = documentByGroup.get(document.leakageGroup);
    if (previousGroup) {
      throw new Error(`Leakage group ${document.leakageGroup} is reused by ${previousGroup.id} (${previousGroup.split}) and ${document.id} (${document.split}).`);
    }
    documentByGroup.set(document.leakageGroup, { id: document.id, split: document.split });
    const previousSource = sourceByHash.get(document.source.fileHash);
    if (previousSource) {
      throw new Error(`Source hash ${document.source.fileHash} is reused by ${previousSource.id} (${previousSource.split}) and ${document.id} (${document.split}).`);
    }
    sourceByHash.set(document.source.fileHash, { id: document.id, split: document.split });
  }
}
