/** Builds visual reference lines from PDF.js native text items; no GROBID/network dependency. */
import type { ExtractedPage } from "../../pdfService";
import type { PaperBlock } from "../../../types/paper";
import type { RefLine } from "./segmentReferences";

const inside = (x: number, y: number, box: { x: number; y: number; width: number; height: number }) => x >= box.x - 2 && x <= box.x + box.width + 2 && y >= box.y - box.height - 2 && y <= box.y + box.height + 2;

/** Recover native visual lines that intersect a projected reference block, ordered by page, column, then baseline. */
export function referenceLinesFromPages(pages: ExtractedPage[], referenceBlocks: PaperBlock[]): RefLine[] {
  const boxes = referenceBlocks.flatMap((block) => block.boundingBoxes.map((box) => ({ ...box, blockStart: true })));
  const lines: Array<RefLine & { page: number; y: number }> = [];
  for (const page of pages) {
    const candidates = page.textItems.filter((item) => item.text.trim() && boxes.some((box) => box.page === page.pageNumber && inside(item.x, item.y, box)));
    const grouped: Array<typeof candidates> = [];
    for (const item of [...candidates].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const existing = grouped.find((group) => Math.abs(group[0].y - item.y) <= Math.max(2, item.fontSize * 0.35));
      (existing ?? (grouped.push([]), grouped[grouped.length - 1])).push(item);
    }
    for (const group of grouped) {
      const ordered = group.sort((a, b) => a.x - b.x); const x = ordered[0].x;
      const y = ordered[0].y; const width = Math.max(...ordered.map((item) => item.x + item.width)) - x;
      lines.push({ text: ordered.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim(), x, width, fontSize: ordered.reduce((sum, item) => sum + item.fontSize, 0) / ordered.length, blockStart: false, page: page.pageNumber, y });
    }
  }
  const byPage = new Map<number, typeof lines>(); for (const line of lines) (byPage.get(line.page) ?? (byPage.set(line.page, []), byPage.get(line.page)!)).push(line);
  const output: RefLine[] = [];
  for (const pageLines of [...byPage.values()]) {
    const columns = [...pageLines].sort((a, b) => a.x - b.x).reduce<Array<typeof lines>>((cols, line) => { const col = cols.find((c) => Math.abs(c[0].x - line.x) < Math.max(24, line.fontSize * 3)); (col ?? (cols.push([]), cols[cols.length - 1])).push(line); return cols; }, []);
    for (const column of columns) for (const line of column.sort((a, b) => a.y - b.y)) { const prev = output.at(-1) as (RefLine & { y?: number }) | undefined; line.blockStart = !prev || (line.y - (prev.y ?? line.y)) > line.fontSize * 2.2; output.push(line); }
  }
  return output;
}
