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
 * line-end hyphen), or, when A cannot end where it does (comma, function
 * word, open parenthesis), B is the first paragraph after the interruption
 * and starts with a number or symbol, or closes A's parenthesis. Everything between them must be non-prose — figures,
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
/**
 * A paragraph that cannot end where it does: after a comma, a function word or
 * inside an open parenthesis.
 */
const isHardOpen = (text: string) =>
  /(?:,|\b(?:and|or|but|nor|that|which|whose|the|a|an|of|to|in|for|with|without|among|between|by|from|on|at|as|than|versus|into|onto|over|under|about|including|such|whether|its|their|our|this|these|those|is|are|was|were|be|been|has|have|had))$/i.test(text) ||
  hasOpenParenthesis(text);
const hasOpenParenthesis = (text: string) => (text.match(/\(/g)?.length ?? 0) > (text.match(/\)/g)?.length ?? 0);
/**
 * The continuation of a hard-open paragraph that does not start in lower case:
 * a number or symbol (`… versus` + `25.0%; …`, `… (43.2%, Nd` + `= 308) …`),
 * or, when the paragraph left a parenthesis open, any text that closes it
 * (`(Open Science` + `Collaboration, 2015). …`). List items, numbered
 * headings, footnote marks, captions and symbol-only debris are not.
 */
function looseContinuation(open: string, text: string, anyStart = false): boolean {
  if (words(text) < 3 || !/\p{L}{4,}/u.test(text)) return false;
  if (/^(?:[•‣▪∙*–-]\s|\(?\d{1,2}[.)]\s|\(?[a-z]{1,3}\)\s|\d{1,2}\s+(?:\p{Lu}|https?:)|(?:Fig\.?|Figure|Table|TABLE|FIGURE|Supplementary)\s*\d)/u.test(text)) return false;
  if (!/^\p{L}/u.test(text) || anyStart) return true;
  const head = text.slice(0, 120);
  const close = head.indexOf(")");
  return hasOpenParenthesis(open) && close >= 0 && (head.indexOf("(") < 0 || head.indexOf("(") > close);
}
/**
 * Prose wrongly typed as an equation (`diagnosis, treatment, and long-term
 * disease management (3).`: the citation looks like an equation number).
 */
function isProseEquation(block: PaperBlock): boolean {
  const text = (block.original ?? "").trim();
  if (block.type !== "equation" || !/^\p{Ll}/u.test(text) || words(text) < 4) return false;
  if (/[=<>≤≥±×÷∑∫√^_{}\\]/.test(text)) return false;
  return (text.match(/\p{L}{4,}/gu)?.length ?? 0) >= 3;
}
/**
 * A sentence that refers to a table or figure at a line start, read as its
 * caption: `… are listed in` + table block `Table 7. For instance, …`.
 */
function isInlineReferenceCaption(open: string, block: PaperBlock): boolean {
  if (block.type !== "table" && block.type !== "figure") return false;
  if (block.metadata.tableRows || block.metadata.imageUrl) return false;
  const text = (block.original ?? "").trim();
  return /\b(?:in|see|of|from|to|and|with|by|on)$/i.test(open) && /^(?:Table|Fig\.?|Figure)\s*\d+[A-Za-z]?\b/.test(text) && text.length <= 240;
}
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
    // A caption-like line taken back mid-sentence ("Table 7. For instance, … of Post") ends anywhere.
    let afterReferenceCaption = false;
    for (;;) {
      const current = out[i];
      const currentText = current.original?.trim() ?? "";
      if (!isOpenEnded(currentText) || words(currentText) < 6) break;
      let target = -1;
      const hardOpen = isHardOpen(currentText) || afterReferenceCaption;
      let skippedParagraph = false;
      // Full-page figures and tables can push the rest of a paragraph several pages on.
      let onlyFloats = true;
      for (let j = i + 1; j < out.length && j <= i + 12 && out[j].pageStart <= current.pageEnd + (onlyFloats && j > i + 1 ? 3 : 1); j += 1) {
        const candidate = out[j];
        const candidateText = candidate.original?.trim() ?? "";
        if (eligible(candidate) && words(candidateText) >= 2 && CONTINUATION_START.test(candidateText)) {
          target = j;
          break;
        }
        if (j === i + 1 && (isProseEquation(candidate) || isInlineReferenceCaption(currentText, candidate))) {
          target = j;
          break;
        }
        // Without a lower-case start, only the first paragraph after the interruption can be the continuation.
        if (hardOpen && !skippedParagraph && eligible(candidate) && looseContinuation(currentText, candidateText, afterReferenceCaption)) {
          target = j;
          break;
        }
        if (!interruptionAllowed(candidate)) break;
        if (candidate.type === "paragraph") skippedParagraph = true;
        if (candidate.type !== "figure" && candidate.type !== "table") onlyFloats = false;
      }
      if (target < 0) break;
      const next = out[target];
      afterReferenceCaption = isInlineReferenceCaption(currentText, next);
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

/**
 * Warnings that come from a paragraph's neighbours or its layout evidence, not
 * from its own text. They are kept as they are.
 */
const CONTEXT_WARNINGS = [/^後続ブロックが前段の文を継続/, /^repeated numeric chart label/, /^table-like text/];
/** A display equation split into pieces leaves short symbol-only paragraphs around it (`1 Xn`, `n i = 1`). */
const isEquationDebris = (b: PaperBlock) => b.type === "paragraph" && !/\p{L}{4,}/u.test(b.original ?? "") && (b.original ?? "").trim().length <= 40;
/**
 * Whether the neighbours (nearest first) start with a display equation, looking past equation debris,
 * within the section. A lead-in may also introduce a table or a list.
 */
function adjacentDisplay(neighbours: PaperBlock[], block: PaperBlock, leadIn: boolean): boolean {
  for (const [i, b] of neighbours.entries()) {
    if (b.sectionId !== block.sectionId || Math.abs(b.pageStart - block.pageStart) > 1) return false;
    if (b.type === "equation" || (leadIn && b.type === "table")) return true;
    if (leadIn && b.type === "paragraph" && b.metadata.listRole === "item") return true;
    // As in the projection's list-intro rule, the list may start a few blocks later (after a figure or a wrapped line).
    if (!isEquationDebris(b) && !(leadIn && i < 4)) return false;
  }
  return false;
}

/**
 * Make each paragraph's translation-input warning describe the text the
 * Reader actually shows.
 *
 * Projection repairs (continuation joins, list splitting, stitching) change a
 * block's text after its warning was computed, which left warnings such as
 * "the end of the paragraph is missing" on paragraphs that now end with a
 * full stop, and copied a list's warning onto every item. The text-derived
 * check is run again on the final text. A lead-in that ends in a colon is a
 * complete unit when the equation, table or list item it introduces follows
 * it, and a lower-case `where …` / `and …` right after a display equation is
 * the rest of that sentence; without the equation both still mark missing
 * content.
 */
export function reconcileTranslationWarnings(blocks: PaperBlock[]): PaperBlock[] {
  return blocks.map((block, index) => {
    if (block.type !== "paragraph" || block.metadata.role === "reference") return block;
    const current = block.metadata.translationInputWarning;
    if (typeof current === "string" && CONTEXT_WARNINGS.some((p) => p.test(current))) return block;
    const text = (block.original ?? "").trim();
    // A colon closes a lead-in like a full stop (`A student shared:` before a quotation,
    // `defined in Eq. 2:` before an equation); every other check still applies. Only a
    // lower-case paragraph right after it shows that the sentence itself goes on.
    const nextText = blocks.slice(index + 1).find((b) => b.type === "paragraph" && !isEquationDebris(b))?.original?.trim() ?? "";
    const introduced = /:\s*$/.test(text) && (block.metadata.listRole === "intro" || adjacentDisplay(blocks.slice(index + 1, index + 6), block, true) || !/^\p{Ll}/u.test(nextText));
    // `where θ denotes …` / `and measures …` right after a display equation continues the sentence the equation is part of.
    const afterEquation = /^\p{Ll}/u.test(text) && adjacentDisplay(blocks.slice(Math.max(0, index - 3), index).reverse(), block, false);
    let checked = introduced ? text.replace(/:\s*$/, ".") : text;
    // A list item may close with ";", ",", ":" or "; and" — the list goes on in the next item.
    // (Items used to inherit the warning of the whole flattened list; each item is now checked on its own.)
    if (block.metadata.listRole === "item") checked = checked.replace(/(?:[;,:]|[;,]\s+(?:and|or))\s*$/, ".");
    if (afterEquation) checked = checked.charAt(0).toUpperCase() + checked.slice(1);
    const warning = isExpectedNonProseParagraph(text) ? null : unsafeParagraphStructureReason(checked);
    if ((warning ?? undefined) === current) return block;
    return { ...block, metadata: { ...block.metadata, translationInputWarning: warning ?? undefined } };
  });
}
