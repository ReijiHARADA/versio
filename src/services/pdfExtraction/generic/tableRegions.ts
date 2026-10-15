import type { ExtractedPage } from "../../pdfService";
import { buildCaptionAnchoredTableSignature } from "../../pdfService";
import type { RoleCandidate } from "./candidates";
import type { TableRegionEvidence } from "../types";

const intersects = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

type Rect = { x: number; y: number; width: number; height: number };

/** Locate a ruled grid near a caption. PDF drawing operators frequently emit
 * table rules as very thin rectangles rather than `line` primitives, so use
 * geometry instead of the primitive kind. Full-page/image rectangles are
 * excluded by the aspect/size constraints. */
function captionAnchoredGraphicsGrid(
  page: ExtractedPage,
  captionBox: Rect,
): Rect | undefined {
  const rules = (page.graphicsPrimitives ?? []).filter((item) => {
    const horizontal = item.width >= 24 && item.height <= 2.5 && item.width / Math.max(item.height, 0.1) >= 8;
    const vertical = item.height >= 8 && item.width <= 2.5 && item.height / Math.max(item.width, 0.1) >= 6;
    return horizontal || vertical;
  });
  if (rules.length < 3) return undefined;
  const touches = (a: Rect, b: Rect) =>
    a.x <= b.x + b.width + 3 && b.x <= a.x + a.width + 3 &&
    a.y <= b.y + b.height + 3 && b.y <= a.y + a.height + 3;
  const remaining = new Set(rules.map((_, index) => index));
  const components: typeof rules[] = [];
  while (remaining.size > 0) {
    const seed = remaining.values().next().value as number;
    remaining.delete(seed);
    const indexes = [seed];
    for (let cursor = 0; cursor < indexes.length; cursor += 1) {
      const current = rules[indexes[cursor]];
      for (const index of [...remaining]) {
        if (!touches(current, rules[index])) continue;
        remaining.delete(index);
        indexes.push(index);
      }
    }
    components.push(indexes.map((index) => rules[index]));
  }
  const candidates = components.flatMap((component) => {
    const horizontal = component.filter((item) => item.width >= 24 && item.height <= 2.5).length;
    const vertical = component.filter((item) => item.height >= 8 && item.width <= 2.5).length;
    const x = Math.min(...component.map((item) => item.x));
    const y = Math.min(...component.map((item) => item.y));
    const right = Math.max(...component.map((item) => item.x + item.width));
    const bottom = Math.max(...component.map((item) => item.y + item.height));
    const box = { x, y, width: right - x, height: bottom - y };
    if (horizontal < 2 || vertical < 1 || box.width < 60 || box.height < 18) return [];
    const captionBottom = captionBox.y + captionBox.height;
    const gap = box.y > captionBottom
      ? box.y - captionBottom
      : captionBox.y > bottom
        ? captionBox.y - bottom
        : 0;
    const overlap = Math.max(0, Math.min(right, captionBox.x + captionBox.width) - Math.max(x, captionBox.x));
    const centerDistance = Math.abs((x + right) / 2 - (captionBox.x * 2 + captionBox.width) / 2);
    if (gap > 180 || (overlap < Math.min(box.width, captionBox.width) * 0.12 && centerDistance > 100)) return [];
    return [{ box, gap, strength: horizontal * 2 + vertical }];
  });
  return candidates.sort((a, b) => a.gap - b.gap || b.strength - a.strength)[0]?.box;
}

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
    const captionBox = caption.boundingBoxes[0];
    const graphicsGrid = captionBox ? captionAnchoredGraphicsGrid(page, captionBox) : undefined;
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
    // Some native streams expose a small table as short, aligned rows without
    // assigning table evidence to each cell. Recover only when the caption is
    // followed by multiple compact rows that contain numeric data or very
    // short labels and repeat an x-band. A nearby prose paragraph therefore
    // cannot become a region merely because it is close to a caption.
    const alignedCompactRows = candidates.filter((candidate) => {
        if (candidate === caption || candidate.pageStart !== page.pageNumber) return false;
        const box = candidate.boundingBoxes[0];
        const text = candidate.text.trim();
        if (!box || box.y < captionY - 18 || box.y > captionY + 150) return false;
        if (candidate.role === "header" || candidate.role === "footer" || candidate.role === "copyright" || candidate.role === "footnote") return false;
        if (/[.!?]\s*$/.test(text) || text.length > 180) return false;
        const words = text.split(/\s+/).filter(Boolean);
        const digits = (text.match(/\d/g) ?? []).length;
        const numericRow = digits >= 2 || digits / Math.max(text.length, 1) >= 0.16;
        const compactLabel = words.length <= 8 && text.length <= 90;
        return numericRow || compactLabel;
      });
    const compactRowXs = new Map<number, number>();
    const compactRowYs = new Map<number, number>();
    for (const candidate of alignedCompactRows) {
      const x = Math.round(candidate.boundingBoxes[0].x / 8) * 8;
      compactRowXs.set(x, (compactRowXs.get(x) ?? 0) + 1);
      const y = Math.round(candidate.boundingBoxes[0].y / 4) * 4;
      compactRowYs.set(y, (compactRowYs.get(y) ?? 0) + 1);
    }
    const repeatedCompactX = [...compactRowXs.values()].some((count) => count >= 2);
    const repeatedCompactY = [...compactRowYs.values()].filter((count) => count >= 2).length >= 1;
    const alignedFallback = alignedCompactRows.length >= 2 && (repeatedCompactX || repeatedCompactY) ? alignedCompactRows : [];
    // Borderless tables can expose only a header and one compact data row as
    // table-scored native candidates (the remaining cells may be merged into
    // a single line).  Two aligned rows plus an explicit caption are enough
    // to preserve the region without promoting surrounding prose.
    if (!signature && !graphicsGrid && captionFallback.length < 2 && alignedFallback.length < 2) continue;
    const effectiveSignature = graphicsGrid
      ? {
          bbox: graphicsGrid,
          horizontalRules: 2,
          verticalRules: 1,
          columnX: [] as number[],
        }
      : signature ?? {
      bbox: {
        page: page.pageNumber,
        x: Math.min(...[...captionFallback, ...alignedFallback].map((candidate) => candidate.boundingBoxes[0].x)),
        y: Math.min(...[...captionFallback, ...alignedFallback].map((candidate) => candidate.boundingBoxes[0].y)),
        width: Math.max(...[...captionFallback, ...alignedFallback].map((candidate) => candidate.boundingBoxes[0].x + candidate.boundingBoxes[0].width)) - Math.min(...[...captionFallback, ...alignedFallback].map((candidate) => candidate.boundingBoxes[0].x)),
        height: Math.max(...[...captionFallback, ...alignedFallback].map((candidate) => candidate.boundingBoxes[0].y + candidate.boundingBoxes[0].height)) - Math.min(...[...captionFallback, ...alignedFallback].map((candidate) => candidate.boundingBoxes[0].y)),
      },
      horizontalRules: 0,
      verticalRules: 0,
      columnX: [...new Set([...captionFallback, ...alignedFallback].map((candidate) => Math.round(candidate.boundingBoxes[0].x)))].sort((a, b) => a - b),
    };
    const group = candidates.filter((candidate) => {
      if (candidate === caption || candidate.pageStart !== page.pageNumber) return false;
      if (!graphicsGrid && (candidate.roleScores.table ?? 0) < 0.94) return false;
      const box = candidate.boundingBoxes[0];
      if (!box || !intersects(box, effectiveSignature.bbox)) return false;
      if (!graphicsGrid) return true;
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      return centerX >= graphicsGrid.x - 2 && centerX <= graphicsGrid.x + graphicsGrid.width + 2 &&
        centerY >= graphicsGrid.y - 2 && centerY <= graphicsGrid.y + graphicsGrid.height + 2;
    });
    // Borderless tables (common in ACM/CHI papers) have no vector rules and
    // therefore cannot satisfy the ruled-grid threshold. A caption plus a
    // compact set of aligned, non-sentence rows is still strong evidence: use
    // the candidate geometry, but never promote prose-shaped rows.
    const borderlessGroup = effectiveSignature.horizontalRules + effectiveSignature.verticalRules < 4
      ? candidates.filter((candidate) => {
        // Require an explicit high table score. The previous
        // `tableLikeWithoutRole` fallback pulled ordinary prose words near a
        // caption (e.g. "were", "perceived") into the region and later
        // promoted them to empty Table shells in the Reader.
        const tableScore = candidate.roleScores.table ?? 0;
        if (candidate.pageStart !== page.pageNumber || tableScore < 0.94) return false;
        const box = candidate.boundingBoxes[0];
        const text = candidate.text.trim();
        if (!box || /[.!?]\s*$/.test(text)) return false;
        const words = text.split(/\s+/).filter(Boolean);
        const digits = (text.match(/\d/g) ?? []).length;
        const letters = (text.match(/[A-Za-z]/g) ?? []).length;
        // Cell-like rows need digits or several short tokens; letter-only
        // fragments next to charts are axis/prose labels, not table members.
        if (digits === 0 && (words.length <= 3 || letters / Math.max(text.length, 1) > 0.7)) return false;
        const yDistance = Math.abs((box.y + box.height / 2) - captionY);
        const xOverlap = box.x < caption.boundingBoxes[0].x + caption.boundingBoxes[0].width &&
          caption.boundingBoxes[0].x < box.x + box.width;
        return xOverlap && yDistance <= 120;
      })
      : [];
    const selectedGroup = graphicsGrid ? group : borderlessGroup.length >= 2 ? borderlessGroup :
      (alignedFallback.length >= 2 && group.length < 2) ? alignedFallback : group;
    const usesAlignedFallback = selectedGroup === alignedFallback && alignedFallback.length >= 2;
    if (selectedGroup.length < (graphicsGrid ? 1 : 2)) continue;
    const prose = selectedGroup.filter((candidate) => /[.!?]\s*$/.test(candidate.text.trim())).length;
    if (prose > Math.floor(selectedGroup.length / 3)) continue;
    const confidence = graphicsGrid
      ? 0.995
      : usesAlignedFallback
      ? 0.982
      : !signature
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
      provenance: [{
        source: "layout-model",
        label: graphicsGrid ? "caption-anchored-graphics-grid" : signature ? "caption-anchored-grid-region" : "caption-anchored-text-region",
        confidence,
        page: page.pageNumber,
        bbox: { page: page.pageNumber, ...effectiveSignature.bbox },
        reason: graphicsGrid
          ? "text candidates are physically contained by a connected ruled grid near the table caption"
          : signature
            ? "multiple table-scored candidates intersect a caption-anchored ruled grid"
            : "multiple table-scored candidates form a compact caption-anchored text region without reliable vector rules",
      }],
    });
    }
  }
  return regions;
}
