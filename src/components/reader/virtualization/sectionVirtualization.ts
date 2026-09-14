/**
 * Section-level virtualization helpers for long papers.
 * Section shells and block id placeholders stay in the DOM; heavy block
 * bodies mount only near the viewport (plus pinned targets).
 */

export const DEFAULT_OVERSCAN = 2;
export const DEFAULT_BLOCK_HEIGHT = 72;

const BLOCK_HEIGHT_BY_TYPE: Record<string, number> = {
  paragraph: 72,
  figure: 280,
  table: 200,
  equation: 64,
  reference: 56,
  footnote: 48,
  heading: 0,
};

export function estimateBlockHeight(type: string): number {
  return BLOCK_HEIGHT_BY_TYPE[type] ?? DEFAULT_BLOCK_HEIGHT;
}

export function estimateSectionBodyHeight(
  blocks: Array<{ type: string }>
): number {
  if (blocks.length === 0) return DEFAULT_BLOCK_HEIGHT;
  return blocks.reduce((sum, block) => sum + estimateBlockHeight(block.type), 0);
}

export function computeMountedSectionIds(args: {
  orderedSectionIds: string[];
  visibleSectionIds: Iterable<string>;
  pinnedSectionIds?: Iterable<string>;
  overscan?: number;
}): Set<string> {
  const overscan = args.overscan ?? DEFAULT_OVERSCAN;
  const mounted = new Set<string>(args.pinnedSectionIds ?? []);
  const ordered = args.orderedSectionIds;
  if (ordered.length === 0) return mounted;

  const visible = [...args.visibleSectionIds].filter((id) => ordered.includes(id));
  if (visible.length === 0) {
    // First paint / unknown scroll: keep a small head window mounted.
    for (let i = 0; i < Math.min(overscan + 1, ordered.length); i++) {
      mounted.add(ordered[i]);
    }
    return mounted;
  }

  for (const id of visible) {
    const index = ordered.indexOf(id);
    if (index < 0) continue;
    const from = Math.max(0, index - overscan);
    const to = Math.min(ordered.length - 1, index + overscan);
    for (let i = from; i <= to; i++) mounted.add(ordered[i]);
  }
  return mounted;
}

export function sectionIdForBlock(
  blockId: string,
  blocks: Array<{ id: string; sectionId: string | null | undefined }>
): string | null {
  const block = blocks.find((item) => item.id === blockId);
  return block?.sectionId || null;
}

export function sectionsMatchingQuery(
  query: string,
  sections: Array<{ id: string }>,
  blocksBySection: Map<string, Array<{ original?: string | null; translated?: string | null }>>
): string[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const hits: string[] = [];
  for (const section of sections) {
    const blocks = blocksBySection.get(section.id) ?? [];
    const matched = blocks.some((block) => {
      const original = (block.original || "").toLowerCase();
      const translated = (block.translated || "").toLowerCase();
      return original.includes(needle) || translated.includes(needle);
    });
    if (matched) hits.push(section.id);
  }
  return hits;
}

/** Before/after style metric for virtualization effectiveness. */
export function countMountedBodies(
  sectionCount: number,
  mountedCount: number
): { sectionCount: number; mountedCount: number; savedRatio: number } {
  const savedRatio =
    sectionCount === 0 ? 0 : Math.max(0, 1 - mountedCount / sectionCount);
  return { sectionCount, mountedCount, savedRatio };
}
