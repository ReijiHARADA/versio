import type { CanonicalRole } from "../../services/pdfExtraction/canonical/types";
import type { EvaluationBundle, PageReview } from "../schema";
import type { BenchmarkRegion, BenchmarkRole, ExtractionBenchmarkGold } from "./schema";
import type { TreeNode } from "./standardMetrics";

const roles = new Set<BenchmarkRole>(["title", "author", "affiliation", "abstract", "heading", "paragraph", "figure", "table", "caption", "equation", "footnote", "reference", "other"]);
const benchmarkRole = (role: CanonicalRole): BenchmarkRole => roles.has(role as BenchmarkRole) ? role as BenchmarkRole : "other";
const regionFor = (page: number, boxes: Array<{ page: number; x: number; y: number; width: number; height: number }>): BenchmarkRegion | null => {
  const onPage = boxes.filter((box) => box.page === page); if (!onPage.length) return null;
  const left = Math.min(...onPage.map((box) => box.x)); const top = Math.min(...onPage.map((box) => box.y));
  const right = Math.max(...onPage.map((box) => box.x + box.width)); const bottom = Math.max(...onPage.map((box) => box.y + box.height));
  return { page, x: left, y: top, width: right - left, height: bottom - top };
};

/**
 * Converts only explicitly completed human review pages. A snapshot becomes
 * gold solely through a page's human completeness signal; uncompleted pages
 * and dimensions remain absent/N/A.
 */
export function goldFromCompletedReview(input: EvaluationBundle, metadata: Pick<ExtractionBenchmarkGold, "id" | "split" | "leakageGroup" | "attributes">): ExtractionBenchmarkGold {
  const completed = input.review.pages.filter((page) => page.status === "complete" && page.coverage.predictedComplete && page.coverage.goldComplete);
  if (!completed.length) throw new Error("No page has complete predicted and gold review coverage.");
  const nodes = new Map(input.snapshot.canonical.nodes.map((node) => [node.id, node]));
  const blocks: NonNullable<ExtractionBenchmarkGold["blocks"]> = [];
  let hasEveryHumanGoldText = true;
  for (const page of completed) {
    const labels = new Map(page.blockReviews.filter((review) => review.predictedNodeId).map((review) => [review.predictedNodeId!, review]));
    for (const node of input.snapshot.canonical.nodes.filter((node) => node.pageStart <= page.page && node.pageEnd >= page.page)) {
      const label = labels.get(node.id);
      if (label?.errorTypes.includes("extra")) continue;
      const region = label?.targetRegion ?? regionFor(page.page, node.boundingBoxes); if (!region) continue;
      // Do not turn the parser text into a reference just because the reviewer
      // marked another dimension complete. Text gold must be explicitly typed.
      const text = label?.goldText;
      blocks.push({ id: `${node.id}@${page.page}`, role: benchmarkRole(label?.correctRole ?? node.role), region, ...(text ? { text } : {}) });
      if (!text) hasEveryHumanGoldText = false;
    }
    for (const missing of page.missingRegions) {
      blocks.push({ id: `missing:${missing.id}`, role: benchmarkRole(missing.correctRole), region: missing.region, text: missing.textAnchor?.text });
      if (!missing.textAnchor?.text) hasEveryHumanGoldText = false;
    }
  }
  const allComplete = (selector: (page: PageReview) => boolean) => completed.every(selector);
  const textComplete = allComplete((page) => page.coverage.textComplete) && hasEveryHumanGoldText;
  const mappedOrder = completed.flatMap((page) => (page.goldReadingOrder ?? []).flatMap((id) => {
    const node = nodes.get(id);
    // A Canonical node can visually span pages. The benchmark artifact uses a
    // page-region block ID, so retain the review page rather than pageStart.
    return node?.boundingBoxes.some((box) => box.page === page.page) ? [`${id}@${page.page}`] : [];
  }));
  const canScoreOrder = allComplete((page) => page.coverage.readingOrderComplete) && mappedOrder.length === blocks.length && new Set(mappedOrder).size === mappedOrder.length;
  const rawBoundaries = completed.flatMap((page) => page.goldParagraphBoundaries ?? []);
  const mappedBoundaries = rawBoundaries.flatMap(([left, right]) => {
    const leftNode = nodes.get(left); const rightNode = nodes.get(right);
    return leftNode && rightNode && leftNode.pageStart === rightNode.pageStart ? [[`${left}@${leftNode.pageStart}`, `${right}@${rightNode.pageStart}`] as [string, string]] : [];
  });
  const canScoreBoundaries = allComplete((page) => page.coverage.paragraphBoundariesComplete) && mappedBoundaries.length > 0;
  const mappedCaptionRelations = completed.flatMap((page) => (page.goldCaptionRelations ?? []).flatMap(([caption, target]) => {
    const captionNode = nodes.get(caption); const targetNode = nodes.get(target);
    return captionNode?.boundingBoxes.some((box) => box.page === page.page) && targetNode?.boundingBoxes.some((box) => box.page === page.page)
      ? [[`${caption}@${page.page}`, `${target}@${page.page}`] as [string, string]] : [];
  }));
  const canScoreCaptionRelations = allComplete((page) => page.coverage.relationsComplete) && mappedCaptionRelations.length > 0;
  const reviewPagesByTarget = new Map(completed.flatMap((page) => [
    ...(page.goldFormulas ?? []).flatMap((formula) => {
      const target = formula.nodeId ? `node:${formula.nodeId}` : formula.missingRegionId ? `missing:${formula.missingRegionId}` : null;
      return target ? [[target, { page, text: formula.text, latex: formula.latex }] as const] : [];
    }),
  ]));
  const goldFormulaBlocks = blocks.filter((block) => block.role === "equation");
  const formulas = goldFormulaBlocks.flatMap((block) => {
    const nodeId = block.id.split("@")[0];
    const target = nodeId.startsWith("missing:") ? nodeId : `node:${nodeId}`;
    const review = reviewPagesByTarget.get(target);
    const text = review?.text?.trim(); const latex = review?.latex?.trim();
    return text || latex ? [{ id: block.id, region: block.region, ...(text ? { text } : {}), ...(latex ? { latex } : {}) }] : [];
  });
  const formulaComplete = goldFormulaBlocks.length > 0 && allComplete((page) => page.coverage.formulasComplete) && formulas.length === goldFormulaBlocks.length;
  const tablePagesByNode = new Map(completed.flatMap((page) => [
    ...(page.goldTables ?? []).map((table) => [table.nodeId, { page, tree: table.tree }] as const),
  ]));
  const goldTableBlocks = blocks.filter((block) => block.role === "table");
  const tables = goldTableBlocks.flatMap((block) => {
    const nodeId = block.id.split("@")[0]; const review = tablePagesByNode.get(nodeId);
    return review?.tree?.tag ? [{ id: block.id, region: block.region, tree: review.tree as TreeNode }] : [];
  });
  const tableComplete = goldTableBlocks.length > 0 && allComplete((page) => page.coverage.tablesComplete) && tables.length === goldTableBlocks.length;
  return {
    schemaVersion: 1, kind: "paper-reader-extraction-benchmark-gold", id: metadata.id,
    source: { fileHash: input.snapshot.source.fileHash, fileName: input.snapshot.source.fileName }, split: metadata.split,
    leakageGroup: metadata.leakageGroup, attributes: metadata.attributes, annotatedPages: completed.map((page) => page.page),
    coverage: {
      blocks: "complete", text: textComplete ? "complete" : "none",
      // The review UI records relation/boundary correctness, but it does not
      // yet author a complete canonical gold sequence/tree. Never infer one.
      readingOrder: canScoreOrder ? "complete" : "none",
      paragraphBoundaries: canScoreBoundaries ? "complete" : "none",
      captionRelations: canScoreCaptionRelations ? "complete" : "none",
      tables: tableComplete ? "complete" : "none", formulas: formulaComplete ? "complete" : "none",
    },
    blocks, ...(canScoreOrder ? { readingOrder: mappedOrder } : {}), ...(canScoreBoundaries ? { paragraphBoundaries: mappedBoundaries } : {}), ...(canScoreCaptionRelations ? { captionRelations: mappedCaptionRelations } : {}), ...(formulaComplete ? { formulas } : {}), ...(tableComplete ? { tables } : {}),
  };
}
