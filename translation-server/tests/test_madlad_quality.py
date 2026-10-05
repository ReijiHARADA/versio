from __future__ import annotations

import unittest
import re
from unittest.mock import patch

from engines.madlad_mps import (
    MADLADEngine,
    MEASUREMENT_PATTERN,
    allows_unprotected_identifier_retry,
    restore_unambiguous_terminal_numeric_citations,
    restore_missing_structure_references,
    unprotected_identifier_retry_values,
)


class MadladUnitQualityTests(unittest.TestCase):
    def test_terminal_visible_numeric_citation_is_repaired_only_at_sentence_end(self) -> None:
        source = "The studies reduced risk [13]."
        output = "研究はリスクを低減した。"
        with patch.dict("os.environ", {"MADLAD_EXPOSE_INLINE_NUMERIC_CITATIONS": "1"}):
            self.assertEqual(
                restore_unambiguous_terminal_numeric_citations(source, output),
                "研究はリスクを低減した[13]。",
            )

    def test_mid_clause_visible_numeric_citation_is_not_moved(self) -> None:
        source = "The studies reduced risk [13] and improved safety."
        output = "研究はリスクを低減し、安全性を改善した。"
        with patch.dict("os.environ", {"MADLAD_EXPOSE_INLINE_NUMERIC_CITATIONS": "1"}):
            self.assertEqual(
                restore_unambiguous_terminal_numeric_citations(source, output),
                output,
            )

    def test_numeric_quote_labels_are_restored_from_source(self) -> None:
        source = 'One group was framed as “75% lean” and the other as “25% fat.”'
        output = '一方は「75%希薄」と、もう一方は「25%脂肪」とされた。'
        self.assertEqual(
            MADLADEngine._restore_numeric_quote_labels(source, output),
            '一方は「75% lean」と、もう一方は「25% fat」とされた。',
        )

    def test_repeated_numeric_condition_with_inconsistent_labels_is_rejected(self) -> None:
        source = 'It was framed as “75% lean” and participants preferred it when described as 75% lean.'
        output = '「75% lean」と示され, 75%希薄と記述された。'
        self.assertTrue(MADLADEngine._has_inconsistent_repeated_measurement_labels(source, output))

    def test_repeated_numeric_condition_label_is_repaired_consistently(self) -> None:
        source = 'It was framed as “75% lean” and preferred when described as 75% lean.'
        output = '「75%希薄」と示され, 75%希薄と記述された。'
        self.assertEqual(
            MADLADEngine._restore_numeric_quote_labels(source, output),
            '「75% lean」と示され, 75% leanと記述された。',
        )

    def test_epistemic_retry_only_triggers_for_missing_uncertainty_marker(self) -> None:
        source = "Smaller effects might not have been detected."
        self.assertTrue(MADLADEngine._epistemic_marker_missing(source, "小さな効果は検出されなかった。"))
        self.assertFalse(MADLADEngine._epistemic_marker_missing(source, "小さな効果は検出されなかった可能性があります。"))
        self.assertFalse(MADLADEngine._epistemic_marker_missing("The effect was not detected.", "効果は検出されなかった。"))

    def test_quoted_technical_name_missing_is_structural(self) -> None:
        source = 'We developed a prototype dubbed the “Jogwheel” (Figure 1a).'
        self.assertEqual(
            MADLADEngine._missing_quoted_technical_names(
                source, "電子テキスタイルの試作機を開発した(Figure 1a)。"
            ),
            ["Jogwheel"],
        )
        self.assertEqual(
            MADLADEngine._missing_quoted_technical_names(
                source, "「Jogwheel」と呼ばれる試作機を開発した。"
            ),
            [],
        )
        self.assertEqual(
            MADLADEngine._missing_quoted_technical_names(
                'The terms “Normal” and “Awkward” described participant perceptions.',
                '参加者の知覚を「正常」と「不快」で表した。',
            ),
            [],
        )

    def test_quoted_content_span_count_detects_dropped_condition(self) -> None:
        source = 'The clips followed gist cues (e.g., “couple fighting”) or detailed cues (e.g., “white piano”).'
        self.assertEqual(MADLADEngine._quoted_content_span_count(source), 2)
        self.assertEqual(MADLADEngine._quoted_content_span_count('クリップは「白いピアノ」に従った。'), 1)
        self.assertEqual(MADLADEngine._quoted_content_span_count('クリップは「カップルの喧嘩」または「白いピアノ」に従った。'), 2)

    def test_negation_retry_only_triggers_when_polarity_is_lost(self) -> None:
        source = "We are not the first to explore this interaction."
        self.assertTrue(MADLADEngine._negation_marker_missing(source, "この相互作用を最初に探求した。"))
        self.assertFalse(MADLADEngine._negation_marker_missing(source, "この相互作用を最初に探求したわけではない。"))
        self.assertFalse(MADLADEngine._negation_marker_missing("We explore this interaction.", "この相互作用を探求する。"))

    def test_relation_risk_source_is_conservative(self) -> None:
        self.assertTrue(MADLADEngine._relation_risk_source("Participants chose either A or B."))
        self.assertTrue(MADLADEngine._relation_risk_source("Gist memory was forgotten more slowly than detailed memory."))
        self.assertTrue(MADLADEngine._relation_risk_source("Fitbit measures valid heart rates only 54.88% of the time."))
        self.assertTrue(MADLADEngine._relation_risk_source("The effect was observed solely in adults."))
        self.assertTrue(MADLADEngine._relation_risk_source("Despite the improvement, the effect was not significant."))
        self.assertTrue(MADLADEngine._relation_risk_source("Both groups improved, and therefore the intervention was retained."))
        self.assertTrue(MADLADEngine._relation_risk_source("The model includes age, including participants with prior training."))
        self.assertFalse(MADLADEngine._relation_risk_source("Participants watched film clips and rated interest."))

    def test_exclusivity_marker_loss_is_detected(self) -> None:
        source = "Fitbit measures valid heart rates only 54.88% of the time."
        self.assertTrue(MADLADEngine._exclusivity_marker_missing(source, "54.88%の時間で測定した。"))
        self.assertFalse(MADLADEngine._exclusivity_marker_missing(source, "54.88%しか測定しなかった。"))

    def test_alternative_marker_loss_is_detected(self) -> None:
        source = "Participants received either gist or detailed cues."
        self.assertTrue(MADLADEngine._alternative_marker_missing(source, "参加者は手がかりを受けた。"))
        self.assertFalse(MADLADEngine._alternative_marker_missing(source, "参加者はいずれかの手がかりを受けた。"))

    def test_comparative_likelihood_marker_loss_is_detected(self) -> None:
        source = "Participants were asked which hospital was more likely to report more days above the threshold."
        self.assertTrue(MADLADEngine._comparative_likelihood_marker_missing(source, "参加者は病院について質問された。"))
        self.assertFalse(MADLADEngine._comparative_likelihood_marker_missing(source, "どちらの病院が報告する可能性が高いかを尋ねた。"))

    def test_condition_marker_loss_is_detected(self) -> None:
        source = "We focused on Davinci unless otherwise noted."
        self.assertTrue(MADLADEngine._condition_marker_missing(source, "Davinciに注目した。"))
        self.assertFalse(MADLADEngine._condition_marker_missing(source, "特に記載がない限りDavinciに注目した。"))

    def test_missing_contextual_count_is_rejected(self) -> None:
        source = "We identified 8949 studies and included 28 studies with 3,227 participants."
        self.assertEqual(MADLADEngine._missing_contextual_count(source, "8949件の研究と28件を含む3,227名。"), None)
        self.assertEqual(MADLADEngine._missing_contextual_count(source, "28件の研究と3,227名。"), "8949")
        self.assertTrue(MADLADEngine._is_degenerate("28件の研究と3,227名。", source, "ja"))

    def test_unexpected_contextual_number_is_rejected(self) -> None:
        source = "We identified 8949 studies and included 28 studies with 3,227 participants."
        self.assertIsNone(MADLADEngine._has_unexpected_contextual_number(source, "8949件と3,227名。"))
        self.assertEqual(MADLADEngine._has_unexpected_contextual_number(source, "8949件と3,227名。227"), "227")

    def test_coordinated_clause_rescue_requires_substantive_clauses(self) -> None:
        parts = MADLADEngine._coordinated_clause_parts(
            "All participants found the PPG Earring as comfortable as their regular earrings, and most participants expressed a strong willingness to wear the PPG Earring all the time every day."
        )
        self.assertEqual(len(parts or []), 2)
        self.assertIsNone(MADLADEngine._coordinated_clause_parts("A short clause, and the rest."))

    def test_coordinated_clause_rescue_allows_commas_inside_right_clause(self) -> None:
        parts = MADLADEngine._coordinated_clause_parts(
            "The forward path is through the body, and the return path is formed by the parasitic capacitance between the receiver and earth, referred to as Cret, as shown in Fig. 2 (a)."
        )
        self.assertEqual(len(parts or []), 2)
        self.assertIn("the return path", parts[1] if parts else "")

    def test_identifier_retry_rejects_camelcase_placeholder_drift(self) -> None:
        self.assertTrue(allows_unprotected_identifier_retry(["errors"]))
        self.assertFalse(allows_unprotected_identifier_retry(["errorsAssume"]))

    def test_identifier_retry_allows_numeric_citations_only(self) -> None:
        self.assertTrue(allows_unprotected_identifier_retry(["[23]", "[6, 22]"]))
        self.assertFalse(allows_unprotected_identifier_retry(["[23] and the result"]))
        self.assertFalse(allows_unprotected_identifier_retry(["p < 0.001"]))

    def test_selective_retry_keeps_citation_protected(self) -> None:
        self.assertEqual(
            unprotected_identifier_retry_values(["ErgoSALBP", "[24]"]),
            ["ErgoSALBP"],
        )
        self.assertFalse(allows_unprotected_identifier_retry(["ErgoSALBP", "[24]"]))

    def test_selective_retry_allows_section_reference(self) -> None:
        self.assertEqual(
            unprotected_identifier_retry_values(["Section 5", "Appendix G"]),
            ["Section 5", "Appendix G"],
        )

    def test_missing_structure_reference_is_recovered_verbatim(self) -> None:
        self.assertEqual(
            restore_missing_structure_references(
                "The results are discussed in Section 5.",
                "結果を示す。",
            ),
            "結果を示す。 (Section 5)",
        )

    def test_missing_table_and_figure_references_are_recovered_verbatim(self) -> None:
        self.assertEqual(
            restore_missing_structure_references(
                "The result is shown in Figure 2 and summarized in Table 5.",
                "結果を示す。",
            ),
            "結果を示す。 (Figure 2; Table 5)",
        )

    def test_missing_equation_reference_is_recovered_but_localized_equation_is_kept(self) -> None:
        source = "The result is given by Eqn. 20 and Eqn. 7."
        self.assertEqual(
            restore_missing_structure_references(source, "結果は式7で与えられる。"),
            "結果は式7で与えられる。 (Eqn. 20)",
        )

    def test_parenthesized_figure_panel_reference_is_recovered(self) -> None:
        self.assertEqual(
            restore_missing_structure_references(
                "The result is shown by Fig. 2 (e) over Fig. 2 (d).",
                "結果はFig. 2 (d)に示される。",
            ),
            "結果はFig. 2 (d)に示される。 (Fig. 2 (e))",
        )

    def test_structural_recovery_does_not_copy_unrelated_numbers(self) -> None:
        self.assertEqual(
            restore_missing_structure_references(
                "The study recruited 82 participants in 2024.",
                "参加者を募集した。",
            ),
            "参加者を募集した。",
        )

    def test_identifier_retry_allows_scalar_measurements(self) -> None:
        self.assertTrue(allows_unprotected_identifier_retry(["1 pF", "40 mAh"]))
        self.assertFalse(allows_unprotected_identifier_retry(["F(4,33) = 2.913"]))
        self.assertTrue(allows_unprotected_identifier_retry(["USD"]))

    def test_measurement_rescue_recognizes_comparators_and_si_prefix_spacing(self) -> None:
        for value in ("≤ 30M Hz", "≤ 1pF", "±0.32 m", "11.3 mm"):
            self.assertIsNotNone(re.fullmatch(MEASUREMENT_PATTERN, value, flags=re.IGNORECASE))
        self.assertIsNone(re.fullmatch(MEASUREMENT_PATTERN, "F(4,33) = 2.913", flags=re.IGNORECASE))

    def test_identifier_retry_allows_narrow_academic_reference_spans(self) -> None:
        self.assertTrue(allows_unprotected_identifier_retry(["SI Appendix", "Ruggeri et al.18"]))
        self.assertFalse(allows_unprotected_identifier_retry(["Ruggeri and Baron et al.18"]))

    def test_identifier_retry_allows_figure_table_reference_spans(self) -> None:
        self.assertTrue(allows_unprotected_identifier_retry(["Figure 1A", "Table 2"]))
        self.assertTrue(allows_unprotected_identifier_retry(["Fig. 3(b)"]))
        self.assertFalse(allows_unprotected_identifier_retry(["Figure 1A and the result"]))

    def test_identifier_retry_exposes_compact_reference_group(self) -> None:
        self.assertEqual(
            unprotected_identifier_retry_values(["17", "SI Appendix"]),
            ["SI Appendix"],
        )
        self.assertEqual(
            unprotected_identifier_retry_values(["17"], allow_inline_numeric=True),
            ["17"],
        )

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

    def test_rejects_hangul_inserted_into_japanese_output(self) -> None:
        source = "None of the groups showed a significant difference, whereas both groups improved."
        output = "両群とも有意差はなかったが、両群と도改善した。"
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))
        self.assertEqual(MADLADEngine._degenerate_reason(output, source, "ja"), "foreign_script:hangul")

    def test_rejects_simplified_chinese_leak_into_japanese_output(self) -> None:
        source = "Deep learning has been widely used for medical image segmentation."
        output = "深度学习は医療画像のセグメンテーションに広く用いられている。"
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))
        self.assertEqual(MADLADEngine._degenerate_reason(output, source, "ja"), "foreign_script:simplified_cjk")

    def test_detects_missing_supplementary_reference(self) -> None:
        source = "The details appear in the SI Appendix."
        self.assertEqual(
            MADLADEngine._missing_supplementary_references(source, "詳細は補足資料に記載されている。"),
            ["SI Appendix"],
        )
        self.assertEqual(
            MADLADEngine._missing_supplementary_references(source, "詳細はSI Appendixに記載されている。"),
            [],
        )

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

    def test_rejects_adjacent_repeated_latin_token(self) -> None:
        source = "The theory was applied to the planned behavior model."
        output = "計画的行動理論（TRA）のTheoryTheoryモデルを適用した。"
        self.assertTrue(MADLADEngine._has_adjacent_repeated_latin_token(output))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))
        self.assertEqual(MADLADEngine._degenerate_reason(output, source, "ja"), "adjacent_repeated_latin_token")

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

    def test_allows_parenthesized_source_claim_enumeration(self) -> None:
        source = "We show that (1) lexical features matter, (2) grammar improves stability, and (3) registers form a continuum."
        output = "(1)語彙特徴が重要であり、(2)文法が安定性を改善し、(3)レジスタは連続体を形成することを示す。"
        self.assertFalse(MADLADEngine._has_unsupported_numbered_enumeration(output, source))

    def test_rejects_unsupported_comma_inventory(self) -> None:
        source = "There are several reasons for the low consumption of organic food, including consumers' attitudes and purchase intentions."
        output = "消費者の有機食品への意識は、消費の意識、消費意欲、消費行動、消費習慣、消費環境、消費動機、消費状況、消費量、消費期限、消費方法、消費目的、消費傾向、消費態度、消費計画、消費経験、消費理由。"
        self.assertTrue(MADLADEngine._has_unsupported_inventory(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))
        self.assertEqual(MADLADEngine._degenerate_reason(output, source, "ja"), "unsupported_inventory")

    def test_allows_source_comma_inventory(self) -> None:
        source = "The study measured attention, memory, and response time across three conditions."
        output = "この研究では、3条件で注意、記憶、反応時間を測定した。"
        self.assertFalse(MADLADEngine._has_unsupported_inventory(output, source))
        self.assertFalse(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_rejects_short_decode_of_long_multi_sentence_claim(self) -> None:
        source = (
            "For example, Levin and Gaeth (1988) presented an advertisement for ground beef to two groups: "
            "one was framed as lean and the other as fat. Participants responded more favorably toward the beef "
            "when it was described as lean."
        )
        output = "例えば、Levin and Gaeth (1988)は、「75%脂肪」と「25%脂質」の2つのグループに広告を提示した。"
        self.assertTrue(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_rejects_compressed_dense_citation_claim(self) -> None:
        source = (
            "Most of the existing literature focus on the factors that influence these aspects, including consumers' "
            "product knowledge (Wu et al., 2019), trust (Yue et al., 2017), health awareness, and individual "
            "characteristics (Asioli et al., 2017) on the basis of the Theory of Reasoned Action (TRA) and the "
            "Theory of Planned Behavior (TPB) (Zagata, 2012)."
        )
        output = "これらの要因は、合理的行動理論(TRA)と計画的行動論(TPB)に基づく(Wu et al., 2019)(Yue et al., 2017)(Asioli et al., 2017)(Zagata, 2012)。"
        self.assertTrue(MADLADEngine._is_implausibly_short_unit(output, source))

    def test_rejects_missing_leading_section_marker(self) -> None:
        source = "4.3.1 Board Design describes the prototype and its constraints."
        self.assertTrue(
            MADLADEngine._has_missing_section_marker(
                "基板設計ではプロトタイプと制約を説明する。", source
            )
        )
        self.assertFalse(
            MADLADEngine._has_missing_section_marker(
                "4.3.1 基板設計ではプロトタイプと制約を説明する。", source
            )
        )
    def test_rejects_long_natural_language_unit_reduced_to_its_conclusion(self) -> None:
        source = (
            "While the smaller sample has a larger variance, the correct answer "
            "is the smaller group because it is more likely to contain an extreme "
            "outcome than the larger comparison group in the same experiment."
        )
        output = "正解は小さい群である。"
        self.assertTrue(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_rejects_multisentence_list_item_that_drops_first_claim(self) -> None:
        source = (
            "The PPG Earring was rated as highly comfortable by all six participants in the "
            "whole-day in-the-wild study. All participants found it as comfortable as their "
            "regular earrings, with five participants expressing a strong willingness to wear "
            "it all the time every day."
        )
        output = "PPGイヤリングは、全日野外実験の6名全員にとって高い快適性を評価された。耳かきの使用は、耳かきを着用する意欲が高い5名が多かった。"
        self.assertTrue(MADLADEngine._is_implausibly_short_unit(output, source))

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

    def test_claim_compression_risk_targets_short_coordinated_omission(self) -> None:
        source = (
            "In this study, 29 participants watched film clips accompanied by either gist or detailed "
            "cues and rated their interest in these clips."
        )
        omitted = "29名の被験者に、映画クリップを見せ、その内容を詳細に説明した。"
        self.assertTrue(MADLADEngine._claim_compression_risk(source, omitted))

    def test_claim_compression_risk_does_not_probe_short_or_complete_output(self) -> None:
        source = "Participants watched film clips and rated interest in them."
        output = "参加者は映画クリップを見て、興味を評価した。"
        self.assertFalse(MADLADEngine._claim_compression_risk(source, output))

    def test_collapsed_measurement_labels_catches_attribute_inversion(self) -> None:
        source = 'One group saw "75% lean" and another saw "25% fat".'
        inverted = '一方は75%脂肪分,もう一方は25%脂肪分と説明された。'
        correct = '一方は75%低脂肪,もう一方は25%脂肪分と説明された。'
        self.assertTrue(MADLADEngine._has_collapsed_measurement_labels(source, inverted))
        self.assertFalse(MADLADEngine._has_collapsed_measurement_labels(source, correct))
        self.assertTrue(MADLADEngine._is_degenerate(inverted, source, "ja"))
        self.assertFalse(MADLADEngine._is_degenerate(correct, source, "ja"))

    def test_rejects_mutated_identifier_glue_only_for_source_compounds(self) -> None:
        source = "The trial compared TRT and RT+CT across the same outcomes."
        self.assertTrue(MADLADEngine._has_corrupted_identifier_glue(
            source, "TRTとRTz+CTzの結果を比較した。"
        ))
        self.assertFalse(MADLADEngine._has_corrupted_identifier_glue(
            "The z score was reported for each group.", "各群のz値を報告した。"
        ))

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
