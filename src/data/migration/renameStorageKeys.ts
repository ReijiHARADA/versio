/**
 * One-time migration of browser storage written under the former
 * "Paper Reader" name. Old keys are copied (not deleted) when the new key
 * is absent, so a rollback to an older build still finds its data.
 */
const LEGACY_STORE_KEY = "paper-reader-storage";
const LEGACY_EVAL_PREFIX = "paper-reader/extraction-evaluation/";
export const STORE_KEY = "versio-storage";
const EVAL_PREFIX = "versio/extraction-evaluation/";
const LEGACY_KIND = /"paper-reader-extraction-/g;

export function migrateLegacyStorageKeys(storage: Storage | undefined = globalThis.localStorage): void {
  if (!storage) return;
  try {
    const legacyStore = storage.getItem(LEGACY_STORE_KEY);
    if (legacyStore != null && storage.getItem(STORE_KEY) == null) {
      storage.setItem(STORE_KEY, legacyStore);
    }
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(LEGACY_EVAL_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const next = EVAL_PREFIX + key.slice(LEGACY_EVAL_PREFIX.length);
      const value = storage.getItem(key);
      if (value != null && storage.getItem(next) == null) {
        storage.setItem(next, value.replace(LEGACY_KIND, '"versio-extraction-'));
      }
    }
  } catch {
    // Storage unavailable (private mode / quota): nothing to migrate.
  }
}
