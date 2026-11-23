import type { PaperBlock } from "../../types/paper";
import { shouldTranslateBlock, untranslatedParagraphReason } from "../../services/import/policy";
import { usableTranslatedText } from "../../services/translation/quality";

type ParagraphTranslationUi = {
  translated: string | null;
  hasTranslation: boolean;
  skipTranslation: boolean;
  isPending: boolean;
  isProcessing: boolean;
  isFailed: boolean;
  isWaiting: boolean;
  untranslatedReason: string | null;
};

/**
 * Reader presentation for a body paragraph. Must follow import
 * `shouldTranslateBlock` — never re-run the narrower
 * `shouldTranslateParagraph` gate alone. That mismatch hid pending/failed
 * list items and other policy-eligible units as silent English.
 */
export function resolveParagraphTranslationUi(
  block: PaperBlock,
  refSectionIds: Set<string> = new Set()
): ParagraphTranslationUi {
  const usableStoredTranslation = usableTranslatedText(block.translated, block.original);
  const hasAcceptedStoredTranslation =
    block.translationStatus === "completed" && Boolean(usableStoredTranslation);

  const inFlightOrFailed =
    block.translationStatus === "pending" ||
    block.translationStatus === "processing" ||
    block.translationStatus === "failed";

  const skipTranslation =
    !hasAcceptedStoredTranslation &&
    !inFlightOrFailed &&
    !shouldTranslateBlock(block, refSectionIds);

  const translated = skipTranslation ? null : usableStoredTranslation;
  const hasTranslation = Boolean(translated);
  const isPending = !skipTranslation && block.translationStatus === "pending";
  const isProcessing = !skipTranslation && block.translationStatus === "processing";
  const isFailed = !skipTranslation && block.translationStatus === "failed" && !hasTranslation;
  const isWaiting = !hasTranslation && (isPending || isProcessing);

  const untranslatedReason =
    hasTranslation ? null : untranslatedParagraphReason(block, refSectionIds);

  return {
    translated,
    hasTranslation,
    skipTranslation,
    isPending,
    isProcessing,
    isFailed,
    isWaiting,
    untranslatedReason,
  };
}
