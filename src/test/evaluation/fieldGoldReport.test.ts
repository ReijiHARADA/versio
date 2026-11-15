import { describe, expect, it } from "vitest";
import { buildReport } from "../../evaluation/fieldGold/report";
import type { FieldGold, FieldPrediction, FieldRecord, ParserId } from "../../evaluation/fieldGold/types";

const empty: FieldRecord = { title: null, authors: [], affiliations: [], emails: [], captions: [], references: [] };
const gold = (id: string, title: string): FieldGold => ({
  id, source: "europepmc", language: "en", discipline: "medicine", pdfPath: "x", pdfSha256: "0",
  trustedFields: ["title", "references"], fields: { ...empty, title, references: [{ raw: "Smith J. A paper. 2020." }] },
});
const pred = (id: string, parser: ParserId, title: string, unavailable: FieldPrediction["unavailableFields"] = []): FieldPrediction => ({
  id, parser, parserVersion: "t", elapsedMs: 1, unavailableFields: unavailable,
  fields: { ...empty, title, references: unavailable.includes("references") ? [] : [{ raw: "Smith J. A paper. 2020." }] },
});

describe("buildReport", () => {
  const golds = [gold("d1", "Alpha beta gamma"), gold("d2", "Delta epsilon")];
  const predictions = [
    pred("d1", "versio", "Alpha beta gamma"),
    pred("d2", "versio", "Something else"),
    pred("d1", "grobid", "Alpha beta gamma", ["references"]),
    pred("d2", "grobid", "Delta epsilon", ["references"]),
  ];
  const { markdown, json } = buildReport({ golds, predictions });

  it("lists both parsers", () => {
    expect(markdown).toContain("| versio | all | all | 2 |");
    expect(markdown).toContain("| grobid | all | all | 2 |");
  });
  it("keeps unavailable fields out of the mean", () => {
    const row = json.groups.find((g) => g.field === "references" && g.parser === "grobid" && g.source === "all" && g.language === "all")!;
    expect(row.n).toBe(0);
    expect(row.unavailable).toBe(2);
  });
  it("orders worst cases ascending", () => {
    const section = markdown.slice(markdown.indexOf("ワースト 5（versio）"));
    expect(section.indexOf("d2")).toBeLessThan(section.indexOf("d1"));
  });
  it("omits excerpts when asked", () => {
    expect(buildReport({ golds, predictions, excerpts: false }).markdown).not.toContain("正解:");
  });
});
