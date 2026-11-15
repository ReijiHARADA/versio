import type { BenchmarkRegion, ExtractionBenchmarkGold, ExtractionBenchmarkPrediction } from "./schema";
import { isTreeNode } from "./standardMetrics";

const validRegion = (region: unknown): region is BenchmarkRegion => {
  if (!region || typeof region !== "object") return false;
  const value = region as Partial<BenchmarkRegion>;
  return Number.isInteger(value.page) && (value.page ?? 0) > 0 &&
    [value.x, value.y, value.width, value.height].every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)) &&
    (value.width ?? 0) > 0 && (value.height ?? 0) > 0;
};
const duplicateIds = (items: Array<{ id: string }>) => new Set(items.map((item) => item.id)).size !== items.length;

/** Reject a claim of complete annotation unless the corresponding gold exists. */
export function validateBenchmarkGold(gold: ExtractionBenchmarkGold): string[] {
  const issues: string[] = [];
  if (!gold.id || !gold.source.fileHash || !gold.leakageGroup) issues.push("id, source.fileHash, and leakageGroup are required.");
  if (!gold.annotatedPages.length || new Set(gold.annotatedPages).size !== gold.annotatedPages.length) issues.push("annotatedPages must be a non-empty unique page list.");
  const blockIds = new Set(gold.blocks?.map((block) => block.id) ?? []);
  if (gold.coverage.blocks === "complete" && !gold.blocks?.length) issues.push("Complete block coverage requires at least one gold block.");
  if (gold.blocks && blockIds.size !== gold.blocks.length) issues.push("Gold block IDs must be unique.");
  if (gold.blocks?.some((block) => !gold.annotatedPages.includes(block.region.page) || !validRegion(block.region))) issues.push("Gold blocks must have valid regions on annotated pages.");
  if (gold.coverage.text === "complete" && (!gold.blocks?.length || gold.blocks.some((block) => !block.text))) issues.push("Complete text coverage requires text for every gold block.");
  if (gold.coverage.readingOrder === "complete") {
    if (!gold.readingOrder || gold.readingOrder.length < 2) issues.push("Complete reading-order coverage requires at least two ordered gold blocks.");
    else if (gold.readingOrder.some((id) => !blockIds.has(id)) || new Set(gold.readingOrder).size !== gold.readingOrder.length || gold.readingOrder.length !== blockIds.size) issues.push("Reading-order IDs must be unique and cover every gold block.");
  }
  if (gold.coverage.paragraphBoundaries === "complete") {
    if (!gold.paragraphBoundaries?.length) issues.push("Complete paragraph-boundary coverage requires boundary pairs.");
    else if (gold.paragraphBoundaries.some(([left, right]) => !blockIds.has(left) || !blockIds.has(right) || left === right)) issues.push("Paragraph boundaries must reference distinct gold block IDs.");
  }
  if (gold.coverage.captionRelations === "complete") {
    if (!gold.captionRelations?.length) issues.push("Complete caption-relation coverage requires caption pairs.");
    else if (gold.captionRelations.some(([caption, target]) => !blockIds.has(caption) || !blockIds.has(target) || caption === target) || new Set(gold.captionRelations.map(([caption, target]) => `${caption}\u0000${target}`)).size !== gold.captionRelations.length) issues.push("Caption relations must be unique pairs of distinct gold block IDs.");
  }
  if (gold.coverage.tables === "complete" && (!gold.tables?.length || duplicateIds(gold.tables) || gold.tables.some((table) => !blockIds.has(table.id) || !gold.annotatedPages.includes(table.region.page) || !validRegion(table.region) || !isTreeNode(table.tree)))) issues.push("Complete table coverage requires unique valid table trees on annotated blocks.");
  if (gold.coverage.formulas === "complete" && (!gold.formulas?.length || duplicateIds(gold.formulas) || gold.formulas.some((formula) => !blockIds.has(formula.id) || !gold.annotatedPages.includes(formula.region.page) || !validRegion(formula.region) || (!formula.text?.trim() && !formula.latex?.trim())))) issues.push("Complete formula coverage requires unique human-authored formula text or LaTeX on annotated blocks.");
  return issues;
}

/** Reject malformed external artifacts before a scorer can silently drop data. */
export function validateBenchmarkPrediction(prediction: ExtractionBenchmarkPrediction): string[] {
  const issues: string[] = [];
  if (!prediction.id || !prediction.source.fileHash || !prediction.parser.id || !prediction.parser.version) issues.push("id, source.fileHash, parser.id, and parser.version are required.");
  const blockIds = new Set(prediction.blocks.map((block) => block.id));
  if (blockIds.size !== prediction.blocks.length) issues.push("Prediction block IDs must be unique.");
  if (prediction.blocks.some((block) => !validRegion(block.region))) issues.push("Prediction blocks must have valid regions.");
  // A partial order is a legitimate parser artifact, but evaluate.ts must
  // report that metric as N/A until it covers every scoped block. Reject only
  // malformed references or duplicate entries here.
  if (prediction.readingOrder && (new Set(prediction.readingOrder).size !== prediction.readingOrder.length || prediction.readingOrder.some((id) => !blockIds.has(id)))) issues.push("Prediction reading order must reference unique known block IDs.");
  if (prediction.paragraphBoundaries?.some(([left, right]) => !blockIds.has(left) || !blockIds.has(right) || left === right)) issues.push("Prediction paragraph boundaries must reference distinct block IDs.");
  if (prediction.captionRelations?.some(([caption, target]) => !blockIds.has(caption) || !blockIds.has(target) || caption === target) || (prediction.captionRelations && new Set(prediction.captionRelations.map(([caption, target]) => `${caption}\u0000${target}`)).size !== prediction.captionRelations.length)) issues.push("Prediction caption relations must reference unique distinct block IDs.");
  if (prediction.tables && (duplicateIds(prediction.tables) || prediction.tables.some((table) => !validRegion(table.region) || !isTreeNode(table.tree)))) issues.push("Prediction tables must have unique IDs, valid regions, and valid trees.");
  if (prediction.formulas && (duplicateIds(prediction.formulas) || prediction.formulas.some((formula) => !validRegion(formula.region) || (!formula.text?.trim() && !formula.latex?.trim()) || (formula.cdm !== undefined && (!formula.latex?.trim() || !Number.isFinite(formula.cdm)))))) issues.push("Prediction formulas must have unique IDs, valid regions, formula text or LaTeX, and finite CDM values only with LaTeX.");
  return issues;
}
