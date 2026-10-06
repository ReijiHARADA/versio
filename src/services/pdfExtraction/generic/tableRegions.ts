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
    // Tables in academic PDFs may place the caption below the last row (the
    // common ACM layout) or above it. Keep a bounded window on both sides so
    // the signature helper can choose the stronger anchored grid without
    // pulling in the whole page.
    const tableItems = page.textItems.filter((item) => item.y >= captionY - 420 && item.y <= captionY + 420);
    const tableGraphics = (page.graphicsPrimitives ?? []).filter((item) => item.y + item.height >= captionY - 420 && item.y <= captionY + 420);
    const signature = buildCaptionAnchoredTableSignature(tableItems, tableGraphics);
    // A few PDFs expose the table text but omit usable vector rule geometry.
    // The caption is still a strong structural anchor: recover a region from
    // several nearby table-scored rows, while requiring compact geometry and
    // rejecting sentence-shaped candidates. This is deliberately conservative
    // so a caption alone never turns surrounding prose into a table.
    const captionFallback = !signature
      ? candidates.filter((candidate) => {
        if (candidate.pageStart !== page.pageNumber || (candidate.roleScores.table ?? 0) < 0.94) return false;
        const box = candidate.boundingBoxes[0];
        if (!box || /[.!?]\s*$/.test(candidate.text.trim())) return false;
        return box.y >= captionY - 420 && box.y <= captionY + 80;
      })
      : [];
    if (!signature && captionFallback.length < 3) continue;
    const effectiveSignature = signature ?? {
      bbox: {
        page: page.pageNumber,
        x: Math.min(...captionFallback.map((candidate) => candidate.boundingBoxes[0].x)),
        y: Math.min(...captionFallback.map((candidate) => candidate.boundingBoxes[0].y)),
        width: Math.max(...captionFallback.map((candidate) => candidate.boundingBoxes[0].x + candidate.boundingBoxes[0].width)) - Math.min(...captionFallback.map((candidate) => candidate.boundingBoxes[0].x)),
        height: Math.max(...captionFallback.map((candidate) => candidate.boundingBoxes[0].y + candidate.boundingBoxes[0].height)) - Math.min(...captionFallback.map((candidate) => candidate.boundingBoxes[0].y)),
      },
      horizontalRules: 0,
      verticalRules: 0,
      columnX: [...new Set(captionFallback.map((candidate) => Math.round(candidate.boundingBoxes[0].x)))].sort((a, b) => a - b),
    };
    const group = candidates.filter((candidate) => {
      if (candidate.pageStart !== page.pageNumber || (candidate.roleScores.table ?? 0) < 0.94) return false;
      const box = candidate.boundingBoxes[0];
      return Boolean(box && intersects(box, effectiveSignature.bbox));
    });
    // Borderless tables (common in ACM/CHI papers) have no vector rules and
    // therefore cannot satisfy the ruled-grid threshold. A caption plus a
    // compact set of aligned, non-sentence rows is still strong evidence: use
    // the candidate geometry, but never promote prose-shaped rows.
    const borderlessGroup = signature.horizontalRules + signature.verticalRules < 4
      ? candidates.filter((candidate) => {
        const tableScore = candidate.roleScores.table ?? 0;
        const tableLikeWithoutRole = candidate.roleScores.table === undefined && candidate.text.trim().length <= 140;
        if (candidate.pageStart !== page.pageNumber || (tableScore < 0.8 && !tableLikeWithoutRole)) return false;
        const box = candidate.boundingBoxes[0];
        if (!box || /[.!?]\s*$/.test(candidate.text.trim())) return false;
        const yDistance = Math.abs((box.y + box.height / 2) - captionY);
        const xOverlap = box.x < caption.boundingBoxes[0].x + caption.boundingBoxes[0].width &&
          caption.boundingBoxes[0].x < box.x + box.width;
        return xOverlap && yDistance <= 120;
      })
      : [];
    const selectedGroup = borderlessGroup.length >= 2 ? borderlessGroup : group;
    if (selectedGroup.length < 2) continue;
    const prose = selectedGroup.filter((candidate) => /[.!?]\s*$/.test(candidate.text.trim())).length;
    if (prose > Math.floor(selectedGroup.length / 3)) continue;
    const confidence = !signature
      ? 0.982
      : borderlessGroup.length >= 2
      ? 0.985
      : Math.min(0.995, 0.96 + Math.min(0.03, (effectiveSignature.horizontalRules + effectiveSignature.verticalRules) * 0.002));
    if (confidence < 0.98) continue;
    regions.push({
      id: `table-region-p${page.pageNumber}-${groupIndex + 1}`,
      kind: "table",
      pageStart: page.pageNumber,
      pageEnd: page.pageNumber,
      boundingBoxes: [{ page: page.pageNumber, x: Math.min(...selectedGroup.map(c=>c.boundingBoxes[0].x)), y: Math.min(...selectedGroup.map(c=>c.boundingBoxes[0].y)), width: Math.max(...selectedGroup.map(c=>c.boundingBoxes[0].x+c.boundingBoxes[0].width))-Math.min(...selectedGroup.map(c=>c.boundingBoxes[0].x)), height: Math.max(...selectedGroup.map(c=>c.boundingBoxes[0].y+c.boundingBoxes[0].height))-Math.min(...selectedGroup.map(c=>c.boundingBoxes[0].y)) }],
      memberCandidateIds: selectedGroup.map((candidate) => candidate.id),
      columnX: effectiveSignature.columnX,
      graphicsEvidence: [],
      repeatedHeaderEvidence: [],
      confidence,
      provenance: [{ source: "layout-model", label: signature ? "caption-anchored-grid-region" : "caption-anchored-text-region", confidence, page: page.pageNumber, bbox: { page: page.pageNumber, ...effectiveSignature.bbox }, reason: signature ? "multiple table-scored candidates intersect a caption-anchored ruled grid" : "multiple table-scored candidates form a compact caption-anchored text region without reliable vector rules" }],
    });
    }
  }
  return regions;
}
