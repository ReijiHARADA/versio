import { afterEach, describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { openSqlite } from "../../data/sqlite/client";
import { rebuildPaperFts, searchPaperIds, searchPapersFts } from "../../data/sqlite/fts";
import {
  createQueuedSearchIndex,
  setNativeSearchIndex,
  type NativePaperText,
  type NativeSearchGroup,
} from "../../data/sqlite/nativeSearchIndex";
import { reconcileNativeSearchIndex } from "../../data/sqlite/reconcileSearchIndex";
import {
  deletePaperIndex,
  indexPaperText,
  refreshPaperAnnotationFts,
  upsertPaperIndex,
  setPaperTrashedAt,
} from "../../data/repositories/paperRepository";
import { saveAnnotationRow } from "../../data/repositories/annotationRepository";
import type { Paper } from "../../types/paper";

const now = "2026-11-26T00:00:00.000Z";

function paper(id: string, title: string): Paper {
  return {
    id,
    sourceFilePath: `${id}.pdf`,
    sourceFileHash: `hash-${id}`,
    titleOriginal: title,
    titleTranslated: null,
    authors: ["Ada Lovelace"],
    publication: null,
    year: 2026,
    pageCount: 1,
    processingStatus: "ready",
    needsTranslationResume: false,
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** In-memory stand-in for `search_index.rs`, scoring as its `score` does. */
function fakeNative() {
  const docs = new Map<string, NativePaperText>();
  const weights = [4, 3, 2, 1, 1];
  const score = (doc: NativePaperText, groups: NativeSearchGroup[]) => {
    const fields = [doc.title, doc.authors, doc.annotation, doc.original, doc.translation];
    let total = 0;
    for (const group of groups) {
      let best = 0;
      for (const v of group.variants) {
        fields.forEach((text, i) => {
          const value = weights[i] * v.weight * (v.single ? 0.2 : 1);
          if (value > best && text && v.needles.some((n) => text.includes(n))) best = value;
        });
        if (v.single && v.weight > best && doc.words.includes(` ${v.term} `)) best = v.weight;
      }
      if (best === 0) return 0;
      total += best;
    }
    return total;
  };
  const calls: string[] = [];
  const index = createQueuedSearchIndex(async <T,>(cmd: string, args?: Record<string, unknown>) => {
    calls.push(cmd);
    if (cmd === "search_index_put") {
      const doc = args!.doc as NativePaperText;
      docs.set(doc.paperId, doc);
    } else if (cmd === "search_index_put_many") {
      for (const doc of args!.docs as NativePaperText[]) docs.set(doc.paperId, doc);
    } else if (cmd === "search_index_set_meta") {
      const meta = args!.meta as Pick<NativePaperText, "paperId" | "title" | "authors" | "annotation">;
      const doc = docs.get(meta.paperId);
      if (doc) docs.set(meta.paperId, { ...doc, ...meta });
    } else if (cmd === "search_index_delete") {
      docs.delete(args!.paperId as string);
    } else if (cmd === "search_index_ids") {
      return [...docs.keys()] as T;
    } else if (cmd === "search_index_search") {
      const groups = args!.groups as NativeSearchGroup[];
      return [...docs.values()]
        .map((doc) => [score(doc, groups), doc.paperId] as const)
        .filter(([s]) => s > 0)
        .sort((a, b) => b[0] - a[0])
        .map(([, id]) => id) as T;
    }
    return undefined as T;
  });
  return { index, docs, calls };
}

afterEach(() => setNativeSearchIndex(null));

describe("native search index", () => {
  it("writes paper text natively and keeps it out of sql.js", async () => {
    const db = await openSqlite(createMemoryFileSystem());
    const native = fakeNative();
    setNativeSearchIndex(native.index);
    const p = paper("p1", "Attention Models");
    upsertPaperIndex(db, p);
    indexPaperText(db, p, "We study transformers.", "注意機構を研究する。");
    await native.index.flush();

    expect(native.docs.get("p1")?.original).toContain("transformers");
    expect(db.get("SELECT count(*) AS n FROM papers_fts")?.n).toBe(0);
    expect(await searchPaperIds(db, "transformers")).toEqual(["p1"]);
    expect(await searchPaperIds(db, "注意機構")).toEqual(["p1"]);
  });

  it("drops trashed papers from results and deletes rows with the paper", async () => {
    const db = await openSqlite(createMemoryFileSystem());
    const native = fakeNative();
    setNativeSearchIndex(native.index);
    for (const id of ["a", "b"]) {
      const p = paper(id, `Robotics ${id}`);
      upsertPaperIndex(db, p);
      indexPaperText(db, p, "robot arms", "");
    }
    setPaperTrashedAt(db, "a", now);
    expect(await searchPaperIds(db, "robot")).toEqual(["b"]);
    deletePaperIndex(db, "b");
    await native.index.flush();
    expect([...native.docs.keys()]).toEqual(["a"]);
  });

  it("refreshes an annotation without resending the body", async () => {
    const db = await openSqlite(createMemoryFileSystem());
    const native = fakeNative();
    setNativeSearchIndex(native.index);
    const p = paper("p1", "Title");
    upsertPaperIndex(db, p);
    indexPaperText(db, p, "body text", "");
    saveAnnotationRow(db, {
      id: "n1",
      paperId: "p1",
      workspaceNodeId: null,
      blockId: "b1",
      startOffset: 0,
      endOffset: 4,
      selectedText: "body",
      prefixContext: "",
      suffixContext: "",
      translationTextHash: "x",
      note: "zebra crossing",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    refreshPaperAnnotationFts(db, "p1");
    expect(await searchPaperIds(db, "zebra")).toEqual(["p1"]);
    expect(native.calls).toContain("search_index_set_meta");
    expect(native.docs.get("p1")?.original).toContain("body text");
  });

  it("moves sql.js rows over once, re-indexes missing papers, and removes orphans", async () => {
    const fs = createMemoryFileSystem();
    const db = await openSqlite(fs);
    // A library from before the native index: bodies in sql.js.
    const legacy = paper("legacy", "Legacy Paper");
    upsertPaperIndex(db, legacy);
    rebuildPaperFts(db, "legacy", { title: "Legacy Paper", authors: "", original: "old corpus", translation: "", annotation: "" });
    // A paper whose index row was lost: only its package Markdown remains.
    const lost = paper("lost", "Lost Paper");
    upsertPaperIndex(db, lost);
    await fs.writeText("papers/lost/original.md", "recovered body");
    expect(searchPapersFts(db, "old corpus")).toEqual(["legacy"]);

    const native = fakeNative();
    native.docs.set("gone", { paperId: "gone", title: "", authors: "", annotation: "", original: "x", translation: "", words: "" });
    setNativeSearchIndex(native.index);
    const result = await reconcileNativeSearchIndex(fs, db);

    expect(result).toEqual({ copied: 1, rebuilt: 1, removed: 1, droppedSqlJs: true });
    expect(db.get("SELECT count(*) AS n FROM papers_fts")?.n).toBe(0);
    expect(await searchPaperIds(db, "corpus")).toEqual(["legacy"]);
    expect(await searchPaperIds(db, "recovered")).toEqual(["lost"]);
    expect(native.docs.has("gone")).toBe(false);

    // Second launch: nothing left to do.
    expect(await reconcileNativeSearchIndex(fs, db)).toEqual({ copied: 0, rebuilt: 0, removed: 0, droppedSqlJs: false });
  });
});
