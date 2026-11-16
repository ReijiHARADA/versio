import type { PaperBlock, Section } from "../../../types/paper";

/**
 * A borderless table that the layout read cell by cell arrives as a long run of
 * tiny "paragraphs" (`Hospital,` `Japan` `2023` `[34]` `60% reduction in …`).
 * Each would be shown as an untranslatable fragment with a warning, and the run
 * also blocks the paragraph stitching across the table. A run of such cells on
 * one page becomes one table block whose text is kept as source, like the
 * existing table fallback for regions without a reliable grid.
 */
const words = (text: string) => text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
const TERMINAL = /[.!?][”"’')\]]*$/;
const MIN_RUN = 8;

function isCellLike(block: PaperBlock): boolean {
  if (block.type !== "paragraph" && block.type !== "heading") return false;
  if (block.metadata.listRole || block.metadata.role === "reference") return false;
  const text = (block.original ?? "").trim();
  // Contents entries with dot leaders are a list of their own, not table cells.
  if (/\.{3,}|…|(?:\.\s){3,}/.test(text)) return false;
  const n = words(text);
  if (n === 0 || n > 30) return false;
  // A finished sentence of some length is prose, not a cell.
  if (n >= 8 && /^[\p{Lu}"“(]/u.test(text) && TERMINAL.test(text)) return false;
  // So is a longer piece of running text (`There is a wide range of popular methods (See Table 9) within`).
  const functionWords = text.match(/\b(?:the|of|and|to|in|a|an|is|are|was|were|for|with|that|this|by|on|as|be)\b/gi)?.length ?? 0;
  return !(n >= 8 && functionWords >= 3);
}
const isTiny = (block: PaperBlock) => words((block.original ?? "").trim()) <= 6 && !TERMINAL.test((block.original ?? "").trim());

export function collapseTableCellRuns(blocks: PaperBlock[], sections: Array<Pick<Section, "id" | "normalizedKind">>): PaperBlock[] {
  const body = new Set(sections.filter((s) => s.normalizedKind !== "references").map((s) => s.id));
  const out: PaperBlock[] = [];
  for (let i = 0; i < blocks.length; ) {
    let j = i;
    while (j < blocks.length && isCellLike(blocks[j]) && blocks[j].pageStart === blocks[i].pageStart && body.has(blocks[j].sectionId ?? "")) j += 1;
    // Prose pieces at the edges (`There is a wide range of` before the table) stay paragraphs.
    let lead = i;
    while (lead < j && (blocks[lead].type === "heading" || (!isTiny(blocks[lead]) && words(blocks[lead].original ?? "") >= 5))) lead += 1;
    let tail = j;
    while (tail > lead && !isTiny(blocks[tail - 1]) && words(blocks[tail - 1].original ?? "") >= 5) tail -= 1;
    const run = blocks.slice(lead, tail);
    const paragraphs = run.filter((b) => b.type === "paragraph").length;
    if (run.length < MIN_RUN || paragraphs < run.length / 2 || run.filter(isTiny).length < run.length * 0.5) {
      out.push(blocks[i]);
      i += 1;
      continue;
    }
    out.push(...blocks.slice(i, lead));
    const first = run[0];
    const text = run.map((b) => (b.original ?? "").trim()).join(" ");
    const previous = out[out.length - 1];
    if (previous?.type === "table" && previous.pageStart === first.pageStart && !previous.metadata.tableRows) {
      // Cells that escaped a flattened table on the same page go back into it.
      out[out.length - 1] = {
        ...previous,
        original: `${(previous.original ?? "").trim()} ${text}`,
        boundingBoxes: [...previous.boundingBoxes, ...run.flatMap((b) => b.boundingBoxes)],
        metadata: { ...previous.metadata, collapsedCellBlocks: run.map((b) => b.id) },
      };
    } else {
      out.push({
        ...first,
        type: "table",
        original: text,
        translated: null,
        translationStatus: "skipped",
        pageEnd: Math.max(...run.map((b) => b.pageEnd)),
        boundingBoxes: run.flatMap((b) => b.boundingBoxes),
        metadata: {
          role: "table",
          column: first.metadata.column,
          tableSourceFallback: true,
          collapsedCellBlocks: run.map((b) => b.id),
          translationInputWarning: "table-like text preserved in source because a reliable grid was unavailable",
        },
      });
    }
    out.push(...blocks.slice(tail, j));
    i = j;
  }
  out.forEach((block, index) => {
    block.order = index;
  });
  return out;
}
