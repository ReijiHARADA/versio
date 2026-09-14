/**
 * Short-lived write barrier for consistent library snapshots.
 *
 * Writers to `library.sqlite` / `papers/**` await the barrier; the barrier
 * holder should only flush + copy into an immutable snapshot directory, then
 * release so long export/validation can continue without freezing the UI.
 */

let barrier: Promise<void> | null = null;
let releaseBarrier: (() => void) | null = null;
let generation = 0;
let depth = 0;

export function getStorageGeneration(): number {
  return generation;
}

export function bumpStorageGeneration(): void {
  generation += 1;
}

export function isBackupBarrierActive(): boolean {
  return depth > 0;
}

export async function waitIfBackupBarrier(): Promise<void> {
  while (barrier) {
    await barrier;
  }
}

export async function withBackupWriteBarrier<T>(work: () => Promise<T>): Promise<T> {
  while (barrier) {
    await barrier;
  }
  let resolve!: () => void;
  barrier = new Promise<void>((r) => {
    resolve = r;
  });
  releaseBarrier = resolve;
  depth += 1;
  try {
    return await work();
  } finally {
    depth = Math.max(0, depth - 1);
    releaseBarrier?.();
    releaseBarrier = null;
    barrier = null;
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
