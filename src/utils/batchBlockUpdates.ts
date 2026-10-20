import { startTransition } from "react";
import type { PaperBlock } from "../types/paper";

/** Coalesce rapid translation completions so shell UI is not fighting React every frame. */
export const BLOCK_UPDATE_COALESCE_MS = 200;

const deferReasons = new Set<string>();
const batchers = new Set<{ flush: () => void }>();

function isDeferred(): boolean {
  return deferReasons.size > 0;
}

/**
 * Mark a UI surface that should defer streaming translation React patches.
 * Reasons are ref-counted by name (reader-scroll, shell, workspace-modal, …).
 */
export function setTranslationUiDeferReason(reason: string, active: boolean): void {
  const before = isDeferred();
  if (active) deferReasons.add(reason);
  else deferReasons.delete(reason);
  const after = isDeferred();
  if (before === after) return;
  if (!after) {
    for (const batcher of batchers) batcher.flush();
  }
}

/**
 * While the Reader body is scrolling (or another defer reason is active),
 * keep translation block patches queued.
 */
export function setTranslationUiScrollPaused(paused: boolean): void {
  setTranslationUiDeferReason("reader-scroll", paused);
}

export function isTranslationUiScrollPaused(): boolean {
  return isDeferred();
}

export function createBlockUpdateBatcher(
  apply: (paperId: string, blocks: PaperBlock[]) => void
): {
  push: (block: PaperBlock) => void;
  flush: () => void;
  dispose: () => void;
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
    if (isDeferred()) {
      // Stay coalesced until interaction idle; do not drop pending work.
      timer = setTimeout(flush, BLOCK_UPDATE_COALESCE_MS);
      return;
    }
    if (pending.size === 0) return;
    const snapshot = [...pending.entries()];
    pending.clear();
    // Low-priority updates so sidebar / folder actions stay responsive.
    startTransition(() => {
      for (const [paperId, blocks] of snapshot) {
        apply(paperId, [...blocks.values()]);
      }
    });
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
