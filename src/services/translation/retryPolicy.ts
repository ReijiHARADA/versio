/**
 * Classify translation failures so the queue retries only transient errors
 * and the Reader reserves "翻訳に失敗しました" for real request failures.
 */

export class TranslationQualityError extends Error {
  readonly code = "translation_quality" as const;

  constructor(message = "Translation output looked degenerate and was discarded") {
    super(message);
    this.name = "TranslationQualityError";
  }
}

export function isTranslationQualityError(error: unknown): boolean {
  if (error instanceof TranslationQualityError) return true;
  if (!(error instanceof Error)) return false;
  return /looked degenerate|quality gate|empty text/i.test(error.message);
}

/** Transient sidecar / network failures worth another queue attempt. */
export function isRetryableTranslationError(error: unknown): boolean {
  if (isTranslationQualityError(error)) return false;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message) return true;
  if (/looked degenerate|quality gate|empty text|result count mismatch/i.test(message)) {
    return false;
  }
  return (
    /timed out|AbortError|network|fetch failed|Failed to fetch|ECONN|ETIMEDOUT|temporary error|502|503|504|401|Unauthorized|接続できません/i
      .test(message)
  );
}
