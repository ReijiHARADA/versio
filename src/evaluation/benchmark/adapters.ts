import type { ExtractionSnapshot } from "../schema";
import type { ExtractionBenchmarkPrediction, BenchmarkRegion, BenchmarkRole } from "./schema";
import type { TreeNode } from "./standardMetrics";

const supportedRoles = new Set<BenchmarkRole>(["title", "author", "affiliation", "abstract", "heading", "paragraph", "figure", "table", "caption", "equation", "footnote", "reference", "other"]);
const roleFor = (role: string): BenchmarkRole => supportedRoles.has(role as BenchmarkRole) ? role as BenchmarkRole : "other";

function tableTree(rows: unknown): TreeNode | null {
  if (!Array.isArray(rows)) return null;
  const parsed = rows.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const cells = row.flatMap((cell) => {
      if (!cell || typeof cell !== "object" || typeof (cell as { text?: unknown }).text !== "string") return [];
      const text = (cell as { text: string }).text.trim();
      return text ? [{ tag: "td", text }] : [];
    });
    return cells.length ? [{ tag: "tr", children: cells }] : [];
  });
  return parsed.length ? { tag: "table", children: parsed } : null;
}

/** Converts an immutable Studio snapshot into the common benchmark format. */
export function predictionFromSnapshot(snapshot: ExtractionSnapshot): ExtractionBenchmarkPrediction {
  const blockIdsByNodeAndPage = new Map<string, string>();
  const pagesByNode = new Map<string, number[]>();
  const blocks = snapshot.canonical.nodes.flatMap((node) => {
    const byPage = new Map<number, typeof node.boundingBoxes>();
    for (const box of node.boundingBoxes) byPage.set(box.page, [...(byPage.get(box.page) ?? []), box]);
    return [...byPage.entries()].map(([page, boxes]) => {
      const left = Math.min(...boxes.map((box) => box.x)); const top = Math.min(...boxes.map((box) => box.y));
      const right = Math.max(...boxes.map((box) => box.x + box.width)); const bottom = Math.max(...boxes.map((box) => box.y + box.height));
      const region: BenchmarkRegion = { page, x: left, y: top, width: right - left, height: bottom - top };
      const id = `${node.id}@${page}`; blockIdsByNodeAndPage.set(`${node.id}\u0000${page}`, id); pagesByNode.set(node.id, [...(pagesByNode.get(node.id) ?? []), page]);
      return { id, role: roleFor(node.role), region, text: node.text ?? undefined };
    });
  });
  const captionRelations = snapshot.canonical.relations.filter((relation) => relation.kind === "CAPTION_OF").flatMap((relation) => {
    const captionPages = pagesByNode.get(relation.from) ?? [];
    const targetPages = new Set(pagesByNode.get(relation.to) ?? []);
    return captionPages.filter((page) => targetPages.has(page)).flatMap((page) => {
      const caption = blockIdsByNodeAndPage.get(`${relation.from}\u0000${page}`); const target = blockIdsByNodeAndPage.get(`${relation.to}\u0000${page}`);
      return caption && target ? [[caption, target] as [string, string]] : [];
    });
  });
  // Paper Reader exposes a linearized source representation, not LaTeX. Keep
  // it in a separately named field so Formula NED can compare like-for-like
  // human text while CDM never receives a falsely labelled TeX string.
  const formulas = blocks.flatMap((block) =>
    block.role === "equation" && block.text?.trim()
      ? [{ id: block.id, region: block.region, text: block.text }]
      : [],
  );
  // The Reader projection preserves native table rows for rendering. Convert
  // that parser output to the same neutral tree shape used by TEDS; do not
  // fabricate a tree for image-only/caption-only tables without rows.
  const tables = snapshot.projection.blocks.flatMap((projected) => {
    if (projected.type !== "table") return [];
    const canonicalNodeId = projected.metadata.canonicalNodeId;
    if (typeof canonicalNodeId !== "string") return [];
    const tree = tableTree(projected.metadata.tableRows);
    if (!tree) return [];
    const page = projected.pageStart;
    const block = blocks.find((candidate) => candidate.id === `${canonicalNodeId}@${page}` && candidate.role === "table");
    return block ? [{ id: block.id, region: block.region, tree }] : [];
  });
  // A Canonical paragraph node is one parser-selected paragraph. Export the
  // adjacent paragraph-node pairs on each page so a reviewed gold boundary
  // can measure the parser's actual split decisions. This is deliberately
  // derived from Canonical structure, not from Reader cards (which can merge
  // continuations for display), and it never crosses page boundaries.
  const paragraphBoundaries = [...new Set(blocks.map((block) => block.region.page))].flatMap((page) => {
    const paragraphs = blocks.filter((block) => block.region.page === page && block.role === "paragraph");
    return paragraphs.slice(1).map((block, index) => [paragraphs[index]!.id, block.id] as [string, string]);
  });
  return {
    schemaVersion: 1, kind: "paper-reader-extraction-benchmark-prediction", id: snapshot.source.paperId,
    parser: snapshot.parser, source: { fileHash: snapshot.source.fileHash }, blocks,
    // Canonical node order is the parser's fallback reading order. A gold
    // evaluation aligns these IDs by geometry; it never treats their names as gold.
    readingOrder: blocks.map((block) => block.id),
    ...(paragraphBoundaries.length ? { paragraphBoundaries } : {}),
    ...(tables.length ? { tables } : {}),
    ...(formulas.length ? { formulas } : {}),
    ...(captionRelations.length ? { captionRelations } : {}),
  };
}
