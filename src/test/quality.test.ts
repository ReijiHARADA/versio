import { describe, expect, it } from "vitest";
import {
  isPlausibleJaTranslation,
  isDegenerateTranslation,
  shouldTranslateTitle,
  shouldTranslateParagraph,
  shouldTranslateHeading,
  looksLikeSubjectClassification,
  evaluateJaTranslation,
  extractScientificInvariants,
  isExpectedNonProseParagraph,
  unsafeParagraphStructureReason,
  restoreUtf8ByteEscapes,
} from "../services/translation/quality";
import { resolveImportConfig } from "../services/import/helpers";
import { analyzeStructure } from "../services/structureService";
import {
  isRetryableTranslationFailure,
  shouldTranslateBlock,
} from "../services/importServiceV2";
import {
  displayProcessingStatus,
  finalizedTranslationStatus,
} from "../services/paperStatus";
import { FIXTURES } from "./readingOrder/builders";
import type { PaperBlock } from "../types/paper";

describe("isPlausibleJaTranslation", () => {
  const source =
    "This research was supported by STW VIDI grant number 016.128.303 Research (NWO), awarded to Elise van den Hoven.";

  it("rejects a Japanese output contaminated by an English model explanation", () => {
    const source = "Visitors preferred audio descriptions because they could listen together.";
    const output = "来訪者は一緒に聞ける音声説明を好んだ。 Note: I kept this technical term in English because its exact translation varies by context.";
    expect(evaluateJaTranslation(output, source).reasons).toContain("untranslated foreign-language prose");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects a long Chinese Han-only sentence embedded in Japanese output", () => {
    const source = "The guidebook content could fit into an ongoing conversation between visitors.";
    const output = "ガイドブックの内容は訪問者間の会話に組み込める。因為參觀的流程可以採取訪問者之間持續對話的形式。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("untranslated foreign-language prose");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("allows technical English terms within an otherwise Japanese sentence", () => {
    const source = "The HCI system uses a guidebook to support shared listening.";
    const output = "HCIシステムは、共有聴取を支援するためにガイドブックを使用する。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("untranslated foreign-language prose");
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("keeps a Japanese translation that retains grant identifiers from the source", () => {
    expect(
      isPlausibleJaTranslation(
        "本研究は NWO の STW VIDI grant number 016.128.303 によって支援され、Elise van den Hoven に授与された。",
        source
      )
    ).toBe(true);
  });

  it("rejects an English echo of the source", () => {
    expect(isPlausibleJaTranslation(source, source)).toBe(false);
  });

  it("rejects fragmented Japanese decoder artifacts", () => {
    const fragmented =
      "これ は じ る デモン の こと で あ る 。 それ は かおり を 吹 く ため に かおり と な り こと を 吹 き 呼 ん で い る 。";
    const normal =
      "社会的受容性は時間と文化に依存するため、参加者の態度を理解するための自由記述データを収集した。";
    expect(isDegenerateTranslation(fragmented)).toBe(true);
    expect(isPlausibleJaTranslation(fragmented, "We collected open-ended responses to understand participants' attitudes toward the system.")).toBe(false);
    expect(isDegenerateTranslation(normal)).toBe(false);
  });

  it("rejects malformed scientific protection placeholders", () => {
    const source = "Results were significant (p=0.001).";
    const output = "結果は有意だった（p=0.001）。ZZCイT4ZZ";
    expect(isDegenerateTranslation(output)).toBe(true);
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("treats ASCII chi-square notation as an indivisible statistic", () => {
    const source = "There was no difference, χ2(3)=0.37, p=0.83.";
    const output = "差はなかった。p=0.83。";
    expect(evaluateJaTranslation(output, source).reasons.join(" ")).toContain("χ2(3)=0.37");
  });

  it("rejects orphaned invariant-only sentences in a longer prose translation", () => {
    const source =
      "Fairness evaluations. After the main task, participants made fairness judgements for several hypothetical money allocations between a person A and a person B. Neither cathodal, nor anodal tDCS altered the fairness perception of participants (Fig. 8 and Table S3). In line with earlier findings, this suggests that brain stimulation led participants to make different decisions without changing the underlying evaluation process.";
    const output =
      "フェアネス評価。主な作業の後、参加者は仮定的な金銭配分に対して公平性判断を行った。tDCS(Fig. 8 and Table S3)。これは、脳刺激が基礎的な評価過程を変えることなく参加者を異なる決定に導くことを示唆する。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("orphaned source invariant sentence");
  });

  it("allows source facts embedded in Japanese prose", () => {
    const source =
      "The result was consistent with prior observations (Fig. 8 and Table S3), suggesting that the intervention did not change the underlying evaluation process.";
    const output =
      "結果は先行観察（Fig. 8 and Table S3）と一致し、この介入が基礎的な評価過程を変えなかったことを示唆する。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("orphaned source invariant sentence");
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("rejects a fluent result that loses a bare rank statistic or figure panel", () => {
    const source = "Selfishness changed significantly (Fig. 7b, Mann–Whitney U test, U=307, p=0.03).";
    const dropped = "自己中心性は有意に変化した。p=0.03。";
    const preserved = "自己中心性は有意に変化した（Fig. 7b、Mann–Whitney U test、U=307、p=0.03）。";
    expect(extractScientificInvariants(source).map((item) => item.value)).toEqual(expect.arrayContaining(["Fig. 7b", "U=307", "p=0.03"]));
    expect(isPlausibleJaTranslation(dropped, source)).toBe(false);
    expect(isPlausibleJaTranslation(preserved, source)).toBe(true);
  });

  it("treats plural figure references as source facts", () => {
    const source = "Figures 3, 4, and 5 show the response curves.";
    expect(extractScientificInvariants(source).map((item) => item.value)).toContain("Figures 3");
    expect(isPlausibleJaTranslation("応答曲線を示す。", source)).toBe(false);
  });

  it("treats parenthesized figure panels as source facts", () => {
    const source = "The necklace case is hung around the neck, as illustrated in Figure 1(a).";
    expect(extractScientificInvariants(source).map((item) => item.value)).toContain("Figure 1(a)");
    expect(isPlausibleJaTranslation("ネックレスケースを首に掛ける。Figure 1。", source)).toBe(false);
    expect(isPlausibleJaTranslation("ネックレスケースを首に掛ける。Figure 1(a)。", source)).toBe(true);
  });

  it("accepts Japanese figure labels while preserving the figure and panel number", () => {
    expect(isPlausibleJaTranslation("結果を図5に示す。", "The results are shown in Figure 5.")).toBe(true);
    expect(isPlausibleJaTranslation("結果を図1(a)に示す。", "The results are shown in Figure 1(a).")).toBe(true);
    expect(isPlausibleJaTranslation("結果を図1に示す。", "The results are shown in Figure 1(a).")).toBe(false);
    expect(isPlausibleJaTranslation("結果を図6に示す。", "The results are shown in Figure 5.")).toBe(false);
  });

  it("requires table cross-references to survive in Japanese or source form", () => {
    const source = "The levels are shown in Table 5.";
    expect(extractScientificInvariants(source).map((item) => item.kind)).toContain("table");
    expect(isPlausibleJaTranslation("分類は表5に示す。", source)).toBe(true);
    expect(isPlausibleJaTranslation("分類は第5表に示す。", source)).toBe(true);
    expect(isPlausibleJaTranslation("分類は表5に示す。値は5である。", source)).toBe(true);
    expect(isPlausibleJaTranslation("分類は異なるレベルである。値は5である。", source)).toBe(false);
  });

  it("treats full-width Japanese digits as the same preserved numeric facts", () => {
    const source = "The study included 82 participants, including 64 women.";
    expect(isPlausibleJaTranslation("本研究の参加者は８２人で、そのうち６４人が女性だった。", source)).toBe(true);
  });

  it("treats variable comparison conditions as source facts", () => {
    const source = "The OLS comparison assumes y \u0338= 0 when x = 0.";
    const values = extractScientificInvariants(source).map((item) => item.value);
    expect(values).toEqual(expect.arrayContaining(["y \u0338= 0", "x = 0"]));
    expect(isPlausibleJaTranslation("OLS比較を仮定した。x = 0。", source)).toBe(false);
    expect(isPlausibleJaTranslation("OLS比較ではy != 0かつx = 0を仮定した。", source)).toBe(true);
  });

  it("rejects fluent Japanese that drops scientific facts", () => {
    const source = "For n = 20, F(4,33) = 2.913 and p < 0.001 [12] were observed at 9.6 mm.";
    const output = "20人の参加者では有意な差が観察されました。";
    const quality = evaluateJaTranslation(output, source);
    expect(quality.invariantScore).toBeLessThan(0.5);
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects simplified-Chinese contamination inside Japanese output", () => {
    const source = "Deep learning methods are widely used in medical image segmentation and improve the accuracy of diagnosis.";
    expect(isPlausibleJaTranslation("医療画像のセグメンテーションにディープ学习手法を用いる。", source)).toBe(false);
  });

  it("rejects a pure Chinese decode for an English source", () => {
    const source = "Teaching analytics refers to the analysis and evaluation of teaching activities.";
    expect(isPlausibleJaTranslation("教学分析是对教学活动及其表现数据的分析。", source)).toBe(false);
  });

  it("accepts academic Japanese while preserving scientific invariants", () => {
    const source = "For n = 20, F(4,33) = 2.913 and p < 0.001 [12] were observed at 9.6 mm.";
    const output = "n = 20では、9.6 mmにおいてF(4,33) = 2.913、p < 0.001という結果が観察された[12]。";
    expect(extractScientificInvariants(source).map((item) => item.value)).toContain("F(4,33) = 2.913");
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("accepts a Japanese expansion of SD when its associated value is preserved", () => {
    const source = "The mean age was 21.54 years (SD=2.16).";
    expect(isPlausibleJaTranslation("平均年齢は21.54歳（標準偏差2.16）だった。", source)).toBe(true);
  });

  it("accepts an unchanged SD token and all its source values", () => {
    expect(isPlausibleJaTranslation(
      "平均値は2.77（SD=1.83）で、対照群は1.86（SD=1.25）だった。",
      "The mean was 2.77 (SD=1.83), and the control group was 1.86 (SD=1.25)."
    )).toBe(true);
  });

  it("still rejects SD expansion when its value or statistical label is missing", () => {
    const source = "The mean age was 21.54 years (SD=2.16).";
    expect(isPlausibleJaTranslation("平均年齢は21.54歳（標準偏差2.61）だった。", source)).toBe(false);
    expect(isPlausibleJaTranslation("平均年齢は21.54歳、値は2.16だった。", source)).toBe(false);
  });

  it("keeps clustered unbracketed superscript citations as citation invariants", () => {
    const source = "Participants follow the rule unconditionally29,30,32; stimulation in this case12,33 had little effect.";
    const good = "参加者は無条件に規則に従う29,30,32。刺激はこの場合、ほとんど影響しなかった12,33。";
    expect(extractScientificInvariants(source).map((item) => item.value)).toContain("29,30,32");
    expect(isPlausibleJaTranslation(good, source)).toBe(true);
    expect(isPlausibleJaTranslation("参加者は無条件に規則に従う。刺激はこの場合、ほとんど影響しなかった。", source)).toBe(false);
  });

  it("treats a trailing range in an inline superscript citation cluster as critical", () => {
    const source = "Thus, the effect was replicated for selfish decisions3,6,9,12–14.";
    const citation = "3,6,9,12–14";
    expect(extractScientificInvariants(source).map((item) => item.value)).toContain(citation);
    expect(isPlausibleJaTranslation(`この効果は再現された${citation}。`, source)).toBe(true);
    const missingFinalCitation = evaluateJaTranslation("この効果は再現された3,6,9,12。", source);
    expect(missingFinalCitation.reasons.join(" ")).toContain(citation);
    expect(isPlausibleJaTranslation("この効果は再現された3,6,9,12。", source)).toBe(false);
  });

  it("rejects a spatial intervention target mistranslated as a comparison", () => {
    const source = "Cathodal tDCS over the right LPFC leads to more selfish decisions.";
    const mistranslation = "右側のLPFCより陰極側のtDCSが、より利己的な決定に導く。";
    const faithful = "右LPFC上の陰極tDCSは、より利己的な決定につながる。";
    expect(evaluateJaTranslation(mistranslation, source).reasons).toContain(
      "spatial target relation rendered as comparison",
    );
    expect(isPlausibleJaTranslation(mistranslation, source)).toBe(false);
    expect(isPlausibleJaTranslation(faithful, source)).toBe(true);
  });

  it("accepts a superscript citation rendered with brackets when its number matches", () => {
    const source = "The canonical “Linda problem”15 (Linda) was used in the study.";
    const output = "標準的な「リンダ問題」[15]（Linda）を研究で用いた。";
    expect(extractScientificInvariants(source).map((item) => item.value)).toContain("15");
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("rejects a changed superscript citation even when both use brackets", () => {
    const source = "The canonical “Linda problem”15 (Linda) was used in the study.";
    const output = "標準的な「リンダ問題」[16]（Linda）を研究で用いた。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
    expect(evaluateJaTranslation(output, source).reasons.join(" ")).toMatch(/15|16/);
  });

  it("rejects a fluent translation that invents a measurement absent from the source", () => {
    const source = "A moving-average filter with a window length of 60 seconds removes outliers.";
    const output = "60秒の移動平均フィルタで外れ値を除去した。さらに100mmと10mmの測定を行った。";
    const quality = evaluateJaTranslation(output, source);
    expect(quality.reasons).toContain("unexpected scientific invariants: 100mm, 10mm");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects an invented calendar year while retaining a source year", () => {
    const source = "Before World War I, wristwatches were worn by women. The Walkman debuted in 1979.";
    const output = "1914年に時計の歴史が発表された。ウォークマンは1979年に発売された。";
    expect(extractScientificInvariants(source).map((item) => item.value)).toContain("1979");
    expect(evaluateJaTranslation(output, source).reasons.join(" ")).toContain("1914");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects a translation that drops a micro-watt power measurement", () => {
    expect(isPlausibleJaTranslation(
      "装置は11.3 mm幅で335 mgである。",
      "The device is 11.3 mm wide, weighs 335 mg, and consumes 14.4 uW."
    )).toBe(false);
  });

  it("rejects changed Celsius values while allowing a faithful temperature translation", () => {
    const source = "Earlobe temperature decreased from 37.1 °C to 33.9 °C during the observation.";
    expect(isPlausibleJaTranslation("観察中に耳たぶの温度は37.1°Cから33.9°Cに低下した。", source)).toBe(true);
    const changed = evaluateJaTranslation("観察中に耳たぶの温度は37.1°Cから23.9°Cに低下した。", source);
    expect(changed.reasons.join(" ")).toContain("33.9 °C");
    expect(isPlausibleJaTranslation("観察中に耳たぶの温度は37.1°Cから23.9°Cに低下した。", source)).toBe(false);
  });

  it("rejects a corrupted restored measurement with an adjacent extra digit", () => {
    const source = "The temperature decreased from 37.1 °C (98.8 °F) to 33.9 °C (93 °F).";
    const output = "温度は37.1 °C (98.8 °F)から233.9 °C (93 °F)に低下した。";
    const quality = evaluateJaTranslation(output, source);
    expect(quality.reasons.join(" ")).toContain("33.9 °C");
    expect(quality.reasons.join(" ")).toContain("233.9 °C");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects fluent phrase-loop output without relying on a vocabulary blacklist", () => {
    const source = "Wearable devices can support personal and social practices when their design starts from existing rituals.";
    const output = "ウェブアプリケーションの役割を明らかにするため、ウェブアプリケーションの役割を明らかにするため、ウェブアプリケーションの役割を明らかにするための研究を行った。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects repeated short Japanese propositions", () => {
    const source = "The course ends with group participation in a real experiment.";
    const output = "実験の結果、参加者は課題を完了した。実験の結果は、実験の結果と一致し、実験の結果を評価した。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("does not reject normal repeated terms in statistical result prose", () => {
    const source = "Interaction with the Jogwheel located at the collarbone (0.022), the wrist (0.046), the torso (0.012), and the waist (0.027) looked less embarrassing when performed by a male. Interaction occurring at the waist looked less impolite (0.013) and less weird (0.007) when executed by a male. Interaction taking place on the pocket also appeared to bother participants less when performed by a male (0.017).";
    const output = "男性の場合, 鎖骨, 手首, 胴体, 腰部に位置するジョグホイールとの相互作用は, 恥ずかしさが少なく見えた。(0.022)(0.046)(0.012)(0.027)。腰部での相互作用は, 男性が行うときは, 失礼さが少なく(0.013), 奇妙さが少なく(0.007)と見えた。また, ポケット上での相互作用は, 男性(0.017)が行うと, 参加者を不快にさせないように見えた。";
    expect(isDegenerateTranslation(output)).toBe(false);
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("accepts coherent single-sentence prose with a repeated technical term", () => {
    const source = "Contemporary Jewellery is a rich craft discipline that seeks to extend concepts of jewellery by embracing new materials, processes and perspectives, whilst challenging preconceptions of jewellery and its role in society.";
    const output = "現代ジュエリーは, 新しい素材, プロセス, 視点を取り入れ, 社会におけるジュエリーの役割に関する先入観に挑戦することによって, ジュエリーコンセプトを拡張しようとする豊かな技術分野である。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });


  it("rejects literal tokenizer byte escapes inside otherwise Japanese output", () => {
    const source = "A camera captures an image from beneath the chin.";
    const output = "カメラは<0xE9><0xA0><0x9A>の下から画像を取得する。";
    expect(isDegenerateTranslation(output)).toBe(true);
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("restores valid tokenizer byte escapes before the client gate", () => {
    expect(restoreUtf8ByteEscapes("胸部の<0xE8><0x90><0xBC>片")).toBe("胸部の萼片");
    expect(restoreUtf8ByteEscapes("本文 <0xE8><0x90>")).toBe("本文 <0xE8><0x90>");
  });

  it("rejects leftover scientific placeholders even with Latin lookalike glyphs", () => {
    const source = "The value is x = 0.";
    const output = "値はZZCΙT1ZZである。";
    expect(isDegenerateTranslation(output)).toBe(true);
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects leftover scientific placeholders with Greek zeta lookalikes", () => {
    const source = "The values were (0.013) and (0.007).";
    const output = "値は(0.013)で、クールではない(ΖZCIt2ZZ)となった。";
    expect(isDegenerateTranslation(output)).toBe(true);
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects a translation that alters a mixed-case technical identifier", () => {
    const source = "Regularized DeepIV improves instrumental variable estimation.";
    const output = "正規化DipIVは操作変数推定を改善する。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
    expect(evaluateJaTranslation(output, source).reasons).toContain("scientific invariants missing: DeepIV");
  });

  it("does not treat one model name as preservation of another acronym", () => {
    expect(isPlausibleJaTranslation(
      "DeBERTaはエンコーダ専用モデルである。",
      "BERT and DeBERTa are encoder-only models."
    )).toBe(false);
  });

  it("accepts a preserved method identifier when its source spacing is normalized", () => {
    expect(isPlausibleJaTranslation(
      "本手法は(Hartford et al., 2017)のDeepIVと類似している。",
      "Our method shares similarities with Deep IV (Hartford et al., 2017)."
    )).toBe(true);
  });

  it("does not accept a different identifier as a compacted method name", () => {
    const result = evaluateJaTranslation("方法はDeeperIVである。", "The method is Deep IV.");
    expect(result.reasons).toContain("scientific invariants missing: IV");
  });


  it("rejects a fluent translation that silently drops a method acronym", () => {
    const source = "RDIV improves MSE for NPIV regression.";
    const output = "この方法は回帰の誤差を改善する。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
    expect(evaluateJaTranslation(output, source).invariantScore).toBeLessThan(0.5);
  });

  it("rejects a translation that drops a hyphenated system identifier", () => {
    expect(
      isPlausibleJaTranslation(
        "人体を用いて複数の装着デバイスへ電力を届ける手法を開発した。",
        "We developed Power-over-Skin, an approach using the human body itself to deliver power."
      )
    ).toBe(false);
  });

  it("accepts a descriptive hyphenated expansion when its acronym is preserved", () => {
    const source = "We report the Signal-to-Noise Ratio (SNR) for each condition.";
    const output = "各条件の信号対雑音比（SNR）を報告する。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("rejects a long translation that ends in a truncated source name", () => {
    const source = `${"The study evaluates related work and reports the observed interaction results. ".repeat(6)}Baudisch et al. describe the comparison.`;
    const output = "本研究は関連研究と観察された相互作用の結果を評価する。Baudi";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
    expect(evaluateJaTranslation(output, source).reasons).toContain("trailing Latin fragment");
  });

  it("rejects a translation that drops an explicit source negation", () => {
    const source = "The individual does not consider x to be important.";
    const output = "個人はxを重要と考える。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
    const quality = evaluateJaTranslation(output, source);
    expect(quality.reasons).toContain("source negation missing");
    expect(quality.score).toBeLessThan(0.8);
  });

  it("accepts an explicit negation preserved in Japanese", () => {
    const source = "The individual does not consider x to be important.";
    const output = "個人はxを重要とは考えない。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("rejects a fluent reversal of lexical omission or exclusion claims", () => {
    const cases = [
      {
        source: "This document is a primary source of practitioner knowledge, foregoing references or data.",
        output: "この文書は実務家の知識の一次資料であり、参考資料やデータの主要な源である。",
      },
    ];
    for (const { source, output } of cases) {
      expect(evaluateJaTranslation(output, source).reasons).toContain("source negation missing");
      expect(isPlausibleJaTranslation(output, source)).toBe(false);
    }
  });

  it("accepts lexical omission claims when Japanese preserves the negative meaning", () => {
    expect(isPlausibleJaTranslation(
      "この文書は参考文献やデータを含まない実務家知識の一次資料である。",
      "This document is a primary source of practitioner knowledge, foregoing references or data."
    )).toBe(true);
  });

  it("detects omission verbs separated by PDF line-wrap hyphenation", () => {
    const source = "This document is a primary source, fore-going references or data.";
    const output = "この文書は参考資料やデータの主要な源である。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("source negation missing");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects a universal claim that drops quantifier negation", () => {
    const source = "Contrary to earlier work, not all persuasion theories are effective online.";
    const output = "以前の研究とは異なり、すべての説得理論がオンラインで有効である。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
    expect(evaluateJaTranslation(output, source).reasons).toContain("source negation missing");
  });

  it("accepts a bounded universal claim when quantifier negation is preserved", () => {
    const source = "Contrary to earlier work, not all persuasion theories are effective online.";
    const output = "以前の研究とは異なり、すべての説得理論がオンラインで有効とは限らない。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("rejects negation moved from reported content onto the reporting verb", () => {
    const source = "Participants who reported not to have looked at the pictures had higher scores.";
    const reversed = "写真を見ていないと報告しなかった参加者は、より高いスコアだった。";
    const faithful = "写真を見ていないと報告した参加者は、より高いスコアだった。";
    expect(evaluateJaTranslation(reversed, source).reasons).toContain(
      "negation moved from reported content to reporting predicate"
    );
    expect(isPlausibleJaTranslation(reversed, source)).toBe(false);
    expect(isPlausibleJaTranslation(faithful, source)).toBe(true);
  });

  it("rejects the negation-scope reversal found in the recovered marketing paragraph", () => {
    const source = "Compared with participants who reported not to have looked at the pictures, those who looked at them chose healthier snacks.";
    const output = "画像を見た被験者は、見ていないと報告しなかった被験者に比べ、より健康的なスナックを選んだ。";
    expect(evaluateJaTranslation(output, source).reasons).toContain(
      "negation moved from reported content to reporting predicate"
    );
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("accepts an unchanged SD=value invariant without requiring its Japanese expansion", () => {
    const source = "The score was higher in the treatment group (M=1.69, SD=3.20) than in the control group (M=0.66, SD=1.09).";
    const output = "介入群のスコアは対照群より高かった(M=1.69, SD=3.20)(M=0.66, SD=1.09)。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain(
      "scientific invariants missing: SD"
    );
  });

  it("accepts the faithful negative-group-first rescue candidate", () => {
    const source = "Participants who reported not to have looked at the pictures had lower implicit attention scores (M=0.66, SD=1.09, U=528.00, p=0.009), whereas participants who reported to have looked at the pictures had higher implicit attention scores (M=1.69, SD=3.20).";
    const output = "画像を見なかったと報告した被験者は低い潜在的注意スコアを示し, 画像をみたと報告する被験者が高い潜在性注意スコアーを示した(M=0.66, SD=1.09, U=528.00, p=0.009)(M=1.69, SD=3.20)。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("rejects a definite result when the source only says an effect might not have been detected", () => {
    const source = "Due to the relatively small number of participants in each condition, smaller effects might not have been detected.";
    const overconfident = "各条件における参加者数が比較的少ないため、小さな効果は検出されなかった。";
    const faithful = "各条件の参加者数が比較的少ないため、小さな効果は検出されなかった可能性がある。";
    expect(evaluateJaTranslation(overconfident, source).reasons).toContain("epistemic uncertainty lost");
    expect(isPlausibleJaTranslation(overconfident, source)).toBe(false);
    expect(isPlausibleJaTranslation(faithful, source)).toBe(true);
  });

  it("does not require uncertainty for an explicitly definite negative result", () => {
    const source = "Due to the relatively small number of participants in each condition, smaller effects were not detected.";
    const output = "各条件の参加者数が少なかったため、小さな効果は検出されなかった。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("epistemic uncertainty lost");
  });

  it("checks epistemic uncertainty in the aligned translated sentence, not elsewhere in the paragraph", () => {
    const source = "The sample size was small. Due to few participants, smaller effects might not have been detected.";
    const overconfident = "サンプルサイズは小さかった。参加者が少なかったため、小さな効果は検出されなかった。";
    const faithful = "サンプルサイズは小さかった。参加者が少なかったため、小さな効果は検出されなかった可能性がある。";
    expect(evaluateJaTranslation(overconfident, source).reasons).toContain("epistemic uncertainty lost");
    expect(isPlausibleJaTranslation(overconfident, source)).toBe(false);
    expect(isPlausibleJaTranslation(faithful, source)).toBe(true);
  });

  it("accepts a faithful alternate-model rendering of the reported negative comparison", () => {
    const source = "Participants who reported to have looked at the pictures had higher implicit attention scores (M=1.69, SD=3.20), compared to those who reported not to have looked at the pictures (M=0.66, SD=1.09, U=528.00, p=0.009).";
    const output = "写真を見たと報告した参加者の暗黙の注意スコアは(M=1.69, SD=3.20)、写真を見なかったと報告した参加者に比べて高かった(M=0.66, SD=1.09, U=528.00, p=0.009)。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("accepts an alternate-model translation that preserves epistemic uncertainty", () => {
    const source = "Due to the relatively small number of participants in each condition, smaller effects might not have been detected.";
    const output = "参加者の数が各条件下で相対的に少ないため、より小さな効果が検出されなかった可能性があります。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("rejects a participant total translated as a count from each unspecified field", () => {
    const source = "Eighty-eight participants from various fields of study were recruited.";
    const output = "各学科から88名の参加者を募集した。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("participant total may have shifted to field-level count");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects attaching the participant total to an unspecified number of fields", () => {
    const source = "Eighty-eight participants from various fields of study were recruited.";
    const output = "88名の研究分野から参加者を募集した。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("participant total may have shifted to field-level count");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("accepts varied-field sampling when the participant total remains collective", () => {
    const source = "Eighty-eight participants from various fields of study were recruited.";
    expect(isPlausibleJaTranslation("様々な学問分野から88名の参加者を募集した。", source)).toBe(true);
  });

  it("allows a field-level sample count when the source explicitly states it", () => {
    const source = "Participants were recruited from various fields, with 22 from each field (N=88).";
    expect(isPlausibleJaTranslation("各分野から22名の参加者を募集し、総数は88名だった（N=88）。", source)).toBe(true);
  });

  it("rejects narrowing an explicit three-or-more-group comparison to two groups", () => {
    const source = "None of the groups differed significantly in age. The study compared three groups.";
    const output = "両群間に年齢の有意差はなかった。3群を比較した。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("collective group comparison narrowed to two groups");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("accepts faithful collective comparisons and a genuine two-group study", () => {
    const threeGroups = "None of the groups differed significantly in age. The study compared three groups.";
    const twoGroups = "None of the groups differed significantly in age. The study compared two groups.";
    expect(isPlausibleJaTranslation("いずれのグループ間にも年齢の有意差はなかった。3群を比較した。", threeGroups)).toBe(true);
    expect(isPlausibleJaTranslation("両群間に年齢の有意差はなかった。2群を比較した。", twoGroups)).toBe(true);
  });

  it("rejects a fluent translation that drops the second branch of an explicit or-both condition", () => {
    const source = "The decision has consequences for another person, or both another person and the decision maker.";
    const incomplete = "決定は他の参加者に影響する。";
    const faithful = "決定は他の参加者、または他の参加者と意思決定者の双方に影響する。";
    expect(evaluateJaTranslation(incomplete, source).reasons).toContain("source disjunctive-both relation missing");
    expect(isPlausibleJaTranslation(incomplete, source)).toBe(false);
    expect(isPlausibleJaTranslation(faithful, source)).toBe(true);
  });

  it("rejects an implausibly short translation of a long multi-sentence source", () => {
    const source = `${"The study reports a separate experimental finding with its interpretation. ".repeat(10)}`;
    const output = "本研究は実験結果を報告した。";
    expect(source.length).toBeGreaterThan(500);
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
    expect(evaluateJaTranslation(output, source).reasons).toContain("long source was implausibly shortened");
  });

  it("rejects an extremely compressed result/list translation while allowing concise Japanese", () => {
    const source = "We conduct real-world experiments in febrile patients demonstrating fever detection using earlobe temperature.";
    const omitted = "耳の温度を測定する実験を行った。";
    const conciseButComplete = "発熱患者を対象に、耳たぶ温度による発熱検出を実環境で検証した。";
    expect(omitted.length / source.length).toBeLessThan(0.2);
    expect(isPlausibleJaTranslation(omitted, source)).toBe(false);
    expect(evaluateJaTranslation(omitted, source).reasons).toContain("long source was implausibly shortened");
    expect(conciseButComplete.length / source.length).toBeGreaterThanOrEqual(0.2);
    expect(isPlausibleJaTranslation(conciseButComplete, source)).toBe(true);
  });

  it("keeps a complete long translation above the audit-derived length bound", () => {
    const source = `${"The study reports a separate experimental finding with its interpretation. ".repeat(10)}`;
    const output = "研究は複数の実験結果を報告した。各結果は独立して評価された。参加者の反応を詳細に記録した。分析では条件ごとの差を検討した。結果は仮説を部分的に支持した。追加の検証も実施された。解釈には限界が伴う。将来の研究課題を提示した。結論はデータに基づいている。評価結果は再現性と妥当性の観点から詳細に報告された。方法と分析手順は研究目的に照らして明確に説明された。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });
});

describe("import translation concurrency", () => {
  it.each([2, 4, 8])("keeps configured queue concurrency %i", (translationConcurrency) => {
    expect(resolveImportConfig({ translationConcurrency }).translationConcurrency).toBe(translationConcurrency);
  });
});

describe("shouldTranslateTitle", () => {
  it("does not send a dotted grant identifier as a paper title", () => {
    expect(shouldTranslateTitle("016.128.303")).toBe(false);
  });
});

describe("subject classification lines", () => {
  const ccs1998 =
    "H.5.m. Information interfaces and presentation (e.g., HCI): Miscellaneous; H.5.2 User interfaces.";

  it("detects ACM CCS 1998 catalog lines including the miscellaneous letter suffix", () => {
    expect(looksLikeSubjectClassification(ccs1998)).toBe(true);
    expect(shouldTranslateParagraph(ccs1998)).toBe(false);
    expect(shouldTranslateHeading("ACM Classification Keywords")).toBe(false);
    expect(shouldTranslateHeading("Author Keywords")).toBe(false);
    expect(shouldTranslateHeading("CCS Concepts")).toBe(false);
    expect(shouldTranslateHeading("Index Terms")).toBe(false);
  });

  it("detects CCS 2012 concept trees", () => {
    expect(
      looksLikeSubjectClassification(
        "• Human-centered computing → Interaction devices"
      )
    ).toBe(true);
  });

  it("still translates body prose that happens to mention a classifier code", () => {
    const prose =
      "However, H.5.2 style interfaces are common in this field of research today and deserve a full translated paragraph.";
    expect(looksLikeSubjectClassification(prose)).toBe(false);
    expect(shouldTranslateParagraph(prose)).toBe(true);
  });

  it("marks classification catalog paragraphs as skipped at structure time", () => {
    const result = analyzeStructure(
      FIXTURES["classification-index"](),
      "paper-classif",
      "/tmp/classif.pdf",
      "hash-classif",
      { pageCount: 1 }
    );
    const catalog = result.blocks.find((b) => /H\.5\.m/.test(b.original || ""));
    expect(catalog?.type).toBe("paragraph");
    expect(catalog?.translationStatus).toBe("skipped");
    const prose = result.blocks.find((b) => /CLASSIFIX_INTRO/.test(b.original || ""));
    expect(prose?.translationStatus).toBe("pending");
    const introHeading = result.blocks.find(
      (b) => b.type === "heading" && /^Introduction$/i.test(b.original || "")
    );
    expect(introHeading?.translationStatus).toBe("skipped");
  });
});

describe("unsafe extracted translation input", () => {
  it("explains structural preservation without flagging normal prose", () => {
    expect(
      unsafeParagraphStructureReason(
        "Participants stayed consistent with their free choices when a rule was"
      )
    ).toContain("末尾");
    expect(
      unsafeParagraphStructureReason(
        "data, and a sun-exposure patch with a screen demonstrate sensing and wireless communication."
      )
    ).toContain("先頭");
    expect(
      unsafeParagraphStructureReason(
        "The paper examines a complete paragraph with enough ordinary content to translate safely."
      )
    ).toBeNull();
  });

  it("keeps broken words and short lower-case continuations out of MADLAD", () => {
    const brokenWord =
      "Importantly, we can have a rate O δn in relatively mild conditions while the previous Theo-";
    const lowerCaseContinuation =
      "function approximation and their method for tuning the regularization parameter. When the learning rate is manually set to";
    expect(unsafeParagraphStructureReason(brokenWord)).toContain("語が途中");
    expect(shouldTranslateParagraph(brokenWord)).toBe(false);
    expect(unsafeParagraphStructureReason(lowerCaseContinuation)).toContain("先頭");
    expect(shouldTranslateParagraph(lowerCaseContinuation)).toBe(false);
    expect(
      shouldTranslateParagraph(
        "e.g. the analysis begins with a valid discourse abbreviation and contains enough ordinary academic prose."
      )
    ).toBe(true);
    expect(
      shouldTranslateParagraph(
        "To evaluate the method, we compare the complete results under the same controlled experimental conditions."
      )
    ).toBe(true);
  });

  it("rejects short figure-panel units even when the extracted fragment has a period", () => {
    const panel = "(b) the characteristics of the interaction method with peers.";
    expect(unsafeParagraphStructureReason(panel)).toContain("サブパネル");
    expect(shouldTranslateParagraph(panel)).toBe(false);
  });

  it("does not present expected metadata skips as structural uncertainty", () => {
    const email = "researcher@example.edu collaborator@example.edu editor@example.edu";
    expect(isExpectedNonProseParagraph(email)).toBe(true);
    expect(unsafeParagraphStructureReason(email)).not.toBeNull();
  });

  it("keeps mixed permission text and incomplete continuations out of MADLAD", () => {
    expect(
      shouldTranslateParagraph(
        "Ppersonal or classroom use is granted without fee provided that copies are made for this work."
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "With the progress of detecting technologies, it is now appropriate to start looking at the possibilities of"
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "The paper examines a complete paragraph with enough ordinary prose to translate safely."
      )
    ).toBe(true);
    expect(
      unsafeParagraphStructureReason(
        "The battery life was tested using the MS621FE coin battery as"
      )
    ).toContain("末尾");
    expect(
      shouldTranslateParagraph(
        "The battery life was tested using the MS621FE coin battery as"
      )
    ).toBe(false);
    expect(
      unsafeParagraphStructureReason(
        'The device was rated as "very'
      )
    ).toContain("引用符");
    expect(
      shouldTranslateParagraph(
        "Accuracy ranged from 40.3% to 78.6%, with an average of 54.4% and standard"
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "원호연, Hongik University Industrial Design Department Graduate School"
      )
    ).toBe(false);
    expect(
      unsafeParagraphStructureReason(
        "Body temperature is an important vital sign. We present Thermal"
      )
    ).toContain("末尾");
    expect(
      shouldTranslateParagraph(
        "Body temperature is an important vital sign. We present Thermal"
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "Thermal Earring: Low-power Wireless Earring for Longitudinal Earlobe Temperature Sensing • 195:3"
      )
    ).toBe(false);
    expect(
      unsafeParagraphStructureReason(
        "We propose to target a specific solution that achieves the least norm, defined as:"
      )
    ).toContain("末尾");
    expect(
      shouldTranslateParagraph(
        "(b) a family of max-depth CFGs that GPT can learn, see Appendix G"
      )
    ).toBe(false);
  });

  it("keeps a paragraph contaminated by a running arXiv header as original", () => {
    expect(
      shouldTranslateParagraph(
        "Consumer response is complex and arXiv:2404.02175v5 13 Mar 2025 provides no prose boundary here."
      )
    ).toBe(false);
  });

  it("keeps flattened diagram labels out of paragraph translation", () => {
    expect(
      shouldTranslateParagraph(
        "Linda Cab Hospital Toma Test Wason also participated in anti-nuclear demonstrations."
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "The University of California research group reported a complete paragraph with sufficient prose for translation."
      )
    ).toBe(true);
  });

  it("keeps a lower-case comma continuation out of paragraph translation", () => {
    expect(
      shouldTranslateParagraph(
        "data, and a sun-exposure patch with a screen demonstrate sensing and wireless communication."
      )
    ).toBe(false);
  });

  it("keeps prose contaminated by an inline numeric table cell out of translation", () => {
    expect(shouldTranslateParagraph("Mean regret Your goal is to maximize received dol- 2 lars within six rounds.")).toBe(false);
    expect(shouldTranslateParagraph("GPT-3, just like people, chose the second option in this controlled experiment.")).toBe(true);
  });

  it("keeps a scientific magnitude with a missing exponent out of translation", () => {
    expect(shouldTranslateParagraph("There are at least 4 × 10 distinct sentential forms derivable from a symbol in this grammar.")).toBe(false);
    expect(shouldTranslateParagraph("There are at least 4 × 10^6 distinct sentential forms derivable from a symbol in this grammar.")).toBe(true);
  });

  it("requires an inline superscript-style citation to survive", () => {
    const source = "We introduced the “cab problem”16 (Cab, see SI Appendix) to participants in a controlled study.";
    expect(isPlausibleJaTranslation("参加者に「タクシー問題」(Cab、SI付録を参照)を提示した。", source)).toBe(false);
    expect(isPlausibleJaTranslation("参加者に「タクシー問題」16 (Cab、SI付録を参照)を提示した。", source)).toBe(true);
  });

  it("preserves numbered document references across localization", () => {
    const source = "The rest of the paper is organized as follows: related work is reviewed in Section 3.";
    expect(isPlausibleJaTranslation("本稿の構成は次の通りであり、関連研究を第3節で検討する。", source)).toBe(true);
    expect(isPlausibleJaTranslation("本稿の構成は次の通りであり、関連研究を第1節で検討する。", source)).toBe(false);
    expect(isPlausibleJaTranslation("本稿の構成は次の通りである。", source)).toBe(false);
    expect(isPlausibleJaTranslation("本稿の構成は次の通りであり、関連研究を3つ検討する。", source)).toBe(false);
  });

  it("keeps a block beginning with a lower-case sentence tail out of translation", () => {
    expect(shouldTranslateParagraph("data. This procedure has proved successful in previous offerings of this course, and the following complete sentences should be stitched with the preceding page before translation.".repeat(2))).toBe(false);
  });

  it("keeps a block ending in an incomplete determiner phrase out of translation", () => {
    expect(shouldTranslateParagraph("The analysis compares every response carefully before looking at the entire")).toBe(false);
    expect(
      shouldTranslateParagraph(
        "Starting from the design philosophy of user-centered design, this paper analyzes the human factors characteristics"
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "Bluetooth chips offer a longer wireless range and compatibility with commercial phones, albeit with"
      )
    ).toBe(false);
    expect(shouldTranslateParagraph("Available power density varies between")).toBe(false);
    expect(shouldTranslateParagraph("Participants stayed consistent with their free choices when a rule was")).toBe(false);
    expect(
      unsafeParagraphStructureReason(
        "The rest of the paper is organized as follows: we first review related work and define notations in Section"
      )
    ).toContain("文書内参照");
    expect(
      shouldTranslateParagraph(
        "The rest of the paper is organized as follows: we first review related work and define notations in Section"
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "This prototype included two applications, the phonebook application, as previously studied in the"
      )
    ).toBe(false);
    expect(shouldTranslateParagraph("A complete-looking extraction sentence that is actually cut at the page boundary ".repeat(8))).toBe(false);
    expect(shouldTranslateParagraph(`“${"A complete quoted interview statement without a final period ".repeat(8)}”`)).toBe(true);
    expect(
      shouldTranslateParagraph(
        "• identity: expressing identity, social status and beliefs towards the world and reconfirming them towards oneself"
      )
    ).toBe(true);
  });

  it("rejects source units cut after determiners, subordinators, or list delimiters", () => {
    const incompleteUnits = [
      "The first dimension describes the",
      "Pilots identified an oil pressure trend and suggested that",
      "The observed effects were statistically reliable, and",
      "The protocol included repeated strength and cognitive assessments,",
      "The participant keywords were choice, availability, and",
      "The main outcomes were cognition;",
    ];
    for (const source of incompleteUnits) {
      expect(unsafeParagraphStructureReason(source), source).toContain("末尾");
      expect(shouldTranslateParagraph(source), source).toBe(false);
    }

    expect(
      shouldTranslateParagraph(
        "The first dimension describes the consumer's participation in the co-production process."
      )
    ).toBe(true);
    expect(
      shouldTranslateParagraph(
        "Pilots identified an oil pressure trend and suggested that additional information would be useful."
      )
    ).toBe(true);
    expect(
      shouldTranslateParagraph(
        "The participant keywords were choice, availability, and purchase intention."
      )
    ).toBe(true);
  });

  it("keeps an unpunctuated terminal infinitive from being completed by the model", () => {
    const source = "NVivo, SPSS, and AMOS programs were used to perform";
    expect(unsafeParagraphStructureReason(source)).toContain("不定詞の補語");
    expect(shouldTranslateParagraph(source)).toBe(false);
    expect(shouldTranslateParagraph("This procedure was designed to improve task performance for all study participants in the experiment.")).toBe(true);
  });

  it("keeps a complete long academic paragraph eligible for translation", () => {
    const source = "This study evaluates a coherent research method across several experimental conditions, reports participant outcomes and confidence intervals, compares the observed effects with prior work, and discusses limitations and implications for future studies. ".repeat(4).trim() + ".";
    expect(source.length).toBeGreaterThan(400);
    expect(shouldTranslateParagraph(source)).toBe(true);
  });

  it("keeps a long lower-case column continuation out of translation", () => {
    expect(shouldTranslateParagraph("substantially improves the ground coupling and unrealistically increases measured performance in the following experimental apparatus description.".repeat(2))).toBe(false);
    expect(shouldTranslateParagraph("e.g. the following paragraph begins with a valid discourse abbreviation and contains enough ordinary academic prose to translate safely.")).toBe(true);
  });

  it("keeps author bylines with editorial acceptance dates out of paragraph translation", () => {
    expect(
      shouldTranslateParagraph(
        "Jörg Gross, Franziska Emmerling & Alexander Sack Accepted: 27 December 2017"
      )
    ).toBe(false);
  });

  it("keeps unnumbered author-year bibliography entries as original text", () => {
    expect(
      shouldTranslateParagraph(
        "WALLACE, J., DEARDEN, Andy and FISHER, T. (2007). The significant other: the value of jewellery within the conception, design and experience of body focussed digital devices. AI and society, 22 (1), 53-62."
      )
    ).toBe(false);
  });
});

describe("Japanese conference structure", () => {
  it("puts はじめに in the outline and extracts CJK authors", () => {
    const result = analyzeStructure(
      FIXTURES["japanese-conference"](),
      "paper-ja",
      "/tmp/ja.pdf",
      "hash-ja",
      { pageCount: 1 }
    );
    expect(result.paper.titleOriginal).toMatch(/情報採餌理論/);
    expect(result.paper.authors.some((name) => /栗原/.test(name))).toBe(true);
    expect(
      result.sections.some((s) => /1 はじめに/.test(s.originalTitle))
    ).toBe(true);
    expect(
      result.sections.some((s) => /Acquisition process/.test(s.originalTitle))
    ).toBe(false);
    expect(result.blocks.some((b) => b.type === "figure")).toBe(true);
  });
});

describe("isRetryableTranslationFailure", () => {
  const prose =
    "This opening paragraph explains the problem in a single column layout with enough words to look like body text.";

  function makeBlock(overrides: Partial<PaperBlock>): PaperBlock {
    return {
      id: "b1",
      paperId: "p1",
      sectionId: "s1",
      type: "paragraph",
      order: 0,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [],
      original: prose,
      translated: null,
      extractionConfidence: 1,
      translationStatus: "failed",
      parentBlockId: null,
      metadata: {},
      ...overrides,
    };
  }

  it("counts a failed body paragraph that the reader can retry", () => {
    const block = makeBlock({});
    expect(shouldTranslateBlock(block)).toBe(true);
    expect(isRetryableTranslationFailure(block)).toBe(true);
  });

  it("does not count failed heading blocks that the reader never renders", () => {
    const block = makeBlock({
      type: "heading",
      original: "Introduction",
    });
    expect(shouldTranslateBlock(block)).toBe(false);
    expect(isRetryableTranslationFailure(block)).toBe(false);
  });

  it("does not count failed figure captions that the reader shows as original", () => {
    const block = makeBlock({
      type: "figure",
      original: "Figure 1. A wearable prototype on a table.",
    });
    expect(isRetryableTranslationFailure(block)).toBe(false);
    expect(
      finalizedTranslationStatus([block], isRetryableTranslationFailure)
    ).toBe("ready");
    expect(
      displayProcessingStatus("partial", [block], isRetryableTranslationFailure)
    ).toBe("ready");
  });

  it("keeps stored partial until blocks are loaded", () => {
    expect(
      displayProcessingStatus("partial", undefined, isRetryableTranslationFailure)
    ).toBe("partial");
  });

  it("does not treat Array.some's index as a section-id set", () => {
    const block = makeBlock({});
    expect(
      finalizedTranslationStatus([block], isRetryableTranslationFailure)
    ).toBe("partial");
    expect(
      displayProcessingStatus("partial", [block], isRetryableTranslationFailure)
    ).toBe("partial");
  });
});
