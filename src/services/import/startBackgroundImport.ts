import { resumeIncompleteTranslation } from "./resume";
import { classifyImportFailure } from "./classifyFailure";
import { showToast } from "../../stores/toastStore";
import { useImportJobStore, type ImportJob } from "../../stores/importJobStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import type { Paper, PaperBlock, Section } from "../../types/paper";
import { upsertBlock, upsertSection } from "../../utils/mergePaperData";
import { createBlockUpdateBatcher } from "../../utils/batchBlockUpdates";
import { waitForTranslationServer } from "../../utils/serverReady";
import { getAllPapers, getSetting } from "../database";
import { addPaperToWorkspace } from "../projectService";
import {
  checkMADLADAvailability,
  importPDFV2,
  type ImportConfig,
} from "../importServiceV2";
import { ImportCancelledError } from "./cancellation";
import { v4 as uuidv4 } from "uuid";
import { translationManager } from "../translation";

const startedImportKeys = new Set<string>();
const importFiles = new Map<string, File>();
const importAbortControllers = new Map<string, AbortController>();
export const SERVER_UNAVAILABLE_MESSAGE = "翻訳サーバーに接続できません";

const blockBatcher = createBlockUpdateBatcher((id, batch) => {
  useLibraryCache
    .getState()
    .setBlocks(id, (prev) => batch.reduce((acc, block) => upsertBlock(acc, block), prev));
});

function fileKeyOf(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function isServerUnavailableMessage(message: string | undefined): boolean {
  return Boolean(message && message.includes(SERVER_UNAVAILABLE_MESSAGE));
}

function libraryTranslationCallbacks() {
  return {
    onBlockTranslated: (block: PaperBlock) => {
      blockBatcher.push(block);
    },
    onPaperUpdated: (paper: Paper) => {
      useLibraryCache.getState().addPaper(paper);
      useLibraryCache.getState().updatePaper(paper.id, paper);
    },
    onSectionTranslated: (section: Section) => {
      useLibraryCache
        .getState()
        .setSections(section.paperId, (prev) => upsertSection(prev, section));
    },
  };
}

export async function shouldResumePaperAfterServerReady(paper: Paper): Promise<boolean> {
  // Index metadata only — never open sections/blocks/package for completed papers.
  const { shouldResumeFromIndex } = await import("./resumeFlag");
  return shouldResumeFromIndex(paper);
}

async function attachToWorkspace(nodeId: string, paperId: string): Promise<void> {
  try {
    const link = await addPaperToWorkspace(nodeId, paperId);
    useProjectStore.getState().upsertMembership(link);
  } catch (error) {
    if (error instanceof Error && error.message.includes("すでに")) return;
    console.error("Failed to add imported paper to project:", error);
    showToast({ kind: "error", message: "論文はライブラリに保存しましたが、指定先への配置に失敗しました" });
  }
}

/** Wait for MADLAD instead of failing the job while the sidecar is still booting. */
async function ensureMadladReady(
  jobId: string,
  patch: (id: string, next: Partial<ImportJob>) => void,
  signal?: AbortSignal
): Promise<boolean> {
  const first = await checkMADLADAvailability();
  if (first.available) return true;

  patch(jobId, {
    stage: "reading",
    message: "翻訳サーバーの起動を待っています...",
    error: undefined,
  });

  try {
    await waitForTranslationServer({
      signal,
      onProgress: (attempt, health) => {
        const phaseMsg = health?.message;
        patch(jobId, {
          stage: "reading",
          message:
            phaseMsg ||
            (attempt > 5
              ? `翻訳サーバーの起動を待っています…（${attempt}秒）`
              : "翻訳サーバーの起動を待っています..."),
        });
      },
    });
    const again = await checkMADLADAvailability();
    return again.available;
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && /abort/i.test(error.message))) {
      throw new ImportCancelledError("Import cancelled while waiting for translation server", {
        partialReady: true,
      });
    }
    return false;
  }
}

async function runImport(jobId: string, file: File, fileKey: string, workspaceNodeId?: string): Promise<void> {
  const patch = useImportJobStore.getState().patchJob;
  // Extraction proceeds without waiting for the translation model.
  const settings = await getSetting<ImportConfig>("translationSettingsV2");
  let attached = false;
  let duplicatePaperId: string | undefined;
  const controller = importAbortControllers.get(jobId) ?? new AbortController();
  importAbortControllers.set(jobId, controller);

  try {
    const result = await importPDFV2(
      file,
      {
        signal: controller.signal,
        waitForTranslationEngine: async (signal) => {
          patch(jobId, {
            stage: "translating",
            message: "翻訳モデルの準備を待っています...",
            error: undefined,
          });
          return ensureMadladReady(jobId, patch, signal ?? controller.signal);
        },
        onProgress: (next) => {
          if (
            next.paper &&
            (next.message.includes("既にインポート") ||
              next.message.toLowerCase().includes("already imported"))
          ) {
            duplicatePaperId = next.paper.id;
            patch(jobId, {
              stage: "duplicate",
              failureKind: "duplicate",
              existingPaperId: next.paper.id,
              message: next.message,
              error: next.message,
              stageProgress: 1,
              stageTotal: 1,
            });
            return;
          }
          const progressPatch = {
            stage: next.stage,
            stageProgress: next.stageProgress,
            stageTotal: next.stageTotal,
            message: next.message,
            error: next.error,
            ...(next.paper ? { paperId: next.paper.id } : {}),
          };
          // Most progress events do not carry the paper. Once partial-ready has
          // materialized the real card, do not clear its id and resurrect the
          // temporary import card on the next progress event.
          patch(jobId, progressPatch);
          if (next.stage === "completed" && next.paper) {
            useLibraryCache.getState().addPaper(next.paper);
            if (workspaceNodeId && !attached) {
              attached = true;
              void attachToWorkspace(workspaceNodeId, next.paper.id);
            }
          }
        },
        onStageChange: (stage) => {
          patch(jobId, { stage });
        },
        onPartialReady: (paper, sections, blocks) => {
          useLibraryCache.getState().addPaper(paper);
          useLibraryCache.getState().setSections(paper.id, sections);
          useLibraryCache.getState().setBlocks(paper.id, blocks);
          patch(jobId, { paperId: paper.id });
          if (workspaceNodeId && !attached) {
            attached = true;
            void attachToWorkspace(workspaceNodeId, paper.id);
          }
        },
        onBlockTranslated: (block) => {
          blockBatcher.push(block);
        },
        onPaperUpdated: (paper) => {
          useLibraryCache.getState().updatePaper(paper.id, paper);
        },
        onSectionTranslated: (section) => {
          useLibraryCache
            .getState()
            .setSections(section.paperId, (prev) => upsertSection(prev, section));
        },
      },
      settings || {}
    );

    if (result) {
      importFiles.delete(jobId);
      importAbortControllers.delete(jobId);
      useLibraryCache.getState().addPaper(result.paper);
      useLibraryCache.getState().setSections(result.paper.id, result.sections);
      useLibraryCache.getState().setBlocks(result.paper.id, result.blocks);
      patch(jobId, { paperId: result.paper.id, stage: "completed" });
      if (workspaceNodeId && !attached) {
        attached = true;
        void attachToWorkspace(workspaceNodeId, result.paper.id);
      }
      return;
    }

    startedImportKeys.delete(fileKey);
    importFiles.delete(jobId);
    importAbortControllers.delete(jobId);
    useImportJobStore.getState().patchJob(jobId, {
      stage: "duplicate",
      failureKind: "duplicate",
      existingPaperId: duplicatePaperId,
      message: "このPDFは既にインポートされています",
      error: "このPDFは既にインポートされています",
      stageProgress: 1,
      stageTotal: 1,
    });
  } catch (error) {
    startedImportKeys.delete(fileKey);
    importAbortControllers.delete(jobId);
    if (error instanceof ImportCancelledError) {
      const job = useImportJobStore.getState().jobs.find((item) => item.id === jobId);
      if (error.partialReady || job?.paperId) {
        patch(jobId, {
          stage: "cancelled",
          message: "インポートを中断しました（原文は利用できます）",
          error: undefined,
        });
        // Drop transient card; paper card owns the partial paper.
        if (job?.paperId) {
          useImportJobStore.getState().removeJob(jobId);
          importFiles.delete(jobId);
        }
      } else {
        importFiles.delete(jobId);
        useImportJobStore.getState().removeJob(jobId);
      }
      showToast({ kind: "info", message: "インポートをキャンセルしました" });
      return;
    }
    const message = error instanceof Error ? error.message : "読み込みに失敗しました";
    const classified = classifyImportFailure(message);
    patch(jobId, {
      stage: "failed",
      error: message,
      message: classified.title,
      failureKind: classified.kind,
    });
    showToast({ kind: "error", message: classified.title });
  }
}

export async function startBackgroundImport(
  file: File,
  options?: { workspaceNodeId?: string }
): Promise<boolean> {
  const looksPdf = file.type.includes("pdf") || file.name.toLowerCase().split("?")[0].endsWith(".pdf");
  if (!looksPdf) {
    showToast({ kind: "error", message: "PDF形式ではありません" });
    return false;
  }

  const fileKey = fileKeyOf(file);
  if (
    startedImportKeys.has(fileKey) ||
    useImportJobStore.getState().jobs.some((job) => job.fileKey === fileKey)
  ) {
    return false;
  }
  startedImportKeys.add(fileKey);

  const jobId = uuidv4();
  importFiles.set(jobId, file);
  importAbortControllers.set(jobId, new AbortController());
  useImportJobStore.getState().upsertJob({
    id: jobId,
    fileName: file.name,
    fileKey,
    workspaceNodeId: options?.workspaceNodeId,
    stage: "reading",
    stageProgress: 0,
    stageTotal: 1,
    message: "読み込み中...",
  });
  showToast({ kind: "success", message: "PDFを追加しました" });
  void runImport(jobId, file, fileKey, options?.workspaceNodeId);
  return true;
}


/** Retry a transient import failure while the original File is still available. */
export async function retryBackgroundImport(jobId: string): Promise<boolean> {
  const job = useImportJobStore.getState().jobs.find((item) => item.id === jobId);
  const file = importFiles.get(jobId);
  if (!job || !file) {
    showToast({ kind: "error", message: "元のPDFを保持できないため、もう一度追加してください" });
    return false;
  }
  if (startedImportKeys.has(job.fileKey)) return false;
  startedImportKeys.add(job.fileKey);
  importAbortControllers.set(jobId, new AbortController());
  useImportJobStore.getState().patchJob(jobId, {
    stage: "reading",
    stageProgress: 0,
    stageTotal: 1,
    message: "再試行中...",
    error: undefined,
  });
  void runImport(jobId, file, job.fileKey, job.workspaceNodeId);
  return true;
}

/**
 * Request cancel of a running import. Stops at the next safe checkpoint.
 * Idempotent: repeated calls are ignored after the first request.
 */
export function cancelBackgroundImport(jobId: string): boolean {
  const job = useImportJobStore.getState().jobs.find((item) => item.id === jobId);
  if (!job) return false;
  if (
    job.stage === "completed" ||
    job.stage === "failed" ||
    job.stage === "duplicate" ||
    job.stage === "cancelled" ||
    job.stage === "cancel_requested"
  ) {
    return false;
  }
  useImportJobStore.getState().patchJob(jobId, {
    stage: "cancel_requested",
    message: "キャンセルしています...",
  });
  const controller = importAbortControllers.get(jobId);
  if (controller && !controller.signal.aborted) {
    controller.abort();
  }
  if (job.paperId) {
    translationManager.cancel(job.paperId);
  }
  return true;
}

/** Dismiss a pre-persistence import failure without touching saved papers. */
export function dismissBackgroundImport(jobId: string): void {
  importFiles.delete(jobId);
  importAbortControllers.delete(jobId);
  useImportJobStore.getState().removeJob(jobId);
}

/** Resume a saved paper whose translation was interrupted or failed. */
export async function retryPaperTranslation(paperId: string): Promise<boolean> {
  const madlad = await checkMADLADAvailability();
  if (!madlad.available) {
    showToast({ kind: "error", message: SERVER_UNAVAILABLE_MESSAGE });
    return false;
  }
  try {
    await resumeIncompleteTranslation(paperId, libraryTranslationCallbacks());
    showToast({ kind: "success", message: "翻訳を再試行しました" });
    return true;
  } catch (error) {
    console.error("Failed to resume translation:", error);
    showToast({ kind: "error", message: "翻訳の再試行に失敗しました" });
    return false;
  }
}

/**
 * After the sidecar becomes reachable, retry imports that failed only because
 * the server was down, and quietly resume incomplete saved translations.
 */
export function resumeAfterTranslationServerReady(): void {
  const failedJobs = useImportJobStore
    .getState()
    .jobs.filter(
      (job) =>
        job.stage === "failed" &&
        isServerUnavailableMessage(job.error ?? job.message) &&
        importFiles.has(job.id)
    );
  for (const job of failedJobs) {
    void retryBackgroundImport(job.id);
  }

  const settingsPromise = getSetting<ImportConfig>("translationSettingsV2");
  const callbacks = libraryTranslationCallbacks();
  void (async () => {
    const settings = (await settingsPromise) || {};
    const cached = useLibraryCache.getState().papers;
    const saved = await getAllPapers();
    const byId = new Map([...cached, ...saved].map((paper) => [paper.id, paper]));
    // Metadata-only filter: completed papers with needsTranslationResume=false never open packages.
    for (const paper of byId.values()) {
      if (!(await shouldResumePaperAfterServerReady(paper))) continue;
      void resumeIncompleteTranslation(paper.id, callbacks, settings);
    }
  })().catch((error) => {
    console.error("Failed to resume translations after server ready:", error);
  });
}
