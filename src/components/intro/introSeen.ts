const KEY = "versio.introSeen";

// Unreadable storage counts as seen: never trap the user behind the intro.
export function hasSeenIntro(storage: Storage = globalThis.localStorage): boolean {
  try {
    return storage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

export function markIntroSeen(storage: Storage = globalThis.localStorage): void {
  try {
    storage.setItem(KEY, "1");
  } catch {
    // shown again next launch; harmless
  }
}
