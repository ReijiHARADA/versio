/**
 * Paper Import Service V2
 * 
 * Uses MADLAD for translation and Ollama for LLM analysis.
 * Implements priority-based translation queue for fast Time to First Read.
 */

import { v4 as uuidv4 } from "uuid";
import { computeFileHash } from "./pdfService";
import { classifyPdfOpenError } from "./pdfOpenError";
import { extractAcademicPdf } from "./pdfExtraction/pipeline/extractAcademicPdf";
import { applyGlossary, normalizeSourceGroundedTerminology } from "./llm/glossaryService";
import { assignBlockTranslation, preserveSourceTranslation, reapplyGlossary } from "./glossary/apply";
import {
  savePaper,
  saveSections,
  updateBlock,
  getBlocksByPaper,
  saveGlossary,
  getGlossary,
  saveBenchmark,
  computeTextHash,
  getCachedTranslation,
  saveTranslationCache,
  deletePaper,
  type BenchmarkEntry,
} from "./database";
import type { Paper, Section, PaperBlock } from "../types/paper";
import { rememberDocument } from "../data/repositories/documentRepository";
import { projectionToPackage } from "../data/package/fromProjection";
import { persistPaperPackage } from "../data/package/persist";
import { getStorage } from "../data/runtime";
import {
  TranslationQueue,
  TranslationPriority,
  translationManager,
  createTranslationEngine,
  setAppleEligibleSources,
  type TranslationPriorityValue,
} from "./translation";
import {
  isPlausibleJaTranslation,
  titleTranslationComplete,
  shouldTranslateTitle,
  localizeNamedFigureCaption,
} from "./translation/quality";
import { projectSafeUnitTranslation } from "./translation/partialProjection";
import { generateGlossary } from "./llm";
import type { GlossaryEntry } from "./llm/types";
import { resolveMadladServerUrl, MADLAD_MODEL_VERSION } from "./translation/madladEngine";
import { finalizedTranslationStatus } from "./paperStatus";
import {
  isRetryableTranslationFailure,
  referenceSectionIds,
  shouldTranslateBlock,
  shouldTranslateSection,
} from "./import/policy";
import {
  DEFAULT_IMPORT_CONFIG,
  collectAppleEligibleSources,
  finalizeJapaneseLayoutOnly,
  isJapaneseLayoutOnlyPaper,
  persistUntranslatableAsSkipped,
  resolveImportConfig,
  usableCachedJa,
} from "./import/helpers";
import { acquireImportHash, activeImportPaperIds } from "./import/session";
import type { ImportCallbacks, ImportConfig } from "./import/types";
import { ImportCancelledError, throwIfImportAborted } from "./import/cancellation";
import { createPresentationDemoProjection } from "./presentationDemo";

export {
  isRetryableTranslationFailure,
  shouldTranslateBlock,
} from "./import/policy";

export type {
  ImportCallbacks,
  ImportConfig,
  ImportProgress,
  ImportStage,
} from "./import/types";
export { resumeIncompleteTranslation } from "./import/resume";
export { retryBlockTranslation } from "./import/retryBlockTranslation";

// ============================================================
// Import Service
// ============================================================

/**
 * Import a PDF with MADLAD translation and Ollama analysis.
 */
export async function importPDFV2(
  file: File,
  callbacks: ImportCallbacks,
  config: ImportConfig = {}
): Promise<{ paper: Paper; sections: Section[]; blocks: PaperBlock[] } | null> {
  const cfg = resolveImportConfig(config);
  const paperId = uuidv4();
  activeImportPaperIds.add(paperId);
  let releaseImportHash: (() => void) | undefined;

  const {
    engine: translationEngine,
    appleRouter,
    llmProviders,
  } = createTranslationEngine(cfg);

  try {
    // Stage 1: Reading file
    callbacks.onStageChange("reading");
    callbacks.onProgress({
      stage: "reading",
      stageProgress: 0,
      stageTotal: 1,
      message: "PDFファイルを読み込んでいます...",
    });
    throwIfImportAborted(callbacks.signal, { paperId, partialReady: false });

    const fileHash = await computeFileHash(file);
    throwIfImportAborted(callbacks.signal, { paperId, partialReady: false });

    // Same PDF dropped twice: wait for the first import to publish its paper,
    // then the duplicate check below reports "already imported".
    releaseImportHash = await acquireImportHash(fileHash);
    throwIfImportAborted(callbacks.signal, { paperId, partialReady: false });

    const { findDuplicatePaper } = await import("./import/duplicate");
    const existingPaper = await findDuplicatePaper(fileHash);
    if (existingPaper) {
      const inTrash = Boolean(existingPaper.trashedAt);
      callbacks.onProgress({
        stage: "completed",
        stageProgress: 1,
        stageTotal: 1,
        message: inTrash
          ? "同じ論文がゴミ箱にあります"
          : "このPDFは既にインポートされています",
        paper: existingPaper,
      });
      return null;
    }

    // Stage 2–3: native extract, classify, resolve Canonical, project, figures
    callbacks.onStageChange("extracting");
    if (cfg.presentationDemo) {
      callbacks.onProgress({ stage: "extracting", stageProgress: 1, stageTotal: 3, message: "PDFの本文と見出しを読み取っています..." });
      await new Promise((resolve) => setTimeout(resolve, 550));
      throwIfImportAborted(callbacks.signal, { paperId, partialReady: false });
      callbacks.onStageChange("structuring");
      callbacks.onProgress({ stage: "structuring", stageProgress: 2, stageTotal: 3, message: "図表・数式・引用を構造化しています..." });
      await new Promise((resolve) => setTimeout(resolve, 650));
      throwIfImportAborted(callbacks.signal, { paperId, partialReady: false });
    }
    const previousBlocks = await getBlocksByPaper(paperId);
    // Production extraction result; null only in the filming-only demo build.
    const extraction = cfg.presentationDemo
      ? null
      : await extractAcademicPdf({
      paperId,
      filePath: file.name,
      fileHash,
      file,
      // Include bounded figure/table extraction in the initial package so the
      // Reader never opens with empty media and fills it in several seconds
      // later. `extractFigureImages` has per-page and document deadlines; the
      // background enrichment path remains a retry for captions that could
      // not be rendered during this pass.
      extractFigures: true,
      previousBlocks: previousBlocks.length ? previousBlocks : undefined,
      onProgress: (progress) => {
        throwIfImportAborted(callbacks.signal, { paperId, partialReady: false });
        const stage =
          progress.stage === "figures" || progress.stage === "structuring"
            ? "structuring"
            : "extracting";
        if (progress.stage === "figures" || progress.stage === "structuring") {
          callbacks.onStageChange("structuring");
        }
        callbacks.onProgress({
          stage,
          stageProgress: progress.done,
          stageTotal: progress.total,
          message: progress.message,
        });
      },
    });
    throwIfImportAborted(callbacks.signal, { paperId, partialReady: false });

    const extracted = extraction ?? createPresentationDemoProjection(paperId, fileHash, file.name);
    const { paper, sections, blocks: extractedBlocks } = extracted;
    const { attachLinesToBlocks, layoutFileFromNative } = await import("../data/package/layoutFromExtraction");
    const blocks = extraction
      ? attachLinesToBlocks(extractedBlocks, extraction.layoutBlocks)
      : extractedBlocks;
    paper.sourceFileName = file.name;
    const sourcePdf = new Uint8Array(await file.arrayBuffer());
    paper.sourceStoredPath = `papers/${paperId}/source.pdf`;
    if (cfg.presentationDemo) {
      callbacks.onProgress({ stage: "structuring", stageProgress: 3, stageTotal: 3, message: "読みやすい表示を準備しています..." });
    }

    const preview = blocks
      .filter((b) => b.pageStart === 3 && (b.original || (b.metadata as { captionOriginal?: string }).captionOriginal))
      .slice(0, 12)
      .map((b) => {
        const caption = (b.metadata as { captionOriginal?: string }).captionOriginal;
        return `p${b.pageStart} [${b.type}/${String(b.metadata.column ?? "")}] ${(b.original || caption || "").slice(0, 140)}`;
      });
    console.info("[reading-order] page 3 preview\n" + preview.join("\n"));

    // Save initial structure. Use a provisional hash until the primary Paper
    // Package exists so a failed mid-import cannot block re-dropping the same
    // PDF via UNIQUE(source_file_hash).
    const finalSourceHash = paper.sourceFileHash;
    paper.sourceFileHash = `importing-${paperId}`;
    paper.processingStatus = cfg.presentationDemo ? "ready" : "glossary";
    // Keep the provisional index hidden while extraction is in progress, then
    // write the complete immutable package in one transaction. Building the
    // package through savePaper/saveSections/saveBlocks first used a mutable
    // cache checkpoint and then read it back to attach the source PDF/layout.
    // A document with no projected body block could therefore have no package
    // at all when that read occurred. Initial import has every required datum
    // now, so it must bypass that intermediate state.
    await savePaper(paper);
    try {
      const { fs } = await getStorage();
      const packagePaper = { ...paper, sourceFileHash: finalSourceHash };
      const pkg = projectionToPackage({
        paper: packagePaper,
        sections,
        blocks,
        layout: extraction ? layoutFileFromNative(extraction.native, blocks) : undefined,
        sourcePdf,
      });
      const persisted = await persistPaperPackage(fs, pkg);
      paper.packageRevision = persisted.revision;
    } catch (error) {
      // Do not expose the final hash/card if the immutable package was not
      // completed. The provisional index stays hidden and the import reports
      // a retryable failure instead of opening an empty Reader.
      throw new Error(`Failed to persist extraction package: ${String(error)}`);
    }
    // Make the paper discoverable only after the complete package swap above.
    paper.sourceFileHash = finalSourceHash;
    await savePaper(paper);
    releaseImportHash();
    // Cache only after the index is final. Calling savePaper with a populated
    // cache schedules another full write, which would defeat the atomic import
    // transaction above and reintroduce a transient package state.
    rememberDocument(paper, sections, blocks);

    // Notify that partial data is ready (can start viewing)
    callbacks.onPartialReady(paper, sections, blocks);
    throwIfImportAborted(callbacks.signal, { paperId, partialReady: true });

    if (cfg.presentationDemo) {
      callbacks.onStageChange("completed");
      callbacks.onProgress({
        stage: "completed", stageProgress: 1, stageTotal: 1,
        message: "デモ用の構造化表示を準備しました", paper, sections, blocks,
      });
      return { paper, sections, blocks };
    }

    if (isJapaneseLayoutOnlyPaper(paper.titleOriginal, blocks)) {
      await finalizeJapaneseLayoutOnly(paper, sections, blocks);
      callbacks.onPaperUpdated?.(paper);
      for (const block of blocks) {
        callbacks.onBlockTranslated?.(block);
      }
      callbacks.onStageChange("completed");
      callbacks.onProgress({
        stage: "completed",
        stageProgress: 1,
        stageTotal: 1,
        message: "日本語論文のため翻訳をスキップし、レイアウトのみ作成しました",
        paper,
        sections,
        blocks,
      });
      return { paper, sections, blocks };
    }

    let glossaryEntries: GlossaryEntry[] = await getGlossary(paperId);

    // Stage 4: Glossary in the background — never block translation
    if (cfg.generateGlossary && llmProviders[0]) {
      void (async () => {
        try {
          callbacks.onStageChange("glossary");
          callbacks.onProgress({
            stage: "glossary",
            stageProgress: 0,
            stageTotal: 1,
            message: "用語集を生成しています...",
          });

          const abstractSection = sections.find(
            (s) => s.normalizedKind === "abstract"
          );
          const abstractBlocks = blocks.filter(
            (b) => b.sectionId === abstractSection?.id && b.type === "paragraph"
          );
          const abstractText = abstractBlocks
            .map((b) => b.original)
            .filter(Boolean)
            .join(" ");

          const glossary = await generateGlossary(
            llmProviders[0],
            paper.titleOriginal || "",
            abstractText,
            []
          );
          await saveGlossary(paperId, glossary);
          glossaryEntries = glossary;
          const updated = await reapplyGlossary(paperId);
          if (updated.paper) {
            Object.assign(paper, updated.paper);
            callbacks.onPaperUpdated?.(updated.paper);
          }
          for (const section of updated.sections) {
            const local = sections.find((item) => item.id === section.id);
            if (local) Object.assign(local, section);
            callbacks.onSectionTranslated?.(section);
          }
          for (const block of updated.blocks) {
            const local = blocks.find((item) => item.id === block.id);
            if (local) Object.assign(local, block);
            if (block.translated) callbacks.onBlockTranslated?.(block);
          }
        } catch (e) {
          console.error("Failed to generate glossary:", e);
        }
      })();
    }

    // Stage 5: Translation with priority queue (after model is ready).
    if (callbacks.waitForTranslationEngine) {
      const engineReady = await callbacks.waitForTranslationEngine(callbacks.signal);
      throwIfImportAborted(callbacks.signal, { paperId, partialReady: true });
      if (!engineReady) {
        paper.processingStatus = "partial";
        paper.needsTranslationResume = true;
        paper.updatedAt = new Date().toISOString();
        await savePaper(paper);
        callbacks.onPaperUpdated?.(paper);
        callbacks.onStageChange("completed");
        callbacks.onProgress({
          stage: "completed",
          stageProgress: 1,
          stageTotal: 1,
          message: "原文の準備は完了しました。翻訳はモデル準備後に再開します",
          paper,
          sections,
          blocks,
        });
        return { paper, sections, blocks };
      }
    }

    callbacks.onStageChange("translating");
    paper.processingStatus = "translating";
    paper.needsTranslationResume = true;
    await savePaper(paper);
    throwIfImportAborted(callbacks.signal, { paperId, partialReady: true });

    const translationQueue = new TranslationQueue(translationEngine, {
      concurrency: cfg.translationConcurrency,
      // Transient sidecar timeouts used to become permanent Reader failures
      // because retries were disabled here. Queue-level retries release the
      // concurrency slot between attempts; quality rejects stay non-retryable.
      retryFailed: true,
      maxRetries: 2,
      retryDelayMs: 1200,
    });
    translationQueue.start();
    translationManager.attach(paperId, translationQueue);

    const onAbortTranslation = () => {
      translationManager.cancel(paperId);
    };
    callbacks.signal?.addEventListener("abort", onAbortTranslation);

    // Track translation progress
    let translatedCount = 0;
    const refSectionIds = referenceSectionIds(sections);
    setAppleEligibleSources(
      appleRouter,
      collectAppleEligibleSources(blocks, refSectionIds, paper.titleOriginal)
    );
    const totalTranslatable =
      blocks.filter((b) => shouldTranslateBlock(b, refSectionIds)).length +
      sections.filter(shouldTranslateSection).length +
      (paper.titleOriginal && shouldTranslateTitle(paper.titleOriginal) ? 1 : 0);

    let lastProgressAt = 0;
    const PROGRESS_THROTTLE_MS = 500;
    const updateProgress = (force = false) => {
      const now = Date.now();
      if (!force && now - lastProgressAt < PROGRESS_THROTTLE_MS) return;
      lastProgressAt = now;
      callbacks.onProgress({
        stage: "translating",
        stageProgress: translatedCount,
        stageTotal: totalTranslatable,
        message: `翻訳中... (${translatedCount}/${totalTranslatable})`,
        paper,
      });
    };

    let outstanding = 0;
    let settleAll: () => void = () => {};
    const allDone = new Promise<void>((resolve) => {
      settleAll = resolve;
    });
    const markDone = () => {
      outstanding = Math.max(0, outstanding - 1);
      if (outstanding === 0) {
        settleAll();
      }
    };

    translationQueue.setOnTaskCompleted(async (task) => {
      if (!task.result) {
        markDone();
        return;
      }

      const safeUnitProjection = projectSafeUnitTranslation(task.result);
      const projectedText = safeUnitProjection && !safeUnitProjection.complete
        ? safeUnitProjection.text
        : task.result.text;
      const translated = normalizeSourceGroundedTerminology(
        task.text,
        applyGlossary(projectedText, glossaryEntries)
      );
      const figureCaption = localizeNamedFigureCaption(task.text);
      const acceptedTranslation = safeUnitProjection && !safeUnitProjection.complete
        ? translated
        : isPlausibleJaTranslation(translated, task.text)
        ? translated
        : figureCaption;
      if (!acceptedTranslation) {
        console.warn(
          `[translation] rejected degenerate output for ${task.blockId}:`,
          translated.slice(0, 80)
        );
        const block = blocks.find((b) => b.id === task.blockId);
        if (block) {
          preserveSourceTranslation(block, "source_fallback");
          await updateBlock(block);
          callbacks.onBlockTranslated?.(block);
        }
        translatedCount++;
        updateProgress();
        markDone();
        return;
      }

      if (task.blockId === `title-${paperId}`) {
        if (!titleTranslationComplete(task.text, translated)) {
          console.warn("[translation] rejected incomplete title translation:", translated);
          paper.titleTranslated = null;
          await savePaper(paper);
          callbacks.onPaperUpdated?.(paper);
          translatedCount++;
          updateProgress();
          markDone();
          return;
        }
        paper.titleTranslated = translated;
        await savePaper(paper);
        callbacks.onPaperUpdated?.(paper);
      } else if (task.blockId.startsWith("section-")) {
        const sectionId = task.blockId.slice("section-".length);
        const section = sections.find((s) => s.id === sectionId);
        if (section) {
          section.translatedTitle = translated;
          await saveSections(sections);
          callbacks.onSectionTranslated?.(section);
        }
      } else {
        const block = blocks.find((b) => b.id === task.blockId);
        if (block) {
          assignBlockTranslation(block, acceptedTranslation);
          if (safeUnitProjection && !safeUnitProjection.complete) {
            block.metadata = {
              ...block.metadata,
              translationOutcome: "partial_unit_source_fallback",
              unitFallbackIndices: safeUnitProjection.failedIndices,
            };
          }
          await updateBlock(block);
          callbacks.onBlockTranslated?.(block);
        }
      }

      if (cfg.useCache && task.text) {
        const textHash = await computeTextHash(task.text);
        await saveTranslationCache(textHash, {
          sourceLanguage: "en",
          targetLanguage: "ja",
          model: task.result.model,
          modelVersion: task.result.modelVersion,
          translatedText: acceptedTranslation,
        });
      }

      const benchmarkEntry: BenchmarkEntry = {
        id: uuidv4(),
        paperId,
        model: task.result.model,
        modelVersion: task.result.modelVersion,
        inputChars: task.result.inputChars,
        inputTokens: task.result.inputTokens ?? null,
        outputChars: acceptedTranslation.length,
        translationTimeMs: task.result.translationTimeMs,
        charsPerSec: task.result.charsPerSec,
        tokensPerSec: task.result.tokensPerSec ?? null,
        timestamp: new Date().toISOString(),
      };
      // Do not await: SQLite benchmark writes must not stall the UI / queue slot.
      void saveBenchmark(benchmarkEntry).catch((error) => {
        console.warn("[translation] benchmark save failed:", error);
      });

      translatedCount++;
      updateProgress();
      markDone();
    });

    translationQueue.setOnTaskFailed((task) => {
      console.error(`Translation failed for block ${task.blockId}:`, task.error);
      const block = blocks.find((b) => b.id === task.blockId);
      if (block) {
        const qualityRejected = /looked degenerate|quality gate|empty text/i.test(task.error ?? "");
        if (qualityRejected) {
          const localized = localizeNamedFigureCaption(task.text);
          if (localized) {
            assignBlockTranslation(block, localized);
          } else {
            preserveSourceTranslation(block, "source_fallback");
          }
        } else {
          block.translationStatus = "failed";
          block.metadata = { ...block.metadata, translationOutcome: "request_failed" };
        }
        void updateBlock(block);
        callbacks.onBlockTranslated?.(block);
      }
      translatedCount++;
      updateProgress();
      markDone();
    });

    // Pause/cancel: settle outstanding without marking pending blocks failed.
    translationQueue.setOnTaskCancelled(() => {
      markDone();
    });

    const enqueue = (
      blockId: string,
      text: string,
      priority: TranslationPriorityValue
    ) => {
      outstanding += 1;
      translationQueue.enqueue(paperId, blockId, text, priority, "en", "ja");
    };

    // Queue title first (highest priority)
    if (paper.titleOriginal && shouldTranslateTitle(paper.titleOriginal)) {
      const titleHash = await computeTextHash(paper.titleOriginal);
      const cachedTitle = cfg.useCache
        ? usableCachedJa(
            await getCachedTranslation(
              titleHash,
              translationEngine.name,
              MADLAD_MODEL_VERSION,
              "en",
              "ja"
            ),
            paper.titleOriginal
          )
        : null;

      if (cachedTitle && titleTranslationComplete(paper.titleOriginal, cachedTitle)) {
        paper.titleTranslated = cachedTitle;
        callbacks.onPaperUpdated?.(paper);
        translatedCount++;
      } else {
        enqueue(`title-${paperId}`, paper.titleOriginal, TranslationPriority.CRITICAL);
      }
    }

    // Queue section titles (high priority)
    for (const section of sections) {
      const sectionHash = await computeTextHash(section.originalTitle);
      const cachedSection = cfg.useCache
        ? usableCachedJa(
            await getCachedTranslation(
              sectionHash,
              translationEngine.name,
              MADLAD_MODEL_VERSION,
              "en",
              "ja"
            ),
            section.originalTitle
          )
        : null;

      if (cachedSection && shouldTranslateSection(section)) {
        section.translatedTitle = cachedSection;
        callbacks.onSectionTranslated?.(section);
        translatedCount++;
      } else if (shouldTranslateSection(section)) {
        enqueue(`section-${section.id}`, section.originalTitle, TranslationPriority.HIGH);
      }
    }

    // Queue blocks by priority
    await persistUntranslatableAsSkipped(blocks, refSectionIds);

    for (const block of blocks) {
      if (!shouldTranslateBlock(block, refSectionIds) || !block.original) {
        continue;
      }

      const translationSource =
        block.type === "figure" || block.type === "table"
          ? String(block.metadata.captionOriginal ?? block.original)
          : block.original;
      const blockHash = await computeTextHash(translationSource);
      const cachedBlock = cfg.useCache
        ? usableCachedJa(
            await getCachedTranslation(
              blockHash,
              translationEngine.name,
              MADLAD_MODEL_VERSION,
              "en",
              "ja"
            ),
            translationSource
          )
        : null;

      if (cachedBlock) {
        assignBlockTranslation(
          block,
          normalizeSourceGroundedTerminology(
            translationSource,
            applyGlossary(cachedBlock, glossaryEntries)
          )
        );
        await updateBlock(block);
        callbacks.onBlockTranslated?.(block);
        translatedCount++;
        continue;
      }

      // Keep body blocks in document order.  The queue is stable within a
      // priority level, so assigning one priority prevents a later abstract
      // or introduction block from jumping ahead of blocks above it.
      enqueue(block.id, translationSource, TranslationPriority.MEDIUM);
    }

    if (outstanding === 0) {
      settleAll();
    }
    try {
      await allDone;
    } finally {
      callbacks.signal?.removeEventListener("abort", onAbortTranslation);
    }
    throwIfImportAborted(callbacks.signal, { paperId, partialReady: true });

    // Stage 6: Finalize
    callbacks.onStageChange("saving");
    callbacks.onProgress({
      stage: "saving",
      stageProgress: 0,
      stageTotal: 1,
      message: "保存しています...",
    });

    // Update section translations
    await saveSections(sections);

    paper.processingStatus = finalizedTranslationStatus(blocks, (block) =>
      isRetryableTranslationFailure(block, refSectionIds)
    );
    paper.needsTranslationResume = paper.processingStatus !== "ready";
    paper.updatedAt = new Date().toISOString();
    await savePaper(paper);

    callbacks.onStageChange("completed");
    callbacks.onProgress({
      stage: "completed",
      stageProgress: 1,
      stageTotal: 1,
      message: "インポートが完了しました",
      paper,
      sections,
      blocks,
    });

    return { paper, sections, blocks };

  } catch (error) {
    if (error instanceof ImportCancelledError) {
      translationManager.cancel(paperId);
      if (!error.partialReady) {
        try {
          await deletePaper(paperId);
        } catch (cleanupError) {
          console.warn("Failed to cleanup cancelled import paper:", cleanupError);
        }
        throw error;
      }
      // Partial-ready: keep Reader package; do not auto-resume after restart.
      try {
        const { getPaper } = await import("./database");
        const paper = await getPaper(paperId);
        if (paper) {
          paper.processingStatus = "partial";
          paper.needsTranslationResume = false;
          paper.updatedAt = new Date().toISOString();
          await savePaper(paper);
          callbacks.onPaperUpdated?.(paper);
        }
      } catch (persistError) {
        console.warn("Failed to mark cancelled import as partial:", persistError);
      }
      throw error;
    }
    const classified = classifyPdfOpenError(error);
    const message =
      classified.code !== "unknown"
        ? classified.message
        : error instanceof Error
          ? error.message
          : "不明なエラー";
    callbacks.onStageChange("failed");
    callbacks.onProgress({
      stage: "failed",
      stageProgress: 0,
      stageTotal: 1,
      message: `エラー: ${message}`,
      error: message,
    });
    return null;
  } finally {
    releaseImportHash?.();
    translationManager.detach(paperId);
    activeImportPaperIds.delete(paperId);
  }
}

/**
 * Check if MADLAD server is available.
 */
export async function checkMADLADAvailability(
  serverUrl: string = DEFAULT_IMPORT_CONFIG.madladServerUrl
): Promise<{ available: boolean; modelLoaded: boolean; error?: string }> {
  const resolved = resolveMadladServerUrl(serverUrl);
  try {
    const response = await fetch(`${resolved}/health`);
    if (!response.ok) {
      return {
        available: false,
        modelLoaded: false,
        error: `Server returned ${response.status}`,
      };
    }
    const data = await response.json();
    return {
      available: true,
      modelLoaded: data.model_loaded,
    };
  } catch {
    return {
      available: false,
      modelLoaded: false,
      error: "翻訳サーバーに接続できません。サーバーを起動してください。",
    };
  }
}
