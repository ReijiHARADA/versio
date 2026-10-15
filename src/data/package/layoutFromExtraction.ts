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
  const withLines = blocks.map((block) => {
    const blockBox = block.boundingBoxes[0];
    const candidates = layoutBlocks.filter((candidate) =>
      candidate.pageStart === block.pageStart && candidate.text === (block.original ?? "")
    );
    // Text is not a stable key: table columns frequently repeat values such
    // as `Model` and `Google`. Match duplicate text by nearest native bbox so
    // each cell retains its own x-band and can be reconstructed into rows.
    const layout = candidates.slice().sort((a, b) => {
      if (!blockBox) return 0;
      const distance = (candidate: LayoutBlock) => {
        const box = candidate.bbox;
        const dx = (box.x + box.width / 2) - (blockBox.x + blockBox.width / 2);
        const dy = (box.y + box.height / 2) - (blockBox.y + blockBox.height / 2);
        return dx * dx + dy * dy;
      };
      return distance(a) - distance(b);
    })[0];
    const recoveredLines = !layout ? recoveredTableLines(block, layoutBlocks) : undefined;
    const sourceLines = layout?.lines ?? recoveredLines;
    const lines = sourceLines?.map((line) => ({
      text: line.text,
      bbox: line.bbox,
      baseline: line.y + line.height,
      fontSize: line.fontSize,
    }));
    if (!lines) {
      const existingRows = (block.metadata as { tableRows?: unknown }).tableRows;
      const box = block.boundingBoxes[0];
      // A row already aggregated by projection may not have an exact
      // LayoutBlock text match. Keep a synthetic line so the captionless-grid
      // pass can still use its per-cell x coordinates.
      if (block.type === "table" && box && Array.isArray(existingRows) && existingRows.length === 1) {
        return {
          ...block,
          metadata: {
            ...block.metadata,
            lines: [{
              text: block.original ?? "",
              bbox: box,
              baseline: box.y + box.height,
              fontSize: box.height,
            }],
          },
        };
      }
      return block;
    }
    // Table rasterization is deliberately conservative. When it cannot make
    // a crop, retain the native same-baseline cells so the Reader can render
    // rows instead of collapsing `Finger Thumb Finger1 ...` into prose.
    const tableRows = block.type === "table" && sourceLines
      ? sourceLines
        .map((line) => line.items
          .map((item) => ({ text: item.text.trim(), x: item.x, width: item.width }))
          .filter((cell) => cell.text.length > 0)
        )
        .filter((row) => row.length > 0)
      : undefined;
    const normalizedTableRows = tableRows ? normalizeTableRows(tableRows) : undefined;
    // A table can be a single-column list or a flattened vertical stream.
    // Keeping multiple one-cell rows still gives the Reader a readable row
    // structure; dropping them turns every cell into one opaque space-joined
    // string. This is limited to blocks already classified as tables.
    const hasReadableRows = normalizedTableRows?.some((row) => row.length >= 2) === true ||
      ((normalizedTableRows?.length ?? 0) >= 2 &&
        normalizedTableRows?.some((row) => row.length > 0) === true);
    return {
      ...block,
      metadata: {
        ...block.metadata,
        lines,
        ...(hasReadableRows ? { tableRows: normalizedTableRows } : {}),
      },
    };
  });
  return demoteNarrativeTableFallbacks(foldCaptionlessNativeGrids(withLines, layoutBlocks));
}

/**
 * A table-region fallback is useful when native geometry proves a grid, but
 * the same geometry can occasionally be produced by a narrow paragraph that
 * happens to sit beside a caption or graphic.  Do not leave a complete prose
 * sentence as a skipped table: it would disappear from translation and appear
 * as an opaque source-only card.  This package-stage repair only applies to
 * explicit fallback regions without recovered cells; real grids and captioned
 * tables remain untouched.
 */
function demoteNarrativeTableFallbacks(blocks: PaperBlock[]): PaperBlock[] {
  return blocks.map((block) => {
    if (block.type !== "table") return block;
    const metadata = block.metadata as {
      captionOriginal?: unknown;
      imageUrl?: unknown;
      figureKey?: unknown;
      tableSourceFallback?: unknown;
      tableRows?: unknown;
      evidence?: Array<{ label?: string; confidence?: number }>;
    };
    if (metadata.captionOriginal || metadata.imageUrl ||
        (!metadata.tableSourceFallback && !String(metadata.figureKey ?? "").startsWith("table-region-"))) {
      return block;
    }
    const rows = metadata.tableRows;
    if (Array.isArray(rows) && rows.some((row) => Array.isArray(row) && row.length >= 2)) return block;
    const paragraphEvidence = (metadata.evidence ?? []).find((entry) => entry.label === "paragraph");
    const tableGeometryEvidence = (metadata.evidence ?? []).some((entry) =>
      entry.label === "table-row-geometry" || entry.label === "table-region-member"
    );
    const text = (block.original ?? "").replace(/\s+/g, " ").trim();
    const words = text.match(/\b[A-Za-z][A-Za-z'-]*\b/g) ?? [];
    const wordCount = words.length;
    const proseWords = words.filter((word) => word.length >= 3).length;
    const sentenceLike = /[.!?]["')\]]?$/.test(text) ||
      // Short function words are common in otherwise valid academic prose;
      // keep the threshold below a strict content-word ratio so a wrapped
      // continuation such as “Potential application” is recovered too.
      (wordCount >= 12 && proseWords / Math.max(1, wordCount) >= 0.6);
    if (!tableGeometryEvidence || !paragraphEvidence ||
        (paragraphEvidence.confidence ?? 0) < 0.8 || wordCount < 10 || !sentenceLike) {
      return block;
    }
    const nextMetadata = { ...block.metadata } as Record<string, unknown>;
    delete nextMetadata.tableSourceFallback;
    delete nextMetadata.figureKey;
    delete nextMetadata.translationInputWarning;
    nextMetadata.role = "paragraph";
    nextMetadata.packageRoleRepair = "narrative-table-fallback-demoted";
    return {
      ...block,
      type: "paragraph",
      translationStatus: block.translationStatus === "skipped" ? "pending" : block.translationStatus,
      metadata: nextMetadata,
    };
  });
}

type TableCell = { text: string; x: number; width: number };

function recoveredTableLines(block: PaperBlock, layoutBlocks: LayoutBlock[]): LayoutBlock["lines"] | undefined {
  if (block.type !== "table" || block.boundingBoxes.length === 0) return undefined;
  const metadata = block.metadata as { figureKey?: unknown; tableSourceFallback?: unknown };
  if (!String(metadata.figureKey ?? "").startsWith("table-region-") && metadata.tableSourceFallback !== true) return undefined;
  const boxes = block.boundingBoxes;
  const rawLines = layoutBlocks
    .filter((candidate) => candidate.pageStart === block.pageStart)
    .flatMap((candidate) => candidate.lines)
    .filter((line, index, all) => {
      const matchesBox = line.items.some((item) => boxes.some((box) => {
        const overlap = Math.max(0, Math.min(item.x + item.width, box.x + box.width) - Math.max(item.x, box.x)) *
          Math.max(0, Math.min(line.y + line.height, box.y + box.height) - Math.max(line.y, box.y));
        return overlap / Math.max(1, item.width * line.height) >= 0.35;
      }));
      if (!matchesBox) return false;
      return all.findIndex((other) =>
        other.text === line.text && Math.abs(other.y - line.y) <= 0.5 &&
        Math.abs(other.bbox.x - line.bbox.x) <= 0.5
      ) === index;
    })
    .sort((a, b) => a.y - b.y || a.bbox.x - b.bbox.x);
  if (rawLines.length === 0) return undefined;
  const lines: LayoutBlock["lines"] = [];
  for (const line of rawLines) {
    const previous = lines.at(-1);
    if (previous && Math.abs(previous.y - line.y) <= Math.max(previous.height, line.height) * 0.6 + 1.5) {
      previous.items.push(...line.items);
      previous.items.sort((a, b) => a.x - b.x);
      previous.text = previous.items.map((item) => item.text).join(" ");
      previous.bbox = {
        page: previous.bbox.page,
        x: Math.min(previous.bbox.x, line.bbox.x),
        y: Math.min(previous.bbox.y, line.bbox.y),
        width: Math.max(previous.bbox.x + previous.bbox.width, line.bbox.x + line.bbox.width) - Math.min(previous.bbox.x, line.bbox.x),
        height: Math.max(previous.bbox.y + previous.bbox.height, line.bbox.y + line.bbox.height) - Math.min(previous.bbox.y, line.bbox.y),
      };
    } else {
      lines.push({ ...line, items: [...line.items] });
    }
  }
  return lines;
}

/** Merge wrapped native table-cell rows and word fragments by geometry. */
function normalizeTableRows(rows: TableCell[][]): TableCell[][] {
  if (rows.length < 2) return rows;
  const allBands: number[] = [];
  for (const row of rows) for (const cell of row) {
    const index = allBands.findIndex((band) => Math.abs(band - cell.x) <= 12);
    if (index >= 0) allBands[index] = (allBands[index] + cell.x) / 2;
    else allBands.push(cell.x);
  }
  allBands.sort((a, b) => a - b);
  const rowCount = (band: number) => rows.filter((row) => row.some((cell) => Math.abs(cell.x - band) <= 12)).length;
  const stableBands = allBands.filter((band) => rowCount(band) >= Math.max(2, Math.ceil(rows.length * 0.4)));
  if (stableBands.length < 2) return rows;
  const ranges = stableBands.map((band) => ({
    band,
    right: Math.max(...rows.flatMap((row) => row
      .filter((cell) => Math.abs(cell.x - band) <= 12)
      .map((cell) => cell.x + cell.width)), band),
  }));
  const mapToStableBand = (cell: TableCell): number => {
    const candidates = ranges.filter((range) => cell.x >= range.band - 12 && cell.x <= range.right + 8);
    if (candidates.length > 0) {
      return candidates.sort((a, b) => Math.abs(a.band - cell.x) - Math.abs(b.band - cell.x))[0].band;
    }
    // Wrapped words are frequently indented within a cell. If they fall
    // between two established columns, keep them in the preceding column
    // rather than creating a spurious fourth cell.
    const interval = ranges.find((range, index) => {
      const nextBand = stableBands[index + 1];
      return cell.x >= range.band - 12 && (nextBand === undefined || cell.x < nextBand - 12);
    });
    return interval?.band ?? cell.x;
  };
  const leftBand = stableBands[0];
  const joinCellText = (left: string, right: string) =>
    `${left} ${right}`.replace(/-\s+/g, "-").replace(/\s+/g, " ").trim();
  const mergeSameBand = (row: TableCell[]): TableCell[] => {
    const merged: TableCell[] = [];
    // Keep native reading order. Wrapped words can return to the same x-band
    // after an indented line; sorting by x would turn `Delete the tapped
    // contact` into `contact Delete the tapped`.
    for (const source of row) {
      const cell = { ...source, x: mapToStableBand(source) };
      const previous = merged.at(-1);
      if (previous && Math.abs(previous.x - cell.x) <= 12) {
        previous.text = joinCellText(previous.text, cell.text);
        previous.width = Math.max(previous.x + previous.width, cell.x + cell.width) - previous.x;
      } else merged.push({ ...cell });
    }
    return merged;
  };
  const normalized: TableCell[][] = [];
  for (const rawRow of rows) {
    const row = mergeSameBand(rawRow);
    const hasLeadingCell = row.some((cell) => Math.abs(cell.x - leftBand) <= 12);
    if (!hasLeadingCell && normalized.length > 0) {
      const previous = normalized[normalized.length - 1];
      for (const cell of row) {
        const target = previous.find((candidate) => Math.abs(candidate.x - cell.x) <= 12);
        if (target) {
          target.text = joinCellText(target.text, cell.text);
          target.width = Math.max(target.x + target.width, cell.x + cell.width) - target.x;
        } else previous.push({ ...cell });
      }
      previous.sort((a, b) => a.x - b.x);
    } else normalized.push(row);
  }
  return normalized;
}

/**
 * Reassemble borderless tables whose native stream contains one block per
 * cell.  This is intentionally a package/projection repair rather than a
 * text heuristic: it requires repeated y rows, at least three stable x bands,
 * and single-line cells. Ordinary two-column prose and multi-line paragraphs
 * therefore remain untouched. Captioned tables continue through the existing
 * crop/fallback path below.
 */
function foldCaptionlessNativeGrids(blocks: PaperBlock[], layoutBlocks: LayoutBlock[]): PaperBlock[] {
  type Record = { block: PaperBlock; line: StructureLine; y: number };
  const recordsByPage = new Map<number, Record[]>();
  for (const block of blocks) {
    const existingRows = (block.metadata as { tableRows?: unknown }).tableRows;
    const existingStructuredGrid = Array.isArray(existingRows) && existingRows.length >= 3 &&
      existingRows.some((row) => Array.isArray(row) && row.length >= 2);
    if (block.type === "figure" || block.type === "reference" ||
        (block.type === "table" && (Boolean(block.metadata.captionOriginal) || existingStructuredGrid)) ||
        block.metadata.captionOriginal || block.metadata.imageUrl) continue;
    const lines = block.metadata.lines;
    if (!Array.isArray(lines) || lines.length !== 1) continue;
    const line = lines[0] as StructureLine;
    const text = (block.original ?? "").trim();
    if (!text || /[\n]/.test(text) || text.length > 280) continue;
    const page = block.pageStart;
    // Projection may already have combined a same-baseline native row into a
    // one-row table block. Split that row back into geometry records so a
    // neighbouring fourth/fifth column can join the same captionless grid.
    if (Array.isArray(existingRows) && existingRows.length === 1 && Array.isArray(existingRows[0]) && existingRows[0].length >= 2) {
      for (const cell of existingRows[0] as Array<{ text?: unknown; x?: unknown; width?: unknown }>) {
        if (typeof cell.text !== "string" || !cell.text.trim() || typeof cell.x !== "number") continue;
        const cellLine = {
          ...line,
          text: cell.text.trim(),
          bbox: { ...line.bbox, x: cell.x, width: typeof cell.width === "number" ? cell.width : line.bbox.width },
          x: cell.x,
          width: typeof cell.width === "number" ? cell.width : line.bbox.width,
        } as StructureLine;
        const list = recordsByPage.get(page) ?? [];
        list.push({ block, line: cellLine, y: line.bbox.y });
        recordsByPage.set(page, list);
      }
      continue;
    }
    const list = recordsByPage.get(page) ?? [];
    list.push({ block, line, y: line.bbox.y });
    recordsByPage.set(page, list);
  }

  const consumed = new Set<string>();
  const mergedById = new Map<string, PaperBlock>();
  for (const records of recordsByPage.values()) {
    records.sort((a, b) => a.y - b.y || a.line.bbox.x - b.line.bbox.x);
    const rows: Record[][] = [];
    for (const record of records) {
      const previous = rows.at(-1);
      const previousY = previous?.[0]?.y;
      const tolerance = previous?.[0] ? Math.max(previous[0].line.bbox.height * 0.65, 2) : 0;
      if (previous && previousY !== undefined && Math.abs(record.y - previousY) <= tolerance) previous.push(record);
      else rows.push([record]);
    }
    const gaps = rows.slice(1).map((row, index) => row[0].y - rows[index][0].y).filter((gap) => gap > 0);
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] ?? 0;
    const splitGap = Math.max(18, medianGap * 2.5);
    const segments: Record[][][] = [];
    for (const row of rows) {
      const previousSegment = segments.at(-1);
      const previousRow = previousSegment?.at(-1);
      if (previousSegment && previousRow && row[0].y - previousRow[0].y <= splitGap) previousSegment.push(row);
      else segments.push([row]);
    }
    for (const segment of segments) {
      if (segment.length < 3) continue;
      const bands: number[] = [];
      for (const row of segment) {
        for (const record of row) {
          const x = record.line.bbox.x;
          const existing = bands.findIndex((band) => Math.abs(band - x) <= 10);
          if (existing >= 0) bands[existing] = (bands[existing] + x) / 2;
          else bands.push(x);
        }
      }
      bands.sort((a, b) => a - b);
      const stableBands = bands.filter((band) => segment.filter((row) => row.some((record) => Math.abs(record.line.bbox.x - band) <= 12)).length >= Math.max(3, Math.ceil(segment.length * 0.65)));
      const coreRows = segment.map((row) => row.filter((record) => stableBands.some((band) => Math.abs(record.line.bbox.x - band) <= 12))).filter((row) => row.length >= 3);
      if (stableBands.length < 3 || coreRows.length < Math.max(3, Math.ceil(segment.length * 0.75))) continue;
      // Some borderless tables have a sparse header/descriptor column (for
      // example a long column label that appears only once). Keep those cells
      // when they sit inside the established table span and share a usable
      // row, while still requiring the repeated core bands above.
      const minBand = Math.min(...stableBands);
      const maxBand = Math.max(...stableBands);
      const rowsWithOptionalCells = segment
        .filter((row) => row.filter((record) => stableBands.some((band) => Math.abs(record.line.bbox.x - band) <= 12)).length >= 3)
        .map((row) => row.filter((record) => record.line.bbox.x >= minBand - 12 && record.line.bbox.x <= maxBand + 12));
      const members = rowsWithOptionalCells.flat();
      const memberIds = new Set(members.map((record) => record.block.id));
      if ([...memberIds].some((id) => consumed.has(id))) continue;
      const first = members[0].block;
      const tableRows = rowsWithOptionalCells.map((row) => row
        .sort((a, b) => a.line.bbox.x - b.line.bbox.x)
        .map((record) => ({ text: record.line.text.trim(), x: record.line.bbox.x, width: record.line.bbox.width })));
      const merged: PaperBlock = {
        ...first,
        type: "table",
        original: tableRows.map((row) => row.map((cell) => cell.text).join(" ")).join(" "),
        pageStart: first.pageStart,
        pageEnd: Math.max(...members.map((record) => record.block.pageEnd)),
        boundingBoxes: members.flatMap((record) => record.block.boundingBoxes),
        translationStatus: "skipped",
        metadata: {
          ...first.metadata,
          role: "table",
          tableSourceFallback: true,
          tableRows,
          captionlessNativeGrid: true,
        },
      };
      mergedById.set(first.id, merged);
      for (const id of memberIds) consumed.add(id);
    }
  }
  if (consumed.size === 0) return foldCaptionOwnedTableFallbacks(blocks, layoutBlocks);
  const result = blocks.flatMap((block) => {
    if (mergedById.has(block.id)) return [mergedById.get(block.id)!];
    if (consumed.has(block.id)) return [];
    return [block];
  });
  return foldCaptionOwnedTableFallbacks(result, layoutBlocks);
}

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
    owned.push(...normalizeTableRows(rows));
    rowsByCaption.set(caption.id, owned);
  }
  const inferredOwnerIds = new Set<string>();
  for (const caption of captions) {
    if (rowsByCaption.has(caption.id)) continue;
    const inferred = inferCaptionGrid(caption, blocks, layoutBlocks);
    if (!inferred) continue;
    rowsByCaption.set(caption.id, normalizeTableRows(inferred.rows));
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
        tableRows: normalizeTableRows(rows),
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
