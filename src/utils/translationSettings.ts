export type TranslationSettingsV2 = {
  translationConcurrency: number;
  useCache: boolean;
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
  };
  const previous = saved?.translationConcurrency ?? 1;
  if (previous <= 3) {
    merged.translationConcurrency = 8;
  }
  return merged;
}
