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
    const signature = buildCaptionAnchoredTableSignature(page.textItems, page.graphicsPrimitives ?? []);
    if (!signature || signature.horizontalRules + signature.verticalRules < 4) continue;
    const members = candidates.filter((candidate) => {
      if (candidate.pageStart !== page.pageNumber || (candidate.roleScores.table ?? 0) < 0.94) return false;
      const box = candidate.boundingBoxes[0];
      return Boolean(box && intersects(box, signature.bbox));
    });
    if (members.length < 2) continue;
    const prose = members.filter((candidate) => /[.!?]\s*$/.test(candidate.text.trim())).length;
    if (prose > Math.floor(members.length / 3)) continue;
    const confidence = Math.min(0.995, 0.96 + Math.min(0.03, (signature.horizontalRules + signature.verticalRules) * 0.002));
    if (confidence < 0.98) continue;
    regions.push({
      id: `table-region-p${page.pageNumber}`,
      kind: "table",
      pageStart: page.pageNumber,
      pageEnd: page.pageNumber,
      boundingBoxes: [{ page: page.pageNumber, ...signature.bbox }],
      memberCandidateIds: members.map((candidate) => candidate.id),
      columnX: signature.columnX,
      graphicsEvidence: [],
      repeatedHeaderEvidence: [],
      confidence,
      provenance: [{ source: "layout-model", label: "caption-anchored-grid-region", confidence, page: page.pageNumber, bbox: { page: page.pageNumber, ...signature.bbox }, reason: "multiple table-scored candidates intersect a caption-anchored ruled grid" }],
    });
  }
  return regions;
}
