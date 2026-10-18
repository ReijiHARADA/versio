import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Paper } from "../types/paper";
import { ImportCancelledError, throwIfImportAborted } from "../services/import/cancellation";
import { shouldResumeFromIndex } from "../services/import/resumeFlag";

const importPDFV2 = vi.fn();
const translationCancel = vi.fn();

vi.mock("../services/importServiceV2", () => ({
  checkMADLADAvailability: vi.fn(async () => ({ available: true })),
  importPDFV2: (...args: unknown[]) => importPDFV2(...args),
}));

vi.mock("../services/database", () => ({
  getAllPapers: vi.fn(async () => []),
  getSetting: vi.fn(async () => ({})),
  getPaper: vi.fn(async () => null),
  savePaper: vi.fn(async () => {}),
}));

const updatePaper = vi.fn();

vi.mock("../stores/libraryCache", () => ({
  useLibraryCache: {
    getState: () => ({
      papers: [],
      addPaper: vi.fn(),
      updatePaper,
      setBlocks: vi.fn(),
      setSections: vi.fn(),
    }),
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

const translationHasQueue = vi.fn(() => false);

vi.mock("../services/translation", () => ({
  translationManager: {
    cancel: (...args: unknown[]) => translationCancel(...args),
    attach: vi.fn(),
    detach: vi.fn(),
    hasQueue: (...args: unknown[]) => translationHasQueue(...args),
  },
}));

vi.mock("uuid", () => ({ v4: () => "job-cancel-1" }));

import {
  cancelBackgroundImport,
  cancelPaperWork,
  startBackgroundImport,
} from "../services/import/startBackgroundImport";
import { resumeAbortControllers, resumingPapers } from "../services/import/session";
import { useImportJobStore } from "../stores/importJobStore";

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
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  } as Paper;
}

describe("ImportCancelledError / throwIfImportAborted", () => {
  it("ImportCancelledError carries paperId and partialReady", () => {
    const error = new ImportCancelledError("stopped", {
      paperId: "p-1",
      partialReady: true,
    });
    expect(error.name).toBe("ImportCancelledError");
    expect(error.message).toBe("stopped");
    expect(error.paperId).toBe("p-1");
    expect(error.partialReady).toBe(true);
  });

  it("throwIfImportAborted no-ops when signal is missing or not aborted", () => {
    expect(() => throwIfImportAborted(undefined)).not.toThrow();
    expect(() => throwIfImportAborted(new AbortController().signal)).not.toThrow();
  });

  it("throwIfImportAborted throws ImportCancelledError when aborted", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() =>
      throwIfImportAborted(controller.signal, { paperId: "p-2", partialReady: false })
    ).toThrow(ImportCancelledError);
    try {
      throwIfImportAborted(controller.signal, { paperId: "p-2", partialReady: false });
    } catch (error) {
      expect(error).toBeInstanceOf(ImportCancelledError);
      expect((error as ImportCancelledError).paperId).toBe("p-2");
      expect((error as ImportCancelledError).partialReady).toBe(false);
    }
  });
});

describe("cancelBackgroundImport", () => {
  beforeEach(() => {
    useImportJobStore.setState({ jobs: [] });
    importPDFV2.mockReset();
    translationCancel.mockReset();
  });

  it("sets cancel_requested and aborts the import controller", async () => {
    let seenSignal: AbortSignal | undefined;
    const importStarted = new Promise<void>((resolve) => {
      importPDFV2.mockImplementation(async (_file: File, callbacks: { signal?: AbortSignal }) => {
        seenSignal = callbacks.signal;
        resolve();
        await new Promise<never>((_, reject) => {
          callbacks.signal?.addEventListener("abort", () => {
            reject(new ImportCancelledError("Import cancelled", { partialReady: false }));
          });
        });
      });
    });

    const file = new File([new Uint8Array([1, 2, 3])], "sample.pdf", { type: "application/pdf" });
    await expect(startBackgroundImport(file)).resolves.toBe(true);
    await importStarted;

    expect(cancelBackgroundImport("job-cancel-1")).toBe(true);
    expect(useImportJobStore.getState().jobs[0]?.stage).toBe("cancel_requested");
    expect(seenSignal?.aborted).toBe(true);

    // Second request is idempotent after cancel_requested.
    expect(cancelBackgroundImport("job-cancel-1")).toBe(false);

    await vi.waitFor(() => {
      expect(useImportJobStore.getState().jobs).toHaveLength(0);
    });
  });

  it("returns false for unknown or terminal jobs", () => {
    expect(cancelBackgroundImport("missing")).toBe(false);
    useImportJobStore.getState().upsertJob({
      id: "done",
      fileName: "a.pdf",
      fileKey: "a.pdf:1:1",
      stage: "completed",
      stageProgress: 1,
      stageTotal: 1,
      message: "完了",
    });
    expect(cancelBackgroundImport("done")).toBe(false);
  });

  it("completion vs cancel race: completed job ignores late cancel", async () => {
    importPDFV2.mockImplementation(async () => ({
      paper: paper("p-done", "ready", false),
      sections: [],
      blocks: [],
    }));
    const file = new File([new Uint8Array([1, 2, 3])], "done.pdf", { type: "application/pdf" });
    await expect(startBackgroundImport(file)).resolves.toBe(true);
    await vi.waitFor(() => {
      const job = useImportJobStore.getState().jobs.find((j) => j.id === "job-cancel-1");
      expect(job?.stage === "completed" || !job).toBe(true);
    });
    expect(cancelBackgroundImport("job-cancel-1")).toBe(false);
  });
});

describe("cancel clears resume eligibility", () => {
  it("shouldResumeFromIndex is false when needsTranslationResume=false (cancel path)", () => {
    // After cooperative cancel on a partial-ready paper, import sets
    // needsTranslationResume=false so server-ready resume does not auto-restart.
    expect(shouldResumeFromIndex(paper("cancelled-partial", "partial", false))).toBe(false);
    expect(shouldResumeFromIndex(paper("cancelled-ready", "ready", false))).toBe(false);
    expect(shouldResumeFromIndex(paper("still-needs", "partial", true))).toBe(true);
  });
});

describe("cancelPaperWork", () => {
  beforeEach(() => {
    useImportJobStore.setState({ jobs: [] });
    translationCancel.mockReset();
    translationHasQueue.mockReset();
    translationHasQueue.mockReturnValue(false);
    updatePaper.mockReset();
    resumeAbortControllers.clear();
    resumingPapers.clear();
  });

  it("cancels a hidden import job by paperId and flips the paper card to partial", () => {
    useImportJobStore.getState().upsertJob({
      id: "job-hidden",
      fileName: "a.pdf",
      fileKey: "a.pdf:1:1",
      stage: "translating",
      stageProgress: 3,
      stageTotal: 10,
      message: "翻訳中...",
      paperId: "paper-visible",
    });
    // After partial-ready the ImportJobCard is hidden, but the job remains in
    // the store so PaperMenu can cancel via paperId.
    expect(cancelPaperWork("paper-visible")).toBe(true);
    expect(useImportJobStore.getState().jobs[0]?.stage).toBe("cancel_requested");
    expect(translationCancel).toHaveBeenCalledWith("paper-visible");
    expect(updatePaper).toHaveBeenCalledWith(
      "paper-visible",
      expect.objectContaining({
        processingStatus: "partial",
        needsTranslationResume: false,
      })
    );
  });

  it("aborts an active resume run when no import job exists", () => {
    const controller = new AbortController();
    resumeAbortControllers.set("paper-resume", controller);
    resumingPapers.add("paper-resume");
    translationHasQueue.mockReturnValue(true);

    expect(cancelPaperWork("paper-resume")).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(translationCancel).toHaveBeenCalledWith("paper-resume");
    expect(updatePaper).toHaveBeenCalledWith(
      "paper-resume",
      expect.objectContaining({
        processingStatus: "partial",
        needsTranslationResume: false,
      })
    );
  });

  it("returns false when nothing is running", () => {
    expect(cancelPaperWork("idle-paper")).toBe(false);
    expect(translationCancel).not.toHaveBeenCalled();
  });
});
