import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Paper } from "../types/paper";
import { shouldResumeFromIndex } from "../services/import/resumeFlag";
import {
  packageLoadMetrics,
  resetPackageLoadMetrics,
} from "../data/package/persist";

const blocksByPaper = new Map<string, unknown[]>();
const sectionsByPaper = new Map<string, unknown[]>();

vi.mock("../services/database", () => ({
  getAllPapers: vi.fn(async () => []),
  getBlocksByPaper: vi.fn(async (paperId: string) => {
    blocksByPaper.set(paperId, [...(blocksByPaper.get(paperId) ?? []), "read"]);
    return [];
  }),
  getSectionsByPaper: vi.fn(async (paperId: string) => {
    sectionsByPaper.set(paperId, [...(sectionsByPaper.get(paperId) ?? []), "read"]);
    return [];
  }),
  getSetting: vi.fn(async () => ({})),
}));

vi.mock("../stores/libraryCache", () => ({
  useLibraryCache: {
    getState: () => ({
      papers: [],
      addPaper: vi.fn(),
      updatePaper: vi.fn(),
      setBlocks: vi.fn(),
      setSections: vi.fn(),
    }),
  },
}));

vi.mock("../stores/importJobStore", () => ({
  useImportJobStore: {
    getState: () => ({ jobs: [], patchJob: vi.fn(), removeJob: vi.fn(), upsertJob: vi.fn() }),
  },
}));

vi.mock("../stores/projectStore", () => ({
  useProjectStore: { getState: () => ({ upsertMembership: vi.fn() }) },
}));

vi.mock("../stores/toastStore", () => ({
  showToast: vi.fn(),
}));

vi.mock("../utils/batchBlockUpdates", () => ({
  createBlockUpdateBatcher: () => ({ push: vi.fn(), flush: vi.fn() }),
}));

vi.mock("uuid", () => ({ v4: () => "test-id" }));

import { shouldResumePaperAfterServerReady } from "../services/import/startBackgroundImport";

function paper(
  id: string,
  processingStatus: Paper["processingStatus"],
  needsTranslationResume?: boolean
): Paper {
  return {
    id,
    sourceFilePath: `${id}.pdf`,
    sourceFileHash: id,
    titleOriginal: "A Complete Paper",
    titleTranslated: "完全な論文",
    processingStatus,
    needsTranslationResume,
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-09-13T00:00:00.000Z",
  } as Paper;
}

describe("server-ready translation resume selection", () => {
  beforeEach(() => {
    blocksByPaper.clear();
    sectionsByPaper.clear();
    resetPackageLoadMetrics();
  });

  it.each(["translating", "queued", "glossary", "partial", "failed"] as const)(
    "resumes saved papers in active %s state via metadata",
    async (status) => {
      await expect(shouldResumePaperAfterServerReady(paper(`p-${status}`, status))).resolves.toBe(
        true
      );
      expect(blocksByPaper.has(`p-${status}`)).toBe(false);
      expect(sectionsByPaper.has(`p-${status}`)).toBe(false);
    }
  );

  it("does not resume a completed paper with needsTranslationResume=false", async () => {
    await expect(
      shouldResumePaperAfterServerReady(paper("p-ready-complete", "ready", false))
    ).resolves.toBe(false);
  });

  it("resumes a ready paper only when the resume flag is set", async () => {
    await expect(
      shouldResumePaperAfterServerReady(paper("p-ready-flag", "ready", true))
    ).resolves.toBe(true);
    await expect(
      shouldResumePaperAfterServerReady(paper("p-ready-no-flag", "ready", false))
    ).resolves.toBe(false);
  });

  it("does not open body/package for 100 completed papers during resume selection", async () => {
    const completed = Array.from({ length: 100 }, (_, i) =>
      paper(`ready-${i}`, "ready", false)
    );
    resetPackageLoadMetrics();
    const results = await Promise.all(
      completed.map((item) => shouldResumePaperAfterServerReady(item))
    );
    expect(results.every((value) => value === false)).toBe(true);
    expect(packageLoadMetrics.documentReads).toBe(0);
    expect(packageLoadMetrics.sourcePdfReads).toBe(0);
    expect(packageLoadMetrics.assetReads).toBe(0);
    expect([...blocksByPaper.keys()]).toEqual([]);
    expect([...sectionsByPaper.keys()]).toEqual([]);
  });

  it("shouldResumeFromIndex never requires sections/blocks", () => {
    expect(shouldResumeFromIndex(paper("a", "ready", false))).toBe(false);
    expect(shouldResumeFromIndex(paper("b", "translating"))).toBe(true);
  });
});
