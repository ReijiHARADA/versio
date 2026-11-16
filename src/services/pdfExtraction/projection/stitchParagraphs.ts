/**
 * Rejoin a paragraph that the page layout interrupted.
 *
 * A typeset paragraph is often broken by a figure, a table, a footnote, a
 * page header or a column/page break. When the pieces end up as separate
 * blocks, the Reader cannot translate either (the first stops mid-sentence,
 * the second starts mid-sentence) and shows the source with a warning.
 *
 * Rule: paragraph A ends without a sentence-final mark, and a later paragraph
 * B (up to the next page) starts as a continuation (lower case, or after a
 * line-end hyphen). Everything between them must be non-prose — figures,
 * tables, captions, footnotes, short fragments (table cells, figure labels,
 * running heads) — never a complete prose paragraph or an equation. B is
 * appended to A; the interruptions stay, after the joined paragraph.
 */
import type { PaperBlock, Section } from "../../../types/paper";
import { isExpectedNonProseParagraph, unsafeParagraphStructureReason } from "../../translation/quality";

const words = (text: string) => text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
const TERMINAL = /[.!?。！？][”"’')\]]*\s*$/;
const isOpenEnded = (text: string) => !TERMINAL.test(text) && !/:\s*$/.test(text);
const CONTINUATION_START = /^(?:[a-z]|(?:which|that|and|or|but|where|while|whereas|because|although|including|with|for|of|to|in)\b)/;
/** A complete prose paragraph between the pieces means they do not belong together. */
const isCompleteProse = (text: string) => words(text) >= 20 && /^[\p{Lu}"“(]/u.test(text) && TERMINAL.test(text);

function interruptionAllowed(block: PaperBlock): boolean {
  if (block.type === "figure" || block.type === "table" || block.type === "footnote") return true;
  if (block.type === "heading") return words(block.original ?? "") <= 8;
  if (block.type === "paragraph") return !isCompleteProse((block.original ?? "").trim()) && words(block.original ?? "") < 20;
  return false;
}

function joinTexts(a: string, b: string): string {
  // `exam-` + `ple`: a line-end hyphen inside a single word is dropped; compound chains keep theirs.
  const hyphen = /(\p{L}+)-$/u.exec(a);
  if (hyphen && /^\p{Ll}/u.test(b)) {
    const compound = /\p{L}-\p{L}+-$/u.test(a);
    return compound ? `${a}${b}` : `${a.slice(0, -1)}${b}`;
  }
  return `${a} ${b}`;
}

export function stitchParagraphContinuations(blocks: PaperBlock[], sections: Array<Pick<Section, "id" | "normalizedKind">>): PaperBlock[] {
  const referenceSections = new Set(sections.filter((s) => s.normalizedKind === "references").map((s) => s.id));
  const eligible = (b: PaperBlock) =>
    b.type === "paragraph" && !referenceSections.has(b.sectionId ?? "") && !b.metadata.listRole && b.metadata.role !== "reference";
  const out = [...blocks];
  for (let i = 0; i < out.length; i += 1) {
    if (!eligible(out[i])) continue;
    for (;;) {
      const current = out[i];
      const currentText = current.original?.trim() ?? "";
      if (!isOpenEnded(currentText) || words(currentText) < 6) break;
      let target = -1;
      for (let j = i + 1; j < out.length && j <= i + 12 && out[j].pageStart <= current.pageEnd + 1; j += 1) {
        const candidate = out[j];
        const candidateText = candidate.original?.trim() ?? "";
        if (eligible(candidate) && words(candidateText) >= 2 && CONTINUATION_START.test(candidateText)) {
          target = j;
          break;
        }
        if (!interruptionAllowed(candidate)) break;
      }
      if (target < 0) break;
      const next = out[target];
      const joined = joinTexts(currentText, next.original?.trim() ?? "");
      const warning = isExpectedNonProseParagraph(joined) ? null : unsafeParagraphStructureReason(joined);
      out[i] = {
        ...current,
        original: joined,
        pageEnd: Math.max(current.pageEnd, next.pageEnd),
        boundingBoxes: [...current.boundingBoxes, ...next.boundingBoxes],
        metadata: { ...current.metadata, translationInputWarning: warning ?? undefined, stitchedFrom: [...((current.metadata.stitchedFrom as string[] | undefined) ?? []), next.id] },
      };
      out.splice(target, 1);
    }
  }
  out.forEach((block, index) => {
    block.order = index;
  });
  return out;
}
