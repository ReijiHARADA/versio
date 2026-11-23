import { describe, expect, it } from "vitest";
import {
  QUERY_TRANSLATION_WEIGHT,
  composeLookups,
  isTranslatableTerm,
  libraryTermsLookup,
  translationsLookup,
  withFallback,
} from "../../../domain/search/lookups";
import { buildSearchQuery } from "../../../domain/search/searchQuery";
import type { SynonymLookup } from "../../../domain/search/synonymDictionary";

describe("libraryTermsLookup", () => {
  const lookup = libraryTermsLookup([
    { term: "SUS", longForm: "System Usability Scale" },
    { term: "cognitive load", longForm: "認知負荷" },
  ]);

  it("expands an abbreviation a paper defined, both ways", () => {
    expect(lookup.lookup("sus")?.[0]).toMatchObject({ term: "system usability scale", relation: "expansion" });
    expect(lookup.lookup("system usability scale")?.[0]).toMatchObject({ term: "sus", relation: "abbr" });
  });

  it("treats a Japanese term with an English gloss as a translation pair", () => {
    expect(lookup.lookup("認知負荷")?.[0]).toMatchObject({ term: "cognitive load", relation: "translation" });
  });
});

describe("composeLookups / withFallback", () => {
  const a: SynonymLookup = { lookup: (t) => (t === "x" ? [{ term: "y", label: "y", weight: 0.6, relation: "synonym" }] : null) };
  const b: SynonymLookup = { lookup: (t) => (t === "x" ? [{ term: "y", label: "Y", weight: 0.9, relation: "abbr" }] : t === "z" ? [] : null) };

  it("unions with the best weight and knows a term if any lookup does", () => {
    const both = composeLookups([a, null, b]);
    expect(both.lookup("x")).toEqual([{ term: "y", label: "Y", weight: 0.9, relation: "abbr" }]);
    expect(both.lookup("z")).toEqual([]);
    expect(both.lookup("q")).toBeNull();
  });

  it("uses a query translation only for terms no dictionary knows", () => {
    const lookup = withFallback(composeLookups([a]), translationsLookup(new Map([["x", "ignored"], ["視線", "gaze"]])));
    expect(lookup.lookup("x")?.[0].term).toBe("y");
    const [group] = buildSearchQuery("視線", { dictionary: lookup }).groups;
    expect(group.variants[1]).toEqual({ term: "gaze", label: "gaze", weight: QUERY_TRANSLATION_WEIGHT, relation: "translation" });
  });
});

it("asks PLaMo only about words and short phrases", () => {
  expect(isTranslatableTerm("視線")).toBe(true);
  expect(isTranslatableTerm("gaze")).toBe(true);
  expect(isTranslatableTerm("ab")).toBe(false);
  expect(isTranslatableTerm("x".repeat(41))).toBe(false);
});
