import { describe, expect, it } from "vitest";
import {
  isPlausibleJaTranslation,
  shouldTranslateTitle,
  shouldTranslateParagraph,
  shouldTranslateHeading,
  looksLikeSubjectClassification,
  evaluateJaTranslation,
  isCascadeQualityAcceptable,
  getCascadeQualityReasons,
  extractScientificInvariants,
  isExpectedNonProseParagraph,
  unsafeParagraphStructureReason,
  diagnoseIncompleteSource,
  extractTechnicalNameCandidates,
} from "../services/translation/quality";
import { isDegenerateTranslation, restoreUtf8ByteEscapes } from "../services/translation/quality/degeneration";
import { resolveImportConfig } from "../services/import/helpers";
import { analyzeStructure } from "../services/structureService";
import {
  isRetryableTranslationFailure,
  shouldTranslateBlock,
  translationInputForBlock,
} from "../services/importServiceV2";

describe("acronym expansion safety", () => {
  it("keeps supplementary-material labels atomic in the technical audit", () => {
    const source = "The task is described in the SI Appendix and the SI Appendix contains details.";
    expect(extractTechnicalNameCandidates(source)).toContain("SI Appendix");
  });

  it("accepts standard scientific acronyms when their Japanese expansion is preserved", () => {
    const source = "A customized infrared (IR) imaging system was used to measure BPM.";
    const output = "カスタム赤外線イメージングシステムを用いて心拍を測定した。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("scientific invariants missing: IR, BPM");
  });
  it("classifies an open citation list at a block boundary as an extraction fragment", () => {
    expect(unsafeParagraphStructureReason(
      "Besides movement on the surface of the head, vocalizing speech also involves movements of different articulators. To capture the tongue movements for SSR, researchers placed magnets on the tongue and head [4, 9, 29",
    )).toBe("引用列が途中で切れている可能性があります");
  });

  it("rejects output that drops an academic e.g. quoted condition", () => {
    const source = 'The clips followed gist cues (e.g., “couple fighting”) and detailed cues (e.g., “white piano”).';
    const dropped = '映画クリップは詳細な手掛かり（例えば「白いピアノ」）に従った。';
    const intact = '映画クリップは要点の手掛かり（例えば「カップルの喧嘩」）と詳細な手掛かり（例えば「白いピアノ」）に従った。';
    expect(evaluateJaTranslation(dropped, source).reasons).toContain("quoted example content missing");
    expect(evaluateJaTranslation(intact, source).reasons).not.toContain("quoted example content missing");
    expect(isPlausibleJaTranslation(dropped, source)).toBe(false);
    expect(isPlausibleJaTranslation(intact, source)).toBe(true);
  });

  it("rejects an alternate translation that leaves an ordinary lexical word in Latin", () => {
    const source = "Participants watched film clips and rated their interest.";
    const output = "参加者は映画 Clips を見て興味を評価した。";
    expect(isCascadeQualityAcceptable(output, source)).toBe(false);
    expect(getCascadeQualityReasons(output, source)).toContain("untranslated cascade lexeme");
    expect(isCascadeQualityAcceptable("参加者は映画を見た。Whilst これは重要だった。", "Participants watched films. Whilst this was important.")).toBe(false);
    expect(isCascadeQualityAcceptable("参加者には cover story が提示された。", "Participants were shown a cover story.")).toBe(false);
    expect(isCascadeQualityAcceptable("社会的慣習が such 新しい相互作用方法に影響する。", "Social conventions affect such novel interaction methods.")).toBe(false);
    expect(isCascadeQualityAcceptable("「Worker Feedback Dashboard」を実装した。", "We implemented the Worker Feedback Dashboard.")).toBe(true);
  });

  it("rejects malformed mixed-script acronym expansions while accepting intact ones", () => {
    const source = "The payload includes the Cyclic Redundancy Check (CRC).";
    const malformed = "ペイロードにはサイクリックレッドゥアンダNCY（CRC）が含まれる。";
    const intact = "ペイロードには巡回冗長検査（CRC）が含まれる。";
    const sourcePreserved = "The payload includes the Cyclic Redundancy Check（CRC）.";
    expect(evaluateJaTranslation(malformed, source).reasons).toContain("malformed acronym expansion");
    expect(evaluateJaTranslation(intact, source).reasons).not.toContain("malformed acronym expansion");
    expect(evaluateJaTranslation(sourcePreserved, source).reasons).not.toContain("malformed acronym expansion");
  });

  it("rejects decoder-spliced Japanese/Latin tokens without rejecting normal identifier order", () => {
    const source = "The study evaluates nudging and rotary embeddings.";
    const corrupted = "本研究はニUDGEとローティORYエンベディングを評価する。";
    const intact = "本研究はナッジング、rotary embeddingsを評価する。";
    const identifier = "本研究ではモデルGPTを評価する。";
    expect(evaluateJaTranslation(corrupted, source).reasons).toContain("mixed-script decoder corruption");
    expect(isPlausibleJaTranslation(corrupted, source)).toBe(false);
    expect(evaluateJaTranslation(intact, source).reasons).not.toContain("mixed-script decoder corruption");
    expect(evaluateJaTranslation(identifier, "This study evaluates model GPT.").reasons).not.toContain("mixed-script decoder corruption");
    expect(evaluateJaTranslation("組立ラインのErgoSALBPモデルを評価する。", "The ErgoSALBP model is evaluated in the assembly line.").reasons).not.toContain("mixed-script decoder corruption");
  });

  it("allows a transliterated technical name with an uppercase suffix", () => {
    const source = "The CycleGAN model improves image conversion between domains.";
    const output = "サイクルGANモデルはドメイン間の画像変換を改善する。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("mixed-script decoder corruption");
  });

  it("rejects an unsupported numbered enumeration introduced by the model", () => {
    const source = "The first group asked a hypothesis-scanning question, while the second group asked a constraint-seeking question.";
    const hallucinated = "第一群は仮説探索質問を尋ね, 第二群は制約探索質問を尋ねた。1)自転車, 2)物, 3)学校, 4)検査。";
    const faithful = "第一群は仮説探索質問を尋ね, 第二群は制約探索質問を尋ねた。";
    expect(evaluateJaTranslation(hallucinated, source).reasons).toContain("translation introduces an unsupported numbered enumeration");
    expect(evaluateJaTranslation(faithful, source).reasons).not.toContain("translation introduces an unsupported numbered enumeration");
  });

  it("rejects a method predicate added to an observational research claim", () => {
    const source = "Different studies investigate ergonomics in assembly systems, mainly with the objective of reducing ergonomic risk in terms of worker posture [13].";
    const hallucinated = "組立システムにおける人間工学的リスクの低減を目的として、組立シミュレーションを行った[13]。";
    const faithful = "さまざまな研究が組立システムの人間工学を調査しており、主に作業者の姿勢に関する人間工学的リスクの低減を目的としている[13]。";
    expect(evaluateJaTranslation(hallucinated, source).reasons).toContain("unsupported method predicate introduced");
    expect(isPlausibleJaTranslation(hallucinated, source)).toBe(false);
    expect(evaluateJaTranslation(faithful, source).reasons).not.toContain("unsupported method predicate introduced");
    expect(isCascadeQualityAcceptable(hallucinated, source)).toBe(false);
    expect(getCascadeQualityReasons(hallucinated, source)).toContain("plausibility gate failed");
    const longSource = `${source} Other works develop digital tools for simulating the assembly process.`;
    expect(evaluateJaTranslation(`${hallucinated} 他の研究では組立工程をシミュレーションするデジタルツールを開発している。`, longSource).reasons).toContain("unsupported method predicate introduced");
  });

  it("does not reject a method predicate when the source explicitly reports the method", () => {
    const source = "We used the public OpenAI API to run all our simulations14 and set the temperature parameter to 0.";
    const output = "公開のOpenAI APIを使用してすべてのシミュレーションを実行した[14]。温度パラメータを0に設定した。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("unsupported method predicate introduced");
    expect(isCascadeQualityAcceptable(output, source)).toBe(true);
  });

  it("does not reject a method predicate when method evidence appears later in the source block", () => {
    const source = "This wearable offers continuous monitoring in daily life. We develop a hardware prototype and measure temperature during rest.";
    const output = "このウェアラブルは日常生活で連続モニタリングを提供します。ハードウェアプロトタイプを開発しました。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("unsupported method predicate introduced");
  });

  it("recognizes Japanese sufficiency as preserving an English only constraint", () => {
    const source = "Only general HCI knowledge is required.";
    const output = "一般的なHCI知識があれば十分です。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("exclusivity relation missing");
  });

  it("recognizes an explicitly conducted study as method evidence", () => {
    const source = "A pilot study was conducted in a real-world commercial setting.";
    const output = "実世界の商業環境でパイロット研究を実施した。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("unsupported method predicate introduced");
  });

  it("recognizes conducting quantitative appraisal analysis as method evidence", () => {
    const source = "The issues are worth considering when conducting quantitative appraisal analysis on institutional texts.";
    const output = "機関文書に対する定量的評価分析を行う際に考慮すべき課題である。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("unsupported method predicate introduced");
  });

  it("recognizes plural experiments and reported user-study evidence", () => {
    expect(evaluateJaTranslation(
      "2011年にFacebook上で2つの大規模なフィールド実験を実施した。",
      "We conducted two large field experiments on Facebook during a short period in 2011.",
    ).reasons).not.toContain("unsupported method predicate introduced");
    expect(evaluateJaTranslation(
      "20名を対象としたユーザースタディの結果、性能が示された。",
      "A user study with 20 participants showed that the system performed well.",
    ).reasons).not.toContain("unsupported method predicate introduced");
  });

  it("recognizes translated unique and distinct constraints", () => {
    const source = "The benchmark has 134 unique evaluation functions.";
    const output = "ベンチマークには134のユニークな評価関数がある。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("exclusivity relation missing");
  });

  it("recognizes development and training as method evidence", () => {
    const source = "We developed the interface and trained the model on captured images.";
    const output = "インターフェースを開発し、取得画像でモデルを学習した。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("unsupported method predicate introduced");
  });

  it("flags a participant-to-researcher role shift", () => {
    const source = "Eighty-eight participants from various fields of study were recruited from the university.";
    const output = "大学から様々な分野の研究者88名が募集された。";
    const quality = evaluateJaTranslation(output, source);
    expect(quality.reasons).toContain("participant role shifted to researcher");
    expect(isCascadeQualityAcceptable(output, source)).toBe(false);
  });

  it("checks participant role per aligned sentence", () => {
    const source = "Eighty-eight participants were recruited. Participants gave consent.";
    const output = "88名の研究者が募集された。参加者は同意した。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("participant role shifted to researcher");
  });

  it("does not treat a sentence-boundary shift as a participant role change", () => {
    const source = "Participants completed the procedure. The participant then took a break.";
    const output = "参加者は手順を完了しました。研究者は記録を確認しました。参加者はその後休憩しました。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("participant role shifted to researcher");
  });

  it("allows participants who are explicitly researchers", () => {
    const source = "The participants were researchers from several laboratories.";
    const output = "参加者は複数の研究室に所属する研究者だった。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("participant role shifted to researcher");
  });

  it("flags an experimental utterance unit translated as a session", () => {
    const source = "The current and previous utterances were discarded before the next trial.";
    const output = "次の試行の前に、現在および以前のセッションを破棄した。";
    const quality = evaluateJaTranslation(output, source);
    expect(quality.reasons).toContain("utterance unit shifted to session");
    expect(isCascadeQualityAcceptable(output, source)).toBe(false);
  });

  it("allows an utterance to remain an utterance", () => {
    const source = "The current and previous utterances were discarded before the next trial.";
    const output = "次の試行の前に、現在および以前の発話を破棄した。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("utterance unit shifted to session");
  });

  it("catches a paired current/previous utterance scope shift across sentence boundaries", () => {
    const source = "If the frame rate was out of range, all images recorded for the current and previous utterances were discarded.";
    const output = "フレームレートが範囲外の場合、そのセッションおよび直前のセッションの画像は破棄された。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("utterance unit shifted to session");
  });

  it("does not reject an utterance unit because a neighboring sentence was split", () => {
    const source = "The participant mouthed the utterances shown on screen. The session was then paused.";
    const output = "参加者は画面に表示された発話を口パクで発音しました。研究者は記録を確認しました。セッションはその後、一時停止されました。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("utterance unit shifted to session");
  });

  it("treats a short acronym as critical when its source context is technical", () => {
    const source = "We compare reinforcement learning (RL) with a supervised learning model.";
    const output = "強化学習と教師あり学習モデルを比較した。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
    expect(evaluateJaTranslation(output, source).reasons.join(" ")).toContain("RL");
  });
});

describe("source completeness diagnostics", () => {
  it("flags a long physical continuation without changing translation routing", () => {
    const source = "Previous studies established the relationship between the intervention and the measured outcome, and the subsequent analysis focused on the participants who were assigned to the rule and were then asked to respond to".repeat(4);
    expect(diagnoseIncompleteSource(source).incomplete).toBe(true);
  });

  it("flags a medium block ending in a continuation cue", () => {
    const source = "A pilot study was conducted in a real-world commercial setting, followed by a series of large-scale online experiments. Both studies";
    expect(diagnoseIncompleteSource(source)).toEqual({ incomplete: true, reason: "source ends with a continuation cue" });
  });

  it("does not flag a complete ordinary sentence", () => {
    const source = "The experiment measured response accuracy across three retention intervals.";
    expect(diagnoseIncompleteSource(source).incomplete).toBe(false);
  });

  it("flags a long ordinary block that ends in an extraction ellipsis", () => {
    const source = "Technological advancement brings opportunities for enhanced information, support, and functionality within the flight deck. Whilst this has many benefits to the pilot and the…";
    expect(diagnoseIncompleteSource(source).incomplete).toBe(true);
    expect(diagnoseIncompleteSource(source).reason).toContain("省略記号");
  });

  it("flags an orphaned numbered list item embedded in prose", () => {
    const source = "You have received 51 dollars. 4 - Machine J delivered 26 dollars.";
    expect(diagnoseIncompleteSource(source)).toEqual({ incomplete: true, reason: "箇条書き番号が本文に混入している可能性があります" });
  });

  it("flags a paragraph with a trailing figure label", () => {
    const source = "The safety analysis estimates induced electric and magnetic fields across the operating range and reports the corresponding average exposure values. Fig. 3";
    expect(diagnoseIncompleteSource(source)).toEqual({ incomplete: true, reason: "図表ラベルが段落末尾に混入している可能性があります" });
  });

  it("flags a paragraph cut immediately after an abbreviated figure label", () => {
    const source = "The proposed chromosome structure is shown in the final comparison of task assignments and workstation layouts in Fig.";
    expect(diagnoseIncompleteSource(source)).toEqual({ incomplete: true, reason: "図表ラベルが段落末尾に混入している可能性があります" });
  });

  it("flags a paragraph cut at a document cross-reference", () => {
    const source = "The rest of the paper is organized as follows: we first review related work and define notations in Section";
    expect(diagnoseIncompleteSource(source).incomplete).toBe(true);
    expect(diagnoseIncompleteSource(source).reason).toContain("文書内参照");
  });

  it("flags a lowercase continuation detached behind a dash", () => {
    expect(diagnoseIncompleteSource("– with a strong interrelation that has been a long-running topic.").incomplete).toBe(true);
    expect(diagnoseIncompleteSource("- Results were consistent across studies.").incomplete).toBe(false);
  });

  it("flags a block that begins inside an assignment expression", () => {
    const source = "Mage = 25.6 years) participated in this study in exchange for credit. This fragment begins after a detached participant label.";
    expect(diagnoseIncompleteSource(source)).toEqual({
      incomplete: true,
      reason: "source begins inside an assignment expression",
    });
  });
});

describe("negation detection", () => {
  it("does not treat forgotten as an English negation marker", () => {
    const result = evaluateJaTranslation(
      "具体的には、要点記憶は詳細記憶よりゆっくり忘れられた。",
      "Specifically, gist memory was forgotten more slowly than detailed memory.",
    );
    expect(result.reasons).not.toContain("source negation missing");
  });
});

describe("compact acronym descriptors", () => {
  it("accepts an intact acronym when a descriptor is compacted", () => {
    const result = evaluateJaTranslation(
      "PPGイヤリングは14 mmである。",
      "The PPG Earring measures 14 mm.",
    );
    expect(result.reasons).not.toContain("scientific invariants missing: PPG");
  });
});

describe("contextual experimental counts", () => {
  it("rejects a translation that drops a clip count", () => {
    const source = "Because of the smaller number of clips (36 in total), 30 participants were included in the experiment.";
    const output = "クリップ数が少ないため、30人の参加者を実験に含めた。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
    expect(evaluateJaTranslation(output, source).reasons).toContain("scientific invariants missing: 36");
  });

  it("does not make an isolated ordinary number critical", () => {
    const source = "The procedure was repeated in 2019 and the discussion follows in the next section.";
    const output = "手順は2019年に再実施され、次の節で議論する。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });
});
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

  it("rejects trailing translation instructions appended by the model", () => {
    const source = "Knowing how to enter formulae is important for spreadsheet users.";
    const output = "数式を入力する方法を知っておくことは、表計算ソフトの利用者にとって重要である。\n\n次の英語の学術テキストを日本語に翻訳してください。\n\nThe purpose of this study is to investigate the effects of various factors.";
    expect(evaluateJaTranslation(output, source).reasons).toContain("model output contains translation instruction contamination");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects translator meta-commentary appended after otherwise fluent Japanese", () => {
    const source = "Class discussion was organized through weekly meetings.";
    const output = "クラスでの議論は毎週の会議を通じて組織された。注: より自然な日本語としては別の表現も可能です。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("model output contains translation meta-commentary");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects inline translator notes embedded in a sentence", () => {
    const source = "Traditional education uses lectures and class discussion.";
    const output = "伝統教育は講義とクラス discussion(注: 原文のままにし、文脈上適切な日本語に置き換えるべきか判断が必要です)を用いる。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("model output contains translation meta-commentary");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects simplified-Chinese output that shares Japanese Han characters", () => {
    const source = "We used the public API to run all simulations and set the temperature to zero.";
    const output = "我々はすべてのシミュレーションを実行し、温度参数为0。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("simplified Chinese mixed into Japanese");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects Chinese lexical contamination when it uses shared Han scripts", () => {
    const source = "External and internal factors affect memory.";
    const output = "外部と内部因素が記憶に影響する。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("simplified Chinese mixed into Japanese");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects simplified Chinese character forms embedded in Japanese output", () => {
    const source = "The first evaluation assessed attitudes toward placement, while the second assessed attitudes toward gesture interaction.";
    const output = "1つ目は配置に関する态度を调查し、2つ目はジェスチャ相互作用に関する态度を评估した。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("simplified Chinese mixed into Japanese");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects a Chinese connective compound missed by single-character checks", () => {
    const source = "Second, several jewellery examples contain valuable but unreachable content.";
    const output = "其次、価値はあるが手に入らない内容を含む宝飾品の例がいくつかある。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("simplified Chinese mixed into Japanese");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects unexpected foreign scripts embedded in otherwise Japanese output", () => {
    const source = "Social influence affects system usage and acceptance of new technologies.";
    const output = "社会的な影響はシステムの利用と新技術の受容に影響する。मल्होत्रा";
    expect(evaluateJaTranslation(output, source).reasons).toContain("foreign script contamination");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects malformed numeric citation brackets", () => {
    const source = "The effect was replicated [11].";
    const output = "この効果は再現された[[11]]。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("malformed citation structure");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects an empty citation placeholder left in translated prose", () => {
    const source = "Participants followed the rule across all trials [29,30,32].";
    const output = "参加者はすべての試行でルールに従った [ ]。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("malformed citation structure");
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

  it("rejects accepted-looking output that leaves a source phrase untranslated", () => {
    const source =
      "The increase in received power is due to the higher-order harmonics also contributing to power delivery (notably 120 MHz, the 3rd harmonic of 40 MHz, which is also an effective frequency for IBPT; see Figure 2).";
    const output =
      "受信電力の増加は, 電力伝達に寄与する高次高調波によると考えた(notably 120 MHz, the 3rd harmonic of 40 MHz, which is also an effective frequency for IBPT; see Figure 2)。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("untranslated source phrase");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects output that drops a numbered section marker", () => {
    const source =
      "4.3.1 Board Design. As with the transmitter, careful board design of the receiver is paramount to high performance.";
    const output =
      "受信機の設計は, 送信機と同様に, 高性能化のためには, 注意深い設計が必要である。";
    expect(evaluateJaTranslation(output, source).reasons.some((reason) => reason.startsWith("scientific invariants missing:"))).toBe(true);
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("allows source facts embedded in Japanese prose", () => {
    const source =
      "The result was consistent with prior observations (Fig. 8 and Table S3), suggesting that the intervention did not change the underlying evaluation process.";
    const output =
      "結果は先行観察（Fig. 8 and Table S3）と一致し、この介入が基礎的な評価過程を変えなかったことを示唆する。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("orphaned source invariant sentence");
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("does not reject a short opening sentence in a quoted epigraph", () => {
    const source = '"In memory of my Mother. Whilst sorting through her belongings, I found several objects." [Marzee 2001 p.25]';
    const output = '母を偲んで。遺品を整理しているうちに、いくつかの品物が見つかりました。［Marzee 2001 p.25］';
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("orphaned source invariant sentence");
  });

  it("does not reject a citation emitted as a detached punctuation span", () => {
    const source = "We explored the history of wearable objects and related cultures [5,6]. The findings inform the guidelines.";
    const output = "ウェアラブル物体と関連文化の歴史を調査した。[5,6]。この知見はガイドラインに反映される。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("orphaned source invariant sentence");
  });

  it("does not reject a figure reference emitted as a detached punctuation span", () => {
    const source = "The receiver loses power as distance from the body increases (Fig. 2 (b)). This effect is consistent across devices.";
    const output = "受信機は身体から離れるほど電力を失う。 (Fig. 2 (b))。この効果はデバイス間で一貫している。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("orphaned source invariant sentence");
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("does not reject citation page spacing normalization", () => {
    const source = "Evaluation is founded on earlier evaluations (see Coffin and O’Halloran 2005), and the discussion cites prior work (Caffarel and Rechniewski 2009: 33). Coffin and O’Halloran (2005: 144) describe this pattern.";
    const output = "評価は以前の評価に基づく（see Coffin and O’Halloran 2005）。先行研究を参照する（Caffarel and Rechniewski 2009:33）。Coffin and O’Halloran（2005:144）はこのパターンを説明する。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("duplicated year citation span");
  });

  it("does not treat citation author names as untranslated cascade lexemes", () => {
    const source = "The platform supports interaction (Liao et al., 2022; Bruggeman et al., 2019).";
    const output = "このプラットフォームは相互作用を支援する。(Liao et al., 2022; Bruggeman et al., 2019)";
    expect(getCascadeQualityReasons(output, source)).not.toContain("untranslated cascade lexeme");
  });

  it("rejects a citation year moved into an unrelated Japanese claim", () => {
    const source = "The study examined remaining options. The effect was reported previously (Parker and Schrift, 2011).";
    const output = "この研究は残りの選択肢を検討した。2011年、研究2で効果が報告された。(Parker and Schrift, 2011)";
    expect(evaluateJaTranslation(output, source).reasons).toContain("citation year scope drift");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects inconsistent partial retention of a repeated ordinary term", () => {
    const source = "Gist memory was compared with detailed memory. Gist cues improved gist memory, while detailed cues improved detailed memory.";
    const output = "要旨記憶を詳細記憶と比較した。Gist手がかりは要旨記憶を改善し、詳細な手がかりは詳細記憶を改善した。";
    expect(getCascadeQualityReasons(output, source)).toEqual(expect.arrayContaining([expect.stringMatching(/(?:inconsistent repeated lexeme|untranslated cascade lexeme)/)]));
  });

  it("allows repeated words inside an acronym-bearing technical label", () => {
    const source = "We model online registers in the Corpus of Online Registers of English (CORE), the largest online corpus.";
    const output = "Corpus of Online Registers of English (CORE)を用いてオンラインレジスターをモデル化した。これは最大のオンラインコーパスである。";
    expect(getCascadeQualityReasons(output, source)).not.toContain("inconsistent repeated lexeme");
  });

  it("does not reject a detached author-year citation group", () => {
    const source = "Digital media connects people on a platform (Möller et al., 2020). It also supports influencers (Prilop et al., 2020).";
    const output = "デジタルメディアはプラットフォーム上で人々をつなぐ。(Möller et al., 2020)。インフルエンサーも支援する。(Prilop et al., 2020)。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("orphaned source invariant sentence");
  });

  it("does not treat an author-year citation window as untranslated prose", () => {
    const source = "Recent work has examined wearable health tracking (e.g. Rock Health et al. 2019), which informs this design.";
    const output = "近年の研究ではウェアラブル健康追跡が検討されている(e.g. Rock Health et al. 2019)。これはこの設計に影響する。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("untranslated source phrase");
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

  it("does not treat digits attached to mixed-case model names as citations", () => {
    const source = "The latest AirPods Pro 2 uses a 0.182 Wh battery.";
    const output = "最新のAirPodsPro2は0.182Whの電池を使用する。";
    const values = extractScientificInvariants(output).map((item) => `${item.kind}:${item.value}`);
    expect(values).not.toContain("citation:2");
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("accepts Japanese figure labels while preserving the figure and panel number", () => {
    expect(isPlausibleJaTranslation("結果を図5に示す。", "The results are shown in Figure 5.")).toBe(true);
    expect(isPlausibleJaTranslation("結果を図1(a)に示す。", "The results are shown in Figure 1(a).")).toBe(true);
    expect(isPlausibleJaTranslation("結果を図1(a)に示す。", "The results are shown in Figure 1a.")).toBe(true);
    expect(isPlausibleJaTranslation("結果を図1に示す。", "The results are shown in Figure 1(a).")).toBe(false);
    expect(isPlausibleJaTranslation("結果を図6に示す。", "The results are shown in Figure 5.")).toBe(false);
  });

  it("accepts Fig. abbreviations when the source uses Figure", () => {
    const source = "The result is shown in Figure 2(c).";
    expect(isPlausibleJaTranslation("結果をFig. 2(c)に示す。", source)).toBe(true);
  });

  it("requires table cross-references to survive in Japanese or source form", () => {
    const source = "The levels are shown in Table 5.";
    expect(extractScientificInvariants(source).map((item) => item.kind)).toContain("table");
    expect(isPlausibleJaTranslation("分類は表5に示す。", source)).toBe(true);
    expect(isPlausibleJaTranslation("分類は第5表に示す。", source)).toBe(true);
    expect(isPlausibleJaTranslation("分類は表5に示す。値は5である。", source)).toBe(true);
    expect(isPlausibleJaTranslation("分類は異なるレベルである。値は5である。", source)).toBe(false);
  });

  it("accepts a compact Japanese section reference with an explicit reference verb", () => {
    const source = "The result is discussed in Section 5.2.";
    expect(isPlausibleJaTranslation("結果は5.2で説明した。", source)).toBe(true);
    expect(isPlausibleJaTranslation("結果は5.2だった。", source)).toBe(false);
  });

  it("accepts a preserved numbered section followed by the Japanese section suffix", () => {
    const source = "The results are presented in Section 4.5.1.";
    expect(isPlausibleJaTranslation("結果は4.5.1節に示されている。", source)).toBe(true);
    expect(isPlausibleJaTranslation("結果は4.5節に示されている。", source)).toBe(false);
  });

  it("treats PDF-split SI prefixes as the same measurement", () => {
    const source = "The resonant frequency is 1M Hz.";
    expect(isPlausibleJaTranslation("共振周波数は1MHzである。", source)).toBe(true);
    expect(isPlausibleJaTranslation("共振周波数は2MHzである。", source)).toBe(false);
  });

  it("treats PDF-inserted scalar-unit hyphens as the same measurement", () => {
    const source = "The 10-m walk test was completed before the 4-6s grip test.";
    expect(isPlausibleJaTranslation("10m歩行試験は4-6sの握力試験の前に完了した。", source)).toBe(true);
    expect(isPlausibleJaTranslation("11m歩行試験は4-6sの握力試験の前に完了した。", source)).toBe(false);
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

  it("rejects a missing study-count invariant in screening results", () => {
    const source = "Initial sifting based on title, abstract and full text resulted in exclusion of 6336 studies; 30 studies were reviewed.";
    const output = "タイトル、要旨、全文に基づく初期選別により、多数の研究が除外され、30件がレビューされた。";
    expect(evaluateJaTranslation(output, source).reasons.join(" ")).toContain("6336");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects simplified-Chinese contamination inside Japanese output", () => {
    const source = "Deep learning methods are widely used in medical image segmentation and improve the accuracy of diagnosis.";
    expect(isPlausibleJaTranslation("医療画像のセグメンテーションにディープ学习手法を用いる。", source)).toBe(false);
  });

  it("rejects isolated simplified forms embedded in otherwise Japanese prose", () => {
    const source = "The gist and details of an event are important for episodic memory.";
    const output = "出来事の概要と詳細はエピソデ的记忆に重要である。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("simplified Chinese mixed into Japanese");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
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

  it("does not treat a citation-adjacent footnote marker as a scientific number", () => {
    const source = "The tool was used in the Genealogies of Knowledge projects 3 (Jones 2019; Luz and Sheehan 2020).";
    const values = extractScientificInvariants(source).map((item) => item.value);
    expect(values).not.toContain("3");
    expect(values).toContain("2019");
    expect(values).toContain("2020");
    expect(isPlausibleJaTranslation("このツールはGenealogies of Knowledgeプロジェクトで使用された(Jones 2019; Luz and Sheehan 2020)。", source)).toBe(true);
  });

  it("treats locale decimal commas as equivalent scientific measurements", () => {
    const source = "The package measures 2.0 x 2.0 x 0.7 mm.";
    const output = "パッケージの寸法は2.0×2.0×0,7 mmである。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("normalizes mathematical italic units before checking invariants", () => {
    const source = "The package measures 1.49𝑚𝑚×1.49𝑚𝑚 and consumes 0.9 𝑢𝑊.";
    const values = extractScientificInvariants(source).map((item) => item.value);
    expect(values).toContain("1.49mm");
    expect(values).toContain("0.9 uW");
    expect(evaluateJaTranslation("パッケージは1.49ml×1.49ni、消費電力は0.9 uWである。", source).reasons)
      .toContain("scientific invariants missing: 1.49mm");
  });

  it("treats micro and Celsius glyph variants as equivalent units", () => {
    const source = "Power is 2 uW and accuracy is ±0.2C.";
    const output = "消費電力は2 μW、精度は±0.2℃である。";
    expect(evaluateJaTranslation(output, source).reasons).toEqual([]);
  });

  it("treats the PDF ring-above Celsius glyph as equivalent to degree Celsius", () => {
    const source = "Measured temperature remained stable within ±0.32 ◦C during rest.";
    const output = "安静時の測定温度は±0.32℃以内で安定していた。";
    expect(evaluateJaTranslation(output, source).reasons).toEqual([]);
  });

  it("normalizes ring-above Fahrenheit glyphs without changing numeric facts", () => {
    const source = "The reference temperature was 98.6 ◦F.";
    const output = "基準温度は98.6°Fであった。";
    expect(evaluateJaTranslation(output, source).reasons).toEqual([]);
  });

  it("accepts acronyms adjacent to Japanese text", () => {
    const source = "The I2C bus was used to connect the sensor.";
    const output = "I2Cバスを用いてセンサーを接続した。";
    expect(evaluateJaTranslation(output, source).reasons).toEqual([]);
  });

  it("accepts fullwidth Japanese citation brackets", () => {
    const source = "Uniform attention is effective (motivating follow-up work [1]).";
    expect(isPlausibleJaTranslation("一様注意は効果的である（後続研究の動機となった［1］）。", source)).toBe(true);
  });

  it("accepts citation groups split into separate brackets by the decoder", () => {
    const source = "The result was reported previously [13, 19–23].";
    const output = "この結果は以前に報告されている[13] [19–23]。";
    expect(evaluateJaTranslation(output, source).reasons).toEqual([]);
  });

  it("does not flag an omitted e.g. cue as a duplicated citation group", () => {
    const source = "Snacks are consumed at home (e.g., Kerr et al., 2010; Myhre et al., 2015).";
    const output = "スナックは家庭で消費される（Kerr et al., 2010; Myhre et al., 2015）。";
    expect(evaluateJaTranslation(output, source).reasons).toEqual([]);
  });
  it("does not treat retained journal text inside a citation as untranslated prose", () => {
    const source = "Register variation is important (see Biber in Corpus Linguist Linguist Theory 8:9–37, 2012).";
    const output = "文体の変動は重要である（see Biber in Corpus Linguist Linguist Theory 8:9–37, 2012）。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("untranslated source phrase");
  });

  it("accepts citation payloads wrapped in harmless HTML markup", () => {
    const source = "The benchmark followed prior work26, 27 and tested 13,000 problems.";
    const output = "ベンチマークは先行研究<sup>26</sup>、<sup>27</sup>に従い、13,000件を検証した。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("preserves statistical comparison operators in Japanese output", () => {
    const source = "The smaller models did not solve the task (all p > 0.05).";
    const output = "小型モデルは課題を解けなかった（すべてp > 0.05）。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("does not flag a retained compound tool name as untranslated prose", () => {
    const source = "An a priori power analysis using G*Power 3.1 was conducted.";
    const output = "G*Power 3.1を用いて事前の検出力分析を実施した。";
    expect(isCascadeQualityAcceptable(output, source)).toBe(true);
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

  it("accepts an electrical measurement when Japanese typography attaches the unit", () => {
    const source = "The receiver is limited by a capacitance of 1 pF.";
    const output = "受信機は1pFの容量によって制限される。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("rejects an SNR definition that changes comparison into frequency measurement", () => {
    const source = "Signal-to-Noise Ratio (SNR) is a common metric to measure the level of the target signal compared to the level of background noise.";
    const drift = "標記の測定法は, 周波数特性を考慮した標的信号の周波数を測定するものである。";
    expect(evaluateJaTranslation(drift, source).reasons).toContain("signal-to-noise comparison relation missing");
    expect(isPlausibleJaTranslation(drift, source)).toBe(false);
    expect(isPlausibleJaTranslation("信号対雑音比（SNR）は、標的信号のレベルを背景雑音のレベルと比較する指標である。", source)).toBe(true);
  });

  it("accepts a localized currency when its source amount is preserved", () => {
    const source = "The processor costs around $1 USD.";
    expect(isPlausibleJaTranslation("プロセッサの価格は約1ドルである。", source)).toBe(true);
    expect(isPlausibleJaTranslation("プロセッサの価格は約2ドルである。", source)).toBe(false);
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

  it("accepts repeated katakana modifiers in a comma-separated inventory", () => {
    const output = "スマートジュエリーにはスマートネックレス、スマートブレスレット、スマートメガネ、スマートリング、スマートイヤリングがある。";
    expect(isPlausibleJaTranslation(output, "Smart jewelry includes necklaces, bracelets, glasses, rings, and earrings.")).toBe(true);
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

  it("accepts an acronym glued to its hexadecimal payload", () => {
    const source = "The service UUID0x1809 is encoded in the packet.";
    const output = "パケットにはサービスUUID0x1809が符号化される。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("scientific invariants missing: UUID");
  });

  it("accepts a hexadecimal payload when PDF extraction separates its identifier phrase", () => {
    const source = "The Universally Unique Identifier (UUID) of 0x1809 is used.";
    const output = "UUID0x1809を使用する。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("scientific invariants missing: UUID");
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("unexpected scientific invariants: 0");
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

  it("rejects binary wording when a collective group statement has no two-group qualifier", () => {
    const source = "None of the groups differed significantly in their memory performance.";
    const output = "両群の記憶性能に有意差はなかった。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("collective group comparison narrowed to two groups");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("accepts faithful collective comparisons and a genuine two-group study", () => {
    const threeGroups = "None of the groups differed significantly in age. The study compared three groups.";
    const twoGroups = "None of the groups differed significantly in age. The study compared two groups.";
    expect(isPlausibleJaTranslation("いずれのグループ間にも年齢の有意差はなかった。3群を比較した。", threeGroups)).toBe(true);
    expect(isPlausibleJaTranslation("両群間に年齢の有意差はなかった。2群を比較した。", twoGroups)).toBe(true);
  });

  it("rejects collapsing opposite access comparisons into one predicate", () => {
    const source = "The waist location was less easy to access on a female, while the torso location was easier to access on a male.";
    const output = "女性ではウエスト位置が「アクセスしやすい」と評価され、男性では胴体位置も「アクセスしやすい」と評価された。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("opposite comparative polarity collapsed");
  });

  it("accepts opposite access comparisons when Japanese polarity stays distinct", () => {
    const source = "The waist location was less easy to access on a female, while the torso location was easier to access on a male.";
    const output = "女性ではウエスト位置が「アクセスしにくい」と評価され、男性では胴体位置が「アクセスしやすい」と評価された。";
    expect(getCascadeQualityReasons(output, source)).not.toContain("unsafe relation guard");
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

  it("preserves ordered opt-in alternate model candidates", () => {
    expect(resolveImportConfig({
      enableSelectiveCascade: true,
      ollamaModel: "qwen2.5:14b",
      ollamaModels: ["gemma2:9b", "qwen2.5:14b"],
    }).ollamaModels).toEqual(["gemma2:9b", "qwen2.5:14b"]);
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

  it("accepts complete formula-definition sentences beginning with where", () => {
    const prose =
      "where Φ(x) is the cumulative distribution function of the standard normal distribution.";
    expect(unsafeParagraphStructureReason(prose)).toBeNull();
    expect(shouldTranslateParagraph(prose)).toBe(true);
  });

  it("still rejects an incomplete where continuation", () => {
    const fragment = "where Φ(x)";
    expect(unsafeParagraphStructureReason(fragment)).toContain("先頭");
    expect(shouldTranslateParagraph(fragment)).toBe(false);
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

describe("affiliation metadata lines", () => {
  it("does not send credential and institution lines to translation", () => {
    const affiliation =
      "Associate Member, Institution of Mechanical Engineers (IMechE), Graduate Member, Engineers New Zealand";
    expect(shouldTranslateParagraph(affiliation)).toBe(false);
  });

  it("keeps ordinary prose about members and institutions eligible", () => {
    const prose =
      "Associate members at the university participated in the study and completed the evaluation.";
    expect(shouldTranslateParagraph(prose)).toBe(true);
  });
});

describe("unsafe extracted translation input", () => {
  it("keeps repeated numbered chart labels out of paragraph translation", () => {
    expect(
      shouldTranslateParagraph(
        "Horizon 1 Horizon 6 You are going to a casino that owns two slot machines."
      )
    ).toBe(false);
  });

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

  it("rejects impossible function-word joins caused by extraction loss", () => {
    expect(
      unsafeParagraphStructureReason(
        "This section gives an introduction about the of radiology and describes the study design."
      )
    ).toContain("機能語");
    expect(
      unsafeParagraphStructureReason(
        "The study gives an overview of radiology and describes the study design."
      )
    ).toBeNull();
  });

  it("treats thousands separators as numeric formatting", () => {
    const quality = evaluateJaTranslation(
      "We excluded 6,336 studies and included 3,227 participants.",
      "6,336件の研究を除外し,3,227人の参加者を含めた。",
    );
    expect(quality.reasons.some((reason) => reason.startsWith("scientific invariants missing"))).toBe(false);
  });

  it("rejects a page or column fragment ending at a mathematical let", () => {
    const source = "A statistical interaction describes a joint influence that is not additive. Let";
    expect(shouldTranslateParagraph(source)).toBe(false);
  });

  it("rejects blocks with repeated PDF line-break hyphen artifacts", () => {
    const damaged =
      "Physiological signals are collected from previ- psycho-physiological measurements and addi- review evidence from the literature.";
    expect(unsafeParagraphStructureReason(damaged)).toContain("改行ハイフン");
    const suspended = "Outcomes were compared between pre- and post-treatment visits in low- and middle-income settings.";
    expect(unsafeParagraphStructureReason(suspended)).toBeNull();
    const item = "a) Physical state of the system (Pps): refers to elements such as the on-off state of actuators, system modes and the readiness of each connected device in the home, as reported by the sensors";
    expect(unsafeParagraphStructureReason(item)).toBeNull();
    const name = "pKa estimation with PROPKA. Protonation behavior of ionizable residues was evaluated using PROPKA 3.0 at physiological pH for every structure in the set.";
    expect(unsafeParagraphStructureReason(name)).toBeNull();
    expect(shouldTranslateParagraph(damaged)).toBe(false);
  });

  it("rejects repeated adjacent-word concatenation from table/column extraction", () => {
    const damaged =
      "Patient safety seriousImplementation outcomes and fidelityOrganisational measures were reported across the included studies.";
    expect(unsafeParagraphStructureReason(damaged)).toContain("隣接語");
    expect(shouldTranslateParagraph(damaged)).toBe(false);
    expect(
      shouldTranslateParagraph(
        "The OpenAI model evaluates participants and reports the results in a complete academic paragraph."
      )
    ).toBe(true);
  });

  it("rejects reordered or unclosed set delimiters from native PDF extraction", () => {
    const damaged =
      "A clustering result produced {\u201ctwa\u201d}, {\u201cacquire\u201d, \u201cacquisition\u201d}, and { itively appear to share similar semantics.";
    expect(unsafeParagraphStructureReason(damaged)).toContain("集合記法");
    expect(shouldTranslateParagraph(damaged)).toBe(false);
    expect(
      unsafeParagraphStructureReason(
        "A clustering result produced {\"twa\"}, {\"acquire\", \"acquisition\"}."
      )
    ).toBeNull();
  });

  it("rejects a paragraph ending in a table or figure label fragment", () => {
    const source =
      "One study reviewed the source and described the observed trend in the Number of Deaths (in Millions)";
    expect(unsafeParagraphStructureReason(source)).toContain("図表見出し");
    expect(shouldTranslateParagraph(source)).toBe(false);
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

  it("treats dense consortium member and affiliation lists as metadata, not a sentence about an institution", () => {
    expect(isExpectedNonProseParagraph("Institute of Biomedicine, University of Eastern Finland, Kuopio, Finland. Department of Neurology, Hospital Universitario Donostia, San Sebastian, Spain. Institute of Cognitive Neurology and Dementia Research, Magdeburg,")).toBe(true);
    expect(isExpectedNonProseParagraph("Susanne Moebus , 42,43,44 Thomas Tegos , 42,45 Jordi Pérez-Tur , 123,124 Martin Ingelsson , 42,125 Mikko Hiltunen ,")).toBe(true);
    expect(isExpectedNonProseParagraph("original publication in this journal is cited, in accordance with accepted academic practice. No use, distribution or reproduction is")).toBe(true);
    expect(isExpectedNonProseParagraph("Participants were recruited at the University Hospital and the Department of Neurology, and all of them gave written consent before the study began in")).toBe(false);
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

  it("keeps extraction replacement characters out of model input without rejecting valid scientific Unicode", () => {
    const damaged = "The value was calculated as proposed in [12, 13]: \uFFFD \uFFFD";
    expect(unsafeParagraphStructureReason(damaged)).toContain("未復元文字");
    expect(shouldTranslateParagraph(damaged)).toBe(false);

    const valid = "The mean μ was 2.913, and the χ² test yielded p < 0.001.";
    expect(unsafeParagraphStructureReason(valid)).toBeNull();

    expect(unsafeParagraphStructureReason("which measures 14 mm in diameter, weighs 2.0 g, and offers 21 hours of continuous sensing.")).toContain("先頭");
    expect(shouldTranslateParagraph(valid)).toBe(true);
  });

  it("treats terminal superscript citations as sentence completion", () => {
    const source = "A notable feature is global ambiguity in this language, resulting in multiple parses.25";
    expect(unsafeParagraphStructureReason(source)).toBeNull();
    expect(shouldTranslateParagraph(source)).toBe(true);
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

  it("uses only a native-row table caption as translation input", () => {
    const block = makeBlock({
      type: "table",
      original: "Table 1. Participant characteristics. Age 34 42 Country Japan Canada",
      translationStatus: "pending",
      metadata: { captionOriginal: "Table 1. Participant characteristics.", tableRows: [[{ text: "Age" }, { text: "34" }]] },
    });
    expect(shouldTranslateBlock(block)).toBe(true);
    expect(translationInputForBlock(block)).toBe("Table 1. Participant characteristics.");
  });

  it("counts a failed body paragraph that the reader can retry", () => {
    const block = makeBlock({});
    expect(shouldTranslateBlock(block)).toBe(true);
    expect(isRetryableTranslationFailure(block)).toBe(true);
  });

  it("keeps geometry-backed continuation warnings out of the translation queue", () => {
    const block = makeBlock({
      metadata: { translationInputWarning: "後続ブロックが前段の文を継続している可能性があります" },
    });
    expect(shouldTranslateBlock(block)).toBe(false);
  });

  it("does not count failed heading blocks that the reader never renders", () => {
    const block = makeBlock({
      type: "heading",
      original: "Introduction",
    });
    expect(shouldTranslateBlock(block)).toBe(false);
    expect(isRetryableTranslationFailure(block)).toBe(false);
  });

  it("keeps transport-failed figure captions retryable", () => {
    // Since the 2026-10-16 retry policy, transport failures on captions keep
    // the retry surface; quality rejects are stored as completed source.
    const block = makeBlock({
      type: "figure",
      original: "Figure 1. A wearable prototype on a table.",
    });
    expect(isRetryableTranslationFailure(block)).toBe(true);
    expect(
      finalizedTranslationStatus([block], isRetryableTranslationFailure)
    ).toBe("partial");
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

  it("rejects fluent output that drops an explicit condition or exclusivity claim", () => {
    const conditional = "If the signal is absent, the participant was excluded from analysis.";
    const conditionalLoss = "信号がない。参加者を分析から除外した。";
    const conditionalKept = "信号がない場合、参加者を分析から除外した。";
    expect(evaluateJaTranslation(conditionalLoss, conditional).reasons).toContain("condition relation missing");
    expect(evaluateJaTranslation(conditionalKept, conditional).reasons).not.toContain("condition relation missing");

    const exclusive = "Only the intervention group received the training.";
    const exclusiveLoss = "介入群が訓練を受けた。";
    const exclusiveKept = "介入群のみが訓練を受けた。";
    expect(evaluateJaTranslation(exclusiveLoss, exclusive).reasons).toContain("exclusivity relation missing");
    expect(evaluateJaTranslation(exclusiveKept, exclusive).reasons).not.toContain("exclusivity relation missing");
    expect(evaluateJaTranslation(
      "表面は独自の物理的歴史を語る。",
      "The surface tells a unique physical history.",
    ).reasons).not.toContain("exclusivity relation missing");
    expect(evaluateJaTranslation("介入群ではなく対照群を用いた。", "The control group was used instead of the intervention group.").reasons).not.toContain("exclusivity relation missing");
    expect(evaluateJaTranslation("接続を維持するより、広告モードで伝送した。", "We transmitted using advertising mode instead of maintaining a connection.").reasons).not.toContain("exclusivity relation missing");

    const whether = "Participants discussed whether the suggestion could be incorporated into their design.";
    expect(evaluateJaTranslation("参加者は、その提案を設計に組み込めるかを議論した。", whether).reasons)
      .not.toContain("condition relation missing");

    const depending = "Participant compensation differed depending on the experiment.";
    expect(evaluateJaTranslation("参加者への報酬は、参加した実験によって異なった。", depending).reasons)
      .not.toContain("condition relation missing");

    const counterfactual = "If he had not taken pill B, could he still have died?";
    expect(evaluateJaTranslation("ピルBを服用していなければ、それでも死亡した可能性はあるか。", counterfactual).reasons)
      .not.toContain("condition relation missing");
    expect(evaluateJaTranslation("公の場で使用されるためには、より厳密な検討が必要である。", "The method requires greater scrutiny if it is to be acceptable for use in public.").reasons)
      .not.toContain("condition relation missing");
    expect(evaluateJaTranslation("登録者が多ければ、講師はコースを複数回教えることを検討する。", "If the number of registrations is large, the instructors may consider teaching the course multiple times.").reasons)
      .not.toContain("condition relation missing");

    const equivalence = "The no-material condition performed comparably to the insulating fabric.";
    expect(evaluateJaTranslation("材料なし条件は絶縁布と同程度の性能を示した。", equivalence).reasons)
      .not.toContain("positive equivalence relation negated");
    expect(evaluateJaTranslation("絶縁布に匹敵する材料なし条件は存在しない。", equivalence).reasons)
      .toContain("positive equivalence relation negated");
    expect(isCascadeQualityAcceptable("絶縁布に匹敵する材料なし条件は存在しない。", equivalence)).toBe(false);
  });

  it("does not reject a retained SI Appendix cross-reference as a repeated source label", () => {
    const source = "The task is described in the SI Appendix and the SI Appendix contains details.";
    const output = "課題の詳細はSI Appendixに記載されており、SI Appendixには追加情報が含まれる。";
    expect(evaluateJaTranslation(output, source).reasons)
      .not.toContain("untranslated repeated source label");
  });

  it("does not treat ASCII fragments inside retained technical names as cascade residue", () => {
    const source = "The MouseLab scenario rediscovered Take-The-Best and Weight-Additive Strategy.";
    const output = "MouseLabシナリオはTake-The-BestとWeight-Additive Strategyを再発見した。";
    expect(getCascadeQualityReasons(output, source)).not.toContain("untranslated cascade lexeme");
  });


  it("detects loss of comparative likelihood", () => {
    const source = "Participants were asked if Linda was more likely to be a bank teller or an active feminist.";
    expect(evaluateJaTranslation(source, source).reasons).toContain("comparative likelihood relation missing");
    expect(evaluateJaTranslation("リンダが銀行員である可能性が高いかを尋ねた。", source).reasons).not.toContain("comparative likelihood relation missing");
    expect(evaluateJaTranslation("高分散試験では、他の結果よりもはるかに可能性の高い結果を意味する。", source).reasons).not.toContain("comparative likelihood relation missing");
    expect(evaluateJaTranslation("知識が豊富な参加者は、知識が浅い参加者に比べて影響を受けにくい。", "Participants who are more likely to be influenced than those with less knowledge.").reasons).not.toContain("comparative likelihood relation missing");
    expect(evaluateJaTranslation("リンダが銀行員か、あるいは活動的なフェミニストかを問うた。", source).reasons).not.toContain("comparative likelihood relation missing");
    expect(isPlausibleJaTranslation(source, source)).toBe(false);
  });

  it("detects collapsed paired choice questions", () => {
    const source = "Consumers with an activated which-to-buy mindset differed from those with an activated whether-to-buy mindset.";
    expect(evaluateJaTranslation("購入マインドセットが活性化した消費者は、購入マインドセットが活性化した消費者と異なった。", source).reasons)
      .toContain("paired choice contrast collapsed");
    expect(evaluateJaTranslation("どれを買うべきかというマインドセットと、買うかどうかというマインドセットを比較した。", source).reasons)
      .not.toContain("paired choice contrast collapsed");
    expect(isPlausibleJaTranslation("購入マインドセットが活性化した消費者は、購入マインドセットが活性化した消費者と異なった。", source)).toBe(false);
  });

  it("rejects output that collapses an either-or experimental condition", () => {
    const source = "Participants watched clips accompanied by either gist or detailed cues.";
    expect(evaluateJaTranslation("参加者は映画を見た。", source).reasons)
      .toContain("alternative relation missing");
    expect(evaluateJaTranslation("参加者は要点または詳細な手がかりを伴う映画を見た。", source).reasons)
      .not.toContain("alternative relation missing");
  });

  it("preserves strong contrast markers without requiring generic conjunctions", () => {
    const source = "Unlike the control condition, the intervention improved recall.";
    expect(evaluateJaTranslation("対照条件とは異なり、介入により再認が改善した。", source).reasons)
      .not.toContain("strong contrast relation missing");
    expect(evaluateJaTranslation("介入により再認が改善した。", source).reasons)
      .toContain("strong contrast relation missing");
  });

  it("accepts 異なり as the natural rendering of unlike for exclusivity evidence", () => {
    const source = "The earring is tightly coupled to the body unlike watches worn loosely on the extremities.";
    expect(evaluateJaTranslation("イヤリングは、四肢にゆるく装着される時計とは異なり、身体との結合が強い。", source).reasons)
      .not.toContain("exclusivity relation missing");
  });

  it("accepts 確率が高い as the natural rendering of more likely", () => {
    const source = "The conjunction fallacy occurs when a specific condition is assumed to be more likely than a general one.";
    expect(evaluateJaTranslation("特定の条件が一般的な条件よりも確率が高いと仮定する誤謬である。", source).reasons)
      .not.toContain("comparative likelihood relation missing");
  });

  it("accepts a natural Japanese rendering of an English meaningfulness negation", () => {
    const source = "It is not meaningful to perform linear probing on this dataset.";
    expect(evaluateJaTranslation("このデータセットに対して線形プロービングを行うのは意味がない。", source).reasons)
      .not.toContain("exclusivity relation missing");
    expect(evaluateJaTranslation("このデータセットに対して線形プロービングを行うのは意味がありません。", source).reasons)
      .not.toContain("exclusivity relation missing");
  });

  it("preserves evidence suggestion and future specification strength", () => {
    const evidence = "First evidence suggests that memory formation in VR differs from the conventional laboratory.";
    expect(evaluateJaTranslation("VRにおける記憶形成は通常の実験室と異なる。", evidence).reasons)
      .toContain("evidence suggestion strengthened to assertion");
    expect(evaluateJaTranslation("初期の証拠は、VRにおける記憶形成が通常の実験室と異なることを示唆している。", evidence).reasons)
      .not.toContain("evidence suggestion strengthened to assertion");

    const pending = "The precise circumstances under which VR leads to efficient mnemonic processing remain to be further specified.";
    expect(evaluateJaTranslation("VRが効率的な記憶処理に導く正確な条件は、教育で適用すべきである。", pending).reasons)
      .toContain("future specification requirement omitted");
    expect(evaluateJaTranslation("VRが効率的な記憶処理に導く正確な条件は、今後さらに特定する必要がある。", pending).reasons)
      .not.toContain("future specification requirement omitted");
  });

  it("rejects fluent output that drops the scope of an assessment predicate", () => {
    const source = "First, we assessed whether GPT-3 could adaptively change between constraint-seeking and hypothesis-scanning questions.";
    expect(evaluateJaTranslation("まず、制約探索型と仮説探索型の質問は、複数の対象に共通する特徴を標的にする。", source).reasons)
      .toContain("assessment scope predicate missing");
    expect(evaluateJaTranslation("まず、GPT-3が制約探索型と仮説探索型の質問を適応的に切り替えられるかを評価した。", source).reasons)
      .not.toContain("assessment scope predicate missing");
  });

  it("rejects cascade candidates that lose a critical semantic relation", () => {
    const source = "If the signal is absent, the participant was excluded from analysis.";
    expect(isCascadeQualityAcceptable("信号がない。参加者を分析から除外した。", source)).toBe(false);
    expect(isCascadeQualityAcceptable("信号がない場合、参加者を分析から除外した。", source)).toBe(true);
    expect(isCascadeQualityAcceptable("sample", source)).toBe(false);
  });

  it("rejects a cascade candidate that leaves an ordinary lowercase source lexeme", () => {
    const source = "Prior work established a precedent for evaluating the interaction.";
    const output = "先行研究はインタラクションを評価する precedent を確立した。";
    expect(isCascadeQualityAcceptable(output, source)).toBe(false);
  });

  it("does not reject a retained contiguous technical term phrase as a lone lexeme", () => {
    const source = "The signal is represented using lumped elements in the circuit model.";
    const output = "回路モデルでは、信号を lumped elements として表現する。";
    expect(isCascadeQualityAcceptable(output, source)).toBe(true);
  });

  it("rejects a Japanese candidate that leaves a multiword English clause untranslated", () => {
    const source = "The participant was outspoken bright and politically active.";
    const output = "participant was outspoken bright and politically active と記述された。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("untranslated source phrase");
    expect(isCascadeQualityAcceptable(output, source)).toBe(false);
  });

  it("rejects a retained multiword figure explanation but allows the figure label", () => {
    const source = "The receiver was iterated repeatedly (major milestones shown in Figure 8).";
    expect(evaluateJaTranslation("受信機は繰り返し改良された（major milestones shown in Figure 8）。", source).reasons)
      .toContain("untranslated source phrase");
    expect(evaluateJaTranslation("受信機は図8に示すように繰り返し改良された。", source).reasons)
      .not.toContain("untranslated source phrase");
  });

  it("allows an intentional source-backed technical noun phrase", () => {
    const source = "We used a deep neural network model for classification.";
    expect(evaluateJaTranslation("分類にはdeep neural network modelを使用した。", source).reasons)
      .not.toContain("untranslated source phrase");
  });

  it("rejects a lowercase English decoder fragment attached to Japanese", () => {
    const source = "Photoplethysmography sensors struggle with accuracy during motion.";
    const output = "光干渉metryセンサは運動中の精度に問題がある。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("untranslated mixed-script lexeme");
    expect(isCascadeQualityAcceptable(output, source)).toBe(false);
  });

  it("allows a source-backed lowercase technical word in Japanese", () => {
    const source = "The wearable sensor records heart rate.";
    const output = "wearableセンサーは心拍数を記録する。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("untranslated mixed-script lexeme");
  });

  it("allows source product and method names to remain in a cascade candidate", () => {
    const source = "The SpeeChin prototype used a Thermal Earring sensor.";
    const output = "SpeeChinプロトタイプはThermal Earringセンサーを使用した。";
    expect(isCascadeQualityAcceptable(output, source)).toBe(true);
  });

  it("rejects a long cascade candidate that drops most source sentences", () => {
    const source = "First result was positive. Second result was stable. Third result was replicated. Fourth result was significant. Fifth result was measured. Sixth result was confirmed. Seventh result was reported. Eighth result was reviewed.";
    const output = "第1の結果は良好でした。第2の結果も安定していました。第3の結果が再現されました。";
    expect(isCascadeQualityAcceptable(output, source)).toBe(false);
  });

  it("does not count dotted academic labels as lost sentences", () => {
    const source = "The output voltage given by Eqn. 20 is independent of the load resistance (RL), given enough current can be supplied. This ensures higher power is delivered to the receiver at the resonant frequency. Eqn. 20 further illustrates the benefits of using a portable device where the floating ground plane of the device is held away from the body, as shown by Fig. 2 (e) over a small form factor wearable device (Fig. 2 (d)). A portable device maximizes the potential of a resonant human body channel by increasing Cret with a large ground plate. Moreover, as the ground plane is further away from the body, CGB is small with respect to Cret. The resonant frequency and the corresponding voltage at the resonant frequency are given by Eqn. 7.";
    const output = "式（20）によって与えられる出力電圧は、十分な電流が供給できる場合、負荷抵抗（RL）に依存しない。これにより、共鳴周波数において受信機に高い電力が供給されることを保証する。式（20）はさらに、浮動接地平面が体から離されている携帯型デバイス（図2（e））が、小型のウェアラブルデバイス（図2（d））よりも利点があることを示している。携帯型デバイスは、大きな接地プレートを使用することでCRETを増加させ、共鳴人間体チャネルの潜在能力を最大化する。また、接地平面が体から遠ざかるにつれて、CRETに対してCGBは小さくなる。共鳴周波数とその周波数における電圧は式（7）によって与えられる。";
    expect(isCascadeQualityAcceptable(output, source)).toBe(true);
  });

  it("accepts parallel numeric comparison clauses without false repetition rejection", () => {
    const source = "The RSSI for the Google Pixel phone decreased to approximately -90 dBm at a distance of 12 meters and reached its lowest RSSI of -95.6 dBm at 24 meters. In contrast, the nRF52 board’s RSSI dropped to -80 dBm at 15 meters and reached its lowest RSSI of -82 dBm at 30 meters.";
    const output = "Google PixelのRSSIは、距離12メートルで約-90 dBmまで低下し、24メートルで-95.6 dBmまで低下した。一方、nRF52ボードのRSSIは、15メートルで-80 dBmまで低下し、30メートルで-82 dBmまで低下した。";
    expect(evaluateJaTranslation(output, source).reasons).toEqual([]);
    expect(isCascadeQualityAcceptable(output, source)).toBe(true);
  });

  it("rejects a measurement list whose scientific values are reordered", () => {
    const source = "The prototype measured 11.3 mm wide, 31 mm long, weighed 335 mg, and consumed 14.4 uW.";
    const output = "試作機を開発した。14.4uWを消費し、11.3 mm、31 mm、335 mgだった。";
    const quality = evaluateJaTranslation(output, source);
    expect(quality.reasons).toContain("scientific measurement order changed");
    expect(isCascadeQualityAcceptable(output, source)).toBe(false);
  });

  it("keeps a normally ordered measurement list acceptable", () => {
    const source = "The prototype measured 11.3 mm wide, 31 mm long, weighed 335 mg, and consumed 14.4 uW.";
    const output = "試作機は幅11.3 mm、長さ31 mm、重量335 mgで、消費電力は14.4 uWだった。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("scientific measurement order changed");
  });

  it("rejects measurements attached to the wrong named quantity", () => {
    const source = "The method transfers more than 2mW peak power for > 1m channel lengths.";
    const output = "この方法は1mのピーク電力に対して2mW以上のチャネル長を伝送する。";
    const quality = evaluateJaTranslation(output, source);
    expect(quality.reasons).toContain("scientific measurement role changed");
    expect(isCascadeQualityAcceptable(output, source)).toBe(false);
  });

  it("rejects the observed peak-power/channel-length role swap", () => {
    const source = "The proposed powering methodology allows more than 2mW peak power to be transferred to a wearable device for > 1m channel lengths, which is > 90X greater than the state-of-the-art.";
    const output = "提案した電源方式は,2mWチャネル長に対して> 1mピーク電力以上を装着可能なデバイスに伝達する。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("scientific measurement role changed");
  });

  it("does not reject a faithful power and length association", () => {
    const source = "The method transfers more than 2mW peak power for > 1m channel lengths.";
    const output = "この方法は1mを超えるチャネル長で2mWを超えるピーク電力を伝送する。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("scientific measurement role changed");
    expect(isCascadeQualityAcceptable(output, source)).toBe(true);
  });

  it("rejects malformed experimental-arm acronyms after placeholder restoration", () => {
    const source = "The trial compared TRT and RT+CT on cognitive function and BDNF levels.";
    const output = "認知機能とBDNFレベルに対するTRTとRTz+CTzの効果を比較した。";
    const quality = evaluateJaTranslation(output, source);
    expect(quality.reasons).toContain("scientific invariants missing: RT, CT");
    expect(isCascadeQualityAcceptable(output, source)).toBe(false);
  });

  it("rejects reordered figure panel references", () => {
    const source = "The portable device is shown in Fig. 2 (e) over the wearable device (Fig. 2 (d)).";
    const output = "携帯デバイスを図2(d)としてウェアラブルデバイスを図2(e)に示す。";
    const quality = evaluateJaTranslation(output, source);
    expect(quality.reasons).toContain("figure/panel reference order changed");
    expect(isCascadeQualityAcceptable(output, source)).toBe(false);
  });

  it("rejects detached localized figure labels when panel order changes", () => {
    const source = "The result is shown by Fig. 2 (e) over a wearable device (Fig. 2 (d)).";
    const output = "結果を図に示す。2 (e) ウェアラブルデバイス（図2 (d)）。";
    expect(evaluateJaTranslation(output, source).reasons)
      .toContain("detached figure reference");
  });

  it("accepts normally ordered localized figure panel references", () => {
    const source = "The portable device is shown in Fig. 2 (e) over the wearable device (Fig. 2 (d)).";
    const output = "携帯デバイスを図2(e)としてウェアラブルデバイスを図2(d)に示す。";
    expect(evaluateJaTranslation(output, source).reasons)
      .not.toContain("figure/panel reference order changed");
  });
});

import { hasAcronymExpansionDrift, hasDetachedNumericCitationRisk, hasExtremeTranslationCompression, missingTechnicalNameCandidates } from "../services/translation/quality";

describe("technical name audit diagnostics", () => {
  it("flags a dropped internal proper name without making it a production rejection", () => {
    const source = "We compare the Xapian project with specialised corpus tools.";
    expect(missingTechnicalNameCandidates(source, "Xapプロジェクトと専門ツールを比較する。"))
      .toContain("Xapian");
  });

  it("does not treat sentence-initial prose as a technical name", () => {
    expect(missingTechnicalNameCandidates("This chapter introduces methods.", "本章では方法を紹介する。"))
      .toEqual([]);
  });

  it("flags detached numeric citation runs as an audit signal", () => {
    const source = "The studies used the protocol,27,28,29 and reported outcomes.";
    expect(hasDetachedNumericCitationRisk(source, "研究ではプロトコルを用い、27、28、29の結果を報告した。"))
      .toBe(true);
  });

  it("flags a changed Latin expansion when the acronym survives", () => {
    expect(hasAcronymExpansionDrift("Deep Learning (DL) improves diagnosis.", "Dip Learning (DL) は診断を改善する。"))
      .toBe(true);
    expect(hasAcronymExpansionDrift("Deep Learning (DL) improves diagnosis.", "深層学習（DL）は診断を改善する。"))
      .toBe(false);
  });

  it("accepts standardized scientific acronym translations", () => {
    const source = "The AC impedance of the return path is large.";
    const output = "帰路の交流インピーダンスは大きい。";
    expect(evaluateJaTranslation(output, source).reasons)
      .not.toContain("scientific invariants missing: AC");
  });

  it("preserves zero-valued percentage facts", () => {
    const source = "Some application subsets reached 0%.";
    const output = "一部のアプリケーションサブセットは0％に達した。";
    expect(evaluateJaTranslation(output, source).reasons)
      .not.toContain("scientific invariants missing: 0%");
    expect(evaluateJaTranslation("一部のサブセットに到達した。", source).reasons)
      .toContain("scientific invariants missing: 0%");
  });

  it("accepts equivalent decimal formatting with trailing zeros", () => {
    const source = "The narrow-face probability was 0.60.";
    const output = "狭い顔の確率は0.6であった。";
    expect(evaluateJaTranslation(output, source).reasons)
      .not.toContain("scientific invariants missing: 0.60");
  });

  it("does not require flattened footnote markers after Roman-numeral names", () => {
    const source = "The duration predictor by Hal Daumé III5 was trained on MaryTTS [20].";
    const output = "Hal Daumé IIIによる持続時間予測器はMaryTTS[20]で学習された。";
    expect(evaluateJaTranslation(output, source).reasons)
      .not.toContain("scientific invariants missing: III5");
  });

  it("accepts exact Japanese conversion of standalone million magnitudes", () => {
    const source = "The corpus contains 3 M word tokens.";
    const output = "コーパスには300万語トークンが含まれる。";
    expect(evaluateJaTranslation(output, source).reasons)
      .not.toContain("scientific invariants missing: 3 M");
  });

  it("accepts stable Japanese expansions for USA and TV acronyms", () => {
    expect(evaluateJaTranslation(
      "本研究は米国と韓国で実施した。",
      "We ran the study in the United States of America (USA) and South Korea.",
    ).reasons).not.toContain("scientific invariants missing: USA");
    expect(evaluateJaTranslation(
      "最も少ないカテゴリは詩、正式スピーチ、テレビ脚本である。",
      "The least frequent categories are Poem, Formal speech, and TV scripts.",
    ).reasons).not.toContain("scientific invariants missing: TV");
  });

  it("flags extreme compression only for long source units", () => {
    expect(hasExtremeTranslationCompression("word ".repeat(140), "短い訳。"))
      .toBe(true);
    expect(hasExtremeTranslationCompression("word ".repeat(20), "短い訳。"))
      .toBe(false);
  });

  it("rejects reviewed hallucination with changed participant facts", () => {
    const source = "We recruited 10 participants for the English study and 10 participants for the Chinese study (M_age = 20.6; male = 3, female = 7).";
    const output = "英語と中国語の研究に10名ずつ招集した。英語と中国語の流暢度はそれぞれ100%、90%であった。";
    const reasons = evaluateJaTranslation(output, source).reasons;
    expect(reasons.some((reason) => /invariant|unexpected|degenerate|compression/i.test(reason))).toBe(true);
  });

  it("rejects reviewed bibliographic hallucination", () => {
    const source = "Anas Barakat and Pascal Bianchi. Convergence and dynamical behavior of the adam algorithm for nonconvex stochastic optimization. SIAM Journal on Optimization, 31(1):244–274, 2021.";
    const output = "アナス・バラカットとパスカル・ビアンキ。非凸確率最適化に対するadamアルゴリズムの収束と動的挙動を調べた。『日本の歴史』岩波書店、2013年、244-247頁。";
    const reasons = evaluateJaTranslation(output, source).reasons;
    expect(reasons.some((reason) => /invariant|unexpected|citation|year/i.test(reason))).toBe(true);
  });
});

describe("unsafeParagraphStructureReason sentence ends", () => {
  it("accepts a full stop before a closing quotation mark or several superscript citations", () => {
    expect(unsafeParagraphStructureReason("One participant said that programs should incorporate traditional healers as treatment resources [25].”")).toBeNull();
    expect(unsafeParagraphStructureReason("Pain was interpreted with the conventional cutoffs reported in the literature.13,14")).toBeNull();
    expect(unsafeParagraphStructureReason("Several studies confirmed the association in older adults.10–15")).toBeNull();
    expect(unsafeParagraphStructureReason("The results across different musical repertoires are detailed in")).toMatch(/末尾/);
  });
});

describe("shouldTranslateParagraph sentence end inside a closing quote", () => {
  it("accepts a long paragraph ending with a period inside a closing quote", () => {
    const body = "Next, in the elaboration stage, participants were asked to flesh out their initial idea in a more detailed outline. ".repeat(4);
    expect(shouldTranslateParagraph(`${body}They were told: “Use your idea as a starting point—you can deviate from it if you'd like.”`)).toBe(true);
  });
});
