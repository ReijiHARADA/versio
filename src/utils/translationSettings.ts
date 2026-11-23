export type TranslationSettingsV2 = {
  translationConcurrency: number;
  useCache: boolean;
  /** Set once the legacy "concurrency ≤ 3 → 8" bump has run, so 安定 (2) sticks afterwards. */
  concurrencyMigrated?: boolean;
};

export const DEFAULT_TRANSLATION_SETTINGS_V2: TranslationSettingsV2 = {
  translationConcurrency: 8,
  useCache: true,
};

export function mergeTranslationSettingsV2(
  saved: (Partial<TranslationSettingsV2> & Record<string, unknown>) | null | undefined
): TranslationSettingsV2 {
  const merged: TranslationSettingsV2 = {
    translationConcurrency:
      typeof saved?.translationConcurrency === "number"
        ? saved.translationConcurrency
        : DEFAULT_TRANSLATION_SETTINGS_V2.translationConcurrency,
    useCache:
      typeof saved?.useCache === "boolean" ? saved.useCache : DEFAULT_TRANSLATION_SETTINGS_V2.useCache,
    concurrencyMigrated: true,
  };
  // One-time migration: old installs stored 1–3 before the PLaMo server had 8 slots.
  // After it has run once, a saved 2 is the user's 安定 choice and must be kept.
  if (saved?.concurrencyMigrated !== true && merged.translationConcurrency <= 3) {
    merged.translationConcurrency = 8;
  }
  return merged;
}
