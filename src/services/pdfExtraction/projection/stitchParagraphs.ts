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
const PAGE_NUMBER = /^\d{1,4}(?:\s*\/\s*\d{1,4})?$/;
// A long table's running label on each page it fills (`TABLE 3 (Continued)`).
const CONTINUED_FLOAT = /^(?:table|figure|fig\.)\s*\d+[a-z]?\.?\s*\(continued\)$/i;
const TERMINAL = /[.!?。！？][”"’')\]]*\s*$/;
// `(Rapport et al.` + `2022). …`: an abbreviation's period does not end the sentence.
const ABBREVIATION_END = /\b(?:et al|e\.g|i\.e|cf|vs)\.$/i;
// A keyword list glued to an abstract (`…, Feature fusion, Computer-aided diagnosis`) ends without a full stop but is finished.
const KEYWORD_TAIL = /(?:,\s*\p{Lu}[\p{L}-]*(?:\s+[\p{L}-]+){0,3}){3,}$/u;
const TERM_START = /^(?:\p{Lu}{2,}|\p{Lu}[\p{L}\d]*[\d+(\-]|\p{Lu}\p{Ll}+\p{Lu})/u;
const isOpenEnded = (text: string) => (!TERMINAL.test(text) || ABBREVIATION_END.test(text)) && !/:\s*$/.test(text);
const CONTINUATION_START = /^(?:[a-z]|(?:which|that|and|or|but|where|while|whereas|because|although|including|with|for|of|to|in)\b)/;
/**
 * A paragraph that cannot end where it does: after a comma, a function word or
 * inside an open parenthesis.
 */
const isHardOpen = (text: string) =>
  /(?:,|\b(?:and|or|but|nor|that|which|whose|the|a|an|of|to|in|for|with|without|among|between|by|from|on|at|as|than|versus|into|onto|over|under|about|including|such|whether|its|their|our|this|these|those|is|are|was|were|be|been|has|have|had|because|although|though|while|whereas|since|unless|if|when|where))$/i.test(text) ||
  hasOpenParenthesis(text) || ABBREVIATION_END.test(text);
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
 * A body line with an inline formula typed as a display equation
 * (`many. Eligible patients were adults (≥ 18 years) with (1)`): it carries
 * running words, and the paragraph after it goes on in lower case.
 */
function isProseLineEquation(block: PaperBlock, next: PaperBlock | undefined): boolean {
  if (block.type !== "equation" || next?.type !== "paragraph") return false;
  const text = (block.original ?? "").trim();
  return (text.match(/\b\p{Ll}{3,}\b/gu)?.length ?? 0) >= 5 && CONTINUATION_START.test((next.original ?? "").trim());
}
/**
 * A prose line typed as a display equation because it carries statistics or a
 * formula (`(M = 3.79, SD = 1.18), concentration difficulties (M = 3.31,`):
 * displays are set narrower and centred, this one fills the paragraph's width.
 */
function isFullWidthProseEquation(current: PaperBlock, block: PaperBlock): boolean {
  if (block.type !== "equation" || block.boundingBoxes.length !== 1) return false;
  if (((block.original ?? "").match(/\b\p{Ll}{3,}\b/gu)?.length ?? 0) < 2) return false;
  const line = block.boundingBoxes[0];
  const body = current.boundingBoxes.filter((box) => box.page === line.page && box.width > 0);
  const widest = body.reduce((a, b) => (b.width > a.width ? b : a), body[0]);
  return Boolean(widest) && Math.abs(line.x - widest.x) <= 6 && line.width >= widest.width * 0.9;
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

/** `current` with `next` (the rest of its interrupted sentence) appended. */
export function appendContinuation(current: PaperBlock, next: PaperBlock): PaperBlock {
  const joined = joinTexts(current.original?.trim() ?? "", next.original?.trim() ?? "");
  const warning = isExpectedNonProseParagraph(joined) ? null : unsafeParagraphStructureReason(joined);
  return {
    ...current,
    original: joined,
    pageEnd: Math.max(current.pageEnd, next.pageEnd),
    boundingBoxes: [...current.boundingBoxes, ...next.boundingBoxes],
    metadata: {
      ...current.metadata,
      ...(next.metadata.listRole === "intro" ? { listRole: "intro" } : {}),
      translationInputWarning: warning ?? undefined,
      stitchedFrom: [...((current.metadata.stitchedFrom as string[] | undefined) ?? []), next.id],
    },
  };
}

export function stitchParagraphContinuations(blocks: PaperBlock[], sections: Array<Pick<Section, "id" | "normalizedKind">>): PaperBlock[] {
  const referenceSections = new Set(sections.filter((s) => s.normalizedKind === "references").map((s) => s.id));
  // Body prose filed under a references heading (a PDF that repeats the article after its reference list) still
  // joins; bibliography entries never do.
  const proseInReferences = (b: PaperBlock) => words(b.original ?? "") >= 20 && !isExpectedNonProseParagraph(b.original ?? "") &&
    !/\b(?:19|20)\d{2}[a-z]?\b.*\b(?:doi|https?:|vol|pp)\b/i.test(b.original ?? "");
  const eligible = (b: PaperBlock) =>
    b.type === "paragraph" && (!referenceSections.has(b.sectionId ?? "") || proseInReferences(b)) && !b.metadata.listRole && b.metadata.role !== "reference";
  const out = [...blocks];
  for (let i = 0; i < out.length; i += 1) {
    // A list item cut at an inline formula (`3. Type-Specific Feature Aggregation … the concatenated features` | `Fmulti ∈ …`
    // | `are passed through …`) goes on past it; otherwise items stay apart.
    const listItem = out[i].type === "paragraph" && out[i].metadata.listRole === "item" && out[i].metadata.role !== "reference" &&
      !referenceSections.has(out[i].sectionId ?? "");
    if (!eligible(out[i]) && !listItem) continue;
    // A caption-like line taken back mid-sentence ("Table 7. For instance, … of Post") ends anywhere.
    let afterReferenceCaption = false;
    for (;;) {
      const current = out[i];
      const currentText = current.original?.trim() ?? "";
      if (!isOpenEnded(currentText) || words(currentText) < 6) break;
      let target = -1;
      let formula = -1;
      const hardOpen = isHardOpen(currentText) || afterReferenceCaption;
      let skippedParagraph = false;
      let skippedFragment = false;
      let passedFinished = 0;
      // Full-page figures and tables (a long table runs over several pages) can push the rest of a paragraph several pages on.
      let onlyFloats = true;
      let sawFloat = false;
      for (let j = i + 1; j < out.length && j <= i + 12 && out[j].pageStart <= current.pageEnd + (onlyFloats && j > i + 1 ? 8 : 1); j += 1) {
        const candidate = out[j];
        const candidateText = candidate.original?.trim() ?? "";
        // A list's lead-in (`task (“diseased” vs. “no disease”). These modifications are:`) can be the rest of the sentence too.
        const listIntro = candidate.type === "paragraph" && candidate.metadata.listRole === "intro" && candidate.metadata.role !== "reference" &&
          !referenceSections.has(candidate.sectionId ?? "");
        if (!listItem && (eligible(candidate) || listIntro) && words(candidateText) >= 2 && CONTINUATION_START.test(candidateText)) {
          target = j;
          break;
        }
        // `… for the coordinated optimization of the` | heading `18 PID parameters of a 6-DOF underwater manipulator, standard`
        // | `PSO may suffer …`: a line read as a (numbered) heading inside a sentence cut at a function word.
        if (!listItem && j === i + 1 && candidate.type === "heading" && hardOpen && !/,$/.test(currentText) && words(candidateText) >= 6 &&
          /(?:\s\p{Ll}{2,}|,)$/u.test(candidateText) && /\s(?:of|a|an|the|and|in|for|with|to),?\s|,\s/.test(candidateText) && out[j + 1] && eligible(out[j + 1]) && out[j + 1].pageStart <= current.pageEnd + 1) {
          formula = j;
          target = j + 1;
          break;
        }
        // `… the concatenated features` [`Fmulti ∈ RH×W`] `are passed through …`: a short unnumbered formula inside
        // the sentence (not after a lead-in, which introduces a display) and the lower-case rest of it.
        if (j === i + 1 && candidate.type === "equation" && candidateText.length <= 80 && !/(?:^|\s)\(\s*\d{1,3}[a-z]?\s*\)\s*$/.test(candidateText) &&
          !isHardOpen(currentText) && !/(?:\b(?:as|follows|where|then|gives|yields)|[:=;–—-])\s*$/.test(currentText) &&
          out[j + 1] && eligible(out[j + 1]) && out[j + 1].pageStart <= current.pageEnd + 1 && /^\p{Ll}/u.test(out[j + 1].original?.trim() ?? "") &&
          words(out[j + 1].original ?? "") >= 3) {
          formula = j;
          target = j + 1;
          break;
        }
        if (!listItem && j === i + 1 && (isProseEquation(candidate) || isFullWidthProseEquation(current, candidate) || isInlineReferenceCaption(currentText, candidate) || isProseLineEquation(candidate, out[j + 1]))) {
          target = j;
          break;
        }
        // Without a lower-case start, only the first paragraph after the interruption can be the continuation.
        // After a skipped fragment, text opening with `,` / `;` continues that fragment.
        // A sentence cut right after a subordinator (`… with full pooling. Because` | figure | `Accmax does not …`)
        // goes on in the first paragraph past the floats, whatever its first letter.
        const cutAtSubordinator = sawFloat && !skippedParagraph && !skippedFragment &&
          /\s(?:because|although|though|while|whereas|since|unless|if|when)$/i.test(currentText);
        if (!listItem && hardOpen && !skippedParagraph && !(skippedFragment && /^[,;:.]/.test(candidateText)) && eligible(candidate) && looseContinuation(currentText, candidateText, afterReferenceCaption || cutAtSubordinator)) {
          target = j;
          break;
        }
        // Right after a paragraph cut at a function word (`… higher than the` + `Transformer+CAM …`), nothing in between,
        // the next paragraph is its rest when it opens with a term (an acronym or a mixed-case name), not a sentence word.
        // (Also after any unpunctuated lower-case word of a long paragraph: `… Given its proven stability, we selected` + `MAPPO under …`.)
        // (Past floats only, too: `… HCT116 cells and` | table | `HEK293T, and perform …`.)
        // A comma-cut list of terms goes on in a paragraph that opens with the next term and a comma
        // (`… occipital cortex, including FT7,` | `FC5, FC3, FC1, …`).
        if (!listItem && (j === i + 1 || (sawFloat && !skippedParagraph && !skippedFragment)) && /,$/.test(currentText) && eligible(candidate) &&
          // (Or a statistic of a fit-index list: `… NFI = 0.917,` | `RFI = 0.900, IFI = 0.935, …`.)
          (/^\p{Lu}[\p{L}\d+-]*,\s/u.test(candidateText) || /^\p{Lu}[\p{Lu}\d]{1,6}\s*=\s*[\d.]/u.test(candidateText)) && TERM_START.test(candidateText)) {
          target = j;
          break;
        }
        // A word broken at the line end (`… 88.40 macro-` | `F1 (88.40%) with …`) goes on in the very next paragraph.
        if (!listItem && j === i + 1 && /\p{L}{2,}-$/u.test(currentText) && candidate.type === "paragraph" && eligible(candidate) &&
          words(candidateText) >= 3 && /^[\p{L}\d(]/u.test(candidateText)) {
          target = j;
          break;
        }
        // A paragraph cannot end on a determiner or preposition (`… XGBoost retained the highest AUC, and its` |
        // `Brier score was …`): the very next paragraph is its rest, whatever its first letter.
        if (!listItem && (j === i + 1 || (sawFloat && !skippedParagraph && !skippedFragment)) &&
          /\s(?:the|a|an|its|their|our|his|her|this|these|those|of|to|in|for|with|by|from|on|at|into|between|among)$/i.test(currentText) &&
          eligible(candidate) && looseContinuation(currentText, candidateText, true) && !/^(?:Table|Figure|Fig\.|Abbreviations?|Note|Notes|Keywords?)\b/.test(candidateText) &&
          // A lower-case continuation a little later is the real rest; this one is a legend or the other column.
          !out.slice(j + 1, j + 5).some((b) => eligible(b) && CONTINUATION_START.test(b.original?.trim() ?? ""))) {
          target = j;
          break;
        }
        if (!listItem && (j === i + 1 || (sawFloat && !skippedParagraph && !skippedFragment && hardOpen)) &&
          (hardOpen || (/\s\p{Ll}{3,}$/u.test(currentText) && words(currentText) >= 20)) && !/,$/.test(currentText) && eligible(candidate) &&
          TERM_START.test(candidateText) && looseContinuation(currentText, candidateText, true)) {
          target = j;
          break;
        }
        // Right after it, any open paragraph goes on in a number (`… on the same` + `1.5 T Signa MRI scanner …`);
        // a contents entry with dot leaders (`2.1 The sector ....3` + `2.1.1 Definition ....3`) does not.
        if (!listItem && j === i + 1 && !hardOpen && eligible(candidate) && /^\d/.test(candidateText) && !/\.{4,}|…{2,}/.test(currentText + candidateText) &&
          looseContinuation(currentText, candidateText, true)) {
          target = j;
          break;
        }
        // Any open paragraph goes on in a bracket (`… with low first authorship` + `(1.9%–2.1%) and …`, `… is limited` + `(75). Our …`).
        if (!listItem && !hardOpen && !skippedParagraph && !skippedFragment && eligible(candidate) && /^[([]/.test(candidateText) && looseContinuation(currentText, candidateText, true) &&
          // A lower-case continuation a little later wins (`(Compl). Scores are …` is a table note).
          !out.slice(j + 1, j + 5).some((b) => eligible(b) && CONTINUATION_START.test(b.original?.trim() ?? ""))) {
          target = j;
          break;
        }
        // Finished paragraphs in between (a float's legend, figure text, the other column read in) do not stop the look:
        // a lower-case start still continues the nearest open paragraph. Past them, only that start is accepted.
        // (Only from a real paragraph, not a running head or table text, and past two at most.)
        const finished = candidate.type === "paragraph" && TERMINAL.test(candidateText);
        // An unfinished paragraph right under a table that is not cut mid-phrase is its note
        // (`Model adjusted for age, … CI 95% confidence interval`); `… across all of the wards in` is open prose.
        const tableNote = candidate.type === "paragraph" && out[j - 1]?.type === "table" && !CONTINUATION_START.test(candidateText) &&
          !isHardOpen(candidateText);
        if (!interruptionAllowed(candidate) && !tableNote && !(finished && (sawFloat || (words(currentText) >= 20 && !KEYWORD_TAIL.test(currentText) && passedFinished < 2)))) break;
        if (finished && !interruptionAllowed(candidate)) passedFinished += 1;
        if (candidate.type === "figure" || candidate.type === "table") sawFloat = true;
        // A running head or a table cell (short, no sentence end) does not count as a skipped paragraph.
        // (Nor does a short note right under a table, `Bold values indicate the best performance.`, or a running head,
        // `Peng et al. BMC Med Inform Decis Mak 2020, 20(Suppl 11):322`.)
        const transparentNote = candidate.type === "paragraph" &&
          ((out[j - 1]?.type === "table" && words(candidateText) <= 15) ||
            (words(candidateText) <= 20 && /^\p{Lu}[\p{L}'’-]+ et al\.?\s/u.test(candidateText) && /\b(?:19|20)\d{2}\b/.test(candidateText) && !TERMINAL.test(candidateText)));
        if (transparentNote) { /* skipped like a float's own text */ }
        else if (candidate.type === "paragraph" && (TERMINAL.test(candidateText) || words(candidateText) > 12)) skippedParagraph = true;
        else if (candidate.type === "paragraph") skippedFragment = true;
        // A page number (`10 / 23`) between the pages does not stop the look past full-page floats.
        // (Nor does a table's own footnote or note.)
        if (candidate.type !== "figure" && candidate.type !== "table" && !PAGE_NUMBER.test(candidateText) && !CONTINUED_FLOAT.test(candidateText) &&
          !(candidate.type === "footnote" && out[j - 1]?.type === "table") && !tableNote &&
          // Nor does a float's text read out as an equation or a non-prose paragraph (`Ctrl(16): μ = 137.64, …`).
          !(sawFloat && (candidate.type === "equation" || (candidate.type === "paragraph" && isExpectedNonProseParagraph(candidateText))))) onlyFloats = false;
      }
      if (target < 0) break;
      const next = out[target];
      afterReferenceCaption = isInlineReferenceCaption(currentText, next);
      out[i] = appendContinuation(formula >= 0 ? appendContinuation(current, out[formula]) : current, next);
      out.splice(target, 1);
      if (formula >= 0) out.splice(formula, 1);
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
// A list item the projection did not mark (`a. Research related to …`, `• Short-Time Fourier Transform …`).
const LIST_START = /^(?:[•‣▪∙●◦]\s*|[–-]\s|\(?(?:[a-z]|\d{1,2}|[ivx]{1,4})[.)]\s+\S)/;
const CONTEXT_WARNINGS = [/^後続ブロックが前段の文を継続/, /^repeated numeric chart label/, /^table-like text/];
/** A display equation split into pieces leaves short symbol-only paragraphs around it (`1 Xn`, `n i = 1`). */
const isEquationDebris = (b: PaperBlock) => b.type === "paragraph" && !/\p{L}{4,}/u.test(b.original ?? "") && (b.original ?? "").trim().length <= 40;
/**
 * A display equation the layout left as a short paragraph: an operator or an
 * equation number, and no run of words (`TP + FP (1)`, `MaxIt − 1`, `Drender − Dgt ‖2`).
 */
function isDisplayFragment(b: PaperBlock): boolean {
  const text = (b.original ?? "").trim();
  if (b.type !== "paragraph" || text.length > 60 || /\p{Ll}{3,}\s+\p{Ll}{3,}\s+\p{Ll}{3,}/u.test(text)) return false;
  return /[=+−×·‖∈∑∏√≤≥<>^]/.test(text) || /\(\d{1,3}\)$/.test(text);
}
/**
 * Whether the neighbours (nearest first) start with a display equation, looking past equation debris,
 * within the section. A lead-in may also introduce a table or a list.
 */
function adjacentDisplay(neighbours: PaperBlock[], block: PaperBlock, leadIn: boolean): boolean {
  for (const [i, b] of neighbours.entries()) {
    if (b.sectionId !== block.sectionId || Math.abs(b.pageStart - block.pageStart) > 1) return false;
    if (b.type === "equation" || isDisplayFragment(b) || (leadIn && b.type === "table")) return true;
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
  // A lower-case name (`vcfsim`, `scikit-learn`) that the paper itself puts after a full stop starts sentences.
  const allText = blocks.map((b) => b.original ?? "").join("\u0000");
  const sentenceStartName = (text: string) => {
    const word = /^(\p{Ll}[\p{L}\d-]{2,})\s/u.exec(text)?.[1];
    return word !== undefined && new RegExp(`[.!?]\\s+${word}\\b`, "u").test(allText);
  };
  return blocks.map((block, index) => {
    if (block.type !== "paragraph" || block.metadata.role === "reference") return block;
    const current = block.metadata.translationInputWarning;
    if (typeof current === "string" && CONTEXT_WARNINGS.some((p) => p.test(current))) return block;
    const text = (block.original ?? "").trim();
    // A colon closes a lead-in like a full stop (`A student shared:` before a quotation,
    // `defined in Eq. 2:` before an equation); every other check still applies. Only a
    // lower-case paragraph right after it shows that the sentence itself goes on.
    // (Nor pieces of a display read as paragraphs: `{ }`, `d mXPer1`.)
    const displayPiece = (b: PaperBlock) => {
      const t = (b.original ?? "").trim();
      return words(t) <= 3 || (t.match(/\p{L}/gu)?.length ?? 0) < t.replace(/\s/g, "").length * 0.5;
    };
    const nextText = blocks.slice(index + 1).find((b) => b.type === "paragraph" && !isEquationDebris(b) && !displayPiece(b))?.original?.trim() ?? "";
    // `… was used:` then `where β is …`: the display between them was not extracted as text (an image);
    // a heading straight after the colon is a list or display that was read as one.
    const introduced = /:\s*$/.test(text) && (block.metadata.listRole === "intro" || adjacentDisplay(blocks.slice(index + 1, index + 6), block, true) ||
      !/^\p{Ll}/u.test(nextText) || /^(?:where|here)\b/.test(nextText) || LIST_START.test(nextText) || blocks[index + 1]?.type === "heading");
    // `where θ denotes …` / `and measures …` right after a display equation continues the sentence the equation is part of.
    const afterEquation = /^\p{Ll}/u.test(text) && adjacentDisplay(blocks.slice(Math.max(0, index - 3), index).reverse(), block, false);
    // `… is defined as` / `… is given by` / `… the matrix,` straight before a display equation introduces it like a colon.
    const introducesDisplay = /(?:\b(?:as|by|follows|is|are|be)|[,;])\s*$/.test(text) &&
      (adjacentDisplay(blocks.slice(index + 1, index + 3), block, false) || (/\b(?:as|follows)\s*$/.test(text) && LIST_START.test(nextText))) ||
      // Any unfinished lead-in straight before an equation block (`… the grid consisted of` + `λ ∈ {0, 2, 4} m/s`) introduces it;
      // a formula read as a table counts after `as`.
      (/[\p{Ll},]$/u.test(text) && (blocks[index + 1]?.type === "equation" || (/\bas$/.test(text) && adjacentDisplay(blocks.slice(index + 1, index + 2), block, true))));
    let checked = introduced ? text.replace(/:\s*$/, ".") : introducesDisplay ? `${text.replace(/[,;]\s*$/, "")}.` : text;
    // A list item may close with ";", ",", ":" or "; and" — the list goes on in the next item.
    // (Items used to inherit the warning of the whole flattened list; each item is now checked on its own.)
    if (block.metadata.listRole === "item") checked = checked.replace(/(?:[;,:]|[;,]\s+(?:and|or))\s*$/, ".");
    if (afterEquation || sentenceStartName(checked)) checked = checked.charAt(0).toUpperCase() + checked.slice(1);
    // `d. The mechanisms by which …`: a lower-case item letter before a capitalised sentence is a list marker, not a continuation.
    if (/^[a-z][.)]\s+\p{Lu}/u.test(checked)) checked = checked.replace(/^[a-z][.)]\s+/, "");
    // `(a) …` `(b) …` `(c) …` in a row is an enumeration in the text, not a figure's sub-panel legend.
    const label = (b?: PaperBlock) => (b?.type === "paragraph" ? /^\(([a-z])\)\s/.exec((b.original ?? "").trim())?.[1] : undefined);
    const own = label(block);
    if (own && (label(blocks[index - 1]) === String.fromCharCode(own.charCodeAt(0) - 1) || label(blocks[index + 1]) === String.fromCharCode(own.charCodeAt(0) + 1))) {
      checked = checked.replace(/^\([a-z]\)\s+/, "");
    }
    // Right before a heading, a sentence that ends in its citation or a parenthesis without the full stop
    // (`… text classification [23]`, `… website. (The DHS Program - Access Instructions)`) is finished: a heading never
    // runs on in mid-sentence.
    if (blocks[index + 1]?.type === "heading" && /[\])]$/.test(checked)) checked = `${checked}.`;
    // A stray backslash after the full stop (`… searches (e.g. Google).\`) is a typesetting leftover.
    checked = checked.replace(/([.!?][)\]”"’]*)\\$/, "$1");
    // A supporting-information entry ends with its file type after the last sentence (`… policy. (ZIP)`).
    checked = checked.replace(/([.!?])\s*\((?:[A-Z][A-Z0-9]{1,4}(?:\s*\/\s*[A-Z][A-Z0-9]{1,4})?)\)$/, "$1");
    // A supporting-information reference puts its number first (`… as in S7 Fig.`): the reference is complete, not cut after `Fig.`.
    checked = checked.replace(/(\bS\d{1,3}\s+)(?:Fig|Table)\.$/, "$1item.");
    // A short piece between two parts of one table on its page is a table cell read as a paragraph.
    const betweenTables = words(text) < 40 && [blocks[index - 1], blocks[index + 1]].every((b) => b?.type === "table" && b.pageStart <= block.pageStart && b.pageEnd >= block.pageStart);
    // A run almost without the small words a sentence is made of (`Trinidad and Tobago Susanta Kumar Ghosh,`, a cell, a
    // label, a credit list `EA: Validation, Writing – review & editing, …`) is no sentence that could be cut: its
    // structure is not checked. Running prose carries one such word in every few.
    const shortLabel = (text.match(/\b(?:the|of|and|to|in|is|are|was|were|with|for|that|this|we|by|on|as|be|from)\b/gi)?.length ?? 0) <=
      Math.max(2, words(text) * 0.06);
    const structural = isExpectedNonProseParagraph(text) || betweenTables ? null : unsafeParagraphStructureReason(checked);
    const warning = shortLabel && structural && /末尾が欠け|先頭が前段|語が途中で切れ|括弧|集合記法/.test(structural) ? null : structural;
    if ((warning ?? undefined) === current) return block;
    return { ...block, metadata: { ...block.metadata, translationInputWarning: warning ?? undefined } };
  });
}

/**
 * A figure legend cut at a page or column break goes on in a lower-case paragraph a few blocks on
 * (`… Green boxes represent` | `important variables identified by the model, while red boxes indicate …`): when the
 * caption stops mid-sentence and the paragraph reads as legend text (a panel label, or a colour or line style it
 * explains), the paragraph is the caption's rest.
 */
export function rejoinLegendTails(blocks: PaperBlock[]): PaperBlock[] {
  const out = [...blocks];
  for (let i = 0; i < out.length; i += 1) {
    const block = out[i];
    const text = (block.original ?? "").trim();
    if (block.type !== "paragraph" || !/^\p{Ll}/u.test(text)) continue;
    const legend = /\(\s*[A-H]\s*\)|[.;]\s[A-H]\s\p{Lu}\p{Ll}/u.test(text) ||
      (/\b(?:red|blue|green|black|grey|gray|orange|purple|yellow|dashed|dotted|light-blue|colou?rs?)\b/.test(text) &&
        /\b(?:indicat|show|represent|denot)/.test(text));
    if (!legend) continue;
    let k = i - 1;
    while (k >= 0 && k >= i - 3 && out[k].type !== "figure") k -= 1;
    const figure = out[k];
    if (!figure || figure.type !== "figure") continue;
    const caption = (figure.original ?? "").trim();
    if (!caption || /[.!?][)\]”"’]*$/.test(caption)) continue;
    const joined = joinTexts(caption, text);
    out[k] = {
      ...figure,
      original: joined,
      pageEnd: Math.max(figure.pageEnd, block.pageEnd),
      boundingBoxes: [...figure.boundingBoxes, ...block.boundingBoxes],
      metadata: { ...figure.metadata, ...("captionOriginal" in figure.metadata ? { captionOriginal: joined } : {}) },
    };
    out.splice(i, 1);
    i -= 1;
  }
  return out;
}
