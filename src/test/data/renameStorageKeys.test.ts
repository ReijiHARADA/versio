import { beforeEach, describe, expect, it } from "vitest";
import { migrateLegacyStorageKeys } from "../../data/migration/renameStorageKeys";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => { map.delete(k); },
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

let localStorage: Storage;

describe("migrateLegacyStorageKeys", () => {
  beforeEach(() => { localStorage = memoryStorage(); });

  it("copies the legacy UI store and evaluation bundles without deleting them", () => {
    localStorage.setItem("paper-reader-storage", '{"state":{"x":1}}');
    localStorage.setItem("paper-reader/extraction-evaluation/abc", '{"kind":"paper-reader-extraction-evaluation"}');
    migrateLegacyStorageKeys(localStorage);
    expect(localStorage.getItem("versio-storage")).toBe('{"state":{"x":1}}');
    expect(localStorage.getItem("versio/extraction-evaluation/abc")).toBe('{"kind":"versio-extraction-evaluation"}');
    expect(localStorage.getItem("paper-reader-storage")).not.toBeNull();
  });

  it("never overwrites existing Versio keys", () => {
    localStorage.setItem("paper-reader-storage", "old");
    localStorage.setItem("versio-storage", "new");
    migrateLegacyStorageKeys(localStorage);
    expect(localStorage.getItem("versio-storage")).toBe("new");
  });
});
