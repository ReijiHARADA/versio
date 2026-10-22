import type { ExtractionSnapshot } from "../schema";
import type { ExtractionBenchmarkPrediction, BenchmarkRegion, BenchmarkRole } from "./schema";

const supportedRoles = new Set<BenchmarkRole>(["title", "author", "affiliation", "abstract", "heading", "paragraph", "figure", "table", "caption", "equation", "footnote", "reference", "other"]);
const roleFor = (role: string): BenchmarkRole => supportedRoles.has(role as BenchmarkRole) ? role as BenchmarkRole : "other";

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
      return { id, role: roleFor(node.role), region, text: node.text };
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
  return {
    schemaVersion: 1, kind: "paper-reader-extraction-benchmark-prediction", id: snapshot.source.paperId,
    parser: snapshot.parser, source: { fileHash: snapshot.source.fileHash }, blocks,
    // Canonical node order is the parser's fallback reading order. A gold
    // evaluation aligns these IDs by geometry; it never treats their names as gold.
    readingOrder: blocks.map((block) => block.id),
    ...(captionRelations.length ? { captionRelations } : {}),
  };
}
