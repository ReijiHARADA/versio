from __future__ import annotations

import unittest

from engines.madlad_mps import MADLADEngine, allows_unprotected_identifier_retry


class MadladUnitQualityTests(unittest.TestCase):
    def test_identifier_retry_rejects_camelcase_placeholder_drift(self) -> None:
        self.assertTrue(allows_unprotected_identifier_retry(["errors"]))
        self.assertFalse(allows_unprotected_identifier_retry(["errorsAssume"]))

    def test_identifier_retry_allows_numeric_citations_only(self) -> None:
        self.assertTrue(allows_unprotected_identifier_retry(["[23]", "[6, 22]"]))
        self.assertFalse(allows_unprotected_identifier_retry(["[23] and the result"]))
        self.assertFalse(allows_unprotected_identifier_retry(["p < 0.001"]))

    def test_identifier_retry_allows_scalar_measurements(self) -> None:
        self.assertTrue(allows_unprotected_identifier_retry(["1 pF", "40 mAh"]))
        self.assertFalse(allows_unprotected_identifier_retry(["F(4,33) = 2.913"]))
        self.assertTrue(allows_unprotected_identifier_retry(["USD"]))

    def test_identifier_retry_allows_narrow_academic_reference_spans(self) -> None:
        self.assertTrue(allows_unprotected_identifier_retry(["SI Appendix", "Ruggeri et al.18"]))
        self.assertFalse(allows_unprotected_identifier_retry(["Ruggeri and Baron et al.18"]))

    def test_degenerate_reason_labels_are_stable(self) -> None:
        source = "This is a sufficiently long academic sentence for testing."
        self.assertEqual(MADLADEngine._degenerate_reason("", source, "ja"), "empty")
        self.assertEqual(MADLADEngine._degenerate_reason("本文 <0xE8>", source, "ja"), "byte_escape")
        self.assertEqual(MADLADEngine._degenerate_reason("aaaaaaaaaaaaaaaa", source, "ja"), "character_repetition")

    def test_rejects_trailing_translation_instruction_contamination(self) -> None:
        source = "Knowing how to enter formulae is important for spreadsheet users."
        output = (
            "数式を入力する方法を知っておくことは、表計算ソフトの利用者にとって重要である。\n\n"
            "次の英語の学術テキストを日本語に翻訳してください。\n\n"
            "The purpose of this study is to investigate the effects of various factors."
        )
        self.assertTrue(MADLADEngine._has_translation_instruction_contamination(output))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))
        self.assertEqual(MADLADEngine._degenerate_reason(output, source, "ja"), "instruction_contamination")

    def test_allows_translation_as_ordinary_academic_content(self) -> None:
        source = "The study examines translation practices in multilingual teams."
        output = "本研究では、多言語チームにおける翻訳実践を検討する。"
        self.assertFalse(MADLADEngine._has_translation_instruction_contamination(output))
        self.assertFalse(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_restores_contiguous_utf8_byte_escapes(self) -> None:
        encoded = "胸部の<0xE8><0x90><0xBC>片と<0xE9><0xA0><0x9A>部"
        self.assertEqual(MADLADEngine._restore_byte_escapes(encoded), "胸部の萼片と頚部")

    def test_leaves_invalid_byte_escape_runs_visible(self) -> None:
        encoded = "本文 <0xE8><0x90>"
        self.assertEqual(MADLADEngine._restore_byte_escapes(encoded), encoded)

    def test_allows_normal_repeated_technical_term(self) -> None:
        output = "温度を測定し、温度変化を記録した。温度の推移を分析し、温度モデルを評価した。"
        self.assertFalse(MADLADEngine._has_abnormal_phrase_repetition(output))

    def test_allows_repeated_katakana_modifier_in_inventory(self) -> None:
        output = "スマートジュエリーにはスマートネックレス、スマートブレスレット、スマートメガネ、スマートリング、スマートイヤリングがある。"
        self.assertFalse(MADLADEngine._has_abnormal_phrase_repetition(output))

    def test_allows_repeated_kanji_in_academic_prose(self) -> None:
        # Recurrent characters such as 的 and 評 are normal in Japanese
        # academic terminology and do not establish phrase repetition.
        output = (
            "暗黙評価は、文化的または社会的参照を認識する聴衆によって"
            "特定の文脈で態度的と解釈できる事実的、表面的に中立的な表現で伝達される。"
        )
        self.assertFalse(MADLADEngine._has_abnormal_phrase_repetition(output))

    def test_rejects_compact_translation_that_omits_as_not_qualification(self) -> None:
        source = (
            "It is the implicit cases of appraisal that are the problem as they are not confined "
            "to individual words (Kaltenbacher 2006: 274)."
        )
        output = "また、評価の暗黙的な場合が問題となる(Kaltenbacher 2006: 274)。"
        self.assertTrue(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))
        complete = "暗黙の評価事例が問題となるのは、個々の語に限定されないためである(Kaltenbacher 2006: 274)。"
        self.assertFalse(MADLADEngine._is_implausibly_short_unit(complete, source))

        paragraph_source = source + (
            " Implicit appraisal is conveyed by factual, superficially neutral expressions "
            "that can be interpreted as attitudinal in specific contexts by audiences that "
            "recognise the cultural or social reference (Hyatt 2007, 2009: 130) as demonstrated "
            "in examples 3 and 4."
        )
        paragraph_output = (
            "これらの評価は個々の単語(Kaltenbacher 2006: 274)に限定されないので、問題となる。"
            "暗黙評価は、文化的または社会的参照を認識する聴衆によって、特定の文脈で態度的と"
            "解釈できる事実的、表面的に中立な表現によって伝達される(Hyatt 2007, 2009: 130)。"
        )
        self.assertFalse(MADLADEngine._is_implausibly_short_unit(paragraph_output, paragraph_source))

    def test_rejects_fluent_japanese_phrase_repetition(self) -> None:
        source = "We present a smart necklace that recognizes silent speech commands in two languages."
        output = "顔面が顔面が顔面が顔面が顔面が続き、その画像を用いて英語と中国語のコマンドを識別する。"
        self.assertTrue(MADLADEngine._has_abnormal_phrase_repetition(output))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))
        self.assertEqual(MADLADEngine._degenerate_reason(output, source, "ja"), "phrase_repetition")

    def test_retries_unsupported_numbered_enumeration(self) -> None:
        source = (
            "The first group asked the hypothesis-scanning question, whereas the second group "
            "asked the constraint-seeking question. The study then compared their responses."
        )
        output = "1) 自転車 2) 物体 3) 病院 4) カードを選んだ。"
        self.assertTrue(MADLADEngine._has_unsupported_numbered_enumeration(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))
        self.assertEqual(
            MADLADEngine._degenerate_reason(output, source, "ja"),
            "unsupported_numbered_enumeration",
        )

    def test_allows_source_numbered_list(self) -> None:
        source = "The procedure had three steps: 1) prepare the data, 2) fit the model, 3) report the result."
        output = "手順は3段階である。1) データを準備し、2) モデルを適合し、3) 結果を報告した。"
        self.assertFalse(MADLADEngine._has_unsupported_numbered_enumeration(output, source))
        self.assertFalse(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_rejects_long_natural_language_unit_reduced_to_its_conclusion(self) -> None:
        source = (
            "While the smaller sample has a larger variance, the correct answer "
            "is the smaller group because it is more likely to contain an extreme "
            "outcome than the larger comparison group in the same experiment."
        )
        output = "正解は小さい群である。"
        self.assertTrue(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_rejects_a_sentence_that_drops_its_material_qualification(self) -> None:
        source = (
            "Cathodal tDCS increased participants’ rule-following, even of rules "
            "that demanded to lose money or hurt another person financially."
        )
        output = "また、カソーダルtDCSは、参加者のルール遵守を増加させた。"
        self.assertTrue(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_rejects_a_borderline_compressed_result_sentence(self) -> None:
        source = (
            "Thus, the confrontation with a rather pro-social rule was able to "
            "attenuate the increased selfishness of participants under cathodal "
            "tDCS, while participants stayed more consistent with their free "
            "choices under anodal tDCS (Fig. 7b)."
        )
        output = "従って、対抗的なプロ社会的ルールは陰極tDCSの下で参加者の利己性を減弱させることができた。(Fig. 7b)。"
        self.assertTrue(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_allows_a_compact_but_substantive_sentence_translation(self) -> None:
        source = (
            "The experiment compares the two groups under the same condition and "
            "reports the observed response for every participant in the study."
        )
        output = "実験では同一条件下で二群を比較し、研究の全参加者について観測された反応を報告する。"
        self.assertFalse(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertFalse(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_allows_compact_translation_when_only_reporting_frame_is_omitted(self) -> None:
        source = (
            "Among other things they found that an emotional relation with an – at first nondescript – "
            "physical piece of jewellery could be established through interaction."
        )
        output = "また、宝石との感情的関係は、相互作用を通して確立されることが分かった。"
        self.assertFalse(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertFalse(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_allows_compact_complete_mid_length_sentence(self) -> None:
        source = (
            "We, therefore, next turned our lens of investigation to a more challenging "
            "setting and tested GPT-3 on actual, task-based experiments."
        )
        output = "GPT‐3を実際のタスクベースの実験でテストした。"
        self.assertFalse(MADLADEngine._is_implausibly_short_unit(output, source))

    def test_still_rejects_coordinated_claim_when_one_finding_is_omitted(self) -> None:
        source = (
            "Among other things they found that an emotional relation with an – at first nondescript – "
            "physical piece of jewellery could be established through interaction and that interactive "
            "jewellery holds the quality to make implicit emotions related to a piece of jewellery can "
            "be made explicit through interaction [29]."
        )
        output = "また、インタラクティブジュエリーは、ジュエリーに関連する内在的な感情をインタラクションを通して明示できる性質を持つことを示した。[29]"
        self.assertTrue(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_candidate_score_prefers_scientific_token_preservation(self) -> None:
        source = "The study measured GPT-3 accuracy at 92.4% with p < 0.001 across both conditions."
        preserved = "この研究では、両条件でGPT-3の精度92.4%を測定し、p < 0.001だった。"
        omitted = "この研究では、両条件で精度を測定した。"
        self.assertGreater(MADLADEngine._candidate_score(preserved, source), MADLADEngine._candidate_score(omitted, source))

    def test_candidate_score_prefers_negation_preservation(self) -> None:
        source = "The method does not distinguish between the two conditions."
        preserved = "この方法は2つの条件を区別しない。"
        omitted = "この方法は2つの条件を区別する。"
        self.assertGreater(MADLADEngine._candidate_score(preserved, source), MADLADEngine._candidate_score(omitted, source))


class MadladPartialSourceFallbackTests(unittest.TestCase):
    def test_rejects_partial_untranslated_source_span(self) -> None:
        source = (
            "While we have shown that an increase in core body temperature can be reflected "
            "in earlobe temperature measurements made by Thermal Earring in section 6.1, "
            "directly estimating the core body temperature from the earlobe temperature requires "
            "further study. It is known that skin temperature is affected by ambient temperature."
        )
        output = (
            "While we have shown that an increase in core body temperature can be reflected "
            "in earlobe temperature measurements made by Thermal Earring in section 6.1, "
            "directly estimating the core body temperature from the earlobe temperature requires "
            "further study.皮膚温は周囲温度の影響を受ける。"
        )
        self.assertTrue(MADLADEngine._contains_untranslated_source_span(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_allows_short_source_facts_inside_japanese(self) -> None:
        source = "We compared the IR camera condition with the baseline condition [12]."
        output = "IR カメラ条件をベースライン条件 [12] と比較した。"
        self.assertFalse(MADLADEngine._contains_untranslated_source_span(output, source))
        self.assertFalse(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_restored_author_year_citation_is_not_untranslated_source_prose(self) -> None:
        source = (
            "Nevertheless, explicit cases in earlier parts of the text guide the reader’s "
            "interpretation of the following implicit cases by creating a setting through "
            "which readers are conditioned to accept certain meanings or value positions "
            "(see e.g. ‘dynamic reader positioning’ in Coffin and O’Halloran 2005, Coffin "
            "and O’Halloran 2006; White 2008)."
        )
        output = (
            "しかし、テキスト前半の明示的な事例は、読者が特定の意味や価値観を受け入れるよう"
            "促す状況を作ることで、後続の暗示的な事例に対する読者の解釈を導く(see e.g. "
            "‘dynamic reader positioning’ in Coffin and O’Halloran 2005, Coffin and O’Halloran "
            "2006; White 2008)。"
        )
        self.assertFalse(MADLADEngine._contains_untranslated_source_span(output, source))

    def test_rejects_trailing_prefix_of_source_identifier(self) -> None:
        source = "GPT-3 identified the correct object to be removed."
        output = "正しい対象を除去すべきだとGPT。"
        self.assertTrue(MADLADEngine._contains_untranslated_source_span(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))
