import { TranslationQueue } from "./translationQueue";
import { prioritiesAroundBlock } from "./readingPriority";
import type { TranslationPriorityValue } from "./types";

/**
 * Process-wide registry and scheduler for heavy paper work.
 *
 * Only one paper is processed at a time. Priority:
 *   1. a running extraction (never preempted)
 *   2. translation of the paper open in Reader
 *   3. the next waiting extraction (makes a new paper readable)
 *   4. translation of the oldest attached paper (FIFO)
 * Every other translation queue is paused; its in-flight tasks finish.
 */
export class TranslationManager {
  private queues = new Map<string, TranslationQueue>();
  private focusBlockIds = new Map<string, string>();
  private readerPaperId: string | null = null;
  private extracting = false;
  private extractionWaiters: Array<() => void> = [];

  attach(paperId: string, queue: TranslationQueue): void {
    this.queues.set(paperId, queue);
    this.reschedule();
  }

  cancel(paperId: string): void {
    this.queues.get(paperId)?.cancelPaper(paperId);
    this.detach(paperId);
  }

  detach(paperId: string): void {
    this.queues.delete(paperId);
    this.focusBlockIds.delete(paperId);
    this.reschedule();
  }

  hasQueue(paperId: string): boolean {
    return this.queues.has(paperId);
  }

  /** Paper currently open in Reader; its translation jumps ahead of others. */
  setReaderPaper(paperId: string | null): void {
    if (this.readerPaperId === paperId) return;
    this.readerPaperId = paperId;
    this.reschedule();
  }

  clearReaderPaper(paperId: string): void {
    if (this.readerPaperId === paperId) this.setReaderPaper(null);
  }

  /** Paper whose translation queue is allowed to run right now. */
  activePaperId(): string | null {
    for (const [id, queue] of this.queues) {
      if (queue.isStarted()) return id;
    }
    return null;
  }

  isExtracting(): boolean {
    return this.extracting;
  }

  /**
   * Wait for the single extraction slot. Resolves with a release function
   * (idempotent). Rejects if `signal` aborts while waiting.
   */
  acquireExtractionSlot(signal?: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new Error("aborted"));
        return;
      }
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        this.extracting = false;
        this.reschedule();
      };
      const grant = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve(release);
      };
      const onAbort = () => {
        this.extractionWaiters = this.extractionWaiters.filter((w) => w !== grant);
        reject(signal?.reason ?? new Error("aborted"));
        this.reschedule();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.extractionWaiters.push(grant);
      this.reschedule();
    });
  }

  private reschedule(): void {
    let runPaperId: string | null = null;
    if (!this.extracting) {
      if (this.readerPaperId && this.queues.has(this.readerPaperId)) {
        runPaperId = this.readerPaperId;
      } else if (this.extractionWaiters.length > 0) {
        this.extracting = true;
        const grant = this.extractionWaiters.shift()!;
        grant();
      } else {
        runPaperId = this.queues.keys().next().value ?? null;
      }
    }
    for (const [id, queue] of this.queues) {
      if (id === runPaperId) queue.start();
      else queue.stop();
    }
  }

  focusedBlockId(paperId: string): string | undefined {
    return this.focusBlockIds.get(paperId);
  }

  /**
   * Reorder queued (not in-flight) tasks around the block the user is reading.
   * Completed tasks are ignored because they are already gone from the queue.
   */
  prioritizeAroundBlock(
    paperId: string,
    blockId: string,
    orderedBlockIds: string[]
  ): void {
    if (this.focusBlockIds.get(paperId) === blockId) return;
    const queue = this.queues.get(paperId);
    if (!queue) return;

    const map = prioritiesAroundBlock(orderedBlockIds, blockId);
    if (map.size === 0) return;

    this.focusBlockIds.set(paperId, blockId);

    const byPriority = new Map<TranslationPriorityValue, string[]>();
    for (const [id, priority] of map) {
      const list = byPriority.get(priority) ?? [];
      list.push(id);
      byPriority.set(priority, list);
    }

    // Apply LOW first so later HIGH/CRITICAL win after re-sort.
    const order: TranslationPriorityValue[] = [3, 2, 1, 0];
    for (const priority of order) {
      const ids = byPriority.get(priority);
      if (ids && ids.length > 0) {
        queue.updatePriority(paperId, ids, priority);
      }
    }
  }
}

export const translationManager = new TranslationManager();
