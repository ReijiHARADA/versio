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
  const withLines = blocks.map((block) => {
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
  return foldCaptionOwnedTableFallbacks(withLines, layoutBlocks);
}

type TableCell = { text: string; x: number; width: number };

function tableRowsFrom(block: PaperBlock): TableCell[][] | undefined {
  const rows = (block.metadata as { tableRows?: unknown }).tableRows;
  if (!Array.isArray(rows)) return undefined;
  const valid = rows.filter((row): row is TableCell[] =>
    Array.isArray(row) && row.every((cell) =>
      Boolean(cell) && typeof cell === "object" && typeof (cell as TableCell).text === "string"
    )
  );
  return valid.some((row) => row.length >= 2) ? valid : undefined;
}

type GridLine = { blockId: string; text: string; x: number; width: number; y: number; height: number };

/** Recover a native grid that the resolver represented as individual short
 * cells. This is deliberately stricter than generic table detection: it is
 * only used next to an already-numbered table caption, requires repeated
 * x-bands across at least three visual rows, and never consumes sentence-like
 * lines. */
function inferCaptionGrid(
  caption: PaperBlock,
  blocks: PaperBlock[],
  layoutBlocks: LayoutBlock[]
): { ids: Set<string>; rows: TableCell[][] } | undefined {
  const captionBox = caption.boundingBoxes[0];
  if (!captionBox) return undefined;
  const lines: GridLine[] = [];
  for (const block of blocks) {
    if (block.id === caption.id || block.pageStart !== caption.pageStart) continue;
    const metadata = block.metadata as { captionOriginal?: unknown; column?: unknown; lines?: StructureLine[] };
    if (metadata.captionOriginal || (metadata.column && caption.metadata.column && metadata.column !== caption.metadata.column)) continue;
    for (const line of metadata.lines ?? []) {
      const text = line.text.trim();
      const words = text.split(/\s+/).filter(Boolean);
      if (!text || words.length > 7 || /[.!?;:]\s*$/.test(text)) continue;
      const overlap = Math.max(0, Math.min(line.bbox.x + line.bbox.width, captionBox.x + captionBox.width) - Math.max(line.bbox.x, captionBox.x));
      if (overlap < Math.min(line.bbox.width, captionBox.width) * 0.2) continue;
      const distance = Math.max(captionBox.y - (line.bbox.y + line.bbox.height), line.bbox.y - (captionBox.y + captionBox.height), 0);
      if (distance > 250) continue;
      lines.push({ blockId: block.id, text, x: line.bbox.x, width: line.bbox.width, y: line.bbox.y, height: line.bbox.height });
    }
  }
  // Projection may intentionally absorb individual table cells before this
  // package step. The native layout still retains those lines, so recover
  // their geometry here without resurrecting separate Reader blocks.
  for (const layout of layoutBlocks) {
    if (layout.pageStart !== caption.pageStart ||
        (layout.column && caption.metadata.column && layout.column !== caption.metadata.column)) continue;
    for (const line of layout.lines) {
      const text = line.text.trim();
      const words = text.split(/\s+/).filter(Boolean);
      if (!text || words.length > 7 || /[.!?;:]\s*$/.test(text)) continue;
      const overlap = Math.max(0, Math.min(line.bbox.x + line.bbox.width, captionBox.x + captionBox.width) - Math.max(line.bbox.x, captionBox.x));
      if (overlap < Math.min(line.bbox.width, captionBox.width) * 0.2) continue;
      const distance = Math.max(captionBox.y - (line.bbox.y + line.bbox.height), line.bbox.y - (captionBox.y + captionBox.height), 0);
      if (distance > 250) continue;
      for (const item of line.items) {
        const itemText = item.text.trim();
        if (!itemText || itemText.split(/\s+/).filter(Boolean).length > 7) continue;
        lines.push({ blockId: "", text: itemText, x: item.x, width: item.width, y: line.y, height: line.height });
      }
    }
  }
  if (lines.length < 6) return undefined;

  const visualRows: GridLine[][] = [];
  // The same native cell can be present both in a projected block and in the
  // raw layout. Prefer the projected copy because it carries the block id to
  // remove from the Reader after the grid has been attached to its caption.
  const distinctByGeometry = new Map<string, GridLine>();
  for (const line of lines) {
    const key = `${Math.round(line.x * 10)}|${Math.round(line.y * 10)}|${line.text}`;
    const existing = distinctByGeometry.get(key);
    if (!existing || (!existing.blockId && line.blockId)) distinctByGeometry.set(key, line);
  }
  const distinctLines = [...distinctByGeometry.values()];
  for (const line of distinctLines.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = visualRows.at(-1);
    if (row && Math.abs(row[0].y - line.y) <= Math.max(row[0].height, line.height) * 0.6 + 2) {
      row.push(line);
    } else {
      visualRows.push([line]);
    }
  }
  const rows = visualRows
    .map((row) => row.sort((a, b) => a.x - b.x))
    .filter((row) => row.length >= 2);
  if (rows.length < 3) return undefined;
  const xBands = new Map<number, number>();
  for (const row of rows) {
    for (const x of new Set(row.map((line) => Math.round(line.x / 12) * 12))) {
      xBands.set(x, (xBands.get(x) ?? 0) + 1);
    }
  }
  if ([...xBands.values()].filter((count) => count >= 2).length < 2) return undefined;
  return {
    ids: new Set(rows.flatMap((row) => row.map((line) => line.blockId)).filter(Boolean)),
    rows: rows.map((row) => row.map((line) => ({ text: line.text, x: line.x, width: line.width }))),
  };
}

function boxDistance(a: PaperBlock, b: PaperBlock): number | undefined {
  const aBox = a.boundingBoxes[0];
  const bBox = b.boundingBoxes[0];
  if (!aBox || !bBox || aBox.page !== bBox.page) return undefined;
  const overlap = Math.max(0, Math.min(aBox.x + aBox.width, bBox.x + bBox.width) - Math.max(aBox.x, bBox.x));
  if (overlap < Math.min(aBox.width, bBox.width) * 0.2) return undefined;
  return Math.max(aBox.y - (bBox.y + bBox.height), bBox.y - (aBox.y + aBox.height), 0);
}

/**
 * Keep a borderless native table as one readable reader surface when its
 * raster crop is unavailable. The Canonical projection deliberately keeps a
 * numbered caption and its cell region separate so an image crop can replace
 * the cells later. Once no image exists, leaving both blocks visible creates
 * an unlabeled "Finger …" card. Fold only an explicitly reconstructed native
 * grid into the nearest same-column numbered caption, preserving the caption
 * and the cell geometry for the Table component.
 */
function foldCaptionOwnedTableFallbacks(blocks: PaperBlock[], layoutBlocks: LayoutBlock[]): PaperBlock[] {
  const captions = blocks.filter((block) => {
    if (block.type !== "table") return false;
    const metadata = block.metadata as { captionOriginal?: unknown; imageUrl?: unknown };
    return typeof metadata.captionOriginal === "string" &&
      /^\s*(?:table|表)\s*\d+/i.test(metadata.captionOriginal) &&
      !metadata.imageUrl;
  });
  if (captions.length === 0) return blocks;

  const ownerByFragmentId = new Map<string, { caption: PaperBlock; rows: TableCell[][] }>();
  for (const fragment of blocks) {
    if (fragment.type !== "table") continue;
    const metadata = fragment.metadata as { captionOriginal?: unknown; figureKey?: unknown; tableSourceFallback?: unknown; column?: unknown };
    if (metadata.captionOriginal || (!metadata.tableSourceFallback && !String(metadata.figureKey ?? "").startsWith("table-region-"))) continue;
    const rows = tableRowsFrom(fragment);
    if (!rows) continue;
    const owners = captions.flatMap((caption) => {
      const captionColumn = caption.metadata.column;
      if (metadata.column && captionColumn && metadata.column !== captionColumn) return [];
      const distance = boxDistance(caption, fragment);
      return distance === undefined || distance > 250 ? [] : [{ caption, distance }];
    }).sort((a, b) => a.distance - b.distance);
    if (owners.length > 0) ownerByFragmentId.set(fragment.id, { caption: owners[0].caption, rows });
  }
  const rowsByCaption = new Map<string, TableCell[][]>();
  for (const { caption, rows } of ownerByFragmentId.values()) {
    const owned = rowsByCaption.get(caption.id) ?? [];
    owned.push(...rows);
    rowsByCaption.set(caption.id, owned);
  }
  const inferredOwnerIds = new Set<string>();
  for (const caption of captions) {
    if (rowsByCaption.has(caption.id)) continue;
    const inferred = inferCaptionGrid(caption, blocks, layoutBlocks);
    if (!inferred) continue;
    rowsByCaption.set(caption.id, inferred.rows);
    for (const id of inferred.ids) inferredOwnerIds.add(id);
  }
  if (ownerByFragmentId.size === 0 && inferredOwnerIds.size === 0) return blocks;
  return blocks.flatMap((block) => {
    if (ownerByFragmentId.has(block.id) || inferredOwnerIds.has(block.id)) return [];
    const rows = rowsByCaption.get(block.id);
    if (!rows) return [block];
    return [{
      ...block,
      metadata: {
        ...block.metadata,
        tableSourceFallback: true,
        tableRows: rows,
        captionOwnedNativeGrid: true,
      },
    }];
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
