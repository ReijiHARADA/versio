import { describe, expect, it } from "vitest";
import { normalizeIndexText } from "../../../domain/search/normalizeSearchText";
import {
  MAX_VARIANTS_PER_TERM,
  buildSearchQuery,
  scoreIndexText,
} from "../../../domain/search/searchQuery";

describe("buildSearchQuery", () => {
  it("makes one AND group per whitespace token", () => {
    const query = buildSearchQuery("  認知負荷  インターフェース ");
    expect(query.groups.map((group) => group.map((variant) => variant.term))).toEqual([
      ["認知負荷"],
      ["インタフェス"],
    ]);
  });

  it("adds expanded variants by weight, deduped and capped", () => {
    const query = buildSearchQuery("HCI", () => [
      { term: "HCI", weight: 0.9, relation: "abbr" },
      { term: "ヒューマンコンピュータインタラクション", weight: 0.85, relation: "translation" },
      { term: "Human-Computer Interaction", weight: 0.9, relation: "expansion" },
      ...Array.from({ length: 20 }, (_, i) => ({ term: `x${i}x`, weight: 0.1, relation: "synonym" as const })),
    ]);
    const terms = query.groups[0].map((variant) => variant.term);
    expect(terms.slice(0, 3)).toEqual([
      "hci",
      "human computer interaction",
      "ヒュマンコンピュタインタラクション",
    ]);
    expect(terms).toHaveLength(MAX_VARIANTS_PER_TERM);
  });
});

describe("scoreIndexText", () => {
  const text = normalizeIndexText("A study of UI design for BUILD systems とインターフェース");

  it("matches spelling variants", () => {
    expect(scoreIndexText(text, buildSearchQuery("インタフェース"))).toBeGreaterThan(0);
  });

  it("matches short Latin words only as whole words", () => {
    expect(scoreIndexText(text, buildSearchQuery("ui"))).toBeGreaterThan(0);
    expect(scoreIndexText(normalizeIndexText("many UIs"), buildSearchQuery("ui"))).toBeGreaterThan(0);
    expect(scoreIndexText(normalizeIndexText("BUILD systems"), buildSearchQuery("ui"))).toBe(0);
  });

  it("needs every group", () => {
    expect(scoreIndexText(text, buildSearchQuery("design quantum"))).toBe(0);
  });
});
