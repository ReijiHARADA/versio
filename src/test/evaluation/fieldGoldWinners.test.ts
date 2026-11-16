import { describe, expect, it } from "vitest";
import type { ReportJson, ScoredDocument } from "../../evaluation/fieldGold/report";
import type { FieldName, ParserId } from "../../evaluation/fieldGold/types";
import { proposeWinners } from "../../evaluation/fieldGold/winners";

const prf = (f1: number) => ({ precision: f1, recall: f1, f1, gold: 1, predicted: 1 });
function doc(id: string, parser: ParserId, language: "en" | "ja", refs: number | null, unavailable: FieldName[] = []): ScoredDocument {
  return { id, parser, source: "europepmc", language, unavailable, scores: refs === null ? {} : { references: { ...prf(refs), countRatio: 1, titleAccuracy: null, yearAccuracy: null, doiAccuracy: null } } };
}
const report = (documents: ScoredDocument[]): ReportJson => ({ documents, groups: [] });
const refsWinner = (r: ReportJson, language: "en" | "ja") => proposeWinners(r, { minMargin: 0.05 }).find((w) => w.field === "references" && w.language === language)!;

describe("proposeWinners", () => {
  it("adopts a parser for English but not for Japanese when it is worse there", () => {
    const r = report([
      doc("e1", "versio", "en", 0.3), doc("e1", "grobid", "en", 0.5),
      doc("j1", "versio", "ja", 0.4), doc("j1", "grobid", "ja", 0.3),
    ]);
    expect(refsWinner(r, "en").winner).toBe("grobid");
    const ja = refsWinner(r, "ja");
    expect(ja.winner).toBe("versio");
    expect(ja.reason).toContain("悪化");
  });
  it("keeps the current extractor when the margin is below the threshold", () => {
    const r = report([doc("e1", "versio", "en", 0.5), doc("e1", "grobid", "en", 0.53)]);
    expect(refsWinner(r, "en").winner).toBe("versio");
  });
  it("ignores a parser that could not run the field", () => {
    const r = report([doc("e1", "versio", "en", 0.2), doc("e1", "apple", "en", null, ["references"])]);
    const en = refsWinner(r, "en");
    expect(en.winner).toBe("versio");
    expect(en.reason).toContain("未実行");
  });
});
