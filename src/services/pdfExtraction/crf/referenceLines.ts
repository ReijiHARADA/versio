/** Builds visual reference lines from PDF.js native text items; no GROBID/network dependency. */
import type { ExtractedPage } from "../../pdfService";
import type { PaperBlock } from "../../../types/paper";
import type { RefLine } from "./segmentReferences";

const inside = (x: number, y: number, box: { x: number; y: number; width: number; height: number }) => x >= box.x - 2 && x <= box.x + box.width + 2 && y >= box.y - box.height - 2 && y <= box.y + box.height + 2;

type Item = ExtractedPage["textItems"][number];

/** Join a baseline group, inserting a space only where the glyph runs are visibly apart. */
function joinItems(items: Item[]): string {
  let out = "";
  let prevEnd = -Infinity;
  for (const item of items) {
    const gap = item.x - prevEnd;
    if (out && gap > Math.max(1, item.fontSize * 0.15) && !out.endsWith(" ") && !item.text.startsWith(" ")) out += " ";
    out += item.text;
    prevEnd = item.x + item.width;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Recover native visual lines of the references section. The projected
 * reference blocks only locate the section: their boxes are merged into one
 * region per page column, and lines are rebuilt from the text items inside each
 * region (so wrong block splits upstream do not leak into the CRF input, and
 * left/right-column lines at the same height are never merged).
 */
export function referenceLinesFromPages(pages: ExtractedPage[], referenceBlocks: PaperBlock[]): RefLine[] {
  const boxes = referenceBlocks.flatMap((block) => block.boundingBoxes);
  const output: Array<RefLine & { y: number }> = [];
  for (const page of [...pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    const pageBoxes = boxes.filter((box) => box.page === page.pageNumber);
    if (pageBoxes.length === 0) continue;
    // Merge boxes whose x-ranges overlap into column regions.
    const columns: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (const box of [...pageBoxes].sort((a, b) => a.x - b.x)) {
      const col = columns.find((c) => box.x < c.x + c.width && c.x < box.x + box.width);
      if (!col) {
        columns.push({ x: box.x, y: box.y, width: box.width, height: box.height });
        continue;
      }
      const left = Math.min(col.x, box.x);
      const right = Math.max(col.x + col.width, box.x + box.width);
      const top = Math.min(col.y, box.y);
      const bottom = Math.max(col.y + col.height, box.y + box.height);
      Object.assign(col, { x: left, y: top, width: right - left, height: bottom - top });
    }
    const used = new Set<Item>();
    for (const column of columns.sort((a, b) => a.x - b.x)) {
      const items = page.textItems.filter((item) => item.text.trim() && !used.has(item) && inside(item.x + Math.min(item.width, 4) / 2, item.y, column));
      for (const item of items) used.add(item);
      const groups: Item[][] = [];
      for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
        const group = groups.find((g) => Math.abs(g[0].y - item.y) <= Math.max(2, item.fontSize * 0.35));
        if (group) group.push(item);
        else groups.push([item]);
      }
      let first = true;
      const sortedGroups = groups.sort((a, b) => a[0].y - b[0].y);
      // A new block (pdfalto-like paragraph) starts where the line pitch opens up clearly.
      const pitches = sortedGroups.slice(1).map((g, i) => g[0].y - sortedGroups[i][0].y).sort((a, b) => a - b);
      const medianPitch = pitches.length ? pitches[pitches.length >> 1] : Infinity;
      for (const group of sortedGroups) {
        const ordered = group.sort((a, b) => a.x - b.x);
        const x = ordered[0].x;
        const y = ordered[0].y;
        const width = Math.max(...ordered.map((item) => item.x + item.width)) - x;
        const fontSize = ordered.reduce((sum, item) => sum + item.fontSize, 0) / ordered.length;
        const prev = output.at(-1);
        const blockStart = first || !prev || y - prev.y > medianPitch * 1.35;
        output.push({ text: joinItems(ordered), x, width, fontSize, blockStart, y });
        first = false;
      }
    }
  }
  return output.filter((line) => line.text).map(({ y: _y, ...line }) => line);
}
