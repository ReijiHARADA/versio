import type { LayoutBlock } from "../../pdfLayout";
import type { PaperBlock } from "../../../types/paper";

const HYPHENATED = /\b([A-Za-z]{3,})-([a-z][A-Za-z]*)\b/g;
const WHOLE_WORD = /(?<![-\w])[A-Za-z]{4,}(?![-\w])/g;
const TEXT_TYPES = new Set<PaperBlock["type"]>(["paragraph", "footnote", "figure", "table"]);

/**
 * Repair only hyphens that pdfLayout introduced while joining two native lines.
 * A printed compound stays intact; a wrapped word loses its hyphen only when
 * the unbroken form occurs elsewhere and the hyphenated form never does mid-line.
 */
export function repairLineBreakHyphens(blocks: PaperBlock[], layoutBlocks: LayoutBlock[]): PaperBlock[] {
  const words = new Set<string>();
  const midLineHyphens = new Set<string>();
  const lineEndHyphens = new Set<string>();

  for (const block of layoutBlocks) {
    for (const line of block.lines) {
      for (const word of line.text.matchAll(WHOLE_WORD)) words.add(word[0].toLowerCase());
      for (const word of line.text.matchAll(HYPHENATED)) midLineHyphens.add(`${word[1]}-${word[2]}`.toLowerCase());
    }
    for (let index = 1; index < block.lines.length; index++) {
      const head = block.lines[index - 1]!.text.trim().match(/([A-Za-z]{3,})-$/)?.[1];
      const tail = block.lines[index]!.text.trim().match(/^([a-z][A-Za-z]*)\b/)?.[1];
      if (head && tail) lineEndHyphens.add(`${head}-${tail}`.toLowerCase());
    }
  }

  const repair = (text: string) => text.replace(HYPHENATED, (whole, head: string, tail: string) => {
    const hyphenated = `${head}-${tail}`.toLowerCase();
    return lineEndHyphens.has(hyphenated) && !midLineHyphens.has(hyphenated) && words.has(`${head}${tail}`.toLowerCase())
      ? `${head}${tail}`
      : whole;
  });

  return blocks.map((block) => {
    if (!TEXT_TYPES.has(block.type)) return block;
    const original = block.original ? repair(block.original) : block.original;
    const caption = typeof block.metadata.captionOriginal === "string" ? repair(block.metadata.captionOriginal) : undefined;
    if (original === block.original && (caption === undefined || caption === block.metadata.captionOriginal)) return block;
    return {
      ...block,
      original,
      ...(caption === undefined ? {} : { metadata: { ...block.metadata, captionOriginal: caption } }),
    };
  });
}
