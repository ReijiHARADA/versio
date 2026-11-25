/**
 * Library search index in the desktop app's native SQLite file
 * (`src-tauri/src/search_index.rs`). sql.js kept every paper body in memory and
 * rewrote all of library.sqlite on each change (~137 KB per paper; see
 * docs/research/library-scale-bench-2026-11.md). The browser build and tests
 * keep the sql.js `papers_fts` path (`fts.ts`).
 */

/** Index text (`normalizeIndexText`) of one paper, plus `singleCharWords`. */
export type NativePaperText = {
  paperId: string;
  title: string;
  authors: string;
  annotation: string;
  original: string;
  translation: string;
  words: string;
};

export type NativePaperMeta = Pick<NativePaperText, "paperId" | "title" | "authors" | "annotation">;

/** One query group for `search_index_search`; needles come from `variantNeedles`. */
export type NativeSearchGroup = {
  variants: Array<{ term: string; weight: number; single: boolean; needles: string[] }>;
};

export type NativeSearchIndex = {
  /** Writes run in call order on a queue; they never block the sql.js caller. */
  put(doc: NativePaperText): void;
  setMeta(meta: NativePaperMeta): void;
  delete(paperId: string): void;
  /** Bulk write for the one-time move out of sql.js; rejects on failure. */
  putMany(docs: NativePaperText[]): Promise<void>;
  ids(): Promise<string[]>;
  /** Ranked ids, trashed papers included (the caller filters). */
  search(groups: NativeSearchGroup[]): Promise<string[]>;
  /** Settles once every queued write has finished. */
  flush(): Promise<void>;
};

let active: NativeSearchIndex | null = null;

export function nativeSearchIndex(): NativeSearchIndex | null {
  return active;
}

export function setNativeSearchIndex(index: NativeSearchIndex | null): void {
  active = index;
}

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

export function createQueuedSearchIndex(invoke: Invoke): NativeSearchIndex {
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (cmd: string, args: Record<string, unknown>) => {
    chain = chain.then(
      () =>
        invoke<unknown>(cmd, args).then(
          () => undefined,
          // A lost write is repaired at the next launch: `reconcileNativeSearchIndex`
          // re-indexes papers the native index is missing.
          (error) => console.warn(`${cmd} failed:`, error)
        ),
      () => undefined
    );
  };
  return {
    put: (doc) => enqueue("search_index_put", { doc }),
    setMeta: (meta) => enqueue("search_index_set_meta", { meta }),
    delete: (paperId) => enqueue("search_index_delete", { paperId }),
    async putMany(docs) {
      await chain;
      await invoke("search_index_put_many", { docs });
    },
    async ids() {
      await chain;
      return invoke<string[]>("search_index_ids");
    },
    async search(groups) {
      await chain;
      return invoke<string[]>("search_index_search", { groups });
    },
    flush: () => chain,
  };
}

export function createTauriSearchIndex(): NativeSearchIndex {
  return createQueuedSearchIndex(async (cmd, args) => {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke(cmd, args);
  });
}
