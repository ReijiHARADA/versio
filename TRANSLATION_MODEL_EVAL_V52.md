# Matched translation evaluation v52

Updated: 2026-09-21 02:01 JST

## Setup

Twenty source blocks were selected without consulting translation or manual-review labels: two rows from each of ten papers across HCI, cognitive psychology, marketing, ergonomics, and linguistics. The source rows came from existing audit generations and were stable-key deduplicated; this is a fresh model replay, not a fresh extraction run. The current Paper Reader MADLAD server ran at `3b-mt-v5-semantic-v73-source-protect-v1-strict-restore-v20`. Gemma 2 9B and Qwen 2.5 14B used the current app Ollama system prompt, temperature 0.3, and `num_predict=2000`. The inputs were identical; model prompts differ because the production MADLAD endpoint applies its own language prefix, protection, and segmentation.

Source review found two source-quality defects inside the `ordinary-body-prose` label: one paragraph starts with a lowercase continuation (`benefit anyone...`), and one row is actually a figure caption with C/D panel descriptions. Thus only 18/20 are clean ordinary-prose comparisons. They remain in the product-facing denominator but are excluded from model-only semantic attribution.

## Results

| Model | Source rows | Server/model fallback | Existing TS plausibility gate rejects | Mean / median latency | Mean input/output tokens |
|---|---:|---:|---:|---:|---:|
| MADLAD v73 | 20 | 4/20 (20%) | 5/20 (25%), including server fallbacks | 16.3 / 14.0 s | 92 / 111* |
| Gemma 2 9B | 20 | 0/20 | 4/20 (20%) | 19.4 / 16.6 s | 226 / 124 |
| Qwen 2.5 14B | 20 | 0/20 | 3/20 (15%) | 37.4 / 27.5 s | 231 / 156 |

`*` MADLAD token counts are the server response values; failed/fallback rows report zero even when internal attempts were made, so this mean undercounts actual generation work. Ollama token counts include its system and user prompt; therefore token counts are not directly comparable between providers.

Current MADLAD server fallbacks comprised two translation-quality rejections and two protected-token restoration failures. A fifth row that the server returned as translated was rejected by the TypeScript plausibility check for missing citation years. On this small cohort, ordinary-body fallback is nowhere near the <=5% goal.

## Manual comparison findings

These are row-level observations from direct source/output comparison, not population estimates. The raw full outputs are in `/tmp/paper-reader-v52-matched-model-eval.json`; selected inputs and their provenance are in `/tmp/paper-reader-v52-selected-sources.json`.

- MADLAD had at least nine accepted outputs with severity >=2 issues among 15 rows that passed the server/client checks: it changed the investigator/participant experience claim in an HCI course description; recast contemporary-jewellery background as findings; shortened the stated jewellery/interaction/memory perspectives; mistranslated “social cues”; hallucinated a website in a wearable-product paragraph; distorted the definition of subjective norms; omitted user experience from an ergonomics study summary; dropped self-tracking/work-context content; and damaged a syntax-versus-prosody comparison. These direct failures show that high plausibility scores do not predict semantic safety.
- Gemma produced readable translations for all 20, but the gate rejected four. Two appear to be false rejects caused by citation normalization (`et al.33`→`[33]`, and `reasoning24`→`[24]`); two are real citation-integrity problems (author-year references converted into unsupported `[1]`–`[5]`, and an unsupported `[1]` added to a related-work sentence). Among gate-accepted output, clear severity>=2 misses include “hallmark” rendered as “target” and prosodic features rendered as phonological features. This is promising as a candidate, not safe for production routing.
- Qwen produced readable translations for all 20, with three gate rejects: two likely representation false rejects on `[33]` and `[24]`, and one valid rejection where author-year citations were turned into unsupported numeric citations. Gate-accepted output still mistranslated “social cues” as `ソーシャルクイ` and narrowed prosody to phonological features. It also produced Chinese-script contamination (`大西洋两岸`) and left `social norms` untranslated in a wearable/human-factors passage.

The citation failures matter because the alternative outputs are superficially fluent while changing the reader's source trail. A selector based only on fallback status or current plausibility score would still accept unsafe terminology/semantic outputs.

## Attribution and next steps

The two contaminated source rows are extraction/classification failures, not model errors. Several other MADLAD outputs are intact-source decode errors; its four server fallbacks come from quality rejection or protected-token restoration, which need separate diagnosis. Alternate-model citation normalization and terminology are model/prompt/quality-gate risks. No model or production route was changed.

Next, adjudicate a genuinely fresh, manually screened ordinary-body sample (at least 20 rows, additional papers and multiple sections) before selecting a cascade; include both clean paragraphs and source fragments in separate strata. For candidate routing, repair citation representation checks with positive controls, then evaluate semantic false accepts on held-out papers. Do not deploy Gemma or Qwen from these results alone. Corpus target of 50+ provenance-verified OA papers, <=5% ordinary-body fallback, near-zero unsafe accept, and production cascade remain unmet.

## Fresh extraction replay and manual accepted-output review

After the matched model replay, the same ten cached PDFs were run through the current PDF extraction → Canonical → MADLAD path with a new run ID and report name (`translation-audit-fresh-v52-current-extraction`). This is a fresh extraction and translation run, stratified by the benchmark's current sampler at four units per paper.

| Measure | Result |
|---|---:|
| Papers / source blocks | 10 / 40 |
| Auto-accepted outputs, all roles | 17 (42.5%) |
| Reader-visible source fallback, all roles | 23/40 (57.5%) |
| Source-category ordinary-body rows | 18 |
| Fallback on source-category ordinary-body | 4/18 (22.2%) |
| Manually screened genuine prose rows after caption reclassification | 17 |
| Fallback on manually screened prose | 4/17 (23.5%) |
| Manually reviewed accepted outputs | 17/17 |

Failure stages for all roles: 18 pre-model structural/source-only fallbacks and 5 post-model fallbacks. The 9 table-contamination rows were safely kept source-only, but this contributes to the high all-role fallback denominator and is not ordinary paragraph failure. Four ordinary-body post-model fallbacks were two translation-quality rejections and two protected-token restoration failures. The one statistical-prose row was rejected after the new participant-scope guard caught “88 from various fields” rendered as “88 per field”; this is a useful unsafe-accept reduction that raises fallback rather than silently displaying the wrong count.

Manual review of the 17 accepted outputs found at least eight severity>=2 mismatches. Seven were in the 14 accepted source-category ordinary-body rows: a paragraph overview was replaced by a claim about manufacturing interactive jewellery; “undergraduate HCI course” became graduate school; an HCI course's investigator/participant experience was changed to an experimenter learning the experimental content; `prosodic` was translated as `phonological`; `consumer journey` became travel; the ergonomics related-work summary dropped self-tracking/work context; and a field-study summary omitted user experience. A further accepted, structurally warned linguistics paragraph appears to swap the meaning of references `[13]` and `[16]`. A standalone dependency-tree figure caption was mislabeled ordinary body, demonstrating a source-category miss even after extraction succeeds.

Thus current MADLAD fallback is roughly 4.7× the 5% target on the manually screened prose sample, while at least half of accepted prose outputs have a researcher-relevant semantic/terminology mismatch in this small stratified cohort (7/14). The gate still assigns score 1.0 to several of these outputs. These are not population estimates; the sample has only ten papers, four units per PDF, and selected section strata. They are enough to rule out treating v73 plus the current gate as ready for research-grade use, and to justify continued cause-specific work. Detailed fresh extraction outputs remain in ignored `test-data/real-papers/reports/translation-audit-fresh-v52-current-extraction.{json,md}`.

## Targeted rescue pilot v53

The four ordinary-body rows that MADLAD rejected in that fresh extraction report were replayed through Gemma 2 9B and Qwen 2.5 14B with the same app prompt/options. This is failure-targeted development data, not a rate estimate. Gemma's existing plausibility gate accepted 4/4; Qwen's accepted 1/4. Mean latency was 35.1s and 61.2s per block, respectively. Full matched inputs/outputs are temporarily at `/tmp/paper-reader-v53-cascade-rescue.json`.

Gemma retained the main claims across the four but translated the marketing/peer-effects term `peers` as coworkers (`同僚`) and technical `linear probing` as linear search (`線形探索`), both potentially material in these disciplines; the current gate accepted them. Qwen's linguistics output expanded `MLM` as “masked label matching” rather than masked language modeling. Thus a simple “MADLAD rejects → fallback to alternate model if current gate passes” cascade would replace visible fallback with undetected semantic/terminology errors. Qwen also received three citation/invariant rejections, one of which (`Section 5` rendered as `次節5`) appears to be a representation false reject. No production model routing or prompt changed.

This rules out immediate integration of either model as an unconditional rescue. Next improvements should target source-unit and evidence-aware quality review, plus citation-safe terminology, before another held-out cascade simulation.

## Paired Gemma replay on current-extraction prose v54

To remove the prior-report-source limitation, all 18 rows classified as ordinary body by the fresh 10-paper extraction report were translated by Gemma 2 9B using the same app prompt/options as v52. They match the current MADLAD source rows exactly. The set includes one standalone dependency-tree caption that the source classifier mislabeled as body; manually screened prose count is 17.

Gemma generated all 18 without a model/API error. The shared TS gate accepted 17/18 and rejected one row because Gemma appended an unsupported `[1]` reference. On the manually screened prose denominator, this is one visible fallback in 17 (5.9%), compared with MADLAD's four in 17 (23.5%). Mean latency was Gemma 13.3s (median 8.3s) versus MADLAD 7.3s (median 5.7s) on the same 18 source rows; Gemma is about 1.8× slower here. Gemma mean prompt/output token counts were 264/167 and include the system/user prompt; MADLAD's reported token counts undercount failed generations.

Direct comparison shows useful corrections: Gemma did not invent manufacture/technology in the interactive-jewellery overview, preserved undergraduate eligibility, retained the HCI investigator/participant roles, and retained user experience in the factory field-study summary. But the gate accepted at least three materially wrong technical-term rows: `linear probing`→`線形探索法`; social-advertising `peers`→`同僚`; and `homophily`→`同性偏見` (including preference/structural homophily). On the misclassified figure-caption row it omitted `prosodic features` entirely. Thus the cleaner translation and lower fallback do not meet semantic safety: at least 3/16 accepted clean-prose rows (18.8%) have clear severity>=2 terminology shifts, and the score is still 1.0 for them. No model route changed.

This is stronger current-source evidence that Gemma may be a better translation base than MADLAD, but a direct switch or gate-only cascade is still unsafe. A next prompt/terminology experiment must use generic preservation guidance or a general term-resource, then be judged on new held-out papers; do not add paper-specific term rules or count the lower fallback as success by itself. The complete matched outputs are temporarily at `/tmp/paper-reader-v54-fresh-gemma.json`.

## Generic terminology prompt probe v55

Added one generic system instruction for named methods, theories, constructs, discipline-specific terms, and statistics: use standard Japanese terminology, avoid everyday/neighbor-term substitutions, and retain English in parentheses when uncertain. No source-specific examples or rules were included. Gemma was rerun on three development failures (linear probing, peer effects, homophily) and two ordinary controls.

The instruction corrected `homophily` from `同性偏見` to `同質性` without adding English parentheticals to the controls. It did not correct `linear probing`→`線形探索法` or `peers`→`同僚`, so it does not solve the key source of term drift. The existing gate accepted 4/5; it rejected the semantically faithful `WOM`→`口コミ` because the acronym disappeared, another representation false reject. Mean latency was 19.2s across five rows with the longer generic instruction. These purposive rows only establish a direction for a broader prompt/terminology test, not a quality estimate. Exact outputs: `/tmp/paper-reader-v55-generic-term-prompt.json`. No production prompt or routing changed.

Next, test a general terminology-resource-backed strategy that can retrieve established field terms from document context, and separately repair concept-preserving acronym/citation equivalence in the quality gate. Validate both changes on new, held-out cross-disciplinary sources; do not hardcode these paper-level phrases or interpret gate pass as semantic correctness.


## v59: same-source Gemma replay, invariant false-reject repair, and semantic review

Replayed the 18 source rows labelled ordinary body in the v56 fresh extraction report through the current local Gemma 2 9B runtime (same source keys and exact text as the v54 replay). This is a paired model replay, not a fresh extraction cohort. Prompt/options were the app's current generic academic translator prompt, temperature 0.3, `num_predict=2000`; all raw model inputs/outputs and token/latency data are in the ignored artifact `test-data/real-papers/reports/gemma-v56-current-runtime-replay.json`. The run generated 18/18 without model error, mean latency 11.6s, mean prompt/output tokens 264/168.

The shared plausibility gate initially rejected the cognitive-psychology paragraph because extraction retained citations as superscripts (`Linda problem”15`) but Gemma rendered them as `[15]`, `[16]`, `[17]`. Those are the same exact citation payloads, not new references. Citation invariant matching now ignores only square brackets around an already-extracted citation value; its numeric value and citation order still have to match. A positive test accepts `15`→`[15]`; a negative control rejects `15`→`[16]`. Re-evaluation accepts 18/18. This fixes a confirmed false-reject representation mismatch; it does not change model output or establish semantic safety.

Manual source/output comparison of the 17 clean prose rows (the eighteenth is actually a figure caption misclassified by the source-category sampler) found at least three clear severity>=2 accepted terminology/construct shifts: linguistics “linear probing” rendered as `線形探索法` (linear search); marketing “peers” / peer influence rendered as `同僚` (coworkers); and consumer production “journey” rendered literally as a trip/consumer itinerary rather than preserving the marketing construct. Thus at least 3/17 = 17.6% of accepted clean-prose outputs have a material observed shift in this small development cohort. Other reviewed rows retained the main participant counts, study comparisons, citations and claims, but this is not a blinded population estimate. The corresponding MADLAD 4.57.6 run visibly fell back on 4/17 clean prose rows (23.5%). Gemma's one prior gate rejection is resolved by this generic citation-format correction; current visible candidate fallback is 0/17, but its observed semantic-error rate remains unacceptable for automatic selection.

Across the current and v54 temperature-0.3 replay, the same cognitive paragraph differed in citation formatting and gate outcome, illustrating generation variation. After recomputing old and current outputs with the fixed gate, all 18 from each pass. Do not interpret this as a quality improvement in generation: the only code change affects citation representation equivalence.

No production model routing, prompt, or MADLAD decode behavior was changed. `CURRENT_STATE.md` and `test-data/real-papers/audit-progress.json` record the checkpoint. Next: evaluate generic domain-term preservation or terminology-resource support on new held-out papers and human-review every candidate accept; separately investigate why the MADLAD server falls back on the cognitive scope paragraph. The <=5% ordinary-body fallback and near-zero unsafe-accept goals remain unmet.


## v59 continuation: saved M2M100 candidate review

The previously pending `facebook/m2m100_1.2B` report `test-data/real-papers/reports/model-cascade-v58-m2m12-ordinary.json` contains five generated rows, not the seven mentioned in an older checkpoint. Direct source/output comparison shows all five unsuitable for research translation: the long cognitive-psychology row stops mid-discussion and corrupts problem/task names and claims; the thermal-earring row repeats/misassigns “core/earlobe” temperature and omits the latter half; linguistics rows corrupt technical terms and named model/task references, omit source claims, and stop early. This is a small failure-targeted candidate screen, not a rate estimate. No rerun or production routing change is justified. Continue with the correctly loaded MADLAD 4.57.6 baseline for runtime integrity, and keep Gemma as an experimental candidate only because its broader matched sample still has material false accepts. The older v58 ordinary-body cohort's 17 fallback causes remain to be reviewed case by case.
