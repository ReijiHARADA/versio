import { describe, expect, it } from "vitest";
import { createLibraryBackupSnapshot } from "../../data/backup/createBackup";
import { restoreLibraryBackup } from "../../data/backup/restoreBackup";
import { validateLibraryBackup } from "../../data/backup/validateBackup";
import {
  BACKUP_MANIFEST_NAME,
  BACKUP_PAPERS_DIR,
  BACKUP_SQLITE_NAME,
  createBackupManifest,
} from "../../data/backup/types";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { projectionToPackage } from "../../data/package/fromProjection";
import { persistPaperPackage } from "../../data/package/persist";
import { PACKAGE_SCHEMA_VERSION, SQLITE_SCHEMA_VERSION } from "../../data/schemaVersion";
import { openSqlite } from "../../data/sqlite/client";
import type { Paper, PaperBlock, Section } from "../../types/paper";

const now = "2026-09-15T00:00:00.000Z";

function makePaper(id: string): {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
} {
  const paper: Paper = {
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
  const sections: Section[] = [
    {
      id: `${id}-s1`,
      paperId: id,
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
      id: `${id}-b1`,
      paperId: id,
      sectionId: `${id}-s1`,
      type: "paragraph",
      order: 0,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [],
      original: `Body for ${id}`,
      translated: `本文 ${id}`,
      extractionConfidence: 1,
      translationStatus: "completed",
      parentBlockId: null,
      metadata: {},
    },
  ];
  return { paper, sections, blocks };
}

async function seedSqlite(fs: ReturnType<typeof createMemoryFileSystem>, markerId?: string) {
  const db = await openSqlite(fs);
  if (markerId) {
    db.exec(
      "INSERT INTO papers (id, source_file_hash, processing_status, created_at, updated_at) VALUES (?, ?, 'ready', ?, ?)",
      [markerId, `hash-${markerId}`, now, now]
    );
  }
  await db.persist();
  await db.close();
  return (await fs.readBytes("library.sqlite"))!;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

describe("library backup / restore", () => {
  it("createLibraryBackupSnapshot writes backup.json, library.sqlite, and papers/", async () => {
    const fs = createMemoryFileSystem();
    await seedSqlite(fs);
    await persistPaperPackage(fs, projectionToPackage(makePaper("paper-1")));

    const result = await createLibraryBackupSnapshot(fs, {
      appVersion: "0.0.0-test",
      stagingRoot: "_backup_staging",
      finalRoot: "_backup",
    });

    expect(result.paperCount).toBe(1);
    expect(await fs.exists(`_backup/${BACKUP_MANIFEST_NAME}`)).toBe(true);
    expect(await fs.exists(`_backup/${BACKUP_SQLITE_NAME}`)).toBe(true);
    expect(await fs.exists(`_backup/${BACKUP_PAPERS_DIR}/paper-1/paper.json`)).toBe(true);

    const full = await validateLibraryBackup(fs, "_backup");
    expect(full.ok, full.errors.join("; ")).toBe(true);
  });

  it("validateLibraryBackup rejects missing backup.json", async () => {
    const fs = createMemoryFileSystem();
    const sqlite = await seedSqlite(fs);
    await fs.writeBytes("_bad/library.sqlite", sqlite);

    const result = await validateLibraryBackup(fs, "_bad", { skipPackageBodies: true });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("backup.json"))).toBe(true);
  });

  it("validateLibraryBackup rejects bad sqlite header", async () => {
    const fs = createMemoryFileSystem();
    const manifest = createBackupManifest({ appVersion: "0.0.0-test", paperCount: 0 });
    await fs.writeText("_bad/backup.json", JSON.stringify(manifest));
    await fs.writeBytes("_bad/library.sqlite", new TextEncoder().encode("not-a-sqlite-file".padEnd(120, "x")));

    const result = await validateLibraryBackup(fs, "_bad", { skipPackageBodies: true });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("SQLite 形式ではありません"))).toBe(true);
  });

  it("validateLibraryBackup rejects path traversal in papers", async () => {
    const fs = createMemoryFileSystem();
    const sqlite = await seedSqlite(fs);
    const manifest = createBackupManifest({ appVersion: "0.0.0-test", paperCount: 1 });
    await fs.writeText("_bad/backup.json", JSON.stringify(manifest));
    await fs.writeBytes("_bad/library.sqlite", sqlite);
    await fs.writeText("_bad/papers/paper-1/../../escape.txt", "oops");

    const result = await validateLibraryBackup(fs, "_bad", { skipPackageBodies: true });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("path traversal") || e.includes("不正な papers"))).toBe(
      true
    );
  });

  it("validateLibraryBackup rejects future sqliteSchemaVersion", async () => {
    const fs = createMemoryFileSystem();
    const sqlite = await seedSqlite(fs);
    await fs.writeText(
      "_bad/backup.json",
      JSON.stringify({
        formatVersion: 1,
        appVersion: "0.0.0-test",
        sqliteSchemaVersion: SQLITE_SCHEMA_VERSION + 1,
        packageSchemaVersion: PACKAGE_SCHEMA_VERSION,
        createdAt: now,
        paperCount: 0,
      })
    );
    await fs.writeBytes("_bad/library.sqlite", sqlite);

    const result = await validateLibraryBackup(fs, "_bad", { skipPackageBodies: true });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("SQLite schema") && e.includes("新しい"))).toBe(true);
  });

  it("restoreLibraryBackup replaces live library.sqlite on success", async () => {
    const fs = createMemoryFileSystem();
    const bytesA = await seedSqlite(fs, "marker-a");

    await createLibraryBackupSnapshot(fs, {
      appVersion: "0.0.0-test",
      stagingRoot: "_backup_staging",
      finalRoot: "_backup",
    });

    const bytesB = await seedSqlite(fs, "marker-b");
    expect(bytesEqual(bytesA, bytesB)).toBe(false);

    const restored = await restoreLibraryBackup(fs, {
      candidateRoot: "_backup",
      safetyRoot: "_safety",
      restoreStagingRoot: "_restore_staging",
    });
    expect(restored.restoredPaperCount).toBe(0);

    const after = (await fs.readBytes("library.sqlite"))!;
    expect(bytesEqual(after, bytesA)).toBe(true);
  });

  it("restore with failAfter: swap rolls back to previous library.sqlite", async () => {
    const fs = createMemoryFileSystem();
    const bytesLive = await seedSqlite(fs, "live-before");

    await createLibraryBackupSnapshot(fs, {
      appVersion: "0.0.0-test",
      stagingRoot: "_backup_staging",
      finalRoot: "_backup",
    });

    // Mutate live after backup so rollback target differs from candidate.
    const bytesMutated = await seedSqlite(fs, "live-mutated");
    expect(bytesEqual(bytesLive, bytesMutated)).toBe(false);

    await expect(
      restoreLibraryBackup(fs, {
        candidateRoot: "_backup",
        safetyRoot: "_safety",
        restoreStagingRoot: "_restore_staging",
        failAfter: "swap",
      })
    ).rejects.toThrow(/injected failure during swap/);

    const after = (await fs.readBytes("library.sqlite"))!;
    expect(bytesEqual(after, bytesMutated)).toBe(true);
  });

  it("invalid candidate does not change live library.sqlite", async () => {
    const fs = createMemoryFileSystem();
    const live = await seedSqlite(fs, "keep-me");
    await fs.writeText("_invalid/backup.json", "{ not json");

    await expect(
      restoreLibraryBackup(fs, {
        candidateRoot: "_invalid",
        safetyRoot: "_safety",
        restoreStagingRoot: "_restore_staging",
      })
    ).rejects.toThrow(/invalid backup/);

    const after = (await fs.readBytes("library.sqlite"))!;
    expect(bytesEqual(after, live)).toBe(true);
  });

  it("createLibraryBackupSnapshot failAfter:copy leaves finalRoot absent", async () => {
    const fs = createMemoryFileSystem();
    await seedSqlite(fs);
    await persistPaperPackage(fs, projectionToPackage(makePaper("paper-1")));

    await expect(
      createLibraryBackupSnapshot(fs, {
        appVersion: "0.0.0-test",
        stagingRoot: "_backup_staging",
        finalRoot: "_backup",
        failAfter: "copy",
      })
    ).rejects.toThrow(/injected failure after copy/);

    expect(await fs.exists("_backup")).toBe(false);
  });

  it("createLibraryBackupSnapshot failAfter:validate does not promote finalRoot", async () => {
    const fs = createMemoryFileSystem();
    await seedSqlite(fs);
    await persistPaperPackage(fs, projectionToPackage(makePaper("paper-1")));

    await expect(
      createLibraryBackupSnapshot(fs, {
        appVersion: "0.0.0-test",
        stagingRoot: "_backup_staging",
        finalRoot: "_backup",
        failAfter: "validate",
      })
    ).rejects.toThrow(/injected failure after validate/);

    expect(await fs.exists("_backup")).toBe(false);
  });

  it("validate rejects missing paper package for declared paperCount", async () => {
    const fs = createMemoryFileSystem();
    const sqlite = await seedSqlite(fs);
    await fs.writeText(
      "_bad/backup.json",
      JSON.stringify(
        createBackupManifest({ appVersion: "0.0.0-test", paperCount: 1 }),
        null,
        2
      )
    );
    await fs.writeBytes("_bad/library.sqlite", sqlite);
    // papers/ empty — package missing

    const result = await validateLibraryBackup(fs, "_bad");
    expect(result.ok).toBe(false);
  });
});
