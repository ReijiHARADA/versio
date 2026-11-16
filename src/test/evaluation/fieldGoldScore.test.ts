import { describe, expect, it } from "vitest";
import { normalizeName, normalizeText, similarity } from "../../evaluation/fieldGold/normalize";
import { scoreFields } from "../../evaluation/fieldGold/score";
import type { FieldGold, FieldPrediction, FieldRecord } from "../../evaluation/fieldGold/types";

function record(partial: Partial<FieldRecord>): FieldRecord {
  return { title: null, authors: [], affiliations: [], emails: [], captions: [], references: [], ...partial };
}

function gold(fields: Partial<FieldRecord>, extra: Partial<FieldGold> = {}): FieldGold {
  return {
    id: "g1", source: "europepmc", language: "en", discipline: "medicine", pdfPath: "x.pdf", pdfSha256: "0",
    trustedFields: ["title", "authors", "authorAffiliation", "emails", "captions", "references"],
    fields: record(fields), ...extra,
  };
}

function pred(fields: Partial<FieldRecord>, extra: Partial<FieldPrediction> = {}): FieldPrediction {
  return { id: "g1", parser: "versio", parserVersion: "t", elapsedMs: 1, unavailableFields: [], fields: record(fields), ...extra };
}

describe("field gold normalization", () => {
  it("strips footnote markers from names", () => {
    expect(normalizeName("Smith*†1", "en")).toBe(normalizeName("smith", "en"));
  });
  it("ignores spaces in Japanese names", () => {
    expect(normalizeName("山田 太郎", "ja")).toBe(normalizeName("山田太郎", "ja"));
  });
  it("folds diacritics", () => {
    expect(normalizeName("José Müller", "en")).toBe(normalizeName("Jose Muller", "en"));
  });
  it("joins hyphenated line breaks", () => {
    expect(normalizeText("deep learn-\ning")).toBe("deep learning");
  });
  it("similarity is 1 for equal and high for one-char diff", () => {
    expect(similarity("Abc def", "abc def")).toBe(1);
    expect(similarity("A study of jewellery", "A study of jewelery")).toBeGreaterThan(0.9);
  });
});

describe("scoreFields", () => {
  it("scores titles", () => {
    expect(scoreFields(gold({ title: "Interactive Jewellery" }), pred({ title: "Interactive Jewellery" })).title).toEqual({ exact: 1, similarity: 1 });
    const near = scoreFields(gold({ title: "Interactive Jewellery design" }), pred({ title: "Interactive Jewelery design" })).title!;
    expect(near.exact).toBe(0);
    expect(near.similarity).toBeGreaterThan(0.9);
  });

  it("scores authors as P/R/F1", () => {
    const s = scoreFields(
      gold({ authors: [{ name: "Jane Smith", affiliationKeys: [] }, { name: "Bo Chen", affiliationKeys: [] }, { name: "Ann Lee", affiliationKeys: [] }] }),
      pred({ authors: [{ name: "J. Smith", affiliationKeys: [] }, { name: "Bo Chen*", affiliationKeys: [] }] }),
    ).authors!;
    expect(s.precision).toBe(1);
    expect(s.recall).toBeCloseTo(0.667, 3);
  });

  it("gives zero author-affiliation F1 when affiliations are swapped", () => {
    const affiliations = [{ key: "a", text: "University of Tokyo" }, { key: "b", text: "Kyoto University" }];
    const s = scoreFields(
      gold({ authors: [{ name: "Jane Smith", affiliationKeys: ["a"] }, { name: "Bo Chen", affiliationKeys: ["b"] }], affiliations }),
      pred({ authors: [{ name: "Jane Smith", affiliationKeys: ["b"] }, { name: "Bo Chen", affiliationKeys: ["a"] }], affiliations }),
    ).authorAffiliation!;
    expect(s.f1).toBe(0);
  });

  it("separates caption detection from label linkage", () => {
    const s = scoreFields(
      gold({ captions: [{ kind: "figure", label: "Figure 3", text: "Overview of the system." }] }),
      pred({ captions: [{ kind: "figure", label: "Figure 2", text: "Overview of the system." }] }),
    ).captions!;
    expect(s.f1).toBe(1);
    expect(s.labelAccuracy).toBe(0);
  });

  it("skips fields with no gold and no prediction", () => {
    expect(scoreFields(gold({}), pred({})).references).toBeUndefined();
  });

  it("only scores trusted fields", () => {
    const g = gold({ emails: ["a@b.c"] }, { trustedFields: ["title"] });
    expect(scoreFields(g, pred({ emails: ["a@b.c"] })).emails).toBeUndefined();
  });

  it("does not score fields the parser could not run", () => {
    const g = gold({ references: [{ raw: "Smith J. A paper. 2020." }] });
    expect(scoreFields(g, pred({}, { unavailableFields: ["references"] })).references).toBeUndefined();
  });

  it("scores references with field accuracy", () => {
    const s = scoreFields(
      gold({ references: [
        { raw: "Smith J. Deep models of reading. Nature. 2020.", title: "Deep models of reading", year: "2020", doi: "10.1/abc" },
        { raw: "Lee A. Another paper on jewellery. CHI 2019.", title: "Another paper on jewellery", year: "2019" },
      ] }),
      pred({ references: [{ raw: "Smith J. Deep models of reading. Nature. 2020.", title: "Deep models of reading", year: "2020", doi: "10.1/ABC" }] }),
    ).references!;
    expect(s.recall).toBe(0.5);
    expect(s.precision).toBe(1);
    expect(s.countRatio).toBe(0.5);
    expect(s.titleAccuracy).toBe(1);
    expect(s.doiAccuracy).toBe(1);
  });
});
