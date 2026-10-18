import {
  getBlocksByPaper,
  getGlossary,
  getPaper,
  getSectionsByPaper,
  savePaper,
  saveSections,
  updateBlock,
} from "../database";
import { assignBlockTranslation, preserveSourceTranslation } from "../glossary/apply";
import { applyGlossary, normalizeSourceGroundedTerminology } from "../llm/glossaryService";
import { finalizedTranslationStatus } from "../paperStatus";
import {
  MADLADEngine,
  OllamaTranslationEngine,
  TranslationPriority,
  translationManager,
  TranslationQueue,
  type TranslationPriorityValue,
} from "../translation";
import { OllamaProvider } from "../llm";
import { isPlausibleJaTranslation, localizeNamedFigureCaption, shouldTranslateTitle, titleTranslationComplete } from "../translation/quality";
import { checkMADLADServer } from "../translation/madladEngine";
import { projectSafeUnitTranslation } from "../translation/partialProjection";
import {
  finalizeJapaneseLayoutOnly,
  isJapaneseLayoutOnlyPaper,
  persistUntranslatableAsSkipped,
  resolveImportConfig,
} from "./helpers";
import { ImportCancelledError, throwIfImportAborted } from "./cancellation";
import { isRetryableTranslationFailure, referenceSectionIds, shouldTranslateBlock, shouldTranslateSection } from "./policy";
import { activeImportPaperIds, resumeAbortControllers, resumingPapers } from "./session";
import type { ImportCallbacks, ImportConfig } from "./types";

export async function resumeIncompleteTranslation(
  paperId: string,
  callbacks: Pick<
    ImportCallbacks,
    "onBlockTranslated" | "onPaperUpdated" | "onSectionTranslated"
  > = {},
  config: ImportConfig = {}
): Promise<void> {
  if (activeImportPaperIds.has(paperId) || resumingPapers.has(paperId)) return;
  resumingPapers.add(paperId);
  const abortController = new AbortController();
  resumeAbortControllers.set(paperId, abortController);

  try {
    const paper = await getPaper(paperId);
    if (!paper) return;

    const blocks = await getBlocksByPaper(paperId);
    const sections = await getSectionsByPaper(paperId);
    const refSectionIds = referenceSectionIds(sections);

    if (isJapaneseLayoutOnlyPaper(paper.titleOriginal, blocks)) {
      await finalizeJapaneseLayoutOnly(paper, sections, blocks);
      callbacks.onPaperUpdated?.(paper);
      for (const block of blocks) {
        callbacks.onBlockTranslated?.(block);
      }
      return;
    }

    const skipped = await persistUntranslatableAsSkipped(blocks, refSectionIds);
    for (const block of skipped) {
      callbacks.onBlockTranslated?.(block);
    }
    const pendingBlocks = blocks.filter((block) => {
      if (!shouldTranslateBlock(block, refSectionIds)) return false;
      // Quality-gate source preservation is intentional: do not loop forever.
      if (
        block.translationStatus === "completed" &&
        block.metadata?.translationOutcome === "source_fallback" &&
        !block.translated
      ) {
        return false;
      }
      return !block.translated || !isPlausibleJaTranslation(block.translated, block.original || "");
    });
    const pendingTitle = Boolean(
      paper.titleOriginal &&
        shouldTranslateTitle(paper.titleOriginal) &&
        (!paper.titleTranslated ||
          !titleTranslationComplete(paper.titleOriginal, paper.titleTranslated))
    );
    const pendingSections = sections.filter(
      (section) =>
        section.originalTitle &&
        shouldTranslateSection(section) &&
        (!section.translatedTitle ||
          !isPlausibleJaTranslation(section.translatedTitle, section.originalTitle))
    );

    if (!pendingBlocks.length && !pendingTitle && pendingSections.length === 0) {
      const nextStatus = finalizedTranslationStatus(blocks, (block) =>
        isRetryableTranslationFailure(block, refSectionIds)
      );
      paper.processingStatus = nextStatus;
      paper.needsTranslationResume = nextStatus !== "ready";
      paper.updatedAt = new Date().toISOString();
      await savePaper(paper);
      callbacks.onPaperUpdated?.(paper);
      return;
    }

    const cfg = resolveImportConfig(config);
    // Leave pending work untouched so a later server-ready resume can pick it up.
    const madlad = await checkMADLADServer(cfg.madladServerUrl);
    if (!madlad.available) {
      paper.needsTranslationResume = true;
      await savePaper(paper);
      return;
    }
    const madladEngine = new MADLADEngine(cfg.madladServerUrl);
    const llmProviders = [cfg.ollamaModel, ...(cfg.ollamaModels ?? [])]
      .filter((model, index, models): model is string => Boolean(model) && models.indexOf(model) === index)
      .map((model) => new OllamaProvider(cfg.ollamaServerUrl, model));
    const translationEngine = cfg.enableSelectiveCascade
      ? new OllamaTranslationEngine(
          madladEngine,
          llmProviders,
        )
      : madladEngine;
    const queue = new TranslationQueue(translationEngine, {
      concurrency: cfg.translationConcurrency,
      retryFailed: true,
      maxRetries: 2,
      retryDelayMs: 1200,
    });
    queue.start();
    translationManager.attach(paperId, queue);

    paper.processingStatus = "translating";
    paper.needsTranslationResume = true;
    await savePaper(paper);
    callbacks.onPaperUpdated?.(paper);

    const glossaryEntries = await getGlossary(paperId);

    let outstanding = 0;
    let settleAll: () => void = () => {};
    const allDone = new Promise<void>((resolve) => {
      settleAll = resolve;
    });
    const markDone = () => {
      outstanding = Math.max(0, outstanding - 1);
      if (outstanding === 0) settleAll();
    };

    queue.setOnTaskCancelled(() => {
      markDone();
    });

    const onAbortTranslation = () => {
      translationManager.cancel(paperId);
    };
    abortController.signal.addEventListener("abort", onAbortTranslation);

    queue.setOnTaskCompleted(async (task) => {
      if (!task.result) {
        markDone();
        return;
      }
      const translated = normalizeSourceGroundedTerminology(
        task.text,
        applyGlossary(task.result.text, glossaryEntries)
      );
      const figureCaption = localizeNamedFigureCaption(task.text);
      const directTranslation = isPlausibleJaTranslation(translated, task.text)
        ? translated
        : undefined;
      // A server partial-unit result is safe to expose only when the backend
      // supplies a one-to-one unit mapping.  `projectSafeUnitTranslation`
      // keeps failed units as their exact source text and rejects an
      // all-failed result, so a quality failure can never become a fluent
      // guess.  Titles and section labels remain all-or-nothing.
      const partialProjection = !directTranslation && !task.blockId.startsWith("title-")
        && !task.blockId.startsWith("section-")
        ? projectSafeUnitTranslation(task.result, task.text)
        : null;
      // A mapped partial result is authoritative even when the concatenated
      // string happens to pass the paragraph-level plausibility check.  It
      // prevents a single failed unit from being silently exposed as a
      // seemingly complete translation.
      const mappedPartial = partialProjection && !partialProjection.complete
        ? partialProjection.text
        : undefined;
      const acceptedTranslation = mappedPartial ?? directTranslation ?? figureCaption ?? partialProjection?.text;
      if (!acceptedTranslation) {
        const block = blocks.find((item) => item.id === task.blockId);
        if (block) {
          preserveSourceTranslation(block, "source_fallback");
          void updateBlock(block);
          callbacks.onBlockTranslated?.(block);
        }
        markDone();
        return;
      }
      if (task.blockId === `title-${paperId}`) {
        if (!titleTranslationComplete(task.text, translated)) {
          paper.titleTranslated = null;
          await savePaper(paper);
          callbacks.onPaperUpdated?.(paper);
          markDone();
          return;
        }
        paper.titleTranslated = translated;
        await savePaper(paper);
        callbacks.onPaperUpdated?.(paper);
      } else if (task.blockId.startsWith("section-")) {
        const sectionId = task.blockId.slice("section-".length);
        const section = sections.find((item) => item.id === sectionId);
        if (section) {
          section.translatedTitle = translated;
          await saveSections(sections);
          callbacks.onSectionTranslated?.(section);
        }
      } else {
        const block = blocks.find((item) => item.id === task.blockId);
        if (block) {
          assignBlockTranslation(block, acceptedTranslation);
          if (partialProjection && !directTranslation) {
            block.metadata = {
              ...block.metadata,
              translationOutcome: "partial_source_preserved",
              partialFailedUnitIndices: partialProjection.failedIndices,
            };
          }
          await updateBlock(block);
          callbacks.onBlockTranslated?.(block);
        }
      }
      markDone();
    });

    queue.setOnTaskFailed((task) => {
      const block = blocks.find((item) => item.id === task.blockId);
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
      markDone();
    });

    const enqueue = (
      blockId: string,
      text: string,
      priority: TranslationPriorityValue
    ) => {
      outstanding += 1;
      queue.enqueue(paperId, blockId, text, priority, "en", "ja");
    };

    if (pendingTitle && paper.titleOriginal) {
      enqueue(`title-${paperId}`, paper.titleOriginal, TranslationPriority.CRITICAL);
    }
    for (const section of pendingSections) {
      enqueue(`section-${section.id}`, section.originalTitle, TranslationPriority.HIGH);
    }
    for (const block of pendingBlocks) {
      const translationSource =
        block.type === "figure" || block.type === "table"
          ? String(block.metadata.captionOriginal ?? block.original)
          : block.original!;
      enqueue(block.id, translationSource, TranslationPriority.MEDIUM);
    }

    if (outstanding === 0) settleAll();
    try {
      await allDone;
    } finally {
      abortController.signal.removeEventListener("abort", onAbortTranslation);
    }
    throwIfImportAborted(abortController.signal, { paperId, partialReady: true });

    paper.processingStatus = finalizedTranslationStatus(blocks, (block) =>
      isRetryableTranslationFailure(block, refSectionIds)
    );
    paper.needsTranslationResume = paper.processingStatus !== "ready";
    paper.updatedAt = new Date().toISOString();
    await savePaper(paper);
    callbacks.onPaperUpdated?.(paper);
  } catch (error) {
    if (error instanceof ImportCancelledError) {
      // User pause: keep package + finished units; do not auto-resume on server ready.
      try {
        const paper = await getPaper(paperId);
        if (paper) {
          paper.processingStatus = "partial";
          paper.needsTranslationResume = false;
          paper.updatedAt = new Date().toISOString();
          await savePaper(paper);
          callbacks.onPaperUpdated?.(paper);
        }
      } catch (persistError) {
        console.warn("Failed to mark cancelled resume as partial:", persistError);
      }
    }
    throw error;
  } finally {
    translationManager.detach(paperId);
    resumeAbortControllers.delete(paperId);
    resumingPapers.delete(paperId);
  }
}
