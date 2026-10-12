import type { NativeDocument } from "../../services/pdfExtraction/native/types";
import type { LayoutBlock } from "../../services/pdfLayout";
import type { PaperBlock } from "../../types/paper";
import { STRUCTURE_SCHEMA_VERSION } from "../schemaVersion";
import type { LayoutFile } from "../types/layout";
import type { StructureLine } from "../types/structure";

export function layoutFileFromNative(native: NativeDocument, blocks: PaperBlock[]): LayoutFile {
  const pages = native.pages.map((page) => ({
    page: page.pageNumber,
    width: page.width,
    height: page.height,
    spans: page.textItems.map((item, lineIndex) => ({
      text: item.text,
      bbox: item.bbox,
      font: item.fontName,
      fontSize: item.fontSize,
      style: item.source,
      lineIndex,
      blockId: nearestBlockId(blocks, item.bbox.page, item.bbox.x, item.bbox.y),
    })),
  }));
  return { schemaVersion: STRUCTURE_SCHEMA_VERSION, pages };
}

export function linesFromLayoutBlocks(layoutBlocks: LayoutBlock[]): Map<string, StructureLine[]> {
  const map = new Map<string, StructureLine[]>();
  for (const block of layoutBlocks) {
    const key = `${block.pageStart}|${block.text.slice(0, 80)}`;
    map.set(
      key,
      block.lines.map((line) => ({
        text: line.text,
        bbox: line.bbox,
        baseline: line.y + line.height,
        fontSize: line.fontSize,
      }))
    );
  }
  return map;
}

export function attachLinesToBlocks(
  blocks: PaperBlock[],
  layoutBlocks: LayoutBlock[]
): PaperBlock[] {
  const byText = new Map<string, StructureLine[]>();
  for (const layout of layoutBlocks) {
    byText.set(
      `${layout.pageStart}|${layout.text}`,
      layout.lines.map((line) => ({
        text: line.text,
        bbox: line.bbox,
        baseline: line.y + line.height,
        fontSize: line.fontSize,
      }))
    );
  }
  return blocks.map((block) => {
    const layout = layoutBlocks.find((candidate) =>
      candidate.pageStart === block.pageStart && candidate.text === (block.original ?? "")
    );
    const lines = byText.get(`${block.pageStart}|${block.original ?? ""}`);
    if (!lines) return block;
    // Table rasterization is deliberately conservative. When it cannot make
    // a crop, retain the native same-baseline cells so the Reader can render
    // rows instead of collapsing `Finger Thumb Finger1 ...` into prose.
    const tableRows = block.type === "table" && layout
      ? layout.lines
        .map((line) => line.items
          .map((item) => ({ text: item.text.trim(), x: item.x, width: item.width }))
          .filter((cell) => cell.text.length > 0)
        )
        .filter((row) => row.length > 0)
      : undefined;
    const hasCellStructure = tableRows?.some((row) => row.length >= 2) ?? false;
    return {
      ...block,
      metadata: {
        ...block.metadata,
        lines,
        ...(hasCellStructure ? { tableRows } : {}),
      },
    };
  });
}

function nearestBlockId(
  blocks: PaperBlock[],
  page: number,
  x: number,
  y: number
): string | undefined {
  let best: { id: string; dist: number } | undefined;
  for (const block of blocks) {
    for (const box of block.boundingBoxes) {
      if (box.page !== page) continue;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const dist = (cx - x) ** 2 + (cy - y) ** 2;
      if (!best || dist < best.dist) best = { id: block.id, dist };
    }
  }
  return best?.id;
}
