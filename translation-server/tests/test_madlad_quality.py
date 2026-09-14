from __future__ import annotations

import unittest

from engines.madlad_mps import MADLADEngine


class MadladUnitQualityTests(unittest.TestCase):
    def test_degenerate_reason_labels_are_stable(self) -> None:
        source = "This is a sufficiently long academic sentence for testing."
        self.assertEqual(MADLADEngine._degenerate_reason("", source, "ja"), "empty")
        self.assertEqual(MADLADEngine._degenerate_reason("本文 <0xE8>", source, "ja"), "byte_escape")
        self.assertEqual(MADLADEngine._degenerate_reason("aaaaaaaaaaaaaaaa", source, "ja"), "character_repetition")

    def test_restores_contiguous_utf8_byte_escapes(self) -> None:
        encoded = "胸部の<0xE8><0x90><0xBC>片と<0xE9><0xA0><0x9A>部"
        self.assertEqual(MADLADEngine._restore_byte_escapes(encoded), "胸部の萼片と頚部")

    def test_leaves_invalid_byte_escape_runs_visible(self) -> None:
        encoded = "本文 <0xE8><0x90>"
        self.assertEqual(MADLADEngine._restore_byte_escapes(encoded), encoded)

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

    def test_rejects_trailing_prefix_of_source_identifier(self) -> None:
        source = "GPT-3 identified the correct object to be removed."
        output = "正しい対象を除去すべきだとGPT。"
        self.assertTrue(MADLADEngine._contains_untranslated_source_span(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))
