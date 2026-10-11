import { describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { projectionToPackage } from "../../data/package/fromProjection";
import { persistPaperPackage } from "../../data/package/persist";
import {
  listPackagePaperIds,
  syncPaperIndexesFromPackages,
} from "../../data/package/syncIndex";
import { getAllPaperIndexes, upsertPaperIndex } from "../../data/repositories/paperRepository";
import { openSqlite, SQLITE_PATH } from "../../data/sqlite/client";
import type { Paper, PaperBlock, Section } from "../../types/paper";

const now = "2026-10-10T00:00:00.000Z";

function samplePaper(id: string): Paper {
  return {
    id,
    sourceFilePath: `${id}.pdf`,
    sourceFileHash: `hash-${id}`,
    titleOriginal: `Title ${id}`,
    titleTranslated: `題名 ${id}`,
    authors: ["Ada"],
    publication: null,
    year: 2026,
    pageCount: 1,
    processingStatus: "ready",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("sqlite persist safety", () => {
  it("keeps a .bak and recovers when library.sqlite is corrupt", async () => {
    const fs = createMemoryFileSystem();
    const db = await openSqlite(fs);
    upsertPaperIndex(db, samplePaper("p1"));
    await db.persist();
    // Second persist moves the previous live file to .bak.
    upsertPaperIndex(db, { ...samplePaper("p1"), titleTranslated: "更新" });
    await db.persist();

    const good = await fs.readBytes(SQLITE_PATH);
    expect(good && good.byteLength > 100).toBe(true);
    expect(await fs.exists(`${SQLITE_PATH}.bak`)).toBe(true);

    await fs.writeBytes(SQLITE_PATH, new TextEncoder().encode("not-a-sqlite-file".padEnd(120, "x")));
    await db.close();

    const recovered = await openSqlite(fs);
    expect(getAllPaperIndexes(recovered).map((p) => p.id)).toEqual(["p1"]);
  });

  it("reindexes orphan Paper Packages missing from library.sqlite", async () => {
    const fs = createMemoryFileSystem();
    const paper = samplePaper("orphan-1");
    const sections: Section[] = [
      {
        id: "s1",
        paperId: paper.id,
        parentSectionId: null,
        order: 0,
        level: 1,
        originalTitle: "Abstract",
        translatedTitle: "概要",
        normalizedKind: "abstract",
      },
    ];
    const blocks: PaperBlock[] = [
      {
        id: "b1",
        paperId: paper.id,
        sectionId: "s1",
        type: "paragraph",
        order: 0,
        pageStart: 1,
        pageEnd: 1,
        original: "Hello",
        translated: "こんにちは",
        extractionConfidence: 1,
        translationStatus: "completed",
        parentBlockId: null,
        boundingBoxes: [],
        metadata: {},
      },
    ];
    await persistPaperPackage(fs, projectionToPackage({ paper, sections, blocks, revision: 0 }));

    const db = await openSqlite(fs);
    expect(getAllPaperIndexes(db)).toHaveLength(0);

    const rebuilt = await syncPaperIndexesFromPackages(fs, db);
    expect(rebuilt).toBeGreaterThanOrEqual(1);
    expect(getAllPaperIndexes(db).map((p) => p.id)).toEqual(["orphan-1"]);
  });

  it("listPackagePaperIds ignores tmp/bak leftovers", () => {
    expect(
      listPackagePaperIds([
        "papers/a/paper.json",
        "papers/a.bak/paper.json",
        "papers/a.tmp/paper.json",
        "papers/b/original.md",
      ])
    ).toEqual(["a"]);
  });
});
