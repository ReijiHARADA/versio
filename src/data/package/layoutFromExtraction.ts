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
    .flatMap((line) => {
      // A recovered table block may not have an exact LayoutBlock text match.
      // In that case the native line can contain several PDF columns on the
      // same baseline. Keep only items that actually overlap this block's
      // source bbox; carrying the whole line would merge authors, callouts,
      // or body prose into a table row.
      const items = line.items.filter((item) => boxes.some((box) => {
        const overlap = Math.max(0, Math.min(item.x + item.width, box.x + box.width) - Math.max(item.x, box.x)) *
          Math.max(0, Math.min(line.y + line.height, box.y + box.height) - Math.max(line.y, box.y));
        return overlap / Math.max(1, item.width * line.height) >= 0.35;
      }));
      if (items.length === 0) return [];
      const left = Math.min(...items.map((item) => item.x));
      const right = Math.max(...items.map((item) => item.x + item.width));
      return [{
        ...line,
        items,
        text: items.map((item) => item.text).join(" "),
        bbox: {
          ...line.bbox,
          x: left,
          width: right - left,
        },
      }];
    })
    .filter((line, index, all) =>
      all.findIndex((other) =>
        other.text === line.text && Math.abs(other.y - line.y) <= 0.5 &&
        Math.abs(other.bbox.x - line.bbox.x) <= 0.5
      ) === index
    )
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
  const joinCellText = (left: string, right: string) =>
    `${left} ${right}`.replace(/-\s+/g, "-").replace(/\s+/g, " ").trim();
  const looksLikeWrappedContinuation = (left: string, right: string) => {
    const leftText = left.trim();
    const leftWords = leftText.split(/\s+/).filter(Boolean).length;
    return (leftWords >= 3 || /[-‐‑]$/.test(leftText)) &&
      !/[.!?;:)]$/.test(leftText) && /^(?:[a-z(]|\[|[,.])/.test(right.trim());
  };
  // A borderless table may emit a wrapped cell on separate native baselines
  // while another column supplies a row between them. Merge only when the
  // text itself proves continuation; this keeps real rows (which usually
  // begin with a label or capitalized value) separate.
  const mergedWrappedRows = rows.map((row) => row.map((cell) => ({ ...cell })));
  for (let index = 0; index < mergedWrappedRows.length; index += 1) {
    const row = mergedWrappedRows[index];
    for (const cell of [...row]) {
      const nextIndex = mergedWrappedRows.findIndex((candidate, candidateIndex) =>
        candidateIndex > index && candidateIndex <= index + 3 &&
        candidate.some((next) => Math.abs(next.x - cell.x) <= 12 &&
          looksLikeWrappedContinuation(cell.text, next.text))
      );
      if (nextIndex < 0) continue;
      const nextRow = mergedWrappedRows[nextIndex];
      const nextCellIndex = nextRow.findIndex((next) =>
        Math.abs(next.x - cell.x) <= 12 && looksLikeWrappedContinuation(cell.text, next.text)
      );
      if (nextCellIndex < 0) continue;
      const next = nextRow[nextCellIndex];
      cell.text = joinCellText(cell.text, next.text);
      cell.width = Math.max(cell.x + cell.width, next.x + next.width) - cell.x;
      nextRow.splice(nextCellIndex, 1);
    }
  }
  const compactRows = mergedWrappedRows.filter((row) => row.length > 0);
  const allBands: number[] = [];
  for (const row of compactRows) for (const cell of row) {
    const index = allBands.findIndex((band) => Math.abs(band - cell.x) <= 12);
    if (index >= 0) allBands[index] = (allBands[index] + cell.x) / 2;
    else allBands.push(cell.x);
  }
  allBands.sort((a, b) => a - b);
  const rowCount = (band: number) => compactRows.filter((row) => row.some((cell) => Math.abs(cell.x - band) <= 12)).length;
  const stableBands = allBands.filter((band) => rowCount(band) >= Math.max(2, Math.ceil(compactRows.length * 0.4)));
  if (stableBands.length < 2) return compactRows;
  const ranges = stableBands.map((band) => ({
    band,
    right: Math.max(...compactRows.flatMap((row) => row
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
  const mergeSameBand = (row: TableCell[]): TableCell[] => {
    const merged: TableCell[] = [];
    // Keep native reading order. Wrapped words can return to the same x-band
    // after an indented line; sorting by x would turn `Delete the tapped
    // contact` into `contact Delete the tapped`.
    for (const source of row) {
      const cell = { ...source, x: mapToStableBand(source) };
      const previous = merged.at(-1);
      // Native PDF streams often expose a wrapped cell as adjacent fragments:
      // `Option (` at x=299 followed by `Correct` at x=332 while the first
      // fragment's bbox still reaches x=334. Treat that physical overlap as
      // continuation text even when the heuristic column bands are distinct.
      const overlapsPrevious = previous &&
        source.x <= previous.x + previous.width + 2 &&
        source.x >= previous.x - 2;
      if (previous && (Math.abs(previous.x - cell.x) <= 12 || overlapsPrevious)) {
        previous.text = joinCellText(previous.text, cell.text);
        previous.width = Math.max(previous.x + previous.width, cell.x + cell.width) - previous.x;
      } else merged.push({ ...cell });
    }
    return merged;
  };
  const normalized: TableCell[][] = [];
  for (const rawRow of compactRows) {
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
  const metadata = block.metadata as { tableRows?: unknown; lines?: StructureLine[] };
  const rows = metadata.tableRows;
  const valid = Array.isArray(rows) ? rows.filter((row): row is TableCell[] =>
    Array.isArray(row) && row.every((cell) =>
      Boolean(cell) && typeof cell === "object" && typeof (cell as TableCell).text === "string"
    )
  ) : [];
  if (valid.some((row) => row.length >= 2)) return valid;
  // A caption-owned borderless table can emit a legitimate one-cell question
  // or label as a standalone block. It has no `tableRows` metadata because a
  // single native line is not useful as a generic fallback, but the caption
  // fold still needs that cell to assemble the complete grid. Recover only
  // short, non-sentence-shaped table fragments here; ordinary prose was
  // already demoted before this package-stage path.
  const line = metadata.lines?.length === 1 ? metadata.lines[0] : undefined;
  const box = !line && block.boundingBoxes.length > 0 ? block.boundingBoxes[0] : undefined;
  const text = (block.original ?? "").trim();
  const words = text.split(/\s+/).filter(Boolean);
  const optionMarkers = text.match(/\b[A-C]\.[\s]/gi)?.length ?? 0;
  if ((!line && !box) || !text ||
      (words.length > 9 && optionMarkers < 2) ||
      (words.length >= 8 && /[.!?]$/.test(text) && optionMarkers < 2)) {
    return undefined;
  }
  return [[{ text, x: line?.bbox.x ?? box!.x, width: line?.bbox.width ?? box!.width }]];
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
  const isWideNarrativeLine = (text: string, width: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    // A neighbouring body line can be split into short native spans while
    // retaining the full column width. It is not a table cell, even when
    // several such spans happen to share the table's vertical range.
    if (words.length < 4 || width < captionBox.width * 0.8) return false;
    const normalized = words.map((word) => word.toLowerCase().replace(/[^a-z0-9]+/g, "")).filter(Boolean);
    const maxRepeated = Math.max(0, ...normalized.map((word) => normalized.filter((candidate) => candidate === word).length));
    const numericRatio = words.filter((word) => /\d/.test(word)).length / words.length;
    // Repeated headers (e.g. a Finger 1/2/3/4 matrix) and numeric rows are
    // wide by design. Only reject a line when it also has prose signals.
    if (maxRepeated >= 3 || numericRatio >= 0.35) return false;
    const hasSentencePunctuation = /[,;:]|['’]/.test(text);
    const hasProseConnector = /\b(?:the|and|of|for|with|to|from|is|are|was|were|has|have|between|indicated|revealed|using|when|that|this)\b/i.test(text);
    return hasSentencePunctuation || hasProseConnector || words.length >= 8;
  };
  const lines: GridLine[] = [];
  const hasNativeLayout = layoutBlocks.some((layout) => layout.pageStart === caption.pageStart);
  if (!hasNativeLayout) for (const block of blocks) {
    if (block.id === caption.id || block.pageStart !== caption.pageStart) continue;
    const metadata = block.metadata as { captionOriginal?: unknown; column?: unknown; lines?: StructureLine[] };
    if (metadata.captionOriginal || (metadata.column && caption.metadata.column && metadata.column !== caption.metadata.column)) continue;
    for (const line of metadata.lines ?? []) {
      const text = line.text.trim();
      const words = text.split(/\s+/).filter(Boolean);
      if (!text || words.length > 7 || /[.!?;:]\s*$/.test(text) || isWideNarrativeLine(text, line.bbox.width)) continue;
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
      if (!text || words.length > 7 || /[.!?;:]\s*$/.test(text) || isWideNarrativeLine(text, line.bbox.width)) continue;
      const overlap = Math.max(0, Math.min(line.bbox.x + line.bbox.width, captionBox.x + captionBox.width) - Math.max(line.bbox.x, captionBox.x));
      if (overlap < Math.min(line.bbox.width, captionBox.width) * 0.2) continue;
      const distance = Math.max(captionBox.y - (line.bbox.y + line.bbox.height), line.bbox.y - (captionBox.y + captionBox.height), 0);
      if (distance > 250) continue;
      for (const item of line.items) {
        const itemText = item.text.trim();
        if (!itemText || itemText.split(/\s+/).filter(Boolean).length > 7 || isWideNarrativeLine(itemText, item.width)) continue;
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
  const inferredBounds = {
    left: Math.min(...rows.flatMap((row) => row.map((line) => line.x))),
    top: Math.min(...rows.flatMap((row) => row.map((line) => line.y))),
    right: Math.max(...rows.flatMap((row) => row.map((line) => line.x + line.width))),
    bottom: Math.max(...rows.flatMap((row) => row.map((line) => line.y + line.height))),
  };
  const inferredIds = blocks
    .filter((block) => block.id !== caption.id && block.pageStart === caption.pageStart && block.type === "table")
    .filter((block) => {
      const box = block.boundingBoxes[0];
      return Boolean(box) && box.x < inferredBounds.right + 3 && box.x + box.width > inferredBounds.left - 3 &&
        box.y < inferredBounds.bottom + 3 && box.y + box.height > inferredBounds.top - 3;
    })
    .map((block) => block.id);
  return {
    ids: new Set([...inferredIds, ...rows.flatMap((row) => row.map((line) => line.blockId)).filter(Boolean)]),
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

  const tableFragments = blocks.filter((block) => {
    if (block.type !== "table") return false;
    const metadata = block.metadata as { captionOriginal?: unknown; figureKey?: unknown; tableSourceFallback?: unknown };
    return !metadata.captionOriginal &&
      (metadata.tableSourceFallback === true || String(metadata.figureKey ?? "").startsWith("table-region-"));
  });
  const firstBox = (block: PaperBlock) => block.boundingBoxes[0];
  // A full-width table on a two-column page often has its caption in the
  // left PDF column while the native cells are classified as `right`. Once
  // several short table fragments form a dense cross-column cluster, treat
  // that cluster as the caption's region. This is deliberately evidence
  // based; a lone neighbouring block is never absorbed.
  const crossColumnCaptions = new Set<string>();
  for (const caption of captions) {
    const captionBox = firstBox(caption);
    if (!captionBox) continue;
    const candidates = tableFragments.filter((fragment) => {
      const box = firstBox(fragment);
      if (!box || box.page !== captionBox.page) return false;
      if (fragment.metadata.column === caption.metadata.column) return false;
      const distance = box.y - (captionBox.y + captionBox.height);
      return distance >= -6 && distance <= 520;
    });
    const xPositions = new Set(candidates.map((fragment) => Math.round((firstBox(fragment)?.x ?? 0) / 12)));
    if (candidates.length >= 4 && xPositions.size >= 2) crossColumnCaptions.add(caption.id);
  }

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
    });
    if (owners.length === 0) {
      const fragmentBox = firstBox(fragment);
      const crossOwners = captions
        .filter((caption) => crossColumnCaptions.has(caption.id))
        .flatMap((caption) => {
          const captionBox = firstBox(caption);
          if (!captionBox || !fragmentBox || captionBox.page !== fragmentBox.page) return [];
          const distance = fragmentBox.y - (captionBox.y + captionBox.height);
          if (distance < -6 || distance > 520) return [];
          // A later caption starts a new table region. Do not carry an
          // earlier full-width grid through it.
          const interveningCaption = captions.some((other) => {
            if (other.id === caption.id) return false;
            const otherBox = firstBox(other);
            return otherBox?.page === captionBox.page &&
              otherBox.y > captionBox.y && otherBox.y < fragmentBox.y;
          });
          return interveningCaption ? [] : [{ caption, distance }];
        });
      owners.push(...crossOwners);
    }
    owners.sort((a, b) => a.distance - b.distance);
    if (owners.length > 0) ownerByFragmentId.set(fragment.id, { caption: owners[0].caption, rows });
  }
  const rowEntriesByCaption = new Map<string, Array<{ rows: TableCell[][]; y: number }>>();
  const ownedCaptionIds = new Set<string>();
  for (const caption of captions) {
    const rows = tableRowsFrom(caption)?.filter((row) =>
      !/^(?:table|表)\s*\d+/i.test(row.map((cell) => cell.text).join(" ").trim())
    );
    if (rows?.length) {
      rowEntriesByCaption.set(caption.id, [{
        rows: normalizeTableRows(rows),
        y: firstBox(caption)?.y ?? 0,
      }]);
    }
  }
  // Projection order is usually reading order, but a full-width table whose
  // caption and cells came from different PDF columns can interleave blocks
  // by column. Reassemble owned fragments in visual y/x order before joining
  // their rows so the Reader does not show a structurally valid but scrambled
  // table. This is geometry-only and leaves the cell text untouched.
  const ownedFragments = new Map<string, Array<{ fragment: PaperBlock; rows: TableCell[][] }>>();
  for (const [fragmentId, owner] of ownerByFragmentId.entries()) {
    const fragment = blocks.find((block) => block.id === fragmentId);
    if (!fragment) continue;
    const list = ownedFragments.get(owner.caption.id) ?? [];
    list.push({ fragment, rows: owner.rows });
    ownedFragments.set(owner.caption.id, list);
  }
  for (const [captionId, entries] of ownedFragments.entries()) {
    entries.sort((a, b) => {
      const aBox = firstBox(a.fragment);
      const bBox = firstBox(b.fragment);
      return (aBox?.y ?? 0) - (bBox?.y ?? 0) || (aBox?.x ?? 0) - (bBox?.x ?? 0);
    });
    const owned = rowEntriesByCaption.get(captionId) ?? [];
    for (const entry of entries) {
      owned.push({ rows: normalizeTableRows(entry.rows), y: firstBox(entry.fragment)?.y ?? 0 });
    }
    rowEntriesByCaption.set(captionId, owned);
    ownedCaptionIds.add(captionId);
  }
  const absorbedParagraphIds = new Set<string>();
  // A table's question cell can be promoted to `paragraph` when its sentence
  // shape is stronger than its table score. Absorb it only inside a dense,
  // already-owned caption region, with a nearby native table fragment on the
  // same baseline. This keeps ordinary prose beside a table untouched.
  for (const caption of captions) {
    const owned = [...ownerByFragmentId.entries()]
      .filter(([, owner]) => owner.caption.id === caption.id)
      .map(([id]) => blocks.find((block) => block.id === id))
      .filter((block): block is PaperBlock => Boolean(block));
    if (owned.length < 4) continue;
    const boxes = owned.map(firstBox).filter((box): box is NonNullable<ReturnType<typeof firstBox>> => Boolean(box));
    if (boxes.length < 4) continue;
    const minX = Math.min(...boxes.map((box) => box.x));
    const maxX = Math.max(...boxes.map((box) => box.x + box.width));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxY = Math.max(...boxes.map((box) => box.y + box.height));
    const nearRows = owned.map(firstBox).filter((box): box is NonNullable<ReturnType<typeof firstBox>> => Boolean(box));
    const candidates = blocks.filter((block) => {
      if (block.type !== "paragraph" || block.pageStart !== caption.pageStart || absorbedParagraphIds.has(block.id)) return false;
      const box = firstBox(block);
      const text = (block.original ?? "").trim();
      if (!box || !text || box.x < minX - 18 || box.x + box.width > maxX + 18 ||
          box.y < minY - 14 || box.y + box.height > maxY + 14) return false;
      if (!/[?？]$/.test(text) && !/^(?:[A-C][.)]|What\b|Which\b|Who\b|How\b|Besides\b|Finally\b)/i.test(text)) return false;
      return nearRows.some((row) => Math.abs(row.y - box.y) <= 14 ||
        (box.y >= row.y && box.y <= row.y + row.height + 14));
    });
    if (candidates.length === 0) continue;
    const entries = rowEntriesByCaption.get(caption.id) ?? [];
    for (const block of candidates) {
      const box = firstBox(block)!;
      entries.push({
        rows: [[{ text: (block.original ?? "").trim(), x: box.x, width: box.width }]],
        y: box.y,
      });
      absorbedParagraphIds.add(block.id);
    }
    rowEntriesByCaption.set(caption.id, entries);
  }
  const rowsByCaption = new Map<string, TableCell[][]>();
  for (const [captionId, entries] of rowEntriesByCaption.entries()) {
    rowsByCaption.set(captionId, entries
      .sort((a, b) => a.y - b.y)
      .flatMap((entry) => entry.rows));
  }
  const inferredOwnerIds = new Set<string>();
  for (const caption of captions) {
    const existingRows = rowsByCaption.get(caption.id);
    if (existingRows?.some((row) => row.length >= 2)) continue;
    const inferred = inferCaptionGrid(caption, blocks, layoutBlocks);
    if (!inferred) continue;
    rowsByCaption.set(caption.id, normalizeTableRows(inferred.rows));
    for (const id of inferred.ids) inferredOwnerIds.add(id);
  }
  if (ownerByFragmentId.size === 0 && inferredOwnerIds.size === 0) return blocks;
  return blocks.flatMap((block) => {
    if (ownerByFragmentId.has(block.id) || inferredOwnerIds.has(block.id) || absorbedParagraphIds.has(block.id)) return [];
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
