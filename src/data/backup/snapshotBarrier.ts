/**
 * Short-lived write barrier for consistent library snapshots.
 *
 * Guarantees:
 * 1. New writers block while the barrier is held
 * 2. Writers already admitted (active) drain to zero before snapshot work runs
 * 3. Release always happens in finally (writer exceptions cannot stick the count)
 * 4. Concurrent backup callers serialize on the barrier
 *
 * Generation is a diagnostic/consistency hint, not a substitute for drain.
 */

let barrierHeld = false;
let barrierPromise: Promise<void> | null = null;
let releaseBarrier: (() => void) | null = null;
let generation = 0;
let activeWriters = 0;
let drainWaiters: Array<() => void> = [];

export function getStorageGeneration(): number {
  return generation;
}

export function bumpStorageGeneration(): void {
  generation += 1;
}

export function isBackupBarrierActive(): boolean {
  return barrierHeld;
}

export function getActiveLibraryWriters(): number {
  return activeWriters;
}

function notifyDrainWaiters(): void {
  if (activeWriters !== 0) return;
  const waiters = drainWaiters;
  drainWaiters = [];
  for (const wake of waiters) wake();
}

async function waitBarrierReleased(): Promise<void> {
  while (barrierHeld && barrierPromise) {
    await barrierPromise;
  }
}

async function waitForActiveWritersDrain(): Promise<void> {
  if (activeWriters === 0) return;
  await new Promise<void>((resolve) => {
    drainWaiters.push(resolve);
  });
}

/**
 * Admit one library mutation. Caller MUST release in finally.
 * Blocks while a backup barrier is held. Re-checks after increment so an
 * in-flight admission cannot slip past a newly raised barrier without being
 * either drained or retried.
 */
export async function acquireLibraryWrite(): Promise<() => void> {
  for (;;) {
    await waitBarrierReleased();
    activeWriters += 1;
    if (barrierHeld) {
      // Lost the race to the barrier: undo admission and wait it out.
      activeWriters = Math.max(0, activeWriters - 1);
      notifyDrainWaiters();
      await waitBarrierReleased();
      continue;
    }
    bumpStorageGeneration();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeWriters = Math.max(0, activeWriters - 1);
      notifyDrainWaiters();
    };
  }
}

/** Run `work` under a library write lease (acquire / finally release). */
export async function withLibraryWriteLease<T>(work: () => Promise<T>): Promise<T> {
  const release = await acquireLibraryWrite();
  try {
    return await work();
  } finally {
    release();
  }
}

export async function waitIfBackupBarrier(): Promise<void> {
  await waitBarrierReleased();
}

/**
 * Stop new writers, drain admitted writers, run snapshot work, then release.
 */
export async function withBackupWriteBarrier<T>(work: () => Promise<T>): Promise<T> {
  await waitBarrierReleased();

  let resolve!: () => void;
  barrierPromise = new Promise<void>((r) => {
    resolve = r;
  });
  releaseBarrier = resolve;
  barrierHeld = true;

  try {
    await waitForActiveWritersDrain();
    return await work();
  } finally {
    barrierHeld = false;
    releaseBarrier?.();
    releaseBarrier = null;
    barrierPromise = null;
  }
}

export function isLibraryMutablePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return (
    normalized === "library.sqlite" ||
    normalized.startsWith("library.sqlite.") ||
    normalized === "papers" ||
    normalized.startsWith("papers/")
  );
}

/** Test-only: reset barrier state between cases. */
export function resetBackupBarrierForTests(): void {
  barrierHeld = false;
  barrierPromise = null;
  releaseBarrier = null;
  generation = 0;
  activeWriters = 0;
  drainWaiters = [];
}
