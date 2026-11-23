import { describe, expect, it } from "vitest";
import { normalizeIndexText } from "../../../domain/search/normalizeSearchText";
import {
  DEFAULT_ON_WEIGHT,
  MAX_VARIANTS_PER_TERM,
  buildSearchQuery,
  scoreIndexText,
  type SearchVariant,
} from "../../../domain/search/searchQuery";
import type { SynonymLookup } from "../../../domain/search/synonymDictionary";

function fakeDictionary(entries: Record<string, SearchVariant[]>): SynonymLookup {
  return { lookup: (term) => entries[term] ?? null };
}

const v = (term: string, weight: number, relation: SearchVariant["relation"] = "synonym"): SearchVariant => ({
  term,
  label: term,
  weight,
  relation,
});

describe("buildSearchQuery", () => {
  it("makes one AND group per whitespace token", () => {
    const query = buildSearchQuery("  認知負荷  インターフェース ");
    expect(query.groups.map((group) => group.variants.map((variant) => variant.term))).toEqual([
      ["認知負荷"],
      ["インタフェス"],
    ]);
    expect(query.groups[1].variants[0].label).toBe("インターフェース");
  });

  it("adds strong variants, offers weak ones, dedupes and caps", () => {
    const dictionary = fakeDictionary({
      hci: [
        v("human computer interaction", 0.9, "expansion"),
        v("hci", 0.9, "abbr"),
        v("weak", DEFAULT_ON_WEIGHT - 0.1),
        ...Array.from({ length: 20 }, (_, i) => v(`x${i}x`, 0.8)),
      ],
    });
    const [group] = buildSearchQuery("HCI", { dictionary }).groups;
    expect(group.variants[0]).toMatchObject({ term: "hci", label: "HCI", relation: "exact" });
    expect(group.variants[1].term).toBe("human computer interaction");
    expect(group.variants).toHaveLength(MAX_VARIANTS_PER_TERM);
    expect(group.suggestions.find((s) => s.term === "weak")?.active).toBe(false);
    expect(group.suggestions.some((s) => s.term === "hci")).toBe(false);
  });

  it("follows the user's per-variant choices", () => {
    const dictionary = fakeDictionary({ a: [v("strong", 0.9), v("weak", 0.3)] });
    const overrides = new Map([
      ["strong", false],
      ["weak", true],
    ]);
    const [group] = buildSearchQuery("a", { dictionary, overrides }).groups;
    expect(group.variants.map((variant) => variant.term)).toEqual(["a", "weak"]);
  });

  it("looks up a multi-word phrase the dictionary knows as one group", () => {
    const dictionary = fakeDictionary({ "cognitive load": [v("認知負荷", 0.9, "translation")] });
    const query = buildSearchQuery("measuring cognitive load", { dictionary });
    expect(query.groups.map((group) => group.term)).toEqual(["measuring", "cognitive load"]);
    expect(query.groups[1].variants.map((variant) => variant.term)).toEqual(["cognitive load", "認知負荷"]);
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

  it("matches a dictionary English word only at a word start", () => {
    const dictionary = fakeDictionary({ 負荷: [v("load", 0.9, "translation")] });
    const query = buildSearchQuery("負荷", { dictionary });
    expect(scoreIndexText(normalizeIndexText("high loads"), query)).toBeGreaterThan(0);
    expect(scoreIndexText(normalizeIndexText("download time"), query)).toBe(0);
    // What the user typed still matches inside a word.
    expect(scoreIndexText(normalizeIndexText("download time"), buildSearchQuery("load"))).toBeGreaterThan(0);
  });
});
