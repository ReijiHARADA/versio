/** Thrown when an import AbortSignal fires at a safe checkpoint. */
export class ImportCancelledError extends Error {
  readonly paperId: string | null;
  readonly partialReady: boolean;

  constructor(message: string, opts?: { paperId?: string | null; partialReady?: boolean }) {
    super(message);
    this.name = "ImportCancelledError";
    this.paperId = opts?.paperId ?? null;
    this.partialReady = opts?.partialReady ?? false;
  }
}

export function throwIfImportAborted(
  signal: AbortSignal | undefined,
  opts?: { paperId?: string | null; partialReady?: boolean }
): void {
  if (signal?.aborted) {
    throw new ImportCancelledError("Import cancelled", opts);
  }
}
