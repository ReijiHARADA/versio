from __future__ import annotations

import json
import unittest
from pathlib import Path

from engines.citation_protect import (
    AUTHOR_YEAR_CITATION_RE,
    CITATION_RE,
    INLINE_FOOTNOTE_CITATION_RE,
    INLINE_NUMERIC_CITATION_RE,
    protect_citations,
    protect_quoted_examples,
    restore_quoted_examples,
    restore_missing_bare_references,
    restore_citations,
    terminal_superscript_indices,
)
from engines.madlad_mps import allows_unprotected_identifier_retry


class CitationProtectTests(unittest.TestCase):
    def test_quoted_examples_round_trip_as_atomic_spans(self) -> None:
        source = 'The cues included e.g., “couple fighting” and e.g. "white piano".'
        protected, values, nonce = protect_quoted_examples(source)
        self.assertEqual(values, ["“couple fighting”", '"white piano"'])
        self.assertNotIn("couple fighting", protected)
        self.assertEqual(restore_quoted_examples(protected, values, nonce), source)

    def test_dropped_quoted_example_fails_closed(self) -> None:
        with self.assertRaises(ValueError):
            restore_quoted_examples("文脈 ZZQTE1N0ZZ", ["“first”", '"second"'], 0)

    def test_power_measurement_keeps_decimal_and_unit_atomic(self) -> None:
        source = "The prototype consumes only 14.4 uW and operates below 1pF."
        protected, cites, nonce = protect_citations(source)
        self.assertNotIn("14.ZZCIT", protected)
        self.assertEqual(restore_citations(protected, cites, nonce), source)

    def test_acronym_with_attached_superscript_number_is_atomic(self) -> None:
        source = "Traditional education systems are classified by UNESCO6 as shown in Table 5."
        protected, cites, nonce = protect_citations(source)
        self.assertEqual(cites, ["UNESCO6", "Table 5"])
        self.assertNotIn("UNESCO6", protected)
        self.assertNotIn("Table 5", protected)
        self.assertEqual(restore_citations(protected, cites, nonce), source)

    def test_numbered_table_reference_is_atomic_without_neighboring_prose(self) -> None:
        source = "Levels are shown in Table 5 and Figure 2a."
        protected, cites, nonce = protect_citations(source)
        self.assertEqual(cites, ["Table 5", "Figure 2a"])
        self.assertEqual(restore_citations(protected, cites, nonce), source)

    def test_section_and_appendix_cross_references_are_atomic(self) -> None:
        source = "Our results, along with Section 5 next, refer to Appendix G."
        protected, cites, nonce = protect_citations(source)
        self.assertIn("Section 5", cites)
        self.assertIn("Appendix G", cites)
        self.assertNotIn("Section 5", protected)
        self.assertEqual(restore_citations(protected, cites, nonce), source)

    def test_table_keyword_without_number_is_not_protected(self) -> None:
        source = "The table contains five rows."
        protected, cites, _ = protect_citations(source)
        self.assertEqual(cites, [])
        self.assertEqual(protected, source)

    def test_bare_superscript_references_are_protected_without_touching_decimals(self) -> None:
        source = (
            "The coaching29 and review28 findings were replicated in the tool,31. "
            "The redesigned record (EHR)30 followed the infection.30 protocol. "
            "The method version2 was stable at 2.913."
        )
        protected, cites, nonce = protect_citations(source)
        for citation in ("29", "28", "31", "30"):
            self.assertIn(citation, cites)
        self.assertNotIn("2.913", cites)
        self.assertEqual(restore_citations(protected, cites, nonce), source)

    def test_missing_bare_references_are_restored_from_source_only(self) -> None:
        source = "The review28 and infection.30 findings were replicated."
        self.assertEqual(
            restore_missing_bare_references(source, "レビュー結果を再現した。"),
            "レビュー結果を再現した 28,30。",
        )
        self.assertEqual(
            restore_missing_bare_references("The value was 2.913.", "値は2.913。"),
            "値は2.913。",
        )

    def test_thousands_group_tail_is_not_restored_as_bare_reference(self) -> None:
        source = "The review included 3,227 participants."
        protected, cites, nonce = protect_citations(source)
        self.assertNotIn("227", cites)
        translated = "レビューには3,227名が含まれた。"
        self.assertEqual(
            restore_missing_bare_references(source, translated),
            translated,
        )
        self.assertEqual(restore_citations(protected, cites, nonce), source)

    def test_repeated_title_case_technical_token_is_atomic(self) -> None:
        source = "Bluetooth advertising uses Bluetooth packets, while These packets repeat."
        protected, cites, nonce = protect_citations(source)
        self.assertEqual(cites, ["Bluetooth", "Bluetooth"])
        self.assertNotIn("Bluetooth", protected)
        self.assertIn("These", protected)
        self.assertEqual(restore_citations(protected, cites, nonce), source)

    def test_unprotected_retry_allows_only_structural_figure_table_reference(self) -> None:
        self.assertTrue(allows_unprotected_identifier_retry(["Fig. 2"]))
        self.assertTrue(allows_unprotected_identifier_retry(["(Table 3a)"]))
        self.assertFalse(allows_unprotected_identifier_retry(["Fig. 2 and the result"]))
        self.assertFalse(allows_unprotected_identifier_retry(["p < 0.001"]))

    def test_hyphenated_model_identifier_is_not_split_into_acronym_placeholder(self) -> None:
        protected, cites, _ = protect_citations("GPT-3 identified the object.")
        self.assertEqual(cites, [])
        self.assertEqual(protected, "GPT-3 identified the object.")

    def test_strict_restore_rejects_dropped_placeholder(self) -> None:
        protected, cites, nonce = protect_citations("signal TQP3M9009 and RF")
        with self.assertRaisesRegex(ValueError, "placeholder dropped"):
            restore_citations(protected.replace("ZZCIT1ZZ", ""), cites, nonce, reject_missing=True)

    def test_strict_restore_accepts_fullwidth_placeholder(self) -> None:
        protected, cites, nonce = protect_citations("see [12]")
        fullwidth = protected.replace("ZZCIT1ZZ", "ＺＺＣＩＴ１ＺＺ")
        self.assertEqual(restore_citations(fullwidth, cites, nonce, reject_missing=True), "see [12]")

    def test_strict_restore_recovers_single_garbled_placeholder_by_index(self) -> None:
        source = "Results include BDNF and (p=0.001)."
        protected, cites, nonce = protect_citations(source)
        self.assertEqual(cites, ["BDNF", "(p=0.001)"])
        garbled = protected.replace("ZZCIT2ZZ", "ZZCイT2ZZ")
        self.assertEqual(
            restore_citations(garbled, cites, nonce, reject_missing=True),
            source,
        )

    def test_strict_restore_rejects_ambiguous_garbled_placeholder(self) -> None:
        source = "Values (p=0.001) and (p=0.002)."
        protected, cites, nonce = protect_citations(source)
        garbled = protected.replace("ZZCIT1ZZ", "ZZCaT1ZZ") + " ZZCaT1ZZ"
        with self.assertRaisesRegex(ValueError, "placeholder malformed"):
            restore_citations(garbled, cites, nonce, reject_missing=True)

    def test_strict_restore_recovers_dropped_terminal_figure_reference(self) -> None:
        protected, cites, nonce = protect_citations("The result is shown (Fig. 8 and Table S3).")
        self.assertEqual(
            restore_citations("結果を示した。", cites, nonce, reject_missing=True),
            "結果を示した(Fig. 8 and Table S3)。",
        )

    def test_identifier_retry_leaves_other_citations_protected(self) -> None:
        source = (
            "Finally, Apple announced its Human Interface Guidelines at WWDC [1]."
        )
        protected, citations, nonce = protect_citations(
            source,
            unprotected_values={"WWDC"},
        )
        self.assertIn("WWDC", protected)
        self.assertNotIn("[1]", protected)
        self.assertEqual(citations, ["[1]"])
        self.assertEqual(
            restore_citations(
                "最後に,アップルはWWDCでガイドラインを発表した。",
                citations,
                nonce,
                reject_missing=True,
            ),
            "最後に,アップルはWWDCでガイドラインを発表した[1]。",
        )

    def test_terminal_superscript_indices_follow_selective_protection_order(self) -> None:
        source = "At WWDC, the result was significant.2"
        self.assertEqual(terminal_superscript_indices(source), {1})
        self.assertEqual(
            terminal_superscript_indices(
                source,
                unprotected_values={"WWDC"},
            ),
            {0},
        )

    def test_strict_restore_rejects_dropped_standalone_figure_reference(self) -> None:
        _, cites, nonce = protect_citations("The result is shown. See Fig. 2")
        with self.assertRaisesRegex(ValueError, "placeholder dropped"):
            restore_citations("結果を示した。", cites, nonce, reject_missing=True)

    def test_single_citation(self) -> None:
        src = "Smith et al. [8] proposed a method."
        protected, cites, nonce = protect_citations(src)
        self.assertEqual(cites, ["[8]"])
        self.assertNotIn("[8]", protected)
        self.assertEqual(restore_citations(protected, cites, nonce), src)

    def test_multiple_citations(self) -> None:
        src = "See [8] then [12] and [3]."
        protected, cites, nonce = protect_citations(src)
        self.assertEqual(cites, ["[8]", "[12]", "[3]"])
        self.assertEqual(restore_citations(protected, cites, nonce), src)

    def test_narrative_author_year_protects_full_multiword_name(self) -> None:
        source = "This is what Geoff Thompson (2014) is wary of."
        protected, cites, nonce = protect_citations(source)
        self.assertEqual(cites, ["Geoff Thompson (2014)"])
        self.assertNotIn("Geoff", protected)
        self.assertEqual(restore_citations(protected, cites, nonce), source)

    def test_narrative_author_year_does_not_capture_adjacent_prose(self) -> None:
        source = "This is what Geoff Thompson (2014) is wary of and supports the analysis."
        protected, cites, nonce = protect_citations(source)
        self.assertEqual(cites, ["Geoff Thompson (2014)"])
        self.assertIn("is wary of and supports the analysis", protected)
        self.assertEqual(restore_citations(protected, cites, nonce), source)

    def test_comma_list(self) -> None:
        src = "Prior work [1, 3] agrees."
        _, cites, _ = protect_citations(src)
        self.assertEqual(cites, ["[1, 3]"])

    def test_range_hyphen_and_en_dash(self) -> None:
        src = "See [1-4] and [1–4]."
        _, cites, _ = protect_citations(src)
        self.assertEqual(cites, ["[1-4]", "[1–4]"])

    def test_mixed_list_and_range(self) -> None:
        src = "Compare [1, 3–5, 8] with [12,13]."
        protected, cites, nonce = protect_citations(src)
        self.assertEqual(cites, ["[1, 3–5, 8]", "[12,13]"])
        self.assertEqual(restore_citations(protected, cites, nonce), src)

    def test_same_citation_repeated(self) -> None:
        src = "First [8] and again [8]."
        protected, cites, nonce = protect_citations(src)
        self.assertEqual(cites, ["[8]", "[8]"])
        self.assertEqual(restore_citations(protected, cites, nonce), src)

    def test_no_citation(self) -> None:
        src = "No brackets here."
        protected, cites, nonce = protect_citations(src)
        self.assertEqual(cites, [])
        self.assertEqual(protected, src)
        self.assertEqual(restore_citations(protected, cites, nonce), src)

    def test_non_citation_brackets_ignored(self) -> None:
        src = "See [Figure] and [Appendix] and [ABC] but keep [8]."
        protected, cites, nonce = protect_citations(src)
        self.assertEqual(cites, ["[8]"])
        self.assertIn("[Figure]", protected)
        self.assertIn("[Appendix]", protected)
        self.assertIn("[ABC]", protected)
        self.assertEqual(restore_citations(protected, cites, nonce), src)

    def test_citation_regex_rejects_letters(self) -> None:
        self.assertIsNotNone(CITATION_RE.search("[12]"))
        self.assertIsNone(CITATION_RE.search("[Figure]"))
        self.assertIsNone(CITATION_RE.search("[8a]"))
        self.assertIsNone(CITATION_RE.search("[ABC]"))

    def test_restores_fullwidth_placeholders(self) -> None:
        src = "See [12] and [3]."
        _, cites, nonce = protect_citations(src)
        fullwidth = "後の研究（ＺＺＣＩＴ１ＺＺ）と（ＺＺＣＩＴ２ＺＺ）。"
        restored = restore_citations(fullwidth, cites, nonce)
        self.assertEqual(cites, ["[12]", "[3]"])
        self.assertIn("[12]", restored)
        self.assertIn("[3]", restored)
        self.assertNotIn("ZZCIT", restored)
        self.assertNotIn("ＺＺＣＩＴ", restored)

    def test_restores_placeholders_with_latin_lookalike_i(self) -> None:
        src = "The value is x = 0."
        _, cites, nonce = protect_citations(src)
        restored = restore_citations("値はZZCΙT1ZZである。", cites, nonce)
        self.assertEqual(restored, "値はx = 0である。")

    def test_restores_placeholder_with_cyrillic_c_lookalike(self) -> None:
        src = "The value is x = 0."
        _, cites, nonce = protect_citations(src)
        restored = restore_citations("値はZZЦIT1ZZである。", cites, nonce, reject_missing=True)
        self.assertEqual(restored, "値はx = 0である。")

    def test_strict_restore_rejects_malformed_placeholder_residue(self) -> None:
        _, cites, nonce = protect_citations("The value is x = 0.")
        with self.assertRaisesRegex(ValueError, "placeholder malformed"):
            restore_citations("値はZZtCIT1ZZである。", cites, nonce, reject_missing=True)

    def test_fixed_corpus_citation_case(self) -> None:
        corpus = json.loads(
            (Path(__file__).resolve().parents[1] / "benchmarks" / "corpus.json").read_text(
                encoding="utf-8"
            )
        )
        case = next(c for c in corpus["cases"] if c["id"] == "citations")
        protected, cites, nonce = protect_citations(case["text"])
        self.assertEqual(cites, ["[8]", "[12]", "[3]"])
        self.assertEqual(restore_citations(protected, cites, nonce), case["text"])
        self.assertIn("ZZCIT1ZZ", protected)
        self.assertNotIn("[8]", protected)

    def test_protects_ascii_chi_square_statistic(self) -> None:
        source = "There was no difference (chi square test, χ2(3)=0.37, p=0.83)."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["(chi square test, χ2(3)=0.37, p=0.83)"])
        self.assertNotIn("χ2(3)=0.37", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_bare_rank_statistic_and_figure_panel_reference(self) -> None:
        source = "Selfishness changed (Fig. 7b, Mann–Whitney U test, U=307, p=0.03)."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["(Fig. 7b, Mann–Whitney U test, U=307, p=0.03)"])
        self.assertNotIn("Mann–Whitney", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_plural_figure_references(self) -> None:
        source = "Figures 3, 4, and 5 show the response curves."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["Figures 3"])
        self.assertNotIn("Figures 3", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_parenthesized_figure_panel_reference(self) -> None:
        source = "The necklace case is hung around the neck, as illustrated in Figure 1(a)."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["Figure 1(a)"])
        self.assertNotIn("Figure 1(a)", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_panel_label_while_leaving_caption_translatable(self) -> None:
        source = "(b) shows the Thermal Earring data of P1 during fever."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["(b)"])
        self.assertTrue(protected.startswith("ZZCIT1ZZ shows"))
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_celsius_and_fahrenheit_values_as_atomic_measurements(self) -> None:
        source = "Temperature fell from 37.1 °C (98.8 °F) to 33.9°C."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["37.1 °C (98.8 °F)", "33.9°C"])
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_farad_and_battery_measurements_as_atomic_values(self) -> None:
        source = "The coupling is below 1 pF and the battery provides 40 mAh."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["1 pF", "40 mAh"])
        self.assertEqual(restore_citations(protected, citations, nonce), source)
        self.assertEqual(
            restore_citations("結合は1pFで、電池は40mAhを供給する。", citations, nonce, reject_missing=True),
            "結合は1 pFで、電池は40 mAhを供給する。",
        )

    def test_protects_math_font_measurements_from_native_pdf_text(self) -> None:
        source = "The sensor measures 1.49𝑚𝑚×1.49𝑚𝑚."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["1.49𝑚𝑚", "1.49𝑚𝑚"])
        self.assertNotIn("1.49𝑚𝑚", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_parenthesized_participant_label(self) -> None:
        source = "The participant said the signal was wrong (P4)."
        protected, citations, nonce = protect_citations(source)
        self.assertIn("(P4)", citations)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_attached_terminal_footnote_marker(self) -> None:
        source = "We used the public API for all simulations14. The settings were fixed."
        protected, citations, nonce = protect_citations(source)
        self.assertIn("14", citations)
        self.assertNotIn("API", citations)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_recovers_placeholder_with_dropped_prefix_after_footnote(self) -> None:
        source = "The first result was reported15. The second result was reported16."
        protected, citations, nonce = protect_citations(source)
        self.assertGreaterEqual(len(citations), 2)
        malformed = protected.replace("ZZCIT2ZZ", "15CIT2ZZ")
        restored = restore_citations(malformed, citations, nonce, reject_missing=True)
        self.assertIn("reported15", restored)
        self.assertIn("reported1516", restored)

    def test_protects_variable_comparison_parenthetical(self) -> None:
        source = "OLS is used for comparison (where y \u0338= 0 when x = 0)."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["(where y \u0338= 0 when x = 0)"])
        self.assertNotIn("y \u0338= 0", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_parenthesized_decimal_result_values(self) -> None:
        source = "Placement looked easier to access (0.006), normal (0.001), and cool (0.005) for one condition."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["(0.006)", "(0.001)", "(0.005)"])
        self.assertNotIn("(0.006)", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_terminal_caps_technical_identifiers(self) -> None:
        source = "We compare DeepIV with a wearable product."
        protected, citations, nonce = protect_citations(source)
        self.assertNotIn("DeepIV", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_hyphenated_title_case_system_identifiers(self) -> None:
        source = "We developed Power-over-Skin for distributed wearable devices."
        protected, citations, nonce = protect_citations(source)
        self.assertNotIn("Power-over-Skin", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)


    def test_restores_placeholder_with_greek_or_cyrillic_lookalikes(self) -> None:
        source = "The method is described [8]."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(restore_citations(protected.replace("ZZCIT1ZZ", "ΖZCIΤ1ZZ"), citations, nonce), source)

    def test_protects_author_year_group_as_one_atomic_span(self) -> None:
        source = "Prior work (Sigure & Koseki, 1998; Marquardt et al., 2011) motivates Deep IV."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["(Sigure & Koseki, 1998; Marquardt et al., 2011)"])
        self.assertNotIn("2011", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_narrative_author_year_name_and_year_atomically(self) -> None:
        for source, span in (
            ("Kelly’s (2016) WEAR Scale was validated.", "Kelly’s (2016)"),
            ("Marquardt et al. (2011) reported the result.", "Marquardt et al. (2011)"),
            ("Smith and Lee (2019) found an effect.", "Smith and Lee (2019)"),
        ):
            with self.subTest(source=source):
                protected, citations, nonce = protect_citations(source)
                self.assertIn(span, citations)
                self.assertNotIn(span, protected)
                self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_explicit_acknowledgment_name_lists(self) -> None:
        source = (
            "The author thanks Nuno Camacho, Stefano Puntoni, Roland Rust, "
            "Dimitrios Tsekouras, Sonja Wendel, and participants at the conference."
        )
        names = "Nuno Camacho, Stefano Puntoni, Roland Rust, Dimitrios Tsekouras, Sonja Wendel"
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, [names])
        self.assertIn("The author thanks", protected)
        self.assertIn("and participants at the conference", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_and_restores_terminal_nested_statistical_result_group(self) -> None:
        source = "Regarding memory performance, groups differed (MCQ: H(2) = 6.06, p = 0.048; CT: H(2) = 17.01, p < 0.001; FR: H(2) = 9.52, p = 0.009)."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(
            citations,
            ["(MCQ: H(2) = 6.06, p = 0.048; CT: H(2) = 17.01, p < 0.001; FR: H(2) = 9.52, p = 0.009)"],
        )
        self.assertEqual(
            restore_citations("記憶成績に群間差が認められた。", citations, nonce, reject_missing=True),
            f"記憶成績に群間差が認められた{citations[0]}。",
        )

    def test_nonterminal_nested_statistics_are_not_moved_to_a_later_claim(self) -> None:
        source = "School results did not differ (H(2)=4.17, p=0.124), and memory outcomes were equivalent (U=10, p=0.4)."
        _, citations, _ = protect_citations(source)
        self.assertNotIn("(H(2)=4.17, p=0.124)", citations)

    def test_author_year_pattern_does_not_capture_non_citation_parentheses(self) -> None:
        self.assertIsNone(AUTHOR_YEAR_CITATION_RE.search("The value (2017 measurements) was stable."))

    def test_protects_inline_footnote_after_quoted_term(self) -> None:
        source = "We introduced the “cab problem”16 (Cab, see SI Appendix)."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["16 (Cab, see SI Appendix)"])
        self.assertIsNotNone(INLINE_FOOTNOTE_CITATION_RE.search(source))
        self.assertNotIn("16", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_author_et_al_superscript_and_si_appendix(self) -> None:
        source = "Ruggeri et al.18 manipulated the reasons (Toma, see SI Appendix). Baron et al.19 reported a related test."
        protected, citations, nonce = protect_citations(source)
        self.assertIn("Ruggeri et al.18", citations)
        self.assertIn("SI Appendix", citations)
        self.assertIn("Baron et al.19", citations)
        self.assertNotIn("Ruggeri et al.18", protected)
        self.assertNotIn("SI Appendix", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_unbracketed_numeric_citation_clusters_attached_to_words(self) -> None:
        source = "Participants follow the rule unconditionally29,30,32; brain stimulation in this case12,33 had little effect."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["29,30,32", "12,33"])
        self.assertIsNotNone(INLINE_NUMERIC_CITATION_RE.search(source))
        self.assertNotIn("29,30,32", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_inline_numeric_citation_cluster_with_trailing_range(self) -> None:
        source = "The effect was replicated for selfish decisions3,6,9,12–14."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["3,6,9,12–14"])
        self.assertNotIn("12–14", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)
        self.assertEqual(
            restore_citations("効果が再現された。", citations, nonce, reject_missing=True),
            "効果が再現された3,6,9,12–14。",
        )

    def test_restores_placeholder_with_repeated_confusable_prefix(self) -> None:
        raw = "これによりＺｚＺＣＩｔ１ＺＺが保たれた。"
        self.assertEqual(
            restore_citations(raw, ["tDCS"], reject_missing=True),
            "これによりtDCSが保たれた。",
        )

    def test_restores_dropped_inline_numeric_citation_at_translated_sentence_end(self) -> None:
        _, citations, nonce = protect_citations("The prior study found little effect in this case12,33.")
        self.assertEqual(citations, ["12,33"])
        self.assertEqual(
            restore_citations("先行研究では,この症例にほとんど影響がなかった。", citations, nonce, reject_missing=True),
            "先行研究では,この症例にほとんど影響がなかった12,33。",
        )

    def test_restores_inline_footnote_before_japanese_sentence_end(self) -> None:
        source = "We introduced the “cab problem”16 (Cab, see SI Appendix)."
        protected, citations, nonce = protect_citations(source)
        placeholder = protected.split("problem”", 1)[1].split(" ", 1)[0]
        restored = restore_citations(f"問題を提示した。{placeholder}。", citations, nonce)
        self.assertEqual(restored, "問題を提示した。16 (Cab, see SI Appendix).。")

    def test_restores_dropped_inline_footnote_before_japanese_sentence_end(self) -> None:
        source = "We introduced the “cab problem”16 (Cab, see SI Appendix)."
        _, citations, nonce = protect_citations(source)
        restored = restore_citations("問題を提示した。", citations, nonce)
        self.assertEqual(restored, "問題を提示した。16 (Cab, see SI Appendix)")

    def test_protects_terminal_superscript_citation_after_sentence_punctuation(self) -> None:
        source = "Smugglers exploit irregular migration.3"
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["3"])
        self.assertTrue(protected.endswith("ZZCIT1ZZ"))
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_strict_restore_recovers_only_terminal_superscript_at_sentence_end(self) -> None:
        source = "Smugglers exploit irregular migration.3"
        _, citations, nonce = protect_citations(source)
        indices = terminal_superscript_indices(source)
        self.assertEqual(indices, {0})
        self.assertEqual(
            restore_citations(
                "不規則移民を利用する。",
                citations,
                nonce,
                reject_missing=True,
                recoverable_terminal_indices=indices,
            ),
            "不規則移民を利用する3。",
        )

    def test_strict_restore_still_rejects_dropped_inline_footnote(self) -> None:
        source = "We introduced the “cab problem”16 (Cab, see SI Appendix)."
        _, citations, nonce = protect_citations(source)
        self.assertEqual(terminal_superscript_indices(source), set())
        with self.assertRaisesRegex(ValueError, "placeholder dropped"):
            restore_citations(
                "問題を提示した。",
                citations,
                nonce,
                reject_missing=True,
                recoverable_terminal_indices=terminal_superscript_indices(source),
            )

    def test_terminal_superscript_protection_does_not_capture_decimal_digit(self) -> None:
        source = "The measured value was 2.913."
        _, citations, _ = protect_citations(source)
        self.assertEqual(citations, [])

    def test_protects_adjacent_identifier_list_as_one_atomic_span(self) -> None:
        source = "Encoder-only models such as BERT, DeBERTa, and GPT struggle on CFG tasks."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["BERT, DeBERTa, and GPT", "CFG"])
        self.assertEqual(
            restore_citations(protected, citations, nonce, reject_missing=True),
            source,
        )

    def test_strict_restore_recovers_adjacent_placeholder_z_merge(self) -> None:
        source = 'The canonical “Linda problem”15 (Linda, see Figure 1A).'
        _, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["15", "(Linda, see Figure 1A)"])
        # Exact decode shape observed in the cognitive-paper debug run:
        # the second placeholder loses its leading ZZ and shares a Z with
        # the first placeholder suffix.
        malformed = "ＧＰＴ‐３の調査はＺＺＣＩＴ１ＺＺＺＣｉＴ２ＺＺを誘導した。"
        restored = restore_citations(malformed, citations, nonce, reject_missing=True)
        self.assertIn("15", restored)
        self.assertIn("(Linda, see Figure 1A)", restored)
        self.assertNotIn("CIT2ZZ", restored)


if __name__ == "__main__":
    unittest.main()
