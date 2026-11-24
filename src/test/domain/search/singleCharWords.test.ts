import { describe, expect, it } from "vitest";
import { normalizeIndexText } from "../../../domain/search/normalizeSearchText";
import { INSIDE_WORD_FACTOR, buildSearchQuery, scoreFields } from "../../../domain/search/searchQuery";
import { isSingleCharTerm, singleCharWords } from "../../../domain/search/singleCharWords";

function score(text: string, query: string): number {
  return scoreFields(
    [
      { text: normalizeIndexText(text), weight: 1 },
      { text: singleCharWords(text), weight: 1, words: true },
    ],
    buildSearchQuery(query)
  );
}

describe("one-character Japanese words", () => {
  it("collects the one-character words a text uses", () => {
    expect(singleCharWords("蚊が飛ぶ。関数の数を数える。")).toBe(" 蚊 が の 数 を ");
    expect(singleCharWords("Deep learning")).toBe("");
  });

  it("ranks a one-character word above the same character inside a longer word", () => {
    expect(score("数が多い", "数")).toBe(1);
    expect(score("関数と数値", "数")).toBe(INSIDE_WORD_FACTOR);
    expect(score("目鼻立ち", "目")).toBeGreaterThan(0);
    expect(score("目鼻立ち", "目")).toBeLessThan(score("目が痛い", "目"));
    expect(score("鼻の形", "目")).toBe(0);
  });

  it("still requires every term", () => {
    expect(score("蚊が人を刺す", "蚊 刺す")).toBeGreaterThan(0);
    expect(score("蚊が人を刺す", "蚊 犬")).toBe(0);
  });

  it("knows which terms are one-character Japanese words", () => {
    expect(isSingleCharTerm("め")).toBe(true);
    expect(isSingleCharTerm("ui")).toBe(false);
    expect(isSingleCharTerm("関数")).toBe(false);
  });
});
