/**
 * Paragraph-level ground truth from publisher JATS, and alignment of an
 * extraction's text blocks against it.
 *
 * JATS `<p>` elements are the publisher's own paragraphs, independent of the
 * app and of any model. Alignment uses 5-token shingles: each gold paragraph
 * is located in the extracted blocks by the shingles it shares with them, so
 * paragraphs that were split, merged or lost show up without a fuzzy
 * per-pair similarity.
 */
import { decodeEntities, elements, first, removeElements, text } from "../fieldGold/xml";

export type GoldParagraph = { index: number; part: "abstract" | "body" | "back"; text: string; hasDisplayFormula: boolean };

/** Abstract, body and acknowledgement paragraphs; figure/table content and nested paragraphs excluded. */
export function jatsParagraphs(xml: string): GoldParagraph[] {
  const out: GoldParagraph[] = [];
  const front = first(xml, "front")?.inner ?? "";
  const parts: Array<[GoldParagraph["part"], string]> = [
    ["abstract", elements(front, "abstract").filter((a) => !a.attrs["abstract-type"]).map((a) => a.inner).join("\n")],
    ["body", first(xml, "body")?.inner ?? ""],
    ["back", (first(xml, "back")?.inner ?? "").replace(/<ref-list[\s\S]*?<\/ref-list>/g, "")],
  ];
  for (const [part, raw] of parts) {
    let scope = raw;
    for (const tag of ["fig", "table-wrap", "fn-group", "supplementary-material"]) scope = removeElements(scope, tag);
    // List items and boxed text are printed prose too; nested <p> are reached through their containers.
    const containers = [scope, ...elements(scope, "list-item").map((x) => x.inner), ...elements(scope, "boxed-text").map((x) => x.inner)];
    for (const p of containers.flatMap((c) => elements(removeElements(removeElements(c, "list"), "boxed-text"), "p"))) {
      if (/<p[\s>]/.test(p.inner)) continue;
      const hasDisplayFormula = /<disp-formula/.test(p.inner);
      // A display formula is its own block in the Reader, so the text around it forms separate paragraphs
      // (`… is defined as:` | formula | `where θ denotes …`).
      for (const piece of p.inner.split(/<disp-formula[\s>][\s\S]*?<\/disp-formula>/)) {
        // Inline formulas carry their LaTeX source next to the MathML; the PDF prints only the formula.
        // Inline formulas and cross-reference labels are printed in another form than the JATS holds (`yi` against
        // nothing, `Figure 10` against `Fig. S13`, `[14–16]` against `14, 15, 16`): they become a boundary that no
        // shingle crosses, so only the prose around them is matched.
        const marked = piece
          .replace(/<inline-formula[\s>][\s\S]*?<\/inline-formula>/g, ` ${MARKUP} `)
          .replace(/<inline-graphic\b[^>]*?(?:\/>|>[\s\S]*?<\/inline-graphic>)/g, ` ${MARKUP} `)
          .replace(/<xref\b[^>]*?(?:\/>|>[\s\S]*?<\/xref>)/g, ` ${MARKUP} `);
        const plain = decodeEntities(text(removeElements(marked, "tex-math"))).replace(/\s+/g, " ").trim();
        if (plain) out.push({ index: out.length, part, text: plain, hasDisplayFormula });
      }
    }
  }
  return out;
}

// Fold accents: LaTeX gold drops math accents (`\\tilde{A}` → `A`) that the PDF text keeps.
// Letters and digits are separate tokens: a superscript citation is set tight against its word in one source
// and spaced in the other (`explored in29.` / `articulation 11`), with the same text.
export const tokens = (s: string): string[] => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/\p{L}+|\p{N}+|\u2063/gu) ?? [];
/** Stands in the gold text where inline markup (a formula, a cross-reference label) was. */
export const MARKUP = "\u2063";
const SHINGLE = 5;
const shingles = (t: string[]): string[] => (t.length < SHINGLE ? [] : Array.from({ length: t.length - SHINGLE + 1 }, (_, i) => t.slice(i, i + SHINGLE)).filter((w) => !w.includes(MARKUP)).map((w) => w.join(" ")));
const wordCount = (s: string) => tokens(s).filter((t) => t !== MARKUP).length;

export type ExtractedBlock = { id: string; text: string; warning: string | null; indent?: boolean; shortEnd?: boolean; spaced?: boolean };

export type ParagraphOutcome = {
  index: number;
  /** Share of the paragraph's shingles found in some block. */
  found: number;
  /** Blocks holding at least 10% of the found shingles, largest first. */
  blocks: Array<{ id: string; share: number }>;
  verdict: "intact" | "split" | "partial" | "missing";
  warned: boolean;
};

export type BlockOutcome = {
  id: string;
  warning: string | null;
  /** Share of the block's shingles that belong to gold paragraphs. */
  gold: number;
  /** Gold paragraphs whose shingles land in this block, with how much of each paragraph is here. */
  paragraphs: Array<{ index: number; here: number }>;
  verdict: "complete" | "fragment" | "merged" | "outside";
};

/**
 * Align gold paragraphs (≥ 25 tokens) to extracted blocks.
 * - paragraph intact: ≥ 85% found and ≥ 90% of it in one block
 * - split: two or more blocks hold ≥ 10% each
 * - partial: one block, but 30–85% found (text lost); missing: < 30%
 * - block fragment: every gold paragraph in it is < 85% here; complete: one paragraph ≥ 85% here;
 *   merged: two or more paragraphs ≥ 85% here; outside: < 50% of the block is gold text
 */
/**
 * `hosts`: non-paragraph blocks that may carry a whole gold paragraph in readable form (a funding or data
 * statement set as a footnote). A gold paragraph found whole in one of them counts as intact; hosts are
 * not judged themselves.
 */
export function alignParagraphs(gold: GoldParagraph[], blocks: ExtractedBlock[], hosts: ExtractedBlock[] = []): { paragraphs: ParagraphOutcome[]; blocks: BlockOutcome[] } {
  // Shingle → blocks containing it. Phrases a paper repeats occur in several blocks; they are
  // credited to the block the paragraph's unambiguous shingles point to.
  const blockIndex = new Map(blocks.map((b, k) => [b.id, k]));
  const owners = new Map<string, string[]>();
  const blockShingles = new Map<string, string[]>();
  for (const block of blocks) {
    const sh = shingles(tokens(block.text));
    blockShingles.set(block.id, sh);
    for (const s of new Set(sh)) owners.set(s, [...(owners.get(s) ?? []), block.id]);
  }
  const goldOwner = new Map<string, number | null>();
  const scorable = gold.filter((p) => wordCount(p.text) >= 25);
  for (const p of scorable) for (const s of new Set(shingles(tokens(p.text)))) goldOwner.set(s, goldOwner.has(s) && goldOwner.get(s) !== p.index ? null : p.index);

  const warnedBlocks = new Set(blocks.filter((b) => b.warning).map((b) => b.id));
  const perBlockFromPara = new Map<string, Map<number, number>>();
  const paragraphs: ParagraphOutcome[] = scorable.map((p) => {
    const sh = [...new Set(shingles(tokens(p.text)))];
    const counts = new Map<string, number>();
    let found = 0;
    for (const s of sh) {
      const ids = owners.get(s);
      if (ids?.length !== 1) continue;
      found += 1;
      counts.set(ids[0], (counts.get(ids[0]) ?? 0) + 1);
    }
    for (const s of sh) {
      const ids = owners.get(s);
      if (!ids || ids.length < 2) continue;
      found += 1;
      const id = ids.reduce((best, x) => ((counts.get(x) ?? 0) > (counts.get(best) ?? 0) ? x : best), ids[0]);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const [id, n] of counts) {
      if (!perBlockFromPara.has(id)) perBlockFromPara.set(id, new Map());
      perBlockFromPara.get(id)!.set(p.index, n / sh.length);
    }
    const share = [...counts].map(([id, n]) => ({ id, share: n / Math.max(1, found) })).filter((b) => b.share >= 0.1).sort((a, b) => b.share - a.share);
    const f = found / Math.max(1, sh.length);
    // The PDF itself starts a new paragraph inside one JATS paragraph: consecutive blocks, each break after a
    // finished sentence on a short last line or before an indented first line, the next block capitalised. The
    // extraction reproduced the print.
    const printedBreaks = share.length >= 2 && f >= 0.85 && (() => {
      const at = share.map((b) => blockIndex.get(b.id)!).sort((a, b) => a - b);
      // A few paragraph blocks between the pieces (figure text, a sidebar) do not change where the print breaks.
      return at.every((k, n) => n === 0 || (k - at[n - 1] <= 4 &&
        /[.!?][”"’')\]]*$/.test(blocks[at[n - 1]].text.trim()) && (blocks[k].indent === true || blocks[k].spaced === true || blocks[at[n - 1]].shortEnd === true) && /^\p{Lu}/u.test(blocks[k].text.trim())));
    })();
    const verdict: ParagraphOutcome["verdict"] = f < 0.3 ? "missing" : share.length >= 2 && !printedBreaks ? "split" : f < 0.85 ? "partial" : "intact";
    return { index: p.index, found: f, blocks: share, verdict, warned: share.some((b) => warnedBlocks.has(b.id)) };
  });

  const blockOutcomes: BlockOutcome[] = blocks.map((block) => {
    const sh = blockShingles.get(block.id) ?? [];
    const goldShare = sh.length ? sh.filter((s) => goldOwner.get(s) !== undefined).length / sh.length : 0;
    const paras = [...(perBlockFromPara.get(block.id) ?? new Map<number, number>())].map(([index, here]) => ({ index, here })).sort((a, b) => b.here - a.here);
    const complete = paras.filter((p) => p.here >= 0.85).length;
    // A block holding most of one paragraph but missing its end (or start) where its warning says so is a
    // fragment: the warning names a real defect, not a false alarm.
    const lacks = (() => {
      if (complete !== 1 || !block.warning) return false;
      // Warnings about damaged characters (an unmapped glyph, a leftover line-break hyphen, glued words, a broken set
      // or exponent) point at the block's own text, not at a missing part: a complete paragraph can carry them rightly.
      if (/未復元文字|改行ハイフン|隣接語が連結|集合記法|指数情報/.test(block.warning)) return true;
      // A label or caption said to be mixed into the paragraph is there when part of the block is not the paragraph.
      if (/混入|混ざ/.test(block.warning) && goldShare < 0.95) return true;
      // A piece of another paragraph glued before or after the complete one is what a start/end warning points at.
      if (/末尾|先頭/.test(block.warning) && paras.length >= 2 && paras[1].here >= 0.05) return true;
      if (paras[0].here >= 0.99) return false;
      const gp = scorable.find((g) => g.index === paras[0].index);
      if (!gp) return false;
      const goldSh = shingles(tokens(gp.text));
      const own = new Set(sh);
      const ends = /末尾/.test(block.warning) ? goldSh.slice(-1) : /先頭/.test(block.warning) ? goldSh.slice(0, 1) : [];
      return ends.length > 0 && ends.every((x) => !own.has(x));
    })();
    const verdict: BlockOutcome["verdict"] = goldShare < 0.5 ? "outside" : complete >= 2 ? "merged" : complete === 1 && !lacks ? "complete" : "fragment";
    return { id: block.id, warning: block.warning, gold: goldShare, paragraphs: paras, verdict };
  });
  const hostShingles = hosts.map((h) => new Set(shingles(tokens(h.text))));
  const hosted = paragraphs.map((p) => {
    if (p.verdict === "intact" || hostShingles.length === 0) return p;
    const sh = [...new Set(shingles(tokens(scorable.find((g) => g.index === p.index)!.text)))];
    const best = Math.max(0, ...hostShingles.map((set) => sh.filter((x) => set.has(x)).length / Math.max(1, sh.length)));
    return best >= 0.85 ? { ...p, verdict: "intact" as const, found: best } : p;
  });
  return { paragraphs: hosted, blocks: blockOutcomes };
}


export type Cause =
  | "interleaved-columns"
  | "hyphen-artifact"
  | "split-page"
  | "split-column"
  | "split-interrupted"
  | "in-non-paragraph-block"
  | "merged-paragraphs"
  | "lost-text";

export type DocBlock = ExtractedBlock & { type: string; order: number; page: number };

/**
 * Root cause of a non-intact gold paragraph, from the blocks it landed in.
 * `all` holds every text block of the document (headings and footnotes too).
 */
export function paragraphCause(goldText: string, outcome: ParagraphOutcome, all: DocBlock[], goldOwner: (shingle: string) => number | undefined): Cause {
  const byId = new Map(all.map((b) => [b.id, b]));
  const main = outcome.blocks[0] ? byId.get(outcome.blocks[0].id) : undefined;
  // Two columns read line by line: the block keeps switching between gold paragraphs.
  if (main) {
    let switches = 0;
    let last: number | undefined;
    for (const sh of shingles(tokens(main.text))) {
      const g = goldOwner(sh);
      if (g === undefined) continue;
      if (last !== undefined && g !== last) switches += 1;
      last = g;
    }
    if (switches >= 4) return "interleaved-columns";
  }
  // The block also carries most of another gold paragraph: a paragraph break was lost.
  if (main && outcome.blocks.length === 1) {
    const others = new Map<number, number>();
    for (const sh of shingles(tokens(main.text))) {
      const g = goldOwner(sh);
      if (g !== undefined && g !== outcome.index) others.set(g, (others.get(g) ?? 0) + 1);
    }
    if ([...others.values()].some((n) => n >= 20)) return "merged-paragraphs";
  }
  if (outcome.verdict === "split") {
    const parts = outcome.blocks.map((b) => byId.get(b.id)).filter((b): b is DocBlock => !!b).sort((a, b) => a.order - b.order);
    const pages = new Set(parts.map((b) => b.page));
    const consecutive = parts.every((b, i) => i === 0 || b.order - parts[i - 1].order === 1);
    if (!consecutive) return "split-interrupted";
    return pages.size > 1 ? "split-page" : "split-column";
  }
  // Partial / missing: is the rest hyphen-joined, sitting in a heading/footnote block, or gone?
  const goldSh = new Set(shingles(tokens(goldText)));
  const has = (blocks: DocBlock[], dehyphen: boolean) => {
    const set = new Set(blocks.flatMap((b) => shingles(tokens(dehyphen ? b.text.replace(/(\p{L})-(\p{Ll})/gu, "$1$2") : b.text))));
    return [...goldSh].filter((x) => set.has(x)).length / Math.max(1, goldSh.size);
  };
  const paragraphs = all.filter((b) => b.type === "paragraph");
  if (has(paragraphs, true) >= 0.85 && has(paragraphs, false) < 0.85) return "hyphen-artifact";
  if (has(all, true) >= Math.max(0.85, outcome.found + 0.1)) return "in-non-paragraph-block";
  return "lost-text";
}

/** Gold-owner lookup for `paragraphCause` (shingle → gold paragraph index, ambiguous shingles excluded). */
export function goldOwnerOf(gold: GoldParagraph[]): (shingle: string) => number | undefined {
  const owner = new Map<string, number | null>();
  for (const p of gold) for (const sh of new Set(shingles(tokens(p.text)))) owner.set(sh, owner.has(sh) && owner.get(sh) !== p.index ? null : p.index);
  return (sh) => owner.get(sh) ?? undefined;
}
