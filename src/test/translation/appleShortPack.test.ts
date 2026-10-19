import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppleShortPackScheduler,
  isApplePackableShort,
  packAppleSources,
  shouldCoalesceForApple,
  unpackAppleSources,
} from "../../services/translation/appleShortPack";
import { isAppleEligibleSource } from "../../services/translation/appleTranslationEngine";
import type { TranslationResult } from "../../services/translation/types";

function result(text: string, model = "Apple Translation"): TranslationResult {
  return {
    text,
    sourceLanguage: "en",
    targetLanguage: "ja",
    model,
    modelVersion: "test",
    inputChars: text.length,
    outputChars: text.length,
    translationTimeMs: 1,
    charsPerSec: text.length,
  };
}

describe("Apple short pack markers", () => {
  it("packs and unpacks units in order", () => {
    const sources = ["Short clause one.", "Another brief claim."];
    const packed = packAppleSources(sources);
    expect(packed).toContain("<<0>> Short clause one.");
    expect(packed).toContain("<<1>> Another brief claim.");
    expect(unpackAppleSources("<<0>> 短い文一。\n<<1>> 別の短い主張。", 2)).toEqual([
      "短い文一。",
      "別の短い主張。",
    ]);
  });

  it("rejects unpack when a marker is missing", () => {
    expect(unpackAppleSources("<<0>> だけ。", 2)).toBeNull();
    expect(unpackAppleSources("短い文一。短い文二。", 2)).toBeNull();
  });

  it("identifies packable shorts that solo eligibility rejects", () => {
    const short = "Results were mixed.";
    expect(isAppleEligibleSource(short)).toBe(false);
    expect(isApplePackableShort(short)).toBe(true);
    expect(shouldCoalesceForApple(short, false)).toBe(true);
  });

  it("does not coalesce long solo-eligible prose", () => {
    const long =
      "The study examined twenty participants and found no significant difference between the conditions.";
    expect(isAppleEligibleSource(long)).toBe(true);
    expect(shouldCoalesceForApple(long, true)).toBe(false);
  });
});

describe("AppleShortPackScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("packs concurrent shorts into one Apple call and splits results", async () => {
    vi.useFakeTimers();
    const translatePacked = vi.fn(async () =>
      result("<<0>> 結果はまちまちだった。\n<<1>> 検出力は限られていた。")
    );
    const translateOne = vi.fn(async (text: string) => result(`solo:${text}`, "madlad"));

    const scheduler = new AppleShortPackScheduler({
      windowMs: 30,
      translateOne,
      translatePacked,
    });

    const p1 = scheduler.translate("Results were mixed.", "en", "ja");
    const p2 = scheduler.translate("Power was limited.", "en", "ja");
    await vi.advanceTimersByTimeAsync(30);
    const [a, b] = await Promise.all([p1, p2]);

    expect(translatePacked).toHaveBeenCalledTimes(1);
    const packedArg = translatePacked.mock.calls[0]?.[0] as string;
    expect(packedArg).toContain("<<0>> Results were mixed.");
    expect(packedArg).toContain("<<1>> Power was limited.");
    expect(translateOne).not.toHaveBeenCalled();
    expect(a.text).toBe("結果はまちまちだった。");
    expect(b.text).toBe("検出力は限られていた。");
    expect(a.model).toBe("Apple Translation");
  });

  it("falls back per unit when unpack fails", async () => {
    vi.useFakeTimers();
    const translatePacked = vi.fn(async () => result("マーカーなしの一塊の訳です。"));
    const translateOne = vi.fn(async (text: string) => result(`solo:${text}`, "madlad"));
    const scheduler = new AppleShortPackScheduler({
      windowMs: 30,
      translateOne,
      translatePacked,
    });

    const p1 = scheduler.translate("Results were mixed.", "en", "ja");
    const p2 = scheduler.translate("Power was limited.", "en", "ja");
    await vi.advanceTimersByTimeAsync(30);
    const [a, b] = await Promise.all([p1, p2]);

    expect(translatePacked).toHaveBeenCalledTimes(1);
    expect(translateOne).toHaveBeenCalledTimes(2);
    expect(a.text).toBe("solo:Results were mixed.");
    expect(b.text).toBe("solo:Power was limited.");
  });

  it("translates a lone short via translateOne after the window", async () => {
    vi.useFakeTimers();
    const translatePacked = vi.fn();
    const translateOne = vi.fn(async (text: string) => result(`solo:${text}`, "madlad"));
    const scheduler = new AppleShortPackScheduler({
      windowMs: 30,
      translateOne,
      translatePacked,
    });

    const pending = scheduler.translate("Results were mixed.", "en", "ja");
    await vi.advanceTimersByTimeAsync(30);
    await expect(pending).resolves.toMatchObject({ text: "solo:Results were mixed." });
    expect(translatePacked).not.toHaveBeenCalled();
    expect(translateOne).toHaveBeenCalledTimes(1);
  });
});
