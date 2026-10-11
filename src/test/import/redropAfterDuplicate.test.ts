import { beforeEach, describe, expect, it, vi } from "vitest";

const importPDFV2 = vi.fn(async () => null);

vi.mock("../../utils/serverReady", () => ({
  waitForTranslationServer: vi.fn(async () => true),
  isTauriApp: () => false,
}));

vi.mock("../../services/importServiceV2", () => ({
  checkMADLADAvailability: vi.fn(async () => ({ available: true })),
  importPDFV2: (...args: unknown[]) => importPDFV2(...args),
}));

vi.mock("../../stores/toastStore", () => ({
  showToast: vi.fn(),
}));

vi.mock("../../services/database", async () => {
  const actual = await vi.importActual<typeof import("../../services/database")>(
    "../../services/database"
  );
  return {
    ...actual,
    getSetting: vi.fn(async () => null),
    getAllPapers: vi.fn(async () => []),
  };
});

describe("re-drop after duplicate job", () => {
  beforeEach(async () => {
    importPDFV2.mockClear();
    const { useImportJobStore } = await import("../../stores/importJobStore");
    useImportJobStore.setState({ jobs: [] });
  });

  it("clears a finished duplicate job so the same PDF can be dropped again", async () => {
    const { useImportJobStore } = await import("../../stores/importJobStore");
    const { startBackgroundImport } = await import("../../services/import/startBackgroundImport");
    const fileKey = "2686612.2686699.pdf:100:1";
    useImportJobStore.setState({
      jobs: [
        {
          id: "old-dup",
          fileName: "2686612.2686699.pdf",
          fileKey,
          stage: "duplicate",
          stageProgress: 1,
          stageTotal: 1,
          message: "このPDFは既にインポートされています",
          failureKind: "duplicate",
        },
      ],
    });

    const file = {
      name: "2686612.2686699.pdf",
      size: 100,
      lastModified: 1,
      type: "application/pdf",
    } as File;

    const started = await startBackgroundImport(file);
    expect(started).toBe(true);
    expect(useImportJobStore.getState().jobs.some((job) => job.id === "old-dup")).toBe(false);
    expect(useImportJobStore.getState().jobs.some((job) => job.fileKey === fileKey)).toBe(true);
  });
});
