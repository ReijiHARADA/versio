from __future__ import annotations

import unittest
import json
import re
from pathlib import Path

from engines.madlad_mps import MADLADEngine
from engines.segmenter import (
    is_probable_panel_fragment,
    model_inputs_for_translation,
    rescue_units_for_translation,
    segment_for_translation,
    split_for_translation,
    validate_round_trip,
)


class SegmenterTests(unittest.TestCase):
    def test_sentence_boundary_after_period_inside_closing_quote(self) -> None:
        source = 'One group was framed as “75% lean.” Participants responded more favorably toward beef.'
        self.assertEqual(
            split_for_translation(source),
            ['One group was framed as “75% lean.”', 'Participants responded more favorably toward beef.'],
        )

    def test_short_panel_fragment_is_marked_before_inference(self):
        self.assertTrue(is_probable_panel_fragment("(b)"))
        self.assertFalse(is_probable_panel_fragment("(b) the characteristics of the interaction method with peers."))
        self.assertFalse(is_probable_panel_fragment("(b) shows the Thermal Earring data of P1 during fever."))
        self.assertFalse(is_probable_panel_fragment("(a) The resulting parser models cannot easily be analyzed."))
        self.assertFalse(is_probable_panel_fragment("The paper evaluates (b) conditions in a complete paragraph."))

    def assert_round_trip(self, source: str) -> None:
        units = split_for_translation(source)
        self.assertTrue(validate_round_trip(source, units))
        self.assertTrue(all(len(unit.split()) >= 4 for unit in units), units)

    def test_et_al_stays_with_following_numeric_citation(self) -> None:
        source = "In line with van Dijk et al. [8] we treat social resources as part of the interaction context."
        units = split_for_translation(source)
        self.assertEqual(len(units), 1)

    def test_equation_abbreviation_stays_with_following_number(self) -> None:
        source = "The output voltage given by Eqn. 20 is independent of the load resistance. Eqn. 7 gives the corresponding value."
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(units[0].startswith("The output voltage given by Eqn. 20"))
        self.assertTrue(units[1].startswith("Eqn. 7"))
        self.assertTrue(validate_round_trip(source, units))
        self.assertTrue(validate_round_trip(source, units))

    def test_proactively_splits_long_although_clause(self) -> None:
        source = (
            "Although this offers a better connection to earth ground compared to a battery-powered transmitter, "
            "it still approximates the performance of worn transmitters in our applications because the receiver "
            "ground plane is the more significant limitation on our power transmission."
        )
        units = segment_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(units[0].model_input.startswith("This offers"))
        self.assertTrue(units[1].model_input.startswith("It still"))
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))

    def test_proactively_splits_200_character_coordinate_clause(self) -> None:
        source = (
            "During encoding, participants watched a series of film clips, half of which were presented "
            "following gist cues (e.g., ‘couple fighting’), and the other half were presented following "
            "detailed cues (e.g., ‘white piano’)."
        )
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(units[0].text.startswith("During encoding"))
        self.assertTrue(units[1].text.startswith("and the other half"))
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))

    def test_keeps_medium_while_sentence_intact_for_context(self) -> None:
        source = (
            "While we have shown that an increase in core body temperature can be reflected "
            "in earlobe temperature measurements made by Thermal Earring in section 6.1, "
            "directly estimating the core body temperature from the earlobe temperature requires further study."
        )
        units = segment_for_translation(source)
        self.assertEqual(len(units), 1)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))

    def test_word_ending_in_ms_is_a_sentence_boundary(self) -> None:
        source = "The mechanisms are described. We then compare the results."
        self.assertEqual(split_for_translation(source), ["The mechanisms are described.", "We then compare the results."])

    def test_leading_tiny_prefix_merges_forward(self) -> None:
        source = "Related work. Linear probing traces the correlation between hidden states and parse trees."
        units = split_for_translation(source)
        self.assertEqual(units, [source])
        self.assert_round_trip(source)

    def test_author_year_semicolons_stay_together(self) -> None:
        source = "The closest related work on finger specific interaction has been presented by (Sigure & Koseki, 1998; Marquardt et al., 2011; Benko et al, 2009), however none are in the mobile domain."
        units = split_for_translation(source)
        self.assertEqual(units, [source])
        self.assert_round_trip(source)

    def test_extremely_long_sentence_uses_safe_top_level_clause_boundary(self) -> None:
        source = (
            "The study presents a longitudinal evaluation of a worker feedback dashboard that combines "
            "wearable sensing, daily self reports, and supervisor observations across several factory sites, "
            "the evaluation covers health, safety, and productivity outcomes over repeated measurement periods, "
            "and the authors discuss how these observations can guide future intervention design while preserving "
            "the workers' privacy and the interpretability of the collected data, and the analysis also compares "
            "differences between production lines, shift patterns, and task assignments, reports uncertainty "
            "around every estimate, and explains why the dashboard should be treated as decision support rather "
            "than as a replacement for established occupational health procedures, while the discussion considers "
            "how managers, workers, and researchers can interpret the measurements responsibly in settings where "
            "the available sensors, schedules, and reporting practices differ substantially across sites."
        )
        self.assertGreater(len(source), 900)
        units = segment_for_translation(source)
        self.assertGreaterEqual(len(units), 2)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertTrue(all(len(unit.text.split()) >= 8 for unit in units), units)

    def test_multi_semicolon_retry_rescue_keeps_counts_and_balances_units(self) -> None:
        source = (
            "We identified 8949 studies based on our initial searching; Initial sifting "
            "based on title, abstract and full text resulted in exclusion of 6336 studies; "
            "30 studies were further reviewed and two studies were excluded before the final analysis."
        )
        units = rescue_units_for_translation(source)
        self.assertGreaterEqual(len(units), 2)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertTrue(any("8949" in unit.text for unit in units))
        self.assertTrue(all(len(unit.text.split()) >= 8 for unit in units))

    def test_clean_source_fallback_fixtures_round_trip(self) -> None:
        fixture_path = Path(__file__).parents[1] / "benchmarks" / "translation-unit-fallback-fixtures-v66.json"
        fixtures = json.loads(fixture_path.read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(fixtures["cases"]), 3)
        for case in fixtures["cases"]:
            with self.subTest(case=case["id"]):
                units = segment_for_translation(case["source"])
                self.assertTrue(validate_round_trip(case["source"], [u.text for u in units]))
                self.assertTrue(all(len(u.text.split()) >= 4 for u in units), case["id"])
                expected = case.get("expected", {})
                for relation in expected.get("mustKeepRelations", []):
                    self.assertEqual(len(relation), 2)
                    self.assertTrue(all(token in case["source"] for token in relation))

    def test_model_input_repairs_lost_apostrophe_without_changing_source(self) -> None:
        source = "“Its not scary like blood pressure, it feels like a costume or sports gear, activity oriented”"
        units = split_for_translation(source)
        inputs = model_inputs_for_translation(source)
        self.assertEqual(units, [source])
        self.assertEqual(inputs, ["“It's not scary like blood pressure, it feels like a costume or sports gear, activity oriented”"])
        self.assert_round_trip(source)

    def test_model_input_repairs_neither_nor_comma_without_changing_source(self) -> None:
        source = "Neither cathodal, nor anodal tDCS altered the fairness perception of participants (Fig. 8 and Table S3)."
        units = split_for_translation(source)
        inputs = model_inputs_for_translation(source)
        self.assertEqual(units, [source])
        self.assertEqual(inputs, ["Neither cathodal nor anodal tDCS altered the fairness perception of participants (Fig. 8 and Table S3)."])
        self.assert_round_trip(source)

    def test_model_input_makes_metric_comparison_explicit_without_changing_source(self) -> None:
        source = "Signal-to-Noise Ratio (SNR) is a common metric to measure the level of the target signal compared to the level of background noise."
        units = segment_for_translation(source)
        self.assertEqual([unit.text for unit in units], [source])
        self.assertEqual(
            [unit.model_input for unit in units],
            ["Signal-to-Noise Ratio (SNR) is a common metric. It measures the level of the target signal compared with the level of background noise."],
        )
        self.assert_round_trip(source)

    def test_empty_source_can_still_be_segmented(self) -> None:
        units = segment_for_translation("   ")
        self.assertEqual(len(units), 1)
        self.assertEqual(units[0].text, "   ")

    def test_year_is_a_sentence_boundary_but_decimal_is_not(self) -> None:
        source = "Nearly one billion devices were sold in 2013. Thus, the value was 2.913 and p < 0.001."
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertIn("2.913", units[1])
        self.assert_round_trip(source)

    def test_experimental_single_letter_label_can_end_a_sentence(self) -> None:
        source = "Participants judged allocations between a person A and a person B. Neither cathodal, nor anodal tDCS altered the fairness perception of participants (Fig. 8 and Table S3)."
        units = split_for_translation(source)
        inputs = model_inputs_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertEqual(units[1], "Neither cathodal, nor anodal tDCS altered the fairness perception of participants (Fig. 8 and Table S3).")
        self.assertEqual(inputs[1], "Neither cathodal nor anodal tDCS altered the fairness perception of participants (Fig. 8 and Table S3).")
        self.assert_round_trip(source)

    def test_author_initial_still_stays_with_name(self) -> None:
        source = "J. Smith reported the result. We then replicated it."
        units = split_for_translation(source)
        self.assertEqual(units, ["J. Smith reported the result.", "We then replicated it."])
        self.assert_round_trip(source)


    def test_second_author_year_citation_stays_with_its_sentence(self) -> None:
        source = "Unlike most touch screen research seeking to extend the input vocabulary, which does not distinguish between different fingers (e.g. Baudisch & Chu, 2009; Boring et al., 2012; Holleis et al., 2008), we focus on identifying the fingers and assigning different functions to them."
        units = split_for_translation(source)
        self.assertEqual(units, [source])
        self.assert_round_trip(source)

    def test_scientific_tokens_cannot_create_boundaries(self) -> None:
        source = "The result was F(4,33) = 2.913, p < 0.001. Thus, the hypothesis was supported."
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertIn("F(4,33) = 2.913, p < 0.001.", units[0])
        self.assert_round_trip(source)

    def test_continuations_merge_before_send(self) -> None:
        source = "Examination of targets indicated errors. One exception to this is the low miss rate."
        self.assert_round_trip(source)

    def test_complete_purpose_sentence_is_not_merged_as_a_continuation(self) -> None:
        source = "Power sources constrain wearable devices. To decrease form factors further, researchers investigated alternative power schemes that capture power rather than carrying it."
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertEqual(units[1], "To decrease form factors further, researchers investigated alternative power schemes that capture power rather than carrying it.")
        self.assert_round_trip(source)

    def test_short_complete_questions_keep_their_sentence_boundaries(self) -> None:
        source = "An experiment is central. But what constitutes an experiment? And how does one write a paper?"
        units = split_for_translation(source)
        self.assertEqual(units, [
            "An experiment is central.",
            "But what constitutes an experiment?",
            "And how does one write a paper?",
        ])
        self.assert_round_trip(source)

    def test_typographic_quotes_do_not_hide_later_sentence_boundaries(self) -> None:
        source = "The canonical “Linda problem” is widely used. It tests a conjunction fallacy. Participants then compare two options."
        units = split_for_translation(source)
        self.assertEqual(units, [
            "The canonical “Linda problem” is widely used.",
            "It tests a conjunction fallacy.",
            "Participants then compare two options.",
        ])
        self.assert_round_trip(source)

    def test_apostrophes_inside_words_do_not_open_a_quote(self) -> None:
        source = "The model's output does not match the source. It should be reviewed separately."
        self.assertEqual(split_for_translation(source), [
            "The model's output does not match the source.",
            "It should be reviewed separately.",
        ])

    def test_long_participant_relative_clause_has_an_independent_model_input(self) -> None:
        source = (
            "Finally, we asked GPT-3 to provide an answer to the hospital problem "
            "(see SI Appendix), in which participants are asked which of two hospitals, "
            "a smaller or a larger one, is more likely to report more days on which more "
            "than 60% of all born children were boys."
        )
        units = segment_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertEqual(" ".join(unit.text for unit in units), source)
        self.assertTrue(units[0].text.endswith(","))
        self.assertTrue(units[0].model_input.endswith("."))
        self.assertTrue(units[1].text.startswith("in which participants"))
        self.assertTrue(units[1].model_input.startswith("In this context, participants"))

    def test_long_model_predicate_list_gets_independent_model_inputs(self) -> None:
        source = (
            "We find that much of GPT-3’s behavior is impressive: it solves vignette-based tasks similarly or better than human subjects, "
            "is able to make decent decisions from descriptions, outperforms humans in a multi-armed bandit task, "
            "and shows signatures of model-based reinforcement learning."
        )
        units = segment_for_translation(source)
        self.assertEqual(" ".join(unit.text for unit in units), source)
        self.assertEqual(len(units), 5)
        self.assertEqual(units[0].model_input, "We find that much of GPT-3’s behavior is impressive.")
        self.assertEqual(units[1].model_input, "GPT-3 solves vignette-based tasks similarly or better than human subjects.")
        self.assertEqual(units[-1].model_input, "GPT-3 shows signatures of model-based reinforcement learning.")

    def test_flattened_bullet_list_keeps_lead_in_and_each_item_as_a_unit(self) -> None:
        source = "The course covers: • Formulating testable research questions • How to design an experiment to answer research questions • Parts of an experiment and ethics approval"
        units = split_for_translation(source)
        self.assertEqual(len(units), 4)
        self.assertEqual(units[0], "The course covers:")
        self.assertTrue(all(unit.startswith("•") for unit in units[1:]))
        self.assertTrue(validate_round_trip(source, units))

    def test_numbered_examples_split_after_sentence_final_superscript_citation(self) -> None:
        source = "(1) Smugglers and human traffickers exploit irregular migration.3 (2) The positive effects of migration for host societies in Europe.4"
        units = segment_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(units[0].text.startswith("(1) Smugglers"))
        self.assertTrue(units[0].text.endswith("migration.3"))
        self.assertTrue(units[1].text.startswith("(2) The positive effects"))
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))

    def test_sentence_final_numeric_citation_keeps_following_claim_independent(self) -> None:
        source = (
            "For example, a clinical practice guideline combined a screening checklist and a decision support algorithm.23 "
            "Other physical tools were also included in this categorisation."
        )
        units = segment_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(units[0].text.endswith("algorithm.23"))
        self.assertTrue(units[1].text.startswith("Other physical tools"))
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))

    def test_complete_sentences_are_independent_translation_units(self) -> None:
        source = (
            "From the above can be concluded that neither of the design proposals uses state-of-the-art technology "
            "when it comes to dynamic behaviour, data visualisation and data sharing. This might prevent early "
            "disposal because of the introduction of a next generation technology."
        )
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertIn("prevent early disposal", units[1])
        self.assertTrue(validate_round_trip(source, units))

    def test_inline_numbered_list_keeps_every_condition_as_a_unit(self) -> None:
        source = "The method has limitations: (1) it needs unique solutions; (2) it needs an unstable oracle; (3) it has no model selection. We address all three."
        units = split_for_translation(source)
        self.assertEqual(len(units), 5)
        self.assertEqual(units[0], "The method has limitations:")
        self.assertTrue(all(f"({number})" in units[number] for number in range(1, 4)))
        self.assert_round_trip(source)

    def test_statistical_degrees_of_freedom_are_not_inline_list_markers(self) -> None:
        source = (
            "None of the groups differed significantly with respect to their grade of final secondary school "
            "examinations (H(2)=4.17, p=0.124), and the rule sets A and B resulted in equivalent memory "
            "performance outcomes regarding the respective memory tasks (MCQ: U=727.0, z=−1.04, p=0.30; "
            "CT: U=801.0, z=−0.31, p=0.741; FR: U=811.5, z=−0.23, p=0.841). Consequently, differences "
            "between groups cannot be traced back to differences in rule sets. Regarding memory performance, "
            "the three groups performed significantly different on the memory tasks (MCQ: H(2) = 6.06, p = "
            "0.048; CT: H(2) = 17.01, p < 0.001; FR: H(2) = 9.52, p = 0.009)."
        )
        units = segment_for_translation(source)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertFalse(any(unit.text.endswith("(H") for unit in units), units)
        self.assertFalse(any(re.match(r"^\(2\)\s*=", unit.text) for unit in units), units)
        self.assertFalse(any(re.match(r"^\(2\)=", unit.text) for unit in units), units)

    def test_statistical_result_before_coordinated_clause_has_rescue_boundary(self) -> None:
        source = "None of the groups differed significantly with respect to their grade of final secondary school examinations (H(2)=4.17, p=0.124), and the rule sets A and B resulted in equivalent memory performance outcomes regarding the respective memory tasks (MCQ: U=727.0, z=−1.04, p=0.30; CT: U=801.0, z=−0.31, p=0.741; FR: U=811.5, z=−0.23, p=0.841)."
        units = segment_for_translation(source)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertEqual(len(units), 1)  # Keep source intact; rescue splitting is retry-only.
        rescue_units = rescue_units_for_translation(units[0].model_input)
        self.assertEqual(len(rescue_units), 2)
        self.assertIn("H(2)=4.17, p=0.124", rescue_units[0].text)
        self.assertTrue(rescue_units[0].model_input.rstrip().endswith("."))
        self.assertIn("MCQ: U=727.0", rescue_units[1].text)

    def test_overlong_top_level_semicolon_splits_into_safe_clauses(self) -> None:
        source = "The first clause explains the experimental context and includes enough ordinary prose to establish a meaningful translation unit for the model without relying on a shorthand notation or a citation, while also explaining the participant procedure and why the first condition matters; " + "the second clause explains the evaluation outcome and includes enough independent ordinary prose to remain meaningful after the safe boundary while preserving the original punctuation and ordering."
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(units[0].endswith(";"))
        self.assert_round_trip(source)

    def test_medium_top_level_semicolon_keeps_independent_claims_separate(self) -> None:
        source = (
            "Encoder-only models struggle with deep structural reasoning compared to "
            "autoregressive models in the same grammar setting; and adding structured "
            "noise to pretraining data improves robustness to corrupted language prompts."
        )
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(units[0].endswith(";"))
        self.assertTrue(units[1].startswith("and adding"))
        self.assert_round_trip(source)

    def test_multiple_top_level_semicolons_keep_shared_logical_unit(self) -> None:
        source = (
            "We identified 8,949 studies based on our initial searching; initial sifting "
            "based on title, abstract and full text resulted in exclusion of 6336 studies; "
            "30 studies were further reviewed and two studies were excluded before the final analysis."
        )
        units = segment_for_translation(source)
        self.assertEqual(len(units), 1)
        self.assert_round_trip(source)

    def test_author_year_semicolon_never_becomes_a_clause_boundary(self) -> None:
        source = "The first clause explains the experimental context with enough ordinary prose to make a long translation unit for the model, citing (Sigure & Koseki, 1998; Marquardt et al., 2011; Benko et al., 2009) as prior work before continuing through a detailed explanation of why the setup matters for later analysis and interpretation in the study."
        self.assertEqual(split_for_translation(source), [source])

    def test_cross_reference_wording_is_normalized_only_for_model_input(self) -> None:
        source = "Our results, along with Section 5 next, shall provide evidence for the proposed model."
        units = segment_for_translation(source)
        self.assertEqual(units[0].text, source)
        self.assertIn("as discussed in Section 5", units[0].model_input)

    def test_epistemic_detection_wording_is_normalized_only_for_model_input(self) -> None:
        source = "Smaller effects might not have been detected in the study."
        units = segment_for_translation(source)
        self.assertEqual(units[0].text, source)
        self.assertIn("may have gone undetected", units[0].model_input)

    def test_quoted_figure_caption_lead_can_split_from_long_description(self) -> None:
        source = "“Traces” (Fig.7), made for one participant; a jeweller who does not wear jewellery discusses strong attachments that can pass from generation to generation, and the piece uses a porcelain pearl, clasps, and velvet to show contours, folds, and hinges as etched lines across the surface of the fabric, while the arrangement preserves the material history and intimate significance described by the participant."
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertEqual(units[0], "“Traces” (Fig.7), made for one participant;")
        self.assert_round_trip(source)

    def test_list_join_restores_markers(self) -> None:
        chunks = ["The course covers:", "• First item", "• Second item"]
        pieces = ["コースでは以下を扱う", "第一項目", "第二項目"]
        self.assertEqual(
            MADLADEngine._join_translated_chunks(chunks, pieces, "ja"),
            "コースでは以下を扱う\n• 第一項目\n• 第二項目",
        )

    def test_list_join_deduplicates_model_markers(self) -> None:
        chunks = ["• First item", "• Second item"]
        pieces = ["- 第一項目", "• 第二項目"]
        self.assertEqual(
            MADLADEngine._join_translated_chunks(chunks, pieces, "ja"),
            "• 第一項目\n• 第二項目",
        )

    def test_inline_list_ordinal_is_detached_and_restored_deterministically(self) -> None:
        self.assertEqual(
            MADLADEngine._detach_enumeration_prefix("(2) requiring an unstable oracle;"),
            ("(2)", "requiring an unstable oracle;"),
        )
        self.assertEqual(MADLADEngine._detach_enumeration_prefix("Equation (2) is stable."), ("", "Equation (2) is stable."))

    def test_model_completed_boundary_closes_japanese_piece_after_inline_citation(self) -> None:
        self.assertEqual(
            MADLADEngine._join_translated_chunks(
                ["We posed a problem17,", "in which participants choose an option."],
                ["問題を提示した17", "参加者は選択肢を選ぶ"],
                "ja",
                ["We posed a problem17.", "In this context, participants choose an option."],
            ),
            "問題を提示した17。参加者は選択肢を選ぶ。",
        )

    def test_rescue_found_that_coordination_keeps_source_round_trip(self) -> None:
        source = (
            "Among other things they found that an emotional relation with an – at first nondescript – "
            "physical piece of jewellery could be established through interaction and that interactive "
            "jewellery holds the quality to make implicit emotions related to a piece of jewellery can "
            "be made explicit through interaction [29]."
        )
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertTrue(units[1].model_input.startswith("They found that interactive jewellery"))

    def test_rescue_em_dash_claim_keeps_both_sides(self) -> None:
        source = (
            "When the system operates properly, the resulting experience is much like that in co-present "
            "conversation – you can easily follow the speech of people with whom you are conversing, and "
            "others can be understood with effort."
        )
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertTrue(units[0].model_input.endswith("."))
        self.assertTrue(units[1].model_input.startswith("You can easily"))

    def test_rescue_hence_clause_keeps_hypothesis_consequence(self) -> None:
        source = (
            "We hypothesized that nudge effectiveness would not be hindered by attention to the nudge, "
            "hence that the nudge is also effective when people pay attention to the nudge either implicitly or explicitly."
        )
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertTrue(units[0].model_input.endswith("."))
        self.assertTrue(units[1].model_input.startswith("Hence that"))

    def test_rescue_if_so_semicolon_keeps_source_round_trip(self) -> None:
        source = (
            "As viewers we must consider whether we believe there is a gold ball within the piece; "
            "if so, do we perceive the piece to be of greater value even though the gold is hidden?"
        )
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertTrue(units[0].model_input.endswith("."))
        self.assertTrue(units[1].model_input.startswith("If so"))

    def test_rescue_where_property_clause_keeps_source_round_trip(self) -> None:
        source = "We invested most of our efforts in optimizing our worn receivers, where size, weight, form factor and power efficiency are paramount."
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertEqual(
            units[1].model_input,
            "In this context, size, weight, form factor and power efficiency are paramount.",
        )

    def test_rescue_appositive_region_keeps_source_round_trip(self) -> None:
        source = (
            "The Thermal Earring takes advantage of the unique position of earrings in proximity to the head, "
            "a region with tight coupling to the body unlike watches and other wearables which are more loosely worn on extremities."
        )
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertEqual(
            units[1].model_input,
            "This region has tight coupling to the body unlike watches and other wearables which are more loosely worn on extremities.",
        )

    def test_rescue_long_top_level_comma_is_conservative_and_reconstructable(self) -> None:
        source = (
            "The experiment examined how participants selected targets under several visual and motor conditions, "
            "with the analysis comparing response time, error rate, confidence, workload, and transfer effects "
            "across the complete set of trials and reporting uncertainty for every estimated difference."
        )
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertTrue(units[0].model_input.endswith("."))
        self.assertTrue(units[1].model_input[0].isupper())

    def test_clean_source_fallback_fixtures_preserve_units_and_scientific_tokens(self) -> None:
        fixture = json.loads((Path(__file__).parents[1] / "benchmarks" / "translation-unit-fallback-fixtures-v66.json").read_text())
        for case in fixture["cases"]:
            with self.subTest(case=case["id"]):
                units = split_for_translation(case["source"])
                self.assertTrue(validate_round_trip(case["source"], units))
                self.assertGreaterEqual(len(case["source"].split()), case["expected"]["minWords"])
                model_text = " ".join(model_inputs_for_translation(case["source"]))
                for token in case["expected"]["mustKeep"]:
                    self.assertIn(token, model_text)
                self.assertTrue(all(len(unit.split()) >= 4 for unit in units), units)


if __name__ == "__main__":
    unittest.main()


class RescueWhileConcessiveTests(unittest.TestCase):
    def test_rescue_splits_discourse_marker_after_citation_list(self) -> None:
        source = (
            "Existing studies have examined social acceptability of mobile gesture techniques [23] and workplace "
            "interaction contexts [24], to our knowledge, limited research "
            "has been conducted to assess third-party attitudes toward e-textile system interaction."
        )
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertIn("workplace interaction contexts [24]", units[0].text)
        self.assertTrue(units[0].model_input.rstrip().endswith("."))
        self.assertTrue(units[1].model_input.startswith("To our knowledge"))
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))

    def test_rescue_splits_long_as_well_as_evidence_clause(self) -> None:
        source = (
            "While current research has looked at the user perceptions of gesture-based mobile control techniques "
            "[23] as well as the feasibility of hands-free mobile control techniques (e.g. head-tilting [6], "
            "foot tapping [5], EMG controllers [4], and wrist-tilting [22]), to our knowledge, limited research "
            "has been conducted to assess third-party attitudes toward e-textile system interaction."
        )
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 3)
        self.assertTrue(units[0].model_input.startswith("current research has looked"))
        self.assertTrue(units[1].model_input.startswith("It also examined the feasibility"))
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))

    def test_rescue_splits_while_concessive_after_decode_failure(self) -> None:
        source = (
            "While we have shown that an increase in core body temperature can be reflected "
            "in earlobe temperature measurements made by Thermal Earring in section 6.1, "
            "directly estimating the core body temperature from the earlobe temperature requires further study."
        )
        units = rescue_units_for_translation(source)
        self.assertEqual([unit.text for unit in units], [
            "While we have shown that an increase in core body temperature can be reflected in earlobe temperature measurements made by Thermal Earring in section 6.1,",
            "directly estimating the core body temperature from the earlobe temperature requires further study.",
        ])
        self.assertEqual(units[0].model_input, "We have shown that an increase in core body temperature can be reflected in earlobe temperature measurements made by Thermal Earring in section 6.1.")
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))

    def test_rescue_splits_although_concessive_after_decode_failure(self) -> None:
        source = (
            "Although this offers a better connection to earth ground compared to a battery-powered transmitter, "
            "it still approximates the performance of worn transmitters in our applications because the receiver "
            "ground plane is the more significant limitation on our power transmission."
        )
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(units[0].model_input.startswith("This offers a better connection"))
        self.assertTrue(units[1].model_input.startswith("It still approximates"))
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))

    def test_rescue_accepts_proper_noun_after_concessive_comma(self) -> None:
        source = (
            "While the correct answer would be the smaller hospital "
            "(due to the larger variance of smaller samples), GPT-3, just like people, "
            "thought that the probability was about equal."
        )
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(units[1].text.startswith("GPT-3, just like people"))
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
