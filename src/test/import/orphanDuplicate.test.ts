import { beforeEach, describe, expect, it } from "vitest";
import { resetStorageForTests, getStorage } from "../../data/runtime";
import { upsertPaperIndex, getPaperIndexByHash } from "../../data/repositories/paperRepository";
import { findDuplicatePaper } from "../../services/import/duplicate";
import type { Paper } from "../../types/paper";

const now = "2026-10-11T00:00:00.000Z";

function makePaper(id: string, hash: string): Paper {
  return {
    id,
    sourceFilePath: `${id}.pdf`,
    sourceFileHash: hash,
    titleOriginal: `Title ${id}`,
    titleTranslated: null,
    authors: [],
    publication: null,
    year: null,
    pageCount: 1,
    processingStatus: "failed",
    lastReadBlockId: null,
    lastReadOffset: null,
    favorite: false,
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
  };
}

describe("orphan hash duplicate reclaim", () => {
  beforeEach(async () => {
    await resetStorageForTests();
  });

  it("clears an index row without a package so the same PDF can re-import", async () => {
    const { db } = await getStorage();
    const hash = "orphan-hash-1";
    upsertPaperIndex(db, makePaper("orphan-paper", hash));
    expect(getPaperIndexByHash(db, hash)?.id).toBe("orphan-paper");

    const duplicate = await findDuplicatePaper(hash);
    expect(duplicate).toBeUndefined();
    expect(getPaperIndexByHash(db, hash)).toBeUndefined();
  });

  it("keeps trashed papers as duplicates even without a package", async () => {
    const { db } = await getStorage();
    const hash = "trashed-hash-1";
    upsertPaperIndex(db, { ...makePaper("trashed-paper", hash), trashedAt: now });

    const duplicate = await findDuplicatePaper(hash);
    expect(duplicate?.id).toBe("trashed-paper");
    expect(getPaperIndexByHash(db, hash)?.id).toBe("trashed-paper");
  });
});
