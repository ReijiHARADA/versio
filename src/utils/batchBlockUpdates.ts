import type { PaperBlock } from "../types/paper";

/** Coalesce rapid translation completions so Reader scroll is not fighting React every frame. */
export const BLOCK_UPDATE_COALESCE_MS = 120;

let scrollPaused = false;
const batchers = new Set<{ flush: () => void }>();

/**
 * While the Reader body is scrolling, keep translation block patches queued.
 * Call with false on scroll idle to flush.
 */
export function setTranslationUiScrollPaused(paused: boolean): void {
  if (scrollPaused === paused) return;
  scrollPaused = paused;
  if (!paused) {
    for (const batcher of batchers) batcher.flush();
  }
}

export function isTranslationUiScrollPaused(): boolean {
  return scrollPaused;
}

export function createBlockUpdateBatcher(
  apply: (paperId: string, blocks: PaperBlock[]) => void
): {
  push: (block: PaperBlock) => void;
  flush: () => void;
} {
  const pending = new Map<string, Map<string, PaperBlock>>();
  let timer: ReturnType<typeof setTimeout> | 0 = 0;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
  };

  const flush = () => {
    clearTimer();
    if (scrollPaused) {
      // Stay coalesced until scroll idle; do not drop pending work.
      timer = setTimeout(flush, BLOCK_UPDATE_COALESCE_MS);
      return;
    }
    if (pending.size === 0) return;
    const snapshot = [...pending.entries()];
    pending.clear();
    for (const [paperId, blocks] of snapshot) {
      apply(paperId, [...blocks.values()]);
    }
  };

  const batcher = {
    push(block: PaperBlock) {
      if (!block.paperId) return;
      let map = pending.get(block.paperId);
      if (!map) {
        map = new Map();
        pending.set(block.paperId, map);
      }
      map.set(block.id, block);
      if (timer) return;
      timer = setTimeout(flush, BLOCK_UPDATE_COALESCE_MS);
    },
    flush,
    dispose() {
      clearTimer();
      batchers.delete(batcher);
      pending.clear();
    },
  };

  batchers.add(batcher);
  return batcher;
}
