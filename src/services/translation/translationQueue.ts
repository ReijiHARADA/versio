/**
 * Priority-based translation queue.
 * 
 * Manages translation tasks with priority ordering to ensure
 * critical content (title, abstract, visible content) is translated first.
 */

import type {
  TranslationEngine,
  TranslationTask,
  TranslationQueueConfig,
  TranslationPriorityValue,
} from "./types";
import { isRetryableTranslationError } from "./retryPolicy";

export { TranslationPriority } from "./types";

type TaskCallback = (task: TranslationTask) => void;

const DEFAULT_CONFIG: TranslationQueueConfig = {
  concurrency: 8,
  retryFailed: true,
  maxRetries: 2,
  retryDelayMs: 1000,
};

/**
 * Priority-based translation queue.
 */
export class TranslationQueue {
  private engine: TranslationEngine;
  private config: TranslationQueueConfig;
  private queue: TranslationTask[] = [];
  private activeCount = 0;
  private isRunning = false;
  private taskIdCounter = 0;

  // Callbacks
  private onTaskStarted?: TaskCallback;
  private onTaskCompleted?: TaskCallback;
  private onTaskFailed?: TaskCallback;
  private onTaskCancelled?: TaskCallback;
  /** Papers whose queued work should drain without starting or retrying. */
  private cancelledPaperIds = new Set<string>();

  constructor(
    engine: TranslationEngine,
    config: Partial<TranslationQueueConfig> = {}
  ) {
    this.engine = engine;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set callback for when a task starts.
   */
  setOnTaskStarted(callback: TaskCallback): void {
    this.onTaskStarted = callback;
  }

  /**
   * Set callback for when a task completes.
   */
  setOnTaskCompleted(callback: TaskCallback): void {
    this.onTaskCompleted = callback;
  }

  /**
   * Set callback for when a task fails.
   */
  setOnTaskFailed(callback: TaskCallback): void {
    this.onTaskFailed = callback;
  }

  /**
   * Set callback for cooperative cancel of queued (not in-flight) tasks.
   * Callers use this to settle outstanding counters without marking blocks failed.
   */
  setOnTaskCancelled(callback: TaskCallback): void {
    this.onTaskCancelled = callback;
  }

  /**
   * Add a translation task to the queue.
   */
  enqueue(
    paperId: string,
    blockId: string,
    text: string,
    priority: TranslationPriorityValue,
    sourceLanguage: string = "en",
    targetLanguage: string = "ja"
  ): string {
    const taskId = `task-${++this.taskIdCounter}`;

    const task: TranslationTask = {
      id: taskId,
      paperId,
      blockId,
      text,
      sourceLanguage,
      targetLanguage,
      priority,
      status: "queued",
      queuedAt: Date.now(),
    };

    // Insert in priority order (lower priority value = higher priority)
    const insertIndex = this.queue.findIndex((t) => t.priority > priority);
    if (insertIndex === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(insertIndex, 0, task);
    }

    // Start processing if not already running
    this.processNext();

    return taskId;
  }

  /**
   * Update the priority of existing tasks for a paper.
   * Used when user scrolls to a different section.
   */
  updatePriority(paperId: string, blockIds: string[], newPriority: TranslationPriorityValue): void {
    const blockIdSet = new Set(blockIds);

    for (const task of this.queue) {
      if (task.paperId === paperId && blockIdSet.has(task.blockId) && task.status === "queued") {
        task.priority = newPriority;
      }
    }

    // Re-sort queue by priority
    this.queue.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Cancel queued tasks for a paper and settle them via onTaskCancelled.
   * In-flight tasks finish (progress is kept) but are not retried.
   */
  cancelPaper(paperId: string): void {
    this.cancelledPaperIds.add(paperId);
    const removed = this.queue.filter(
      (t) => t.paperId === paperId && t.status === "queued"
    );
    this.queue = this.queue.filter(
      (t) => !(t.paperId === paperId && t.status === "queued")
    );
    for (const task of removed) {
      task.status = "failed";
      task.error = "cancelled";
      void this.onTaskCancelled?.(task);
    }
  }

  /**
   * Get the current queue status.
   */
  getStatus(): {
    queueLength: number;
    activeCount: number;
    isRunning: boolean;
    tasksByPriority: Record<number, number>;
  } {
    const tasksByPriority: Record<number, number> = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
    };

    for (const task of this.queue) {
      if (task.status === "queued") {
        tasksByPriority[task.priority]++;
      }
    }

    return {
      queueLength: this.queue.filter((t) => t.status === "queued").length,
      activeCount: this.activeCount,
      isRunning: this.isRunning,
      tasksByPriority,
    };
  }

  /**
   * Start the queue processing.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    // Fill every free slot; processNext starts at most one task per call.
    const free = Math.max(0, this.config.concurrency - this.activeCount);
    for (let i = 0; i < free; i++) this.processNext();
  }

  isStarted(): boolean {
    return this.isRunning;
  }

  /**
   * Stop starting new tasks. In-flight tasks finish; queued tasks wait for start().
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Clear all queued tasks.
   */
  clear(): void {
    this.queue = this.queue.filter((t) => t.status === "translating");
  }

  private async processNext(): Promise<void> {
    if (!this.isRunning) return;
    if (this.activeCount >= this.config.concurrency) return;

    // Drop queued work for cancelled papers before picking the next task.
    const stale = this.queue.filter(
      (t) => t.status === "queued" && this.cancelledPaperIds.has(t.paperId)
    );
    if (stale.length > 0) {
      this.queue = this.queue.filter(
        (t) => !(t.status === "queued" && this.cancelledPaperIds.has(t.paperId))
      );
      for (const task of stale) {
        task.status = "failed";
        task.error = "cancelled";
        void this.onTaskCancelled?.(task);
      }
    }

    // Find next queued task
    const task = this.queue.find((t) => t.status === "queued");
    if (!task) return;

    // Mark as processing
    task.status = "translating";
    task.startedAt = Date.now();
    this.activeCount++;

    this.onTaskStarted?.(task);

    try {
      const result = await this.engine.translate(
        task.text,
        task.sourceLanguage,
        task.targetLanguage
      );

      task.status = "completed";
      task.result = result;
      task.completedAt = Date.now();

      // Keep successful in-flight work after cancel so pause does not discard it.
      await this.onTaskCompleted?.(task);
    } catch (error) {
      task.error = error instanceof Error ? error.message : "Unknown error";
      const retryCount = (task as TranslationTask & { _retryCount?: number })._retryCount ?? 0;
      const cancelled = this.cancelledPaperIds.has(task.paperId);
      const canRetry =
        !cancelled &&
        this.config.retryFailed &&
        retryCount < this.config.maxRetries &&
        isRetryableTranslationError(error);

      if (canRetry) {
        // Keep the block out of the Reader failure surface until retries are
        // exhausted. Calling onTaskFailed first painted "翻訳に失敗しました"
        // even when the next attempt would succeed.
        (task as TranslationTask & { _retryCount?: number })._retryCount = retryCount + 1;
        task.status = "queued";
        setTimeout(() => {
          this.processNext();
        }, this.config.retryDelayMs);
      } else if (cancelled) {
        task.status = "failed";
        task.error = "cancelled";
        task.completedAt = Date.now();
        await this.onTaskCancelled?.(task);
      } else {
        task.status = "failed";
        task.completedAt = Date.now();
        await this.onTaskFailed?.(task);
      }
    } finally {
      this.activeCount--;

      // Remove completed/failed tasks that won't be retried
      this.queue = this.queue.filter(
        (t) => t.status === "queued" || t.status === "translating"
      );

      // Process next task
      this.processNext();
    }
  }
}

/**
 * Create a translation queue with default settings.
 */
export function createTranslationQueue(
  engine: TranslationEngine,
  config?: Partial<TranslationQueueConfig>
): TranslationQueue {
  return new TranslationQueue(engine, config);
}
