import type { ExtractedPage } from "../../pdfService";
import { buildCaptionAnchoredTableSignature } from "../../pdfService";
import type { RoleCandidate } from "./candidates";
import type { TableRegionEvidence } from "../types";

const intersects = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Build only strongly anchored table regions; ambiguous rows remain ordinary candidates. */
export function buildTableRegionEvidence(pages: ExtractedPage[], candidates: RoleCandidate[]): TableRegionEvidence[] {
  const regions: TableRegionEvidence[] = [];
  for (const page of pages) {
    const captionCandidates = candidates.filter((candidate) => candidate.pageStart === page.pageNumber && (candidate.roleScores.caption ?? 0) >= 0.8 && /^\s*table\b/i.test(candidate.text)).sort((a,b)=>a.boundingBoxes[0].y-b.boundingBoxes[0].y);
    for (const [groupIndex, caption] of captionCandidates.entries()) {
    // The legacy signature helper anchors to the first caption it sees. Limit
    // the input window per caption so multiple tables on one page each get
    // independent geometry evidence.
    const captionY = caption.boundingBoxes[0]?.y ?? 0;
    const tableItems = page.textItems.filter((item) => item.y >= captionY - 2 && item.y <= captionY + 420);
    const tableGraphics = (page.graphicsPrimitives ?? []).filter((item) => item.y + item.height >= captionY - 2 && item.y <= captionY + 420);
    const signature = buildCaptionAnchoredTableSignature(tableItems, tableGraphics);
    if (!signature || signature.horizontalRules + signature.verticalRules < 4) continue;
    const group = candidates.filter((candidate) => {
      if (candidate.pageStart !== page.pageNumber || (candidate.roleScores.table ?? 0) < 0.94) return false;
      const box = candidate.boundingBoxes[0];
      return Boolean(box && intersects(box, signature.bbox));
    });
    if (group.length < 2) continue;
    const prose = group.filter((candidate) => /[.!?]\s*$/.test(candidate.text.trim())).length;
    if (prose > Math.floor(group.length / 3)) continue;
    const confidence = Math.min(0.995, 0.96 + Math.min(0.03, (signature.horizontalRules + signature.verticalRules) * 0.002));
    if (confidence < 0.98) continue;
    regions.push({
      id: `table-region-p${page.pageNumber}-${groupIndex + 1}`,
      kind: "table",
      pageStart: page.pageNumber,
      pageEnd: page.pageNumber,
      boundingBoxes: [{ page: page.pageNumber, x: Math.min(...group.map(c=>c.boundingBoxes[0].x)), y: Math.min(...group.map(c=>c.boundingBoxes[0].y)), width: Math.max(...group.map(c=>c.boundingBoxes[0].x+c.boundingBoxes[0].width))-Math.min(...group.map(c=>c.boundingBoxes[0].x)), height: Math.max(...group.map(c=>c.boundingBoxes[0].y+c.boundingBoxes[0].height))-Math.min(...group.map(c=>c.boundingBoxes[0].y)) }],
      memberCandidateIds: group.map((candidate) => candidate.id),
      columnX: signature.columnX,
      graphicsEvidence: [],
      repeatedHeaderEvidence: [],
      confidence,
      provenance: [{ source: "layout-model", label: "caption-anchored-grid-region", confidence, page: page.pageNumber, bbox: { page: page.pageNumber, ...signature.bbox }, reason: "multiple table-scored candidates intersect a caption-anchored ruled grid" }],
    });
    }
  }
  return regions;
}
