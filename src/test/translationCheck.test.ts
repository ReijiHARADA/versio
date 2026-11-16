import { describe, expect, it } from "vitest";
import { checkTranslation, isAcceptableTranslation } from "../services/translation/translationCheck";

const src60 = "The proposed model improves robustness across all evaluated benchmark datasets.";
const ja60 = "提案モデルは、評価したすべてのベンチマークデータセットで頑健性を向上させる。";

describe("checkTranslation", () => {
  it("accepts unit-converted numbers", () => expect(checkTranslation("about 20 million users", "約2000万人のユーザー").lostFacts).toEqual([]));
  it("keeps thousands separators", () => expect(checkTranslation("n = 2,431 participants were enrolled in total", "合計2431人の参加者が登録された").ok).toBe(true));
  it("does not split citation groups", () => expect(checkTranslation("as shown before [8,10–13] in prior work on this", "先行研究[8,10–13]で示された").lostFacts).toEqual([]));
  it("flags a lost number", () => expect(checkTranslation("accuracy improved by 4.7% over the baseline model", "精度がベースラインより向上した").lostFacts).toEqual(["num:4.7"]));
  it("flags English echo", () => expect(checkTranslation(src60, src60).breakdown).toContain("not_japanese"));
  it("flags meta preamble", () => expect(checkTranslation(src60, "以下は翻訳です：" + ja60).breakdown).toContain("meta_preamble"));
  it("flags empty output", () => expect(checkTranslation("Hello world.", "  ").breakdown).toEqual(["empty"]));
  it("lets short titles through", () => expect(isAcceptableTranslation("謝辞", "Acknowledgements")).toBe(true));
  it("flags runaway length on long sources", () =>
    expect(checkTranslation(src60, ja60.repeat(3)).breakdown.some((r) => r.startsWith("length_ratio:"))).toBe(true));
  it("accepts a good translation", () => expect(isAcceptableTranslation(ja60, src60)).toBe(true));
});
