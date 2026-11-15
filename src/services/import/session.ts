export const activeImportPaperIds = new Set<string>();
export const resumingPapers = new Set<string>();
/** AbortControllers for in-flight resumeIncompleteTranslation runs. */
export const resumeAbortControllers = new Map<string, AbortController>();

/** Tail of the per-hash import queue; resolves when the holder releases. */
const importHashTails = new Map<string, Promise<void>>();

/**
 * Serialise imports of the same PDF (by content hash). Two concurrent imports
 * would both pass the duplicate check and the second would hit
 * `UNIQUE constraint failed: papers.source_file_hash`, or reclaim the first
 * one's half-written package. The waiter re-runs the duplicate check after the
 * holder finishes and reports the normal "already imported" result.
 */
export async function acquireImportHash(hash: string): Promise<() => void> {
  const previous = importHashTails.get(hash) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => mine);
  importHashTails.set(hash, tail);
  await previous;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
    if (importHashTails.get(hash) === tail) importHashTails.delete(hash);
  };
}
