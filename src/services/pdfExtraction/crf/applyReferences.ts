/**
 * Rebuild the references section with the ported GROBID CRF models.
 *
 * Runs after projection: the projected reference blocks only locate the
 * section; entries are re-segmented from native pdf.js lines and parsed.
 * Text is never dropped — segments the CRF rejects as references stay as
 * paragraphs. Japanese reference lists are left untouched (models are
 * trained on Latin-script references).
 */
import { stableBlockId, uniqueId } from "../../../data/package/ids";
import type { BoundingBox, PaperBlock, Section } from "../../../types/paper";
import type { ExtractedPage } from "../../pdfService";
import { parseCitation } from "./citation";
import { referenceLinesFromPages, selectReferenceBlocks } from "./referenceLines";
import { referenceZoneLines } from "./referenceZone";
import { segmentReferenceLines, type RefLine } from "./segmentReferences";

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

export type CrfReferencesOutcome = { applied: boolean; reason: string; references: number };

/**
 * Native lines of the references: the zone found on the page text, or (no
 * references heading line) the lines under the projected reference blocks.
 */
function referenceInput(pages: ExtractedPage[], blocks: PaperBlock[], sections: Section[]): { lines: RefLine[]; zone: boolean } {
  const zone = referenceZoneLines(pages);
  if (zone && zone.length > 0) return { lines: zone, zone: true };
  return { lines: referenceLinesFromPages(pages, selectReferenceBlocks(blocks, sections)), zone: false };
}

const isLatin = (text: string) => text.length > 0 && (text.match(CJK)?.length ?? 0) / text.length <= 0.05;

/** Quick pre-check before loading models: is there a Latin-script references section? */
export function wantsCrfReferences(pages: ExtractedPage[], blocks: PaperBlock[], sections: Section[]): boolean {
  if (pages.length === 0) return false;
  const { lines } = referenceInput(pages, blocks, sections);
  return isLatin(lines.map((l) => l.text).join(" "));
}

const inBox = (line: RefLine, box: BoundingBox) =>
  line.page === box.page && line.y !== undefined && line.x + 2 >= box.x - 2 && line.x <= box.x + box.width && line.y + 1 >= box.y - 3 && line.y <= box.y + box.height + 1;
const compact = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, "").length;

/** Share of a block's characters that sit on the given lines (0 for blocks that are never replaced). */
function coverage(block: PaperBlock, lines: RefLine[]): number {
  if (!["reference", "paragraph", "footnote"].includes(block.type) || block.boundingBoxes.length === 0) return 0;
  const covered = lines.filter((line) => block.boundingBoxes.some((box) => inBox(line, box))).reduce((n, line) => n + compact(line.text), 0);
  return covered / Math.max(1, compact(block.original));
}

function boxesOf(lines: RefLine[]): BoundingBox[] {
  const byPage = new Map<number, BoundingBox>();
  for (const line of lines) {
    if (line.page === undefined || line.y === undefined) continue;
    const height = line.height ?? line.fontSize;
    const box = byPage.get(line.page);
    if (!box) {
      byPage.set(line.page, { page: line.page, x: line.x, y: line.y, width: line.width, height });
      continue;
    }
    const left = Math.min(box.x, line.x);
    const right = Math.max(box.x + box.width, line.x + line.width);
    const top = Math.min(box.y, line.y);
    const bottom = Math.max(box.y + box.height, line.y + height);
    Object.assign(box, { x: left, y: top, width: right - left, height: bottom - top });
  }
  return [...byPage.values()];
}

/**
 * Where the reference list ends. Versio's section split can run the references
 * section into an appendix; GROBID cuts that with its segmentation model. Score
 * each segment +1 when it looks like a reference (accepted, with a year,
 * authors, a DOI, a number label or a URL; appendix prose has none of them) and -1 otherwise, and cut where the prefix sum peaks. Only
 * a tail of at least 3 segments is cut, so a last yearless entry stays.
 */
export function referencesEnd(citations: Array<{ raw?: string; rejected?: true; year?: string; authors?: string; doi?: string }>): number {
  let sum = 0;
  let best = 0;
  let cut = citations.length;
  citations.forEach((c, i) => {
    const labelled = /^\s*(?:\[\s*\d+\s*\]|\d+\.\s)|https?:\/\//.test(c.raw ?? "");
    sum += !c.rejected && (c.year || c.authors || c.doi || labelled) ? 1 : -1;
    if (sum >= best) {
      best = sum;
      cut = i + 1;
    }
  });
  return citations.length - cut >= 3 ? cut : citations.length;
}

/**
 * Replace the reference blocks in `blocks` (in place order-wise; returns a new
 * array) with one block per CRF reference. Falls back (no change) when the
 * section is missing, non-Latin, or yields no references.
 */
export function applyCrfReferences(input: {
  paperId: string;
  pages: ExtractedPage[];
  blocks: PaperBlock[];
  sections: Section[];
}): { blocks: PaperBlock[]; outcome: CrfReferencesOutcome } {
  const unchanged = (reason: string) => ({ blocks: input.blocks, outcome: { applied: false, reason, references: 0 } });
  if (input.pages.length === 0) return unchanged("no pages");
  const { lines } = referenceInput(input.pages, input.blocks, input.sections);
  if (!isLatin(lines.map((l) => l.text).join(" "))) return unchanged("no latin references section");
  const all = segmentReferenceLines(lines);
  if (all.length === 0) return unchanged("no segments");
  const parsed = all.map((segment) => parseCitation(segment.text));
  // Past the end of the list (an appendix read into the zone) nothing is touched.
  const tail = referencesEnd(parsed);
  const segments = all.slice(0, tail);
  const citations = parsed.slice(0, tail);
  const accepted = segments.flatMap((segment, i) => (citations[i].rejected ? [] : segment.lines));
  // Blocks the accepted lines stand for (80% of their characters) are replaced.
  const share = new Map(input.blocks.map((b) => [b, coverage(b, accepted)] as const));
  const removed = new Set(input.blocks.filter((b) => (share.get(b) ?? 0) >= 0.8));
  // Once the CRF has rebuilt the list it is the only source of reference blocks: leftovers of the
  // heuristic typing (outside the zone, or mixed with other text) become paragraphs, text kept.
  const demoted = new Set(input.blocks.filter((b) => b.type === "reference" && !removed.has(b)));

  const anchor = input.blocks.findIndex((b) => removed.has(b));
  const firstPage = segments[0].lines.find((l) => l.page !== undefined)?.page ?? 0;
  const before = anchor >= 0 ? anchor : input.blocks.reduce((last, b, i) => (b.pageStart <= firstPage ? i + 1 : last), 0);
  const sectionId = anchor >= 0 ? input.blocks[anchor].sectionId : (input.blocks[before - 1]?.sectionId ?? null);
  const usedIds = new Set(input.blocks.filter((b) => !removed.has(b)).map((b) => b.id));
  const rebuilt: PaperBlock[] = [];
  let references = 0;
  segments.forEach((segment, index) => {
    const citation = citations[index];
    const boxes = boxesOf(segment.lines);
    const pages = boxes.map((b) => b.page);
    const pageStart = pages.length ? Math.min(...pages) : firstPage;
    const pageEnd = pages.length ? Math.max(...pages) : firstPage;
    const type = citation.rejected ? "paragraph" : "reference";
    if (!citation.rejected) references += 1;
    rebuilt.push({
      id: uniqueId(stableBlockId({ type, page: pageStart, text: segment.text, bbox: boxes[0], order: index }), usedIds),
      paperId: input.paperId,
      sectionId,
      type,
      order: 0,
      pageStart,
      pageEnd,
      boundingBoxes: boxes,
      original: segment.text,
      translated: null,
      extractionConfidence: null,
      translationStatus: type === "reference" ? "skipped" : "pending",
      parentBlockId: null,
      metadata: citation.rejected
        ? { role: "paragraph", source: "crf-references" }
        : {
            role: "reference",
            source: "crf-references",
            citation: {
              ...(citation.authors ? { authors: citation.authors } : {}),
              ...(citation.title ? { title: citation.title } : {}),
              ...(citation.year ? { year: citation.year } : {}),
              ...(citation.journal ? { journal: citation.journal } : {}),
              ...(citation.doi ? { doi: citation.doi } : {}),
            },
          },
    });
  });
  if (references === 0) return unchanged("no references accepted");
  // Never lose text: the rebuilt references must carry (almost) all characters of the blocks they replace.
  const rebuiltChars = rebuilt.reduce((n, b) => n + compact(b.original), 0);
  const removedChars = [...removed].reduce((n, b) => n + compact(b.original), 0);
  if (rebuiltChars < 0.85 * removedChars) return unchanged("text coverage below 85%");

  const out: PaperBlock[] = [];
  input.blocks.forEach((block, i) => {
    if (anchor < 0 && i === before) out.push(...rebuilt);
    if (removed.has(block)) {
      if (i === anchor) out.push(...rebuilt);
      return;
    }
    out.push(demoted.has(block) ? { ...block, type: "paragraph", translationStatus: "pending" } : block);
  });
  if (anchor < 0 && before >= input.blocks.length) out.push(...rebuilt);
  out.forEach((block, i) => {
    block.order = i;
  });
  return { blocks: out, outcome: { applied: true, reason: "crf", references } };
}

/**
 * Pipeline step: load the models only when a Latin-script references section
 * exists, rebuild the reference blocks, and record the outcome as canonical
 * evidence. Any failure keeps the heuristic blocks.
 */
export async function enhanceReferencesWithCrf(
  result: { paper: { id: string }; blocks: PaperBlock[]; sections: Section[]; canonical: { nodes: Array<{ evidence: Array<{ source: string; label: string; confidence: number; reason?: string }> }> } },
  pages: ExtractedPage[],
  loadRuntime: () => Promise<unknown>,
): Promise<CrfReferencesOutcome> {
  if (!wantsCrfReferences(pages, result.blocks, result.sections)) return { applied: false, reason: "no latin references section", references: 0 };
  try {
    await loadRuntime();
    const { blocks, outcome } = applyCrfReferences({ paperId: result.paper.id, pages, blocks: result.blocks, sections: result.sections });
    if (outcome.applied) {
      result.blocks.splice(0, result.blocks.length, ...blocks);
      result.canonical.nodes[0]?.evidence.push({ source: "crf", label: "references", confidence: 0.85, reason: `${outcome.references} references (GROBID 0.9.1 CRF port)` });
    }
    return outcome;
  } catch (error) {
    console.warn("[references] CRF step skipped", error);
    return { applied: false, reason: "crf failed", references: 0 };
  }
}
