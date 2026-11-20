import { describe, expect, it } from "vitest";
import { hasSeenIntro, markIntroSeen } from "./introSeen";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  } as Storage;
}
const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } as unknown as Storage;

describe("introSeen", () => {
  it("is unseen until marked", () => {
    const s = memoryStorage();
    expect(hasSeenIntro(s)).toBe(false);
    markIntroSeen(s);
    expect(hasSeenIntro(s)).toBe(true);
  });
  it("treats unreadable storage as seen so the app stays usable", () => {
    expect(hasSeenIntro(throwing)).toBe(true);
    expect(() => markIntroSeen(throwing)).not.toThrow();
  });
});
