/**
 * Reader paragraph retry — same engine stack and outcome rules as import/resume.
 */

import { updateBlock } from "../database";
import { getTranslationGlossary } from "../glossary/global";
import { assignBlockTranslation, preserveSourceTranslation } from "../glossary/apply";
import { applyGlossary, normalizeSourceGroundedTerminology } from "../llm/glossaryService";
import {
  createTranslationEngine,
  setEngineGlossary,
} from "../translation/createTranslationEngine";
import { projectSafeUnitTranslation } from "../translation/partialProjection";
import {
  isPlausibleJaTranslation,
  localizeNamedFigureCaption,
} from "../translation/quality";
import { isTranslationQualityError } from "../translation/retryPolicy";
import type { PaperBlock } from "../../types/paper";
import { translationInputForBlock } from "./policy";

export async function retryBlockTranslation(
  block: PaperBlock,
  options: {
    onBlockUpdated?: (block: PaperBlock) => void;
  } = {}
): Promise<PaperBlock> {
  const source = translationInputForBlock(block);
  if (!source.trim()) return block;

  const { engine, primaryEngine } = createTranslationEngine();

  const glossary = await getTranslationGlossary(block.paperId);
  setEngineGlossary({ primaryEngine }, glossary);

  try {
    const result = await engine.translate(source, "en", "ja");
    const safeUnitProjection = projectSafeUnitTranslation(result, source);
    const projectedText =
      safeUnitProjection && !safeUnitProjection.complete
        ? safeUnitProjection.text
        : result.text;
    const translated = normalizeSourceGroundedTerminology(
      source,
      applyGlossary(projectedText, glossary)
    );
    const figureCaption = localizeNamedFigureCaption(source);
    const acceptedTranslation =
      safeUnitProjection && !safeUnitProjection.complete
        ? translated
        : isPlausibleJaTranslation(translated, source)
          ? translated
          : figureCaption;

    if (!acceptedTranslation) {
      preserveSourceTranslation(block, "source_fallback");
    } else {
      assignBlockTranslation(block, acceptedTranslation);
      if (safeUnitProjection && !safeUnitProjection.complete) {
        block.metadata = {
          ...block.metadata,
          translationOutcome: "partial_source_preserved",
          partialFailedUnitIndices: safeUnitProjection.failedIndices,
        };
      }
    }
  } catch (error) {
    if (isTranslationQualityError(error)) {
      const localized = localizeNamedFigureCaption(source);
      if (localized) {
        assignBlockTranslation(block, localized);
      } else {
        preserveSourceTranslation(block, "source_fallback");
      }
    } else {
      block.translationStatus = "failed";
      block.metadata = { ...block.metadata, translationOutcome: "request_failed" };
    }
  }

  await updateBlock(block);
  options.onBlockUpdated?.(block);
  return block;
}
