/**
 * Parser-agnostic document extraction metrics.  All functions operate only on
 * explicitly supplied annotations; callers must keep a null score for a
 * dimension that has not been fully annotated.
 */
export type MetricScore = { value: number | null; evaluated: number; reason?: string };

export type Rect = { page: number; x: number; y: number; width: number; height: number };
export type ScoredBlock = { id: string; role: string; region: Rect; text?: string };
export type F1Score = { precision: number; recall: number; f1: number; truePositive: number; falsePositive: number; falseNegative: number; evaluated: number; matches: Array<{ predictedId: string; goldId: string; iou: number }> };
/** Ordered table tree; leaf text is optional but scored when annotated. */
export type TreeNode = { tag: string; text?: string; children?: TreeNode[] };

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    for (let index = 0; index < previous.length; index += 1) previous[index] = current[index];
  }
  return previous[right.length];
}

function sequenceLevenshtein<T>(left: T[], right: T[]): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    for (let index = 0; index < previous.length; index += 1) previous[index] = current[index];
  }
  return previous[right.length];
}

/** Error rate (lower is better). Empty reference deliberately has no score. */
export function characterErrorRate(predicted: string, reference: string): MetricScore {
  if (!reference.length) return { value: null, evaluated: 0, reason: "Empty reference text is not scorable." };
  return { value: levenshtein(predicted, reference) / reference.length, evaluated: reference.length };
}

/** NED is EditDistance / max(lengths), the convention used by OmniDocBench. */
export function normalizedEditDistance(predicted: string, reference: string): MetricScore {
  const denominator = Math.max(predicted.length, reference.length);
  if (!denominator) return { value: null, evaluated: 0, reason: "Both strings are empty; no annotated characters." };
  return { value: levenshtein(predicted, reference) / denominator, evaluated: denominator };
}

export function intersectionOverUnion(a: Rect, b: Rect): number {
  if (a.page !== b.page) return 0;
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * One-to-one maximum-cardinality matching, with higher-IoU candidates tried
 * first. Maximizing only the first local IoU can strand another prediction
 * that has no alternative gold region, artificially lowering F1.
 */
export function blockF1(predicted: ScoredBlock[], gold: ScoredBlock[], options: { iouThreshold?: number; requireSameRole?: boolean } = {}): F1Score {
  const iouThreshold = options.iouThreshold ?? 0.5;
  const requireSameRole = options.requireSameRole ?? true;
  const candidates = predicted.flatMap((item) => gold.map((reference) => ({
    predicted: item,
    gold: reference,
    iou: intersectionOverUnion(item.region, reference.region),
  }))).filter((item) => item.iou >= iouThreshold && (!requireSameRole || item.predicted.role === item.gold.role))
    .sort((a, b) => b.iou - a.iou || a.predicted.id.localeCompare(b.predicted.id) || a.gold.id.localeCompare(b.gold.id));
  const candidatesByPrediction = new Map<string, typeof candidates>();
  for (const candidate of candidates) candidatesByPrediction.set(candidate.predicted.id, [...(candidatesByPrediction.get(candidate.predicted.id) ?? []), candidate]);
  const predictedById = new Map(predicted.map((item) => [item.id, item]));
  const matchedPredictionByGold = new Map<string, string>();
  const matchPrediction = (predictionId: string, visitedGold = new Set<string>()): boolean => {
    for (const candidate of candidatesByPrediction.get(predictionId) ?? []) {
      if (visitedGold.has(candidate.gold.id)) continue;
      visitedGold.add(candidate.gold.id);
      const previousPrediction = matchedPredictionByGold.get(candidate.gold.id);
      if (!previousPrediction || matchPrediction(previousPrediction, visitedGold)) {
        matchedPredictionByGold.set(candidate.gold.id, predictionId);
        return true;
      }
    }
    return false;
  };
  for (const predictionId of predictedById.keys()) matchPrediction(predictionId);
  const matches = [...matchedPredictionByGold.entries()].map(([goldId, predictedId]) => {
    const candidate = candidatesByPrediction.get(predictedId)?.find((item) => item.gold.id === goldId);
    return { predictedId, goldId, iou: candidate?.iou ?? 0 };
  });
  const truePositive = matches.length;
  const falsePositive = predicted.length - truePositive;
  const falseNegative = gold.length - truePositive;
  const precision = predicted.length ? truePositive / predicted.length : (gold.length ? 0 : 1);
  const recall = gold.length ? truePositive / gold.length : 1;
  return { precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    truePositive, falsePositive, falseNegative, evaluated: predicted.length + gold.length, matches };
}

/** Reading-order error after block IDs have been aligned to gold IDs. IDs are atomic tokens, not characters. */
export function readingOrderEditDistance(predictedGoldIds: string[], goldIds: string[]): MetricScore {
  const denominator = Math.max(predictedGoldIds.length, goldIds.length);
  if (!denominator) return { value: null, evaluated: 0, reason: "No ordered blocks to score." };
  return { value: sequenceLevenshtein(predictedGoldIds, goldIds) / denominator, evaluated: denominator };
}

/** Exact boundary F1 for adjacent gold block ID pairs. */
export function boundaryF1(predicted: Array<[string, string]>, gold: Array<[string, string]>): F1Score {
  const key = ([left, right]: [string, string]) => `${left}\u0000${right}`;
  const predictionSet = new Set(predicted.map(key)); const goldSet = new Set(gold.map(key));
  const truePositive = [...predictionSet].filter((value) => goldSet.has(value)).length;
  const falsePositive = predictionSet.size - truePositive; const falseNegative = goldSet.size - truePositive;
  const precision = predictionSet.size ? truePositive / predictionSet.size : (goldSet.size ? 0 : 1);
  const recall = goldSet.size ? truePositive / goldSet.size : 1;
  return { precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    truePositive, falsePositive, falseNegative, evaluated: predictionSet.size + goldSet.size, matches: [] };
}

function treeSize(node: TreeNode): number { return 1 + (node.children ?? []).reduce((sum, child) => sum + treeSize(child), 0); }
function comparableText(value: string | undefined): string { return (value ?? "").replace(/\s+/g, " ").trim(); }
function treeDistance(left: TreeNode, right: TreeNode): number {
  const leftChildren = left.children ?? []; const rightChildren = right.children ?? [];
  const dp = Array.from({ length: leftChildren.length + 1 }, () => Array<number>(rightChildren.length + 1).fill(0));
  for (let row = 1; row <= leftChildren.length; row += 1) dp[row][0] = dp[row - 1][0] + treeSize(leftChildren[row - 1]);
  for (let column = 1; column <= rightChildren.length; column += 1) dp[0][column] = dp[0][column - 1] + treeSize(rightChildren[column - 1]);
  for (let row = 1; row <= leftChildren.length; row += 1) for (let column = 1; column <= rightChildren.length; column += 1) {
    dp[row][column] = Math.min(dp[row - 1][column] + treeSize(leftChildren[row - 1]), dp[row][column - 1] + treeSize(rightChildren[column - 1]), dp[row - 1][column - 1] + treeDistance(leftChildren[row - 1], rightChildren[column - 1]));
  }
  return (left.tag === right.tag && comparableText(left.text) === comparableText(right.text) ? 0 : 1) + dp[leftChildren.length][rightChildren.length];
}

/** Ordered-tree TEDS similarity (1 is identical). Table text is intentionally excluded. */
export function tableTeds(predicted: TreeNode, gold: TreeNode): MetricScore {
  const denominator = Math.max(treeSize(predicted), treeSize(gold));
  return { value: denominator ? 1 - treeDistance(predicted, gold) / denominator : null, evaluated: denominator };
}

export function isTreeNode(value: unknown): value is TreeNode {
  if (!value || typeof value !== "object") return false;
  const node = value as { tag?: unknown; text?: unknown; children?: unknown };
  return typeof node.tag === "string" && (node.text === undefined || typeof node.text === "string") &&
    (node.children === undefined || (Array.isArray(node.children) && node.children.every(isTreeNode)));
}

/**
 * CDM needs the official local TeX/rendering environment for a comparable
 * score. Emit pairs through the benchmark report; never substitute NED and
 * label it CDM.
 */
export function formulaCdmUnavailable(): MetricScore {
  return { value: null, evaluated: 0, reason: "CDM requires the official local formula-rendering evaluator; formula NED remains separately reported." };
}
