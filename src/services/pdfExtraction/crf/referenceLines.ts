/** Builds visual reference lines from PDF.js native text items; no GROBID/network dependency. */
import type { ExtractedPage } from "../../pdfService";
import type { PaperBlock } from "../../../types/paper";
import type { RefLine } from "./segmentReferences";

const inside = (x: number, y: number, box: { x: number; y: number; width: number; height: number }) => x >= box.x - 2 && x <= box.x + box.width + 2 && y >= box.y - 2 && y <= box.y + box.height + 2;

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
    for (const box of [...pageBoxes].sort((a, b) => a.x - b.x || a.y - b.y)) {
      // Same column (x overlap) and vertically contiguous: a gap of a few lines means
      // other content sits between the boxes, so it starts a new region.
      const near = (c: { y: number; height: number }) => box.y <= c.y + c.height + 24 && c.y <= box.y + box.height + 24;
      const col = columns.find((c) => box.x < c.x + c.width && c.x < box.x + box.width && near(c));
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
    // Reading order: left column first, then top to bottom within it.
    const colX = (c: { x: number }) => Math.round(c.x / 40);
    for (const column of columns.sort((a, b) => colX(a) - colX(b) || a.y - b.y)) {
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
        const height = Math.max(...ordered.map((item) => item.y + item.height)) - y;
        output.push({ text: joinItems(ordered), x, width, fontSize, blockStart, y, page: page.pageNumber, height });
        first = false;
      }
    }
  }
  return output.filter((line) => line.text);
}

const REFERENCES_TITLE = /^(?:references?|bibliography|literature cited|works cited|reference list|参考文献|引用文献|文献)$/i;

/**
 * Blocks that delimit the references section. Only sections whose title is a
 * references heading (numbering stripped) count, so a subsection such as
 * "4.2.1 Better Access to References" is never treated as the bibliography.
 * Falls back to blocks typed as references when no such section exists.
 */
export function selectReferenceBlocks(blocks: PaperBlock[], sections: Array<{ id: string; normalizedKind: string; originalTitle?: string }>): PaperBlock[] {
  const titled = (s: { originalTitle?: string }) => REFERENCES_TITLE.test((s.originalTitle ?? "").replace(/^[\s\dIVXivx.\-–:)]+/, "").trim());
  const kinds = sections.filter((s) => s.normalizedKind === "references");
  const strict = kinds.filter(titled);
  const referenceSections = new Set((strict.length > 0 ? strict : kinds).map((s) => s.id));
  const inSection = blocks.filter((b) => b.sectionId !== null && referenceSections.has(b.sectionId) && (b.type === "reference" || b.type === "paragraph"));
  return inSection.length > 0 ? inSection : blocks.filter((b) => b.type === "reference");
}
