import type { PaperBlock } from "../../../types/paper";

/**
 * A wrapped byline row left in the body (`Chen Li1, Dongsheng Shang4, Linquan Jin4,`)
 * after the masthead already gave those names to `paper.authors`. A page-1
 * paragraph made only of known author names (affiliation marks stripped) is
 * the byline shown in the header, not body text, and is dropped.
 */
export function dropDuplicateBylineRows(blocks: PaperBlock[], authors: string[]): PaperBlock[] {
  const known = new Set(authors.map(normalize).filter(Boolean));
  if (known.size < 2) return blocks;
  const out = blocks.filter((block) => {
    if (block.pageStart !== 1 || (block.type !== "paragraph" && block.type !== "heading")) return true;
    const text = (block.original ?? "").trim();
    const names = text.split(/,|;|\band\b|&/).map(normalize).filter(Boolean);
    const endsOpen = /(?:,|\band|&)$/.test(text.replace(/[\d*†‡§✉\s]+$/u, ""));
    return !((names.length >= 2 || (names.length === 1 && endsOpen)) && names.every((name) => known.has(name)));
  });
  if (out.length === blocks.length) return blocks;
  out.forEach((block, index) => {
    block.order = index;
  });
  return out;
}

function normalize(name: string): string {
  return name.replace(/[\d*†‡§✉,.]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
