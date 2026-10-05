## v83 — negated comparison syntax sensitivity (2026-09-21)

Four same-model, same-runtime greedy requests isolate the quality issue in the marketing comparison. Original “higher ..., compared to those who reported not to have looked ...” again reversed the reporting negation, including when sent as a standalone sentence. A two-sentence equivalent rewrite translated correctly with all summary statistics preserved; a single-sentence `whereas` variant dropped the lower-score contrast; a negative-group-first `whereas` rewrite produced a faithful output and passed quality-v2 controls. Artifact: ignored `test-data/real-papers/reports/translation-audit-v83-negated-comparison-segmentation.json`. This is a promising rescue direction, not yet a production change: validate across independent paper sentences before introducing a generic comparative rewrite.

## Latest checkpoint — v81 table-role and negation-scope findings (2026-09-21)

The 40-block v80 independent manual review contains 15 accepted translations (12 ordinary prose, 3 statistical prose); severity >=2 was found in 5/12 and 2/3 respectively. The 7/15 overall unsafe accepted outputs are from a purposive, section-stratified sample, not a population rate. Ordinary-body fallback was 8/20 (40%); all-row visible fallback was 25/40 and includes structural/non-prose cases. A same-column constraint fixes cross-column spans being counted as table cells in `marketing-health-goals-nudging`. Replaying the recovered 1,338-character prose then exposed a distinct MADLAD negation-scope reversal; the quality gate now rejects negative reporting-predicate movement while preserving a faithful control. Exact unchanged `SD=value` is accepted as preserved. Malformed scientific placeholders restore only when a unique original index is identifiable; ambiguous corruption rejects. Source protection v9 and quality-v2 identities invalidate stale translations. The corrected exact 1,338-character PDF block was replayed against the restarted local MPS server (15.5 s); the same output repeated the scope reversal. The client quality-v2 regression rejects it; artifact: ignored `test-data/real-papers/reports/translation-audit-v82-negation-scope-live-replay.json`. Focused PDF extraction regression 1/1, full frontend 436/436, Python 144/144, typecheck/lint/diff check pass. The full extraction corpus has 108/108 passing assertions but still terminates with a Vitest `onTaskUpdate` timeout, including with one worker. Server is ready on source-protect-v9 / quality-v2. See `CURRENT_STATE.md` for detailed evidence, caveats and next actions.

# Cross-disciplinary translation audit

## Current continuation checkpoint (2026-09-21): semantic omission guard reviewed

A v80 quality-gate change now recognizes lexical omission/exclusion predicates (`forgo/forego`, including PDF line-wrap hyphenation, `omit`, `exclude`, `absent`, `missing`) when Japanese output contains no negative marker. It rejects the v79 HAI severity-3 polarity reversal. Retrospective review of 58 unique manual labels found two newly detected severity>=2 omissions and zero severity 0–1 samples rejected by this cue; purposive and retrospective, so not a product-rate estimate. Full details and caveats are in `CURRENT_STATE.md`; regression report rechecks are local under ignored `test-data/real-papers/reports/`. The MADLAD loader A/B confirms unpatched Transformers 5.17.0 maps the encoder embedding to `lm_head.weight`; 4.57.6 loads the checkpoint input embedding correctly. Keep 4.57.6 as the verified baseline. The source-protect-v7 retry now exposes only a dropped plain identifier while preserving numeric citations and other scientific spans. Actual debug evidence is in `test-data/real-papers/reports/translation-unit-debug-v79-selective-retry.json`.

Matched HAI block `human-ai-interaction-guidelines:b-ea13dc01` went from v78 post-model fallback (`[1]` missing) to v79 accepted with `[1]`, `[11]`, and numeric/acronym invariants retained. Manual review found severity-3 semantic drift: “fore-going references or data” was reversed into “先行する参考資料またはデータの主要な源”; Apple was also rendered as “Appl”. This is a false accept with automatic quality score 1.0, so do not count the single fallback reduction as a net quality improvement. Benchmark and review: `test-data/real-papers/reports/translation-audit-v79-selective-citation-retry.json` and `semantic-review-v79-selective-citation-retry.json`. Next prioritize general semantic relation validation supported by fresh cross-paper fixtures and keep source extraction improvements high precision.

The former PPG extraction failure was a page-clipped, multi-sentence results paragraph containing enough indented native spans to resemble vector labels and a table grid. Generic evidence now suppresses vector-label/table promotion for sufficiently long text with at least two substantial sentence spans. Captionless native table cells remain skipped table content; the narrative result containing “achieves 74.55” remains canonical paragraph text.

A fresh four-block HCI paper review exposed a second generic false table signal. A right-column paragraph below a Table 1 region was tagged as a rightmost table-cell column because independent left-column prose emitted occasional x-fragments on matching baselines. Counting two x bands on two candidate lines was too weak; candidate evidence now requires at least two distinct cell origins to repeat over multiple aligned baselines. This removes the HAI paragraph’s `captioned-neighbor-cell-rows` evidence while retaining the prior marketing table and captionless PPG grid regressions. The exact same source block was table-policy fallback before the fix and continuation-source fallback afterward. Therefore the role is repaired but visible fallback is unchanged until the canonical layer can safely join the unfinished left-column sentence across the table region. The block remains source-only because it begins mid-sentence.

Manual review of the HAI cohort (details in `semantic-review-v76-hai-column-aware-table-evidence.json`) found one severity-2 accepted translation out of two accepted blocks (50% purposive unsafe false accept): “steer the future of Human-Centered AI” was rendered as “支配する”, changing guidance into domination; the quality score was 1.0. One accepted paragraph also fused the short `Errors` heading to its first sentence. The sample showed two pre-model fallbacks: a valid list introduction ending in a colon was treated as a fragment, and the right-column continuation above remains split. The 50% is a tiny purposive result, not a product estimate. Raw runs: `translation-audit-v76-hai-complete-source.json`, `translation-audit-v76-hai-column-aware-table-evidence.json`, and exact target `translation-audit-v76-hai-targeted-table-prose.json`.

Verification: PPG, HAI, and marketing table/body targeted regressions pass; synthetic vector-label and inline-style-label tests pass. Reading-order tests pass 70/70. The full 56-case extraction baseline has 56/56 assertions passing, with one Vitest worker `onTaskUpdate` notification timeout reported after completion; typecheck, lint, and `git diff --check` pass. Exact native-PDF inspection confirms `Errors` is now a heading and its following `Given that AI systems...` text a separate paragraph. The HAI right-column fragment still has a source-continuation fallback; table false-positive removal alone did not reduce visible fallback. No translation benchmark is active; server remains ready. Next: continue source-complete semantic review and safely designed canonical continuation repair. Do not relax gates or route a candidate model from fallback-rate results alone. The <=5% visible ordinary-body fallback and near-zero unsafe false-accept goals remain unmet.

## Latest checkpoint (2026-09-21): v63 Qwen14 candidate pilot

The local production server is ready (PID 4671, 127.0.0.1:8765; MADLAD 3B on verified Transformers 4.57.6, source-protect-v4 / restore-v23); no benchmark is running. Six complete previously accepted prose blocks from marketing, ergonomics/human factors, and linguistics were replayed through Ollama Qwen 2.5 14B using the v62 academic prompt and matching temperature/token cap. Manual review found five severity-1 wording/terminology issues and one severity-0 translation; no severity >=2 in this purposive accepted-only subset. The alternative is smoother in several rows, but it has not been tested on a representative set of hard misses or through production gating and resource constraints. This does not support model routing or an unsafe-false-accept estimate. Exact inputs/outputs and manifest are in ignored `model-compare-v63-reviewed-blocks-qwen14.json`; manual review: `semantic-review-v63-qwen14-candidate.json`. Production algorithm is unchanged; fallback and semantic-safety goals remain unmet. Next: paper-held-out, section-stratified comparison including known hard failures across more disciplines, with manual semantic review and production-gate results.

## Latest checkpoint (2026-09-21): v62 full-name citation protection and candidate replay

The v61 known-failure pair was replayed through Gemma 2 9B, Qwen 2.5 7B and 14B with the same academic translation prompt/settings. All candidate output scores were 1.0 except Qwen 7B on the caveat paragraph, which the existing language gate rejected for one Chinese-script token. Manual review shows Gemma reverses caveat negation, all candidates omit the appraisal contrast “factual/formal rather than attitudinal/affectual”, and unprotected Qwen 14B substitutes “George” for cited author Geoff. With the existing scientific-token protector making `Geoff Thompson (2014)` atomic, Qwen 14B restores the exact name and preserves the caveat on that block; it still softens “not possible” to “difficult”. This two-block known-failure diagnostic is not held-out prevalence evidence and does not justify automatic model routing. Raw generations, prompt, options, digest and timing: ignored `test-data/real-papers/reports/model-compare-v61-known-failures.json`; manual findings: `semantic-review-v62-model-candidates.json`.

The author-name drift revealed that narrative author-year protection captured `Thompson (2014)` but not `Geoff`. A general multiword-name matcher now protects up to three name tokens and excludes common English function-word overcapture; regression tests cover both full citation restoration and “what Geoff Thompson (2014)” context. Protection/cache identity is `source-protect-v4` / `strict-restore-v23`. A live v4 reader-path replay confirms the full name is protected/restored exactly, but MADLAD still drops the nonrestrictive negative caveat at `b-ae5e69d9`. Fresh v62 evaluation: 6 blocks in the same Springer paper, 4 accepted, 2 source fallbacks, ordinary-body fallback 1/4 (25%), unchanged from the v61 same-paper subset. Manual comparison of all four accepted outputs still finds the severity-2 omission at score 1.0. Exact run: ignored `translation-audit-v62-fullname-citation-protect.json`; review labels are appended to `test-data/real-papers/audit-manual-review.json`.

## Latest checkpoint (2026-09-21): v61 superscript restore and runtime integrity

The Transformers 5.17.0 loading defect is already demonstrated by isolated tensor A/B and fixed translation fixtures in `TRANSFORMERS_MADLAD_AB.md`; current lockfile and `.venv` are now on 4.57.6. Live server PID 3501 also runs the project `.venv`, and startup reports the input embeddings are intact. Do not attribute the remaining semantic misses to corrupted embeddings.

In the prior v60 extraction benchmark, a flattened two-item list was safely split but both item translations fell back when MADLAD dropped terminal superscript citations `3` / `4`. Added tightly scoped restoration for only source-proven terminal superscript references, preserving fail-closed behavior for inline footnotes and scientific values. A fresh two-paper reader-path v61 run accepts the numbered list and restores both labels/references; 12 blocks, 4 accepts, 8 source fallbacks, and 1/4 ordinary-body fallback (25%) in this small sample, compared with 2/4 in v60. Manual source review of all four accepts still finds one severity-2 omission accepted at score 1.0: the caveat that appraisal annotations need not be restricted to words or noun phrases. Thus the loader fix resolves one false reject, while the unsafe-accept problem remains. Exact run: ignored `test-data/real-papers/reports/translation-audit-v61-terminal-citation-restore.json`; manual labels: `test-data/real-papers/audit-manual-review.json` and ignored `semantic-review-v61-2papers.json`. Full interpretation and next action are in `CURRENT_STATE.md` v61.

## Latest checkpoint (2026-09-21): v60 held-out manual review and invariant recheck

Fresh v59 reader-path evaluation on nine paper-held-out OA PDFs sampled 54 blocks across cognitive psychology, marketing, ergonomics, linguistics, and economics. Seventeen blocks reached MADLAD; 15 were accepted, 34 fell back before model submission, and five after model output. All 15 accepted translations were manually compared with their source: six (40%) were severity >=2, including four severity-3 errors. The set includes an omitted one of two numbered examples, an omitted scope qualification, technical-term corruption, missing formula content, and a fluent unsupported claim caused by a detached measurement-list tail. This small section-stratified set is diagnostic, not a population estimate. Review notes and short excerpts are appended to `test-data/real-papers/audit-manual-review.json`; raw full-length rows and extraction geometry live in ignored run artifacts.

The automatic ordinary-body label selected 19 rows, with five visible fallbacks. A false-reject candidate on the `Deep IV`/`DeepIV` model identifier was confirmed by exact source/output review. The invariant now accepts the joined spelling only when the full source identifier appears in output, with negative controls for unrelated identifiers. Rechecking the same saved model responses moves this fallback count from 5/19 (26.3%) to 4/19 (21.1%); this is a gate correction only and remains well above target. See `scripts/recheck-audit-translation-quality.ts` and `TRANSLATION_MODEL_EVAL_V52.md` v60.

The accepted cognitive measurement fragment starts `(2.53±0.37), sound complexity...`; its immediately preceding paragraph ends `...medium visual complexity (2.89±0.32), story complexity`. The current extraction gives it equation-like role evidence, then the model invents an assertion about sound quality while all automatic checks pass. This points to paragraph continuation/role resolution as a confirmed source of semantic false acceptance. A separate accepted numbered-example row omits item (1). Both need a general translation-unit/extraction correction and held-out validation. No model-routing change is justified. Latest measured ordinary-body fallback 21.1%; observed accepted severity>=2 6/15. Goals remain unmet.

## Earlier checkpoint: corrected-runtime .app verified; Transformers A/B and v56 replay

The MADLAD-400 3B checkpoint is affected by the reported Transformers 5.x loader defect when loaded without a workaround: 5.17.0 silently binds encoder input embeddings to the distinct `lm_head.weight`. The active Paper Reader 5.16.1 environment had a custom reassignment that masked the issue. The project now pins 4.57.6 and validates encoder/decoder/checkpoint equality at startup instead of mutating weights. Detailed tensor mapping and fixed-fixture A/B outputs are in [TRANSFORMERS_MADLAD_AB.md](TRANSFORMERS_MADLAD_AB.md); raw tensors/outputs remain in ignored local reports.

Under correctly loaded 4.57.6, the same 10-paper / 40-unit v53 cohort retained matching source text and keys. There were 18 pre-model and 5 post-model fallbacks, with 17 accepted translations. Clean ordinary-body fallback was 4/17 (23.5%), unchanged from the patched 5.x baseline. The known group-cardinality and participant-count scope errors persist at direct model level and remain rejected by the client scope gate. Manual review of the changed accepted outputs also found factory-worker study-focus omission/addition, an interactive-jewellery hallucination, consumer-production terminology drift, and an unsupported WEAR construct claim. Correct weights fix runtime integrity, not MADLAD's remaining semantic limitations.

The release `.app` was rebuilt successfully in fast mode at 02:48:22 JST and inspected: its bundled Python reports Transformers 4.57.6, and its server source includes the v6 cache identity plus fail-closed embedding checks. Full Vitest 418/418, Python 133 + 11 subtests, typecheck, lint, and production frontend build pass. The first bundle attempt exposed unrelated extraction-source project-reference type errors; these were fixed minimally and the full checks rerun.

For next model work, keep 3B/4.57.6 as the reference and prioritize a 7B comparison before 10B. Neither weight set is cached; full safetensors are about 33.2 GB (7B) and 42.9 GB (10B), while only 37 GiB is free on this 96%-used volume. No weights were downloaded; compare already-installed Gemma/Qwen on held-out papers until more storage is available.

The <=5% ordinary-body fallback and near-zero unsafe false-accept goals remain unmet. Continue held-out semantic review and jointly track fallback and unsafe accepts under 4.57.6; keep model routing unchanged until that evidence supports a safe intervention.


## Latest checkpoint (2026-09-21 02:04 JST)

### v55: generic terminology instruction probe

A generic Gemma prompt addition for named methods/theories/constructs and discipline-specific terminology was tested on three known terminology failures plus two normal controls. `homophily` improved from `同性偏見` to `同質性`; `linear probing` remained `線形探索法`, and marketing/social `peers` remained `同僚`. The two controls remained natural. The existing gate accepted 4/5 but rejected correctly translated `WOM`→`口コミ` for losing the English acronym: a false-reject confirmation. Mean latency was 19.2s for five sources. This small purposive development probe is not an estimate and has not changed production prompt/routing. Raw rows: `/tmp/paper-reader-v55-generic-term-prompt.json`; discussion in `TRANSLATION_MODEL_EVAL_V52.md`.

Next: evaluate document-grounded term lookup and concept-preserving acronym equivalence, then test on fresh held-out OA papers. No per-paper phrase rules. Continue broader manual review and corpus expansion; fallback <=5% and near-zero unsafe accept remain unmet.

### v54: paired Gemma replay on fresh extraction source blocks

Gemma 2 9B was evaluated on the identical 18 source-category ordinary-body rows from v53. Manual screening reclassified one as a figure caption, so the ordinary prose denominator is 17. Gemma generated all rows; the existing TypeScript gate accepted 17/18 and rejected one unsupported `[1]` citation. Manually corrected visible prose fallback is 1/17 (5.9%) vs current MADLAD 4/17 (23.5%). Mean time was 13.3s Gemma vs 7.3s MADLAD (1.8x), same sources.

Gemma avoided several MADLAD false claims/omissions, but manual source comparison found clear high-impact terminology shifts in gate-accepted rows: `linear probing` became linear search, `peers` became coworkers, and `homophily` became same-sex bias. It also omitted prosodic features from the misclassified standalone caption. Thus candidate false accepts persist even when fallback is near target and gate score is 1.0. No production route was changed; neither switch nor gate-only rescue is safe. Full paired analysis: `TRANSLATION_MODEL_EVAL_V52.md`; raw replay: `/tmp/paper-reader-v54-fresh-gemma.json`.

Next: run a generic term-preservation / terminology intervention on development examples, retain paper-independent rules, and test on new held-out papers with manual review. Continue source-category false-negative review, track false accepts and false rejects alongside fallback, and expand OA corpus. Goals remain unmet.

### v53: fresh extraction cohort and targeted alternate-model rescue

A newly named serial benchmark run processed ten locally cached OA PDFs through current extraction/Canonical/MADLAD code, sampling four stratified blocks per paper (40 total). All outputs were manually compared. Overall source-only/original fallback was 23/40 (57.5%), driven partly by 9 table-contamination and 18 pre-model structural/source skips; the former are safe structural preservation, not ordinary paragraph failure. Within source-category ordinary-body, 4/18 post-model fallback (22.2%); a figure caption was misclassified as ordinary prose, so the manually screened prose denominator is 17 and fallback 4/17 (23.5%). Seventeen automatically accepted outputs were reviewed; eight had severity>=2 shifts, including seven ordinary-prose errors. The existing participant-scope guard correctly rejected the `88 participants from various fields`→`88 per field` shift. No production behavior changed.

The four post-model ordinary-body fallback sources were translated by Gemma 2 9B and Qwen 2.5 14B. Gemma passed the shared gate 4/4 but two outputs shift `peers` to coworkers and `linear probing` to linear search. Qwen passed 1/4 and produced an MLM expansion error; the other three were gate-rejected, including likely representation false rejects. This is insufficient evidence for cascade routing. Exact counts, sample caveats and examples are in `TRANSLATION_MODEL_EVAL_V52.md`; fresh extraction is `reports/translation-audit-fresh-v52-current-extraction.json` under ignored local data, and rescue generations are in `/tmp/paper-reader-v53-cascade-rescue.json`.

The current app source still meets neither <=5% ordinary-body fallback nor near-zero unsafe-accept goals. Next: use fresh, manually screened multi-paper extraction rows to quantify false accepts and false rejects separately, investigate citation/protected-token failures and title/figure caption source contamination, and defer cascade until new-paper semantic performance supports it. Corpus expansion to 50+ provenance-verified OA papers remains outstanding.

### v52: matched source-only model replay on ordinary-body candidates

Replayed 20 stable-key source rows from 10 existing papers across HCI, cognitive psychology, marketing, ergonomics, and linguistics through current MADLAD v73, Gemma 2 9B, and Qwen 2.5 14B. Sampling used role/category/source form, not translation or manual-review labels; source rows span prior audit reports, so this is a fresh model run but not a fresh extraction generation. Two rows labeled ordinary body were actually a continuation fragment and a figure caption, leaving 18 clean prose comparisons after manual input screening.

Server fallback: MADLAD 4/20; Gemma and Qwen 0/20. Applying the shared TypeScript plausibility API to the same outputs rejected 5/20 MADLAD, 4/20 Gemma, and 3/20 Qwen. In alternatives, citation strings `[33]` and `[24]` appear to be representation-only false rejects; invented/renumbered author-year citations remain true rejects. Yet the gate accepts several clear semantic/terminology errors: MADLAD changed a website category into a wearable product, and Gemma/Qwen outputs confused `prosody` with phonology; Qwen rendered `social cues` as `ソーシャルクイ`. Manual comparison found at least 9 severity>=2 problems among 15 MADLAD outputs passing server/client checks, 2 clear severity>=2 Gemma gate false accepts, and 2 Qwen gate false accepts. These are raw small-sample counts, not rates generalizable to product use.

Mean latency: MADLAD 16.3s, Gemma 19.4s, Qwen 37.4s per block. Gemma remains faster than Qwen but its prompt changes author-year citations into unsupported numbered citations on a marketing paragraph. No production routing changed. Full findings, model token/fallback statistics, and representative failure descriptions: `TRANSLATION_MODEL_EVAL_V52.md`. Raw exact source/output rows: `/tmp/paper-reader-v52-matched-model-eval.json`; source selection/provenance: `/tmp/paper-reader-v52-selected-sources.json`.

Next: select a new manually screened ordinary-body cohort from fresh extractions, broaden papers/sections, classify all outputs blind to model where practical, investigate citation false rejects and source-protection restoration fallbacks, and only then simulate a held-out selective cascade. The <=5% fallback and near-zero unsafe-accept targets remain unmet.

### v51: matched five-discipline primary replay and local alternatives

Selected five previously accepted severity 2–4 errors from five separate papers across HCI, neuroscience, linguistics, ergonomics, and marketing; ran the identical extracted source through current MADLAD v73 and local Qwen 2.5 14B / Gemma 2 9B with the same Paper Reader prompt/options. This is a purposive known-failure replay, not held-out or population-quality evidence.

Current MADLAD reproduced all five serious historical shifts without server fallback: stronger-than-source HCAI “domination,” mangled “rule-adherence,” a missing central linguistics claim, wearable→webinar/website hallucinations, and “sharing economy”→共有経営. The client plausibility API assigned all five score 1.0 with no reasons. New Qwen14 and Gemma outputs were manually reviewed at 0/5 severity>=2 each on these cases; caveats include minor HCI omissions/compression and Gemma's nonstandard `句法` terminology. Mean latency per block: MADLAD 16.1s, Qwen14 24.5s, Gemma9 14.8s. This makes Gemma a promising selective-rescue candidate but does not prove it safe on ordinary body text or random papers.

Detailed matched comparison: `test-data/real-papers/reports/semantic-model-matched-v51.md`; full raw model outputs are at `/tmp/paper-reader-v51-madlad-current.json` and `/tmp/paper-reader-v51-independent-model-eval.json`. No production model routing changed. Next: sample >=20 matched ordinary-body blocks independent of existing labels across several papers/sections, manually compare all models and explicitly count candidate false rejects, then simulate a selective route on held-out papers before implementation.

### v50: add two English-to-Japanese scope/cardinality guards; track their fallback cost

Added checks for a collective participant total shifted into a field-level count, and a group-wide null comparison narrowed to two despite >=3 explicit groups/conditions. Among 32 unique pairs from reviewed accepted rows, only the two known severity-2 errors in the motivating cognitive-psychology paper flagged; this is development data, not held-out precision. The checks would make the two MADLAD results visible fallback unless a safe alternate candidate is routed, so they do not improve fallback by themselves. The positive/negative controls and exact false-positive accounting are described in `CURRENT_STATE.md` and `reports/semantic-model-comparison-v48.md`.

### v48: compare local alternatives on reproduced scope errors; repair one statistical-label false reject

Ran the two v46 severity-2 full paragraphs through local Qwen 2.5 7B and Gemma 2 9B with Paper Reader's existing Ollama translation prompt, plus a bounded-negation negative control and a true per-group count positive control. On the participant paragraph, Qwen attached 88 to “research fields” while Gemma preserved 88 participants across varied disciplines; compensation wording in Gemma remains ambiguous. On the statistical paragraph, Qwen avoided a binary `両群間` claim but phrasing remained awkward; Gemma preserved “none of the groups” and the later three-group finding. Both models preserved the two controls. Full results, timing and human interpretation: `reports/semantic-model-comparison-v48.md`; raw outputs: `/tmp/paper-reader-v48-alternative-models.json`.

Latency was 15–25s (Qwen) and 18–31s (Gemma) for full paragraphs. The production plausibility gate passed all eight outputs, including the known Qwen count error and MADLAD false accepts. This confirms that automatic gate pass is not semantic validation. The small targeted comparison does not justify blanket replacement or production routing; Gemma is only a rescue candidate pending held-out review.

The Gemma participant output correctly translated `SD=value` as `標準偏差 value`, but the acronym invariant rejected it. `quality.ts` now accepts that expansion only when every `SD=value` is numerically matched next to `標準偏差`. Missing/mismatched number or label still rejects. Tests: focused quality 78/78; full Vitest 410/410 (65 files); typecheck/lint pass; Python suite 130 + 11 subtests. No app build. No extraction or generation behavior changed. The <=5% ordinary-body fallback and near-zero unsafe-accept goals remain unmet.

Next: design a high-precision, language-aware count-scope/cardinality signal, test it against the de-duplicated accepted manual-review corpus and matched positive controls, and quantify false rejection before production use. Then run a held-out multi-paper selective-cascade comparison. Do not count these two target papers as held-out evidence.

### v47: trace two statistical semantic false accepts to model decode; probe input phrasing

On a single ready model process, replayed the two v46 false-accept blocks through the production server with unit debug tracing. The participant-count sentence reached MADLAD intact as one 161-character chunk; greedy output already said `各学科から88名`, so segmentation/citation splitting was not the direct cause. The statistical sentence reached decode in a 340-character chunk with `H(2)=4.17, p=0.124` hidden as a citation placeholder; greedy and beam both emitted `両群間`, and the final block later said the study compared three groups. Neither model fallback nor the number/negation quality checks rejected the internally inconsistent output. Attribution: primary model decode, secondary false-accept gap in the quality gate. Citation protection can remove context, but the “both groups” error also reproduced with the sentence alone, so that is not by itself causal.

Eight same-process diagnostic variants (`/tmp/paper-reader-semantic-v47-variants.json`) showed that “No significant differences were found among the three groups...” translated as `3群間...` (31 input / 17 output tokens), while a later sentence naming three groups did not correct the original sentence's `両群間` output. Participant-count rewrites remained unreliable: a reordered version omitted key sample/pay facts and passed with no fallback; adding “overall” preserved 88 but still yielded ambiguous scope. Do not adopt source rewriting from these results. No production code changed. Full trace: `/tmp/paper-reader-semantic-v47.log`; original replay: `/tmp/paper-reader-semantic-v47-replay.json`. Next: held-out cross-domain tests for set cardinality and count scope, then evaluate a general semantic consistency signal with false-reject accounting before any production guard change.

### v46: reassemble native cell geometry across peer blocks; remove two accepted table fragments

Manual PDF review of v45 found two accepted outputs on page 5 were Table 1 rows, not prose. Their geometry explains the false accept: three cell spans were grouped into one layout block and the long outcome cell was a same-baseline peer block. Generic `captionedNativeMultiCellRow` evidence now joins native spans across same-baseline peers when a nearby native table caption exists and there are four clearly separated text runs. The Brodie row is preserved as a structured table; the Mathwick/Mosteller row is source-only because no reliable grid is projected. Both are excluded from paragraph translation. Regression coverage includes both rows and the full prose paragraph immediately below Table 2 (negative case).

Fresh v46 on the same three OA papers / 36 selected blocks produced 12 accepted translations and 24 visible fallbacks. Relative to v45, three accepts disappeared because two flattened table rows left the paragraph candidate set (the remaining sampling change is structural). The previously reviewed table-row false accepts are no longer sent to MADLAD. All 12 accepts were manually compared: 2/12 severity >=2 (16.7%), both statistical prose; 2/3 accepted statistical blocks (66.7%) retain meaning shifts around participant scope and the number of compared groups. No list/table false accept remained in this accepted set, though the keyword line is flattened with minor readability impact.

The report's automatically labeled ordinary-body category says 1/10 fallbacks (10%); visual/manual adjudication shows the single fallback is funding metadata, and six accepted rows are genuine ordinary body. That tiny purposive sample has 0/6 visible fallback, but cannot establish the <=5% product target. The complete prose block repaired in v45 still returns `partial_unit_fallback` on direct replay, due protected-token restoration; see `reports/translation-audit-v45-recovered-marketing-paragraph-replay.json`. Keep this as a false-reject candidate, not a clean accept.

Report: `reports/translation-audit-v46-table-grid-evidence.json`; full accept review: `reports/semantic-review-v46-table-grid-evidence.json`. Validation: extraction baseline 55/55, extraction/reading-order corpus 107/107, default Vitest 408/408 (65 files), typecheck/lint. No app build; Python server implementation was unchanged (latest Python tests v44: 130 + 11 subtests). Normal server PID 81428 is ready; no benchmark/debug process remains.

Next: fixture and diagnose the protected-span partial fallback, then address the two statistical scope/cardinality errors with cross-domain source invariants or another evidence method that does not hard-code the paper's hallucinated wording. Expand manual review beyond this three-paper diagnostic before estimating product ordinary-body fallback.

## Previous checkpoint (2026-09-21 00:00 JST)

### v45: correct a caption-neighbor false table classification; fresh cohort exposes table false accepts

The Springer marketing PDF page 7 contains a regular right-column paragraph immediately below Table 2. It was being preserved source-only as a table because left-column prose at x≈51pt and an indented first line at x≈62pt were counted as separate neighbor-cell origins. The generic `captionedNeighborCellRows` evidence now merges same-baseline spans and clusters nearby starts within 24pt before counting distinct cell origins. A real-paper regression asserts this body block projects as a pending paragraph without `tableSourceFallback`; the existing Table 2 assertions remain.

The same three-paper / 36-row reader-path cohort was rerun as v45 (`translation-audit-v45-extraction-table-fix.json`). Changed extraction altered stratified sample membership, so this is a directional diagnostic rather than a controlled matched-rate claim. It yielded 15 accepts / 21 visible fallbacks (v44: 12 / 24). Automated `ordinary-body-prose` contained 13 rows and 1 fallback (7.7%), but that category is contaminated by two accepted flattened table rows and one funding metadata block. All 15 accepts were manually compared in `semantic-review-v45-extraction-table-fix.json`; 5/15 (33.3%) have severity >=2. The unsafe set includes the known quantifier/group-scope errors, the construct “sharing economy” rendered as “共有経営,” and two malformed table-row fragments accepted as paragraphs. Therefore v45 does not establish an overall quality gain and the automated ordinary-body rate is not a valid product rate.

The previously misclassified 882-character Wirtz paragraph is now a paragraph and is submitted to MADLAD. A direct production-server replay produced mostly coherent Japanese, but returned `partial_unit_fallback` after protected-token restoration failed. It was not selected in v45's 12-row marketing stratum and must not be counted as an accepted clean translation. Full source and response are recorded in `reports/translation-audit-v45-recovered-marketing-paragraph-replay.json`.

Validation passed: baseline extraction 55/55; complete extraction/reading-order corpus 107/107; typecheck and lint. Python server tests remain the v44 result (130 tests + 11 subtests); this iteration changed TypeScript extraction only. No app bundle was built. Debug server and benchmark have stopped; normal server PID 81428 is ready with `3b-mt-v5-semantic-v73-source-protect-v1-strict-restore-v20`.

Next: repair generic table-row boundary/classification false accepts with positive and negative layout fixtures, then manually recalculate the true-body denominator. Keep the table-adjacent full prose case as a negative fixture. Afterwards address statistical scope/quantifier failures and protected-token partial fallback. Do not loosen quality gates or report automatic labels as manual truth.

## Previous checkpoint (2026-09-20 23:25 JST)

### v44: proper-name fixes confirmed; statistical prose still has unsafe accepts

Fresh production-reader-path report test-data/real-papers/reports/translation-audit-v44-post-protection.json used the same cohort as v43: 36 stratified blocks from wear-scale (ergonomics), marketing-consumer-production-journey (marketing), and cognitive-vr-mnemonic-processing (cognitive psychology). The run completed in about 2m53s. It accepted 12/36 and displayed source fallback on 24/36, unchanged from v43. Ordinary-body fallback was 3/12 (25%), all post-model; overall fallback comprised 19 pre-model and 5 post-model rows. The <=5% target is not met.

All 12 accepted outputs were manually compared with the English source; see semantic-review-v44-post-protection.json. Two severity-2 semantic shifts remain (2/12 accepts overall, both in statistical prose; 2/3 accepted statistical-prose rows). For the participant sample, “from various fields of study” became ambiguous “各学科から88名”, potentially implying 88 participants per department. In a results paragraph, “none of the groups” became “両群間” (between two groups), though this experiment has three conditions. These are model semantic errors, not extraction errors, and current automatic quality checks accept them. Ordinary-body accepts were 0/9 severity >=2 in this small purposive cohort.

The prior v43 severity-2 proper-name errors are resolved: narrative Kelly’s (2016) and acknowledgment Dimitrios Tsekouras now retain exact spelling under scientific/name protection. PDF-native geometry repair also restored the previously missing ’ co-production activities. We in the marketing abstract; the complete source and full abstract translation are now present and accepted. Since repair generated a new block ID, compare the old/new abstract by source content rather than stable key alone. These fixes reduced reviewed severity-2+ accepts from 3/12 to 2/12, but did not reduce fallback rate.

A repeated Tucker (2014) row remains fallback. Under v43 the client gate cited missing year 2014; in v44 the server reports protected-token restoration failure for unit 0. This is a concrete false-reject / protection interaction to diagnose. Two other statistical rows also fail protected-token restoration (WEAR sample-size and cognitive pairwise results). Do not loosen the guard until inputs, placeholders, generated chunks, and restoration are captured. Mean accepted translation time was 9.22s; v43 was 9.93s and whole-run times were 2m53s vs 2m56s. This is descriptive only, not a controlled speed or quality gain.

The v44 process loaded the edited protection code but reported the old identity 3b-mt-v5-semantic-v73-strict-restore-v20; at run time, the app cache constant was still v71. After v44, added source-protect-v1 to the server identity and synchronized the TypeScript cache key. A cross-language cache-identity test, typecheck, lint, and Python suite 130 + 11 subtests pass. Restarted server PID 80608 reports 3b-mt-v5-semantic-v73-source-protect-v1-strict-restore-v20 and is ready. Model warmup OK failed the Japanese-script check, but model loading completed. PDF.js emitted its optional missing canvas.node warnings; the benchmark itself completed successfully.

Next: create fixed, cross-domain statistical-prose fixtures for quantifier/group-scope preservation; trace the three protected-token restore failures end-to-end; only then make generalizable changes. Measure false rejects as well as unsafe accepts on a fresh versioned held-out cohort. Preserve v43/v44 reports and do not represent fallbacks as safety improvements.

### v42: generic column, rail, caption, and continuation repair

Native geometry on the Frontiers cognitive-VR PDF page 1 showed a 7pt publication
date rail at x=73.9 beside 9pt body text beginning at x=208.3. Other pages had
large figures/captions leaving only a few paired body lines, so the previous
column-profile detector missed two-column layout and reading order interleaved
the columns. This is generic line/block grouping evidence, before resolver role
selection.

`src/services/pdfLayout.ts` now identifies sparse but repeated column x-origins,
separates narrow rail lines from wide body lines, reconnects caption lines when
a short statistical caption tail is detached, and stitches only high-confidence
unfinished prose continuations across nearby margin blocks/pages/columns. For a
left-to-right column transition, it transfers only the unfinished sentence
prefix, leaving later independent material with its own block. These changes
were checked against the cognitive-vr PDF and synthetic reading-order cases;
they are geometry/continuation based, not paper-specific.

Fresh production reader-path report:
`test-data/real-papers/reports/translation-audit-v42-margin-stitch.json`.
The 12 sampled rows are 6 accepted and 6 visible fallbacks. The ordinary-body
category contains 4 rows with 1 fallback (25%). Manual comparison of all six
accepted Japanese outputs is recorded in
`test-data/real-papers/reports/semantic-review-v42-margin-stitch.json`: 0/6
severity >=2, with minor wording issues in all six. This is a purposive
single-paper result, not a population estimate. Mean generation time for the
six accepted outputs was 8.13 seconds; no matched performance claim is made.

The previously accepted paragraph ending `... by comparing` is reconstructed
through the next page before translation; the former “10 vs 20 cases” fluent
hallucination is no longer generated. Figure 5's caption tail and p-value are
preserved. The publication date is no longer fused into method prose. This
repairs input structure, but several other damaged/table/reference fragments
still fallback, and one statistical acknowledgment is rejected because the
invariant guard considers `MWK` missing. Fallback and unsafe-accept targets
remain unmet; no threshold was relaxed.

Validation: extraction-corpus 107/107 (2 files), focused reading-order 67/67,
target table/Wear Scale regressions 2/2, typecheck and lint pass. PDF.js emitted
optional missing `canvas.node` warnings only. System Python 3.14 lacks pytest, so
Python server tests were not runnable in this environment. No `.app` build was
run; port 8765 remains the user's active server.

### v39: nested statistics restore safely and terminology correction

### v39: nested statistics restore safely and terminology correction

The v33 and v38 Frontiers cognitive-paper samples share all 12 stable block
keys. The targeted result block `b-0948b947` had been split at statistical
degrees-of-freedom notation `(2)` and fell back after MADLAD omitted protected
statistics. Production segmentation now treats those tokens as part of the
statistic, and retry-only clause splitting isolates the school-exam result from
the memory-result clause. A balanced nested-parenthesis scanner atomically
protects *terminal* statistical result groups. If a dropped group is terminal,
the exact source parenthetical is restored next to its translated claim; a
nonterminal group is excluded so restoration cannot shift evidence onto a
later claim.

Fresh production `/translate` plus the client gate now accepts the 1,110-character
block (`semantic-v73`): 242 input / 341 output tokens, 68.1 seconds, quality
score 1.0. Manual comparison found the reported tests, values, p-values, and
result directions intact (severity 1 for awkward placement of a Figure 5
reference). On identical 12 stable keys, v33 had 7 accepts / 5 visible
fallbacks; v39 has 8 / 4. One statistical-prose block moved from fallback to
accept. Another block, `b-3e9b6acb`, still falls back after test-name
placeholders are dropped; no broad statistics-fallback reduction is claimed.

Reviewing every v39 accept also found three generic issues. A left publication
date rail was fused into methods prose; a caption ending at the partial word
`Significant` was translated without that fragment; and `stimulus material`
became `刺激物質`. The first two remain accepted errors (severity 2). The
terminology error was corrected with source-grounded normalization to
`刺激素材` / `ビデオ素材`, without changing accept decisions on the exact same
12 rows. Accepted severity-2+ went from 3/8 in v38 to 2/8 in v39; within the
automatically ordinary-body category it is 2/5 (40%) in this purposive
single-paper sample. Ordinary-body fallback is 0/5 in both runs; overall
fallback is 4/12. This does not meet the <=5% ordinary-body fallback goal or
the near-zero unsafe-error goal. See
`reports/semantic-review-v39-stimulus-material.json` and
`reports/translation-audit-v39-stimulus-material.json`.

Python translation-server tests are being re-run after the v73 protection
change; the glossary test passes 17/17. No `.app` build was run. Next: diagnose
the generic page-rail/body merge and incomplete-caption false accepts, then
investigate the remaining dropped-test-name fallback without loosening
scientific invariants.

## Previous checkpoint (v37, 2026-09-20)

### v37 follow-up: statistical notation was misread as inline list markers

The v33 cognitive-psychology fallback `cognitive-vr-mnemonic-processing:b-0948b947`
contains a 1,110-character results paragraph. The prior segmenter interpreted
every degrees-of-freedom token `(2)` in `H(2)` as an inline enumeration marker.
Replaying the old production helper yields 10 units, including the broken pairs
`... examinations (H` / `(2)=4.17...` and `... tasks (MCQ: H` / `(2) = 6.06...`.

The new generic candidate rule accepts `(n)` only at a list boundary (start,
colon, or semicolon) and only when prose follows; an equation form like
`(2) = 6.06` is not a list marker. The production/cache version is now
`semantic-v72`. The same source segments into six complete sentences and
round-trips exactly. The real numbered-list regression still passes.

This corrects source-unit damage but does not yet reduce fallback on that case.
The same MADLAD model, through production `/translate`, still returned source
because it dropped protected statistical evidence in two sentence units. Debug
output shows unit 0 omitted `p=0.124` and the `(MCQ…; CT…; FR…)` group; unit 2
omitted several task/p-value placeholders. The other four sentence units
translated. Treat this as a separate remaining issue: dense result prose and
all-or-nothing scientific-token restoration. The fix must preserve each test's
reported values and their relationship; allowing dropped p-values merely to
improve the fallback rate would be unsafe.

Python translation-server tests now pass **125 tests plus 8 subtests**. The
translation server is running and ready at `127.0.0.1:8765` with debug enabled
and model `3b-mt-v5-semantic-v72-strict-restore-v20`; there is no active broad
benchmark. Prior v33/v35 rates remain unchanged and descriptive only.

Next: design and test a general strategy for dense statistical-result groups,
then evaluate it on this block and held-out statistical prose. Continue ordinary
body false-reject review and corpus expansion. No `.app` build was run.

## Previous checkpoint (v33, 2026-09-20)

The translation server was ready at `127.0.0.1:8765` with
MADLAD `semantic-v71-strict-restore-v20`. The broad fresh run is v33
(`reports/translation-audit-v33-cross-field-heldout.json`): three OA journal
papers spanning ergonomics, corpus linguistics, and cognitive psychology, 12
stratified blocks each. There were 22 model submissions, 15 accepts, and 21
reader-visible fallbacks. Ordinary-body rows were 15 with 3 fallbacks (20.0%).
Every accepted row was manually reviewed: severity >=2 appeared in 5/15 accepts;
for ordinary-body accepts it was 5/12 (41.7%). This is a purposive diagnostic,
not a prevalence estimate. See `reports/semantic-review-v33-cross-field-heldout.json`.

The v33 held-out run confirmed that current source-role estimates can miss
peripheral metadata. In the Frontiers PDF, `15 February 2023` in a left-side
publication rail shared a baseline with body text; it was fused into the block
and became an apparent experiment date. In the Springer ergonomics PDF, a
repeated page-edge mark `1 3` was treated as paragraph text and joined to the
next page's lowercase continuation, producing the input `1 3 means also...`
and the accepted Japanese prefix “13…”. Native geometry showed that the real
paragraph continued from the previous page's “Personal feedback” and the mark
was a publisher footer.

A generic repair recognizes short numeric/symbol marks repeated in the top or
bottom page band as footer metadata. The boundary stitcher skips that marker
only when geometry places it below the prior paragraph tail; it then joins the
actual source continuation. It also requires a substantial source tail before
generic cross-page stitching. The real paper now yields the full paragraph
`Personal feedback means also ...` across pages 3–4 and retains `1 3` as a
footer. The repaired real block is covered by a cached-paper regression.

A fresh v35 reader-path run on that paper sampled 12 blocks: 5 submitted, 3
accepted, 9 visible fallbacks; ordinary-body was 1/4 fallback (25%). The
corrected block was not among the 12 sampled rows, and source-unit selection
changed after reconstruction, so do not compare this as a causal rate change.
Sending the exact reconstructed 2,446-character paragraph directly to the same
server took 43.8 seconds (589 input / 766 output tokens). The model omitted
source citation years 2015 and 2017 and shifted the four-user-experience-goal
claim. The existing client quality evaluator scored it 0.794 and flags the
missing years; the 0.8 threshold and invariant check should reject it. This is
safe fallback, not a quality win: the ordinary-body goal remains <=5% and is
not met.

A fixed v36 sentence diagnostic compared a whole sentence, a manually inserted
atomic citation placeholder, and mechanically separated complete clauses.
Whole and clause-split variants each scored 0.723 with missing 2015/2017 citation
years and were rejected by `isPlausibleJaTranslation`. A manually injected
current-style `ZZCIT1ZZ` token was retained, then manually restored to the exact
source citation. That simulation scored 1.0 and passed the current gate, but the
Japanese output made the cited authors the grammatical agents who defined the
goals. This is not a production false-accept measurement: the current server
does not automatically protect this square-bracket author-year span. It is a
controlled warning that naive bracket-citation protection could turn a rejected
output into an unsafe accepted one. No server/model/gate change was made.

Verification after the generic edge-marker change: extraction/read-order
selection 107/107; reading-order and quality unit tests 141/141; Python
translation-server tests 124 passed; typecheck, lint, `npm run build`, and
`git diff --check` pass. The normal web build reports existing PDF.js direct-eval,
large-chunk, and ineffective-dynamic-import warnings. No `.app` bundle was
built. The translation server remains ready.

Next: diagnose and repair peripheral metadata/body line grouping without
paper-specific rules; review false rejects among the 21 v33 fallbacks, in
particular table/source-only and scientific prose; evaluate a citation-aware
complete-unit strategy against an alternate model on held-out papers; continue
provenance-verified corpus expansion. The severe false-accept rate and fallback
target remain unmet.

## Previous checkpoint (2026-09-20 21:01 JST; v32)

v32 audited one Springer marketing paper with 12 stratified blocks: 7 model
submissions, 6 accepts, and 6 visible fallbacks (5 table/source-only before the
model and 1 post-model quality fallback). Ordinary-body fallback was 1/6
(16.7%), but table-row reclassification changed that denominator. All six
accepts were reviewed; 3/6 had severity >=2, including the already observed
unsupported experimental-results claim. Table 2/3 compact cell clusters were
kept out of paragraph translation using generic caption proximity, repeated
row spacing, x-column alignment, and neighboring cell evidence. Reliable
structured grids remain incomplete. Details:
`reports/translation-audit-v32-captioned-grid-row-recovery.json` and
`reports/semantic-review-v32-marketing-grid.json`.

## Historical checkpoint (2026-09-20 19:25 JST)

The latest multi-paper baseline remains the fresh v20 cohort (4 papers, 48
sampled blocks), not the older v16 broad cached-paper run described later in
this document. Its ordinary-body reader-visible fallback was 5/17 (29.4%).
Manual review covered 15 accepted rows and found severity >=2 in 10; this small,
risk-stratified sample is descriptive, not a corpus-wide error estimate. The
<=5% fallback and near-zero unsafe semantic error goals remain unmet.

Three newer fresh runs (v21–v23) isolate the wear-scale real-PDF extraction
repair and must not be mixed into v20 metrics. v23 (`2026-09-20T09-51-33-356Z`)
sampled 20 blocks: 6 ordinary-body rows / 1 fallback (16.7%); all categories
had 14 fallbacks (12 pre-model, 2 post-model). This purposive one-paper sample
is diagnostic only.

The PDF mixed department/address text into the WEAR lead because a narrow
left-side x-band shared aligned baselines with body prose. Generic repeated
narrow/long x-origin detection now separates those runs and preserves
affiliation role. Adjacent same-column text can then be stitched across that
affiliation only when x origin, font, and line spacing match and the prior text
is unfinished. Nonbreaking hyphens at line ends are also joined to a lowercase
continuation. The extracted lead now reads through “extended WEAR Scale to the
apparel field by” without affiliation contamination.

Before, MADLAD received the incomplete “...introduce an extended” fragment and
generated unsupported dimensions (“100mm…1000m…10mm…1m”); the invariant gate
rejected it after generation. After, extraction restored the “WEAR Scale…by”
continuation, which reveals that the text leads into separately represented
list items. The generic source-boundary guard now pre-model-falls back the lead;
the hallucinated dimensions are no longer generated/displayed, but this case's
fallback remains unresolved until list leads and items can be handled together.

No server or benchmark is running. Evaluations used isolated ports 18807–18809
and stopped each server at exit. The new real-paper regression covers the WEAR
lead/affiliation split. Extraction-corpus suite passes 77 tests; full Vitest
passes 399/399; typecheck, lint, and diff-check pass. The optional native PDF.js
canvas binding warning remains in test output.

Next: build and test a generic translation-unit strategy for list leads plus
their items without flattening unrelated lists; review v23 accepted and
post-model-fallback rows for semantic false accepts/avoidable rejects; then
refresh the multi-paper benchmark and continue manual review and verified OA
corpus expansion.

This audit makes real-paper translation failures reproducible without adding
copyrighted PDFs or translations to Git. The catalog is
`test-fixtures/real-papers/catalog.json`; PDFs and generated source/translation
pairs live only in the ignored `test-data/real-papers/` directory.

Run `npm run fetch:real-papers`, start the local translation server, then run:

```bash
npm run bench:real-paper-translation -- --paper ozchi-finger-specific-touch --limit 8
```

The evaluator runs the production `extractFromPages` Canonical pipeline, sends
sampled projected paragraph blocks to the running MADLAD server, and writes
both JSON and Markdown review queues in `test-data/real-papers/reports/`.
Every row records source, Japanese output, page span, structural warnings,
scientific invariants, token counts, and automatic quality score. Automatic
checks are triage only; semantic equivalence requires source/translation review.

## Extraction checkpoint (2026-09-16)

The current extraction branch was revalidated after the x-band source-integrity
regression: reading-order focused tests are 55/55, the real-paper extraction
corpus is 56/56, and TypeScript, lint, and production web build all pass. The
new regression only asserts native-text preservation; it does not widen role
classification. No translation server or packaged app was changed.

Table-row evidence now also permits a split, label-only row when an independently
table-like native block immediately precedes it and the two bounding boxes share
at least half their horizontal span. This remains geometry-only and is guarded
by a narrow vertical gap; the corpus remains 56/56 after the change.

The page-top caption guard was validated against the medical meta-review. It
raises table-region recall from 0.571 to 1.000 without changing the 56/56
extraction-corpus result. Table continuation-page recall remains 0.571 and is
still an extraction task; translation-server behavior is intentionally unchanged.
Resolver diagnostics also show the proximity window can attach later table
captions/rows to an earlier region (visible in the medical Table 1 trace). This
precision risk is hidden by the incomplete-annotation recall metric and is the
next extraction issue to resolve.
The resolver now stops cross-page member collection at the next table caption;
the medical Table 1 diagnostic no longer includes later table labels. Corpus
tests remain 56/56; continuation-page recall is unchanged at 0.571.
Long sentence-shaped candidates ending in punctuation are now excluded from
table-row evidence, preventing prose from entering a table region. Tests remain
56/56 and no translation code was changed.
Region members with roles that cannot be table rows (heading, title, footnote,
chrome, author, affiliation) are also excluded while native table headers stay
eligible. The medical diagnostic no longer links the section heading to Tables
2/3; extraction tests remain 56/56.
When multiple table captions share a page, same-page row candidates are now
bounded to the interval after the current caption and before the next one;
focused diagnostics show Table 1 no longer cross-links adjacent tables.

### v23 accepted-output manual review (2026-09-20 19:01 JST)

A source-to-Japanese review was completed for all five accepted ordinary-body rows in the 20-row v23 wear-scale diagnostic. All five had a severity-2-or-higher issue (2/5 severity 3); the sample unsafe false-accept proportion is therefore 5/5 **within this purposive accepted subset only**, not a corpus estimate. Two severe false accepts changed wearable-product concepts to web-application/web-browser concepts. Other issues included an author-name/citation error, a terminology shift in product availability, and omission from the subjective-norms definition. The review artifact is [`reports/semantic-review-v23-wear-scale-accepted.json`](test-data/real-papers/reports/semantic-review-v23-wear-scale-accepted.json). Model quality score was 1.0 for the two severe rows, demonstrating that current automatic checks do not measure semantic correctness. No blacklist or production gate change was made.

Offline M2M100 same-source comparison: the same five ordinary-body source strings were run with cached `facebook/m2m100_1.2B`, deterministic greedy decoding, and offline HF mode. Manual comparison found severity >=2 in 2/5 (both severity 3), versus 5/5 for MADLAD’s previously accepted outputs. M2M100 preserved the wearable-product concept in one block where MADLAD hallucinated web application development, but truncated the literature-review block and omitted the second sentence in the Dimension 7 block. Do not deploy it as a fallback model on this evidence. Full inputs, outputs, tokenizer-specific token counts, timings, and per-row labels: [`reports/model-quality-m2m-v23-wear-accepted.json`](test-data/real-papers/reports/model-quality-m2m-v23-wear-accepted.json). This is a 5-row, one-paper exploratory comparison; M2M100 and MADLAD token counts use different tokenizers and their generations were not run in the same process.

This confirms a decode/semantic-validation problem in addition to the extraction/list-boundary fallback: correcting source structure alone does not make accepted Japanese reliable. Next evaluation should include blind manual review of accepted outputs from multiple disciplines, then evaluate general semantic checks or alternate models against a held-out set before changing production routing.


### v24 fresh multi-paper evaluation (2026-09-20 19:25 JST)

A no-resume fresh run completed on the same four papers and maximum 12 sampled units/paper as v20: HCI/ACM Thermal Earring, ergonomics/Springer WEAR Scale, neuroscience/Nature rule-following, and linguistics/arXiv syntax-prosody. Run ID `2026-09-20T10-06-01-548Z`; report: [`reports/translation-audit-v24-fresh.json`](test-data/real-papers/reports/translation-audit-v24-fresh.json). All 48 rows completed, with no server request errors. The server returned MADLAD `3b-mt-v5-semantic-v71-strict-restore-v20` for 25 model-submitted units; 23 rows were pre-model decisions.

Automatic report counts: 35/48 reader-visible fallback (23 pre-model, 12 post-model); automatically categorized ordinary-body rows 15, of which 5 fell back (33.3%). v20 had 5/17 (29.4%), so this is **not an improvement**. The ordinary-body denominator changed because the PDF candidate set/source categories changed; all 44 overlapping stable keys kept byte-identical source, translation, and accept/fallback decision. The aggregate rates are descriptive and not directly comparable enough to infer model regression or gain.

All 13 v24 accepted outputs were manually compared to source. Among 10 rows automatically categorized ordinary body, 6 had severity >=2 (60% conditional unsafe false-accept sample); 2 had severity 3–4. Across all accepted rows, 8/13 had severity >=2. This is a small purposive sample, not a corpus rate. Severe examples: wearables became “webinar/web-site” concepts in an aesthetics paragraph (quality score 1.0); a linguistics paragraph about role-pair comparisons was truncated/semantically broken; a source typo contrasting objects with objects was preserved while “spurious significance” became “false meaning”. Full labels and excerpts: [`reports/semantic-review-v24-fresh.json`](test-data/real-papers/reports/semantic-review-v24-fresh.json).

The same five sources were also compared with cached offline M2M100-1.2B: 2/5 severity >=2, including two severe truncations. It avoided the wearable-to-web hallucination in one row but is not a safe replacement/cascade candidate. This result is in [`reports/model-quality-m2m-v23-wear-accepted.json`](test-data/real-papers/reports/model-quality-m2m-v23-wear-accepted.json). No production code, gate, or model routing was changed.

## Initial local sample (2026-09-07)

The local cache contains the established HCI/wearable corpus plus public
arXiv papers for HCI research methods, cognitive psychology, quantitative
marketing, human factors/ergonomics, and computational linguistics. The first
manual pass found the same failure classes across fields.

| Failure class | Observed in | Cause | Safe current handling |
| --- | --- | --- | --- |
| Fluent phrase loop / unrelated concept | HCI and linguistics | greedy decoding can repeat a valid Japanese phrase while replacing the source concept | detect repeated multi-character spans and fall back to original |
| Incomplete source fragment | OzCHI, marketing, ergonomics | page/column boundary or header interruption produces a non-sentence block | do not send continuation-shaped text; show original until extraction is repaired |
| Chrome mixed into body | OzCHI, marketing | permission or running arXiv material became part of a paragraph before role resolution | keep the mixed block untranslated; repair line/block boundary separately |
| Flattened list | HCI methods, linguistics, cognitive tasks | PDF bullets were combined into one paragraph, so list items compete in a single decode | split multiple bullet items into independent translation units and restore bullet markers after translation |
| Numeric/probability loss | cognitive psychology, OzCHI | long lists and result summaries can drop values even if Japanese is fluent | existing invariant score rejects critical loss; list structure reduces the trigger |

The evaluator intentionally includes unsafe examples in its review queue. A
passing quality score does not mean the source was complete; source-boundary
checks run in the import policy before a block is submitted to MADLAD.

## First full run (2026-09-07, semantic-v3)

The local corpus had 18 catalog records, of which 16 PDFs were available (the
Wearable Acceptability URL failed and one publisher URL returned a different
paper, so that record is explicitly blocked). The audit sent two deliberately
spread samples per available paper: 32 source blocks in total.

| Production decision | Blocks | Interpretation |
| --- | ---: | --- |
| Accepted | 23 | The automatic guard found no structural or invariant failure. These remain a manual semantic-review queue. |
| Original before model | 9 | Continuation, chrome, or other unsafe source boundary was detected. |
| Original after quality gate | 9 | The generated output had a phrase loop, numeric/invariant loss, language failure, or another quality failure. Categories overlap because the audit deliberately probes unsafe input. |
| Score below 0.80 | 6 | Clear automatic preservation failures; the remaining quality fallbacks were caught by the phrase-loop detector, including repeated short Japanese propositions. |

The audit caught concrete failures in every priority area: HCI phrase loops;
cognitive choice-list number loss; marketing page-spanning contamination;
ergonomics and wearable-HCI continuation fragments; and OzCHI permission-text
interleaving. This establishes that the failure is cross-disciplinary rather
than a PDF-specific exception. It does not prove that the 23 accepted rows are
semantically perfect; those rows are the next human review set.

## Phase 2 protocol

Phase 2 targets at least 50 verified PDFs and 12 section-stratified blocks per
paper. The review command below materializes `audit-manual-review.json` and
`audit-progress.json` under ignored `test-data/real-papers/`; it preserves
completed labels across benchmark reruns.

```bash
npm run bench:real-paper-translation -- --limit 12
npm run audit:prepare-review
```

Every row must receive one or more labels, severity `0`–`4`, a primary cause,
optional secondary causes, and a recommended general fix. Aggregate metrics
must use these labels: an automatic accept with manual severity at least `2`
is an unsafe false accept. A production fallback with a manually correct source
is a false reject.

## Phase 2 reviewed result: HCI course material (12 blocks)

Manual comparison found **two unsafe false accepts**: a malformed course
sentence accepted as fluent Japanese, and a page/paragraph fragment beginning
with `data.` accepted as `データ。`. Both have severity 3 and primary cause
`paragraph reconstruction`; this is evidence that source completeness must be
evaluated before translation, rather than only by Japanese output quality. Two
MADLAD repetition failures (severity 4) were correctly rejected after decode.

## Phase 2 reviewed result: cognitive psychology (12 blocks)

The arXiv cognitive-psychology paper adds a distinct high-risk format: prose
interleaved with figure labels, choice lists, and statistical notation. Manual
comparison found that all seven automatically accepted blocks had a severity
of at least 2. This is a small, deliberately risk-stratified sample and is not
a field-wide rate. It does establish three general failures that need upstream
work: figure-label/body merging, incomplete paragraph acceptance, and
terminology drift such as translating *vignette* as a material rather than an
experimental scenario. Four model outputs were safely rejected after decode,
including a long phrase loop and numeric/list corruption.

At this checkpoint the durable manual queue contains 57 rows and 24 completed
reviews. Across those completed, the provisional unsafe false-accept rate is
75% (9 of 12 accepted rows); the rate is intentionally not generalized until
ordinary-body samples and more publisher formats are reviewed. The machine
readable metrics are regenerated with:

```bash
npm run audit:prepare-review
npm run audit:summarize-review
```

The scripts merge every atomic `translation-audit-*.json` checkpoint, retain
existing human labels, and write ignored progress/metric files so a stopped
run can resume without losing reviewed rows.

## Phase 2 checkpoint: 48 reviewed blocks

The first four 12-block strata now cover HCI methods, cognitive psychology,
quantitative marketing, and ergonomics/iHCI. The durable queue has 75 rows;
48 have manual labels. The provisional aggregate has an extraction-induced
error rate of 54.2%, while the unsafe false-accept rate is 66.7% (12 accepted
blocks are severity 2 or higher). These numbers are not representative
prevalence estimates because the sampling intentionally includes risky
sections; they are evidence that accepted Japanese alone is not a safety
criterion.

The clearest cross-format finding is that paragraphs beginning or ending in a
continuation, figure/table layouts flattened into prose, and chrome/body
mixtures must be resolved before translation. The current pre-model fallback
prevents many of these from reaching users, but it also has a provisional 10%
false-reject rate. The next work remains broader corpus coverage and fixing
general paragraph/region reconstruction rather than tightening a Japanese
output blacklist.

## Implemented audit-driven repair: page wrap around a figure caption

The Power-over-Skin regression exposed an incomplete paragraph ending on page
1 right column (`...patch which logs`), a Figure 1 caption, then page 2 left
column beginning `data, and ...`. The previous resolver kept the caption
separate but also prevented the two paragraph pieces from meeting. The layout
merger now searches past figure/table caption blocks when both adjacent
paragraphs are clear continuations, and recognizes the normal right-column to
next-page left-column reading-order wrap. It still requires an incomplete
predecessor and continuation-shaped successor.

On the real PDF, the standalone `data, and ...` block fell from one to zero;
the repaired canonical paragraph spans pages 1–2. The figure caption remains
a separate block. Reading-order regression tests and the production build pass.

## Implemented audit-driven reliability fix: isolate quality fallback

The first `thermal-earring` audit returned HTTP 500 because one degenerate
MADLAD decode raised through the microbatch scheduler and aborted every item
in its request. A quality rejection is expected control flow: it must preserve
that source block, not make the translation service unavailable. The scheduler
now returns an original-text result only for the affected item; the existing
client quality gate treats that source echo as a fallback while independent
items continue. The same paper subsequently completed all 12 audit rows, and
the translation-server microbatch and segmenter suites pass 14 tests.

## Implemented audit-driven guard: flattened layout labels

The cognitive-psychology regression contained a paragraph where diagram labels
were flattened into `Linda Cab Hospital Toma Test Wason ...`. It was previously
accepted and rendered as a misleading Japanese sentence. `shouldTranslateParagraph`
now treats a run of at least five title-cased labels followed by ordinary prose
as an incomplete layout unit. This is a structural rule rather than a
paper-specific vocabulary list. On the identical real-PDF benchmark, the row
changed from model submission/acceptance to `wouldSubmitToModel: false`; it is
now preserved as source text until the figure region is reconstructed.

## Implemented audit-driven fix: duplicate list markers

The HCI design-paper audit found valid list content rendered with duplicate
markers such as `• - item` and `• • item`. The semantic segmenter already
keeps list items separate, but MADLAD can preserve a marker while the joiner
also restores one. The joiner now removes only a leading model-generated list
marker before adding its single canonical source marker. The translation-server
segmenter suite passes eight tests in the same virtual environment used by the
local server.

## Phase 2 checkpoint: 60 reviewed blocks

The five priority disciplines now each have a 12-block manual stratum. The
overall provisional unsafe false-accept rate is 64.3%; 46.7% of reviewed input
was automatically accepted and 46.7% had an extraction-induced label. The
computational-linguistics stratum is comparatively clean structurally, but it
still exposes decode-time repetition and loss of mathematical detail. This
confirms that input validation and decoder quality guards address separate
failure layers and both must remain in the pipeline.

## Next corpus work

1. Add an OA biomedical/clinical article and a journal-publisher PDF with
   complex tables when stable direct PDF URLs are found.
2. Turn manually confirmed audit rows into copyright-safe fixtures made of
   short metadata and synthetic structural analogues, never copied full PDFs.
3. Measure block-level false-accept and false-reject rates after each change.
4. Improve upstream page/column stitching and chrome separation rather than
   relaxing the safe original fallback.

## Continuous audit checkpoint: all locally cached PDFs

The audit runner now processes every cached catalog PDF that lacks a complete
12-block atomic checkpoint, then rebuilds the human-review queue before moving
to the next paper. This avoids treating a completed collection pass as the end
of translation-quality work: all 16 locally cached PDFs are now benchmarked,
and the queue contains 193 source/translation comparisons, of which 84 have
manual labels at this checkpoint. The runner log and queue are ignored runtime
artifacts; the runner itself is `scripts/run-pending-translation-audit.mjs`.

## Implemented audit-driven guard: literal decode byte escapes

The SpeeChin abstract was accepted despite containing literal decoder byte
escapes (`<0xE9><0xA0>...`) inside an otherwise Japanese output. This is a
model decode failure, not a valid proper noun or a paper-specific word. The
translation quality gate now classifies any such byte-escape token as
degenerate output, so the existing fallback retains the English source. On
the same real-PDF benchmark row, the production decision changed from accept
(`0.911`) to original fallback (`0.761`, with `degenerate output`). A unit test
covers the general pattern; quality tests and the production web build pass.

## Implemented audit-driven repair: prose-bearing table rows

The education survey exposed two table failures that text-only checks could not
reliably identify. A system-description table joined a short left cell with
long prose right cells; a book-list table joined title, author, year, publisher,
and page-count cells. Both were projected as paragraphs and were submitted to
MADLAD, allowing fluent but fabricated Japanese to be accepted.

Generic table evidence now recognizes repeated native multi-cell rows with a
separate indented description column, in addition to the existing short/numeric
cell grid. This evidence receives a high table score only when the geometry is
present; the resolver otherwise keeps its paragraph fallback. Re-running the
same education PDF removed both problematic source rows from the 12-block
paragraph translation sample. The result protects the reader from translating
flattened table cells while preserving ordinary prose for translation.

## Implemented audit-driven guard: editorial-date bylines

The Scientific Reports sample contained an author byline joined with
`Accepted: 27 December 2017`. It was incorrectly handled as a paragraph and
translated into a fictional Japanese biographical event. Paragraph input
validation now excludes editorial-state date markers (`Accepted`, `Received`,
`Revised`, `Published`, and `Available online`) with a full date. This is
publisher-agnostic metadata detection, not an author-name blacklist. The
same-PDF rerun removed that byline from model submission; the quality suite
now includes a regression test for it.

## Continuous audit checkpoint: semantic units and scientific identifiers

The PMLR economics PDF exposed two distinct safety failures. A flattened inline
list, `(1) …; (2) …; (3) …`, was sent as one translation unit, allowing the
decoder to omit conditions. The shared segmenter now isolates an inline
numbered list only when two or more ordinal markers are present; the source
round-trip invariant remains intact. This is separate from bullet handling and
covers ordinary academic limitation/result lists.

The same audit showed that a fluent result could omit a method or metric
acronym such as `MSE`, `NPIV`, or `DeepIV`. Acronym loss is now a critical
scientific-invariant failure in the production gate, so it selects the original
source rather than accepting a changed research claim. Author-year parenthetic
reference groups are protected atomically to preserve authors and years. A
trial that also placeholder-protected every short acronym was rejected during
validation because MADLAD could move those placeholders to the end of Japanese
sentences; that unsafe rule was not retained.

The translation cache identity is now `3b-mt-v5-semantic-v3`, matching the
server, so translations created before these segmentation and preservation
rules are not reused. Regression coverage: 29 Python translation-server tests
and 28 TypeScript quality tests.

## Continuous audit checkpoint: inline enumerations

The PMLR inline-list regression was run against the live development server
after detaching ordinal markers before decode. The previous output fabricated a
sequence from `(1)` through `(13)`; the new output retains exactly `(1)`, `(2)`,
and `(3)` without synthetic entries. The remaining mistranslation of `IV` is
correctly rejected by the strengthened acronym invariant, so it cannot be
stored as a fluent but false translation. This is intentionally a safe fallback
until a general terminology strategy can produce a faithful Japanese expansion.

## Continuous audit checkpoint: omission and interleaved numeric cells

Manual review found a severity-4 accepted omission: an 803-character,
multi-sentence cognitive-psychology paragraph was rendered as a 16%-length
Japanese summary. The long-source guard now rejects outputs below 20% only
when the source is at least 500 characters; the corpus's manually correct
long translations bottom out above 22%. The stored failure now receives the
production original-fallback decision. A separate source-input rule blocks a
lowercase word split by a standalone numeric cell (`dol- 2 lars`), which is
geometry/table contamination rather than valid hyphenation.

## Continuous audit checkpoint: incomplete physical blocks

Three previously accepted severity-3 source fragments share a layout-independent
signature: a lower-case sentence tail at block start (`data. This procedure …`)
or a final noun phrase cut after words such as `the entire`. The input validator
now retains these original blocks until upstream paragraph stitching repairs
them. Along with the existing title-label and numeric-cell guards, this turns
the audited `Linda Cab Hospital …`, `Mean regret … dol- 2 lars`, `data. This
procedure …`, and `Looking at the entire` cases away from model submission.

## Continuous audit checkpoint: lower-case continuation repair

A remaining accepted Power-over-Skin fragment began `substantially improves …`:
it is the continuation of a preceding sentence, not a grammatical paragraph.
The input policy now holds long lowercase-start blocks for upstream stitching,
while explicitly allowing common lower-case discourse abbreviations such as
`e.g.` and `i.e.`. This is a source-boundary rule, independent of paper title
or vocabulary. The quality suite has 34 passing tests and the production web
build passes after this change.

## Continuous audit checkpoint: negated scientific claims

A marketing/consumer-behavior regression accepted a translation that dropped
`does not consider x to be important`, reversing a premise of the utility
analysis. The quality gate now treats explicit English negation without a
Japanese negative marker as a hard preservation failure. It recognizes
predicate negation, `cannot`, `never`, `without`, and lack/absence wording,
while avoiding `not only` as a false signal. The stored regression now selects
original fallback; paired positive and negative Japanese tests prevent an
over-broad rejection.

## Continuous audit checkpoint: bounded long-clause segmentation

For a sentence longer than 360 characters, the semantic segmenter may now split
at a top-level semicolon only when each side has at least 100 characters.
Citation groups are protected before scanning, so author-year semicolons cannot
be used as a boundary. This improves long multi-clause prose without returning
to global semicolon splitting. Captions with only a short leading semicolon
remain pending for structure-aware caption handling.

## Continuous audit checkpoint: figure-caption lead preservation

The pending caption case is now covered without a paper-specific rule. For an
otherwise overlong caption whose short lead has the structural shape quoted
work title + `Fig.`/`Figure` identifier + semicolon, the segmenter emits that
lead as one unit and translates the remaining descriptive sentence separately.
The rule is only considered after ordinary top-level safe-clause boundaries and
requires at least 120 characters after the boundary.

A live development-server regression used the previously severity-3 `Traces`
caption. Its earlier stored translation ended after the general discussion of
jewellery and omitted the material description. With model version
`3b-mt-v5-semantic-v3`, the output retains the porcelain pearl, porcelain
clasps, velvet, and etched contours/folds/hinges. The Japanese still needs
terminology review, but the omission has been removed. Regression coverage is
33 Python translation-server tests and 36 TypeScript quality tests; the
production web build passes.

## Continuous audit checkpoint: complete sentence boundaries and decode loops

A wearable-computing paragraph exposed a semantic-unit bug: `_merge_fragments()`
joined every sentence beginning with a connective, including the complete
purpose sentence `To decrease form factors further, …`. MADLAD consequently
omitted that claim. The merger now joins only sub-four-word fragments and
standalone references; a terminal punctuation boundary is otherwise retained.
The live regression now includes the formerly missing claim.

A separate CHI course-description regression isolated a decoder loop, not an
extraction or batching fault: one complete parallel sentence (`how to …, how
to …, and how to …`) caused greedy decode to repeat the same Japanese phrase.
`no_repeat_ngram_size=4` is now applied in both sequential and micro-batched
generate calls. On the same live source, the repeated phrase disappeared and
the output retained every course topic. Cache identity is now
`3b-mt-v5-semantic-v4`; old outputs cannot be reused after this decode change.

## Continuous audit checkpoint: typographic quotation scanner

A severe cognitive-psychology regression was traced to the segmenter's quote
state rather than to the model: opening `“` and closing `”` had been treated
as different toggles, so one quoted problem name suppressed every later
sentence boundary. A 1,575-character paragraph was therefore submitted as one
unit and returned only its first sentence. The scanner now tracks paired
straight and typographic quotes and ignores apostrophes inside words. The same
source produces nine translation units and a 400-token output instead of a
38-token output. Cache identity is now `3b-mt-v5-semantic-v5`.

The revised output still compresses details of the final hospital vignette.
Its missing numeric/citation invariants cause the existing client quality gate
to keep the original instead of storing a misleading partial translation. This
is an unresolved long-sentence semantic-fidelity case, not represented as a
successful translation.

## Continuous audit checkpoint: quote-state generalization

Two additional cognitive-psychology blocks with quoted task names confirmed the
quote-state repair is general: their prior outputs contained only an opening
sentence, while the revised server translates the full sequence of task
sentences. One output still repeated `machine` and is rejected by the existing
degenerate-output gate. Another passes formal checks but translates
`vignette-based` as `ビニールに基づく`, a terminology/semantic error. This is
recorded as a remaining false-accept pattern: structural and invariant checks
cannot establish the Japanese meaning of an ordinary English research term.

## Continuous audit checkpoint: source-preserving relative clauses

A long `…, in which participants are asked …` sentence was still decoded as a
partial translation even after ordinary sentence segmentation. The segmenter
now represents a Translation Unit with an exact source slice and a separate,
aligned model input. For long scholarly entities (problem/task/study/experiment/
method/model/system/case), the source remains round-trip reconstructible while
the model receives the relative clause as `In this context, participants …`.
On the hospital-problem regression this restored the hospital comparison and
60% condition; output tokens increased from 400 to 465.

The same source exposed native-text superscript citations concatenated to a
preceding quoted term (`problem”16 (`). These are now protected as inline
footnote citations and evaluated as critical invariants. Cache identity is
`3b-mt-v5-semantic-v7`.

## Continuous audit checkpoint: source-preserving predicate lists

The cognitive-psychology audit found a serious false accept in an otherwise
well-formed abstract. The source sentence described four positive GPT-3
behaviours after a colon, but greedy MADLAD emitted only the lead sentence and
silently omitted all four facts. The existing quality gate accepted it because
there were no numeric or citation invariants to lose.

`TranslationUnit` now recognises only a narrow high-confidence structure: a
long colon-led list with an explicit technical/model subject and at least three
substantial coordinated predicates. It retains exact source slices and commas
for round-trip reconstruction, but supplies independent model inputs by
repeating the already-present subject (`GPT-3 solves …`, `GPT-3 is able …`).
This is not a general comma splitter.

On the real `Using cognitive psychology to understand GPT-3` regression, model
version `3b-mt-v5-semantic-v11` retains all four claims: vignette-task
performance, decisions from descriptions, multi-armed-bandit performance, and
model-based reinforcement-learning signatures. The preceding version emitted
none of those details. Source-grounded terminology normalization also maps the
observed model homophones only when the English source supplies the term:
`vignette` → `ヴィネット` and `multi-armed bandit` → `多腕バンディット課題`.

The remaining false accepts are now narrower semantic errors inside otherwise
complete sentences (for example awkward paraphrase or a wrong ordinary term).
They cannot be treated as equivalence merely because the formal invariant gate
passes, so manual semantic review remains required.

## Current resumable state (2026-09-10)

- Development server: `127.0.0.1:8766`, `3b-mt-v5-semantic-v11`; the installed
  app server on `8765` is deliberately untouched.
- Latest focused real-paper audit: 12 blocks from
  `cognitive-psychology-gpt3`; 3 pre-model structural fallbacks and 4
  post-model quality fallbacks remain safety fallbacks.
- The next audit pass should run the v11 regression set across completed
  disciplines, then continue OA corpus expansion and manual labels. Do not
  count automatic accepts as semantic correctness.

## Continuous audit checkpoint: semantic-v11 cross-discipline regression

The v11 live regression completed without translation-server request failures.
It evaluated 19 of 21 selected catalog papers (two yielded no usable sampled
translation unit in this run), spanning 204 translation units. The automatic
results were: 34 scores below 0.80, 51 post-model original fallbacks, 66
pre-model input-policy fallbacks, and 82 units marked for structural review.

This is a safety and regression result, not a semantic accuracy claim. The
v11 predicate-list repair retained the previously omitted cognitive-psychology
claims, and no micro-batch mapping failure was observed. The next pass is to
manually label automatic accepts from this fixed v11 corpus, prioritising
accepted long sentences and discipline-specific terminology, then make only
source-grounded general repairs.

## Continuous audit checkpoint: title-case system identifiers

A Power-over-Skin abstract previously passed formal checks while dropping the
paper's named system and replacing it with a generic description. Hyphenated
Title-Case identifiers are now protected before generation and included in the
client-side scientific invariants. On the live `3b-mt-v5-semantic-v12` server,
the full abstract retains `Power-over-Skin` in the Japanese output. The rule
requires an initial Title-Case token, optional lower-case linker tokens, and a
later Title-Case token, so it targets named systems rather than ordinary
hyphenated prose.

## Continuous audit checkpoint: transparent layout chrome in paragraph repair

An HCI course-material PDF exposed a physical paragraph split across a page turn
and intervening layout objects: the preceding block ended `... the other inputs
the`, while the next body block began `data. This procedure ...`. The objects in
between were a figure caption, a small numbered footnote, and a repeated running
title that had been weakly classified as a paragraph.

The canonical layout repair now treats captions, true footnotes, small numbered
footnotes, and repeated short Title-Case running headers as transparent only
while searching for an immediately adjacent unfinished paragraph. It joins only
when the source has a grammatical continuation and the geometry supports a
same-page or page-wrap reading order. It does not synthesize missing text. The
real PDF now reconstructs the logical paragraph with `pageStart: 2` and
`pageEnd: 3`, including the exact source sequence `inputs the data. This
procedure ...`. A catalog-based real-PDF regression asserts that this logical
paragraph remains intact.

Focused v12 server audits were rerun for the cognitive-psychology and HCI
corpora. The former confirms that the previously omitted GPT-3 predicate list
is now represented as distinct source-aligned translation units. It also shows
why automatic acceptance alone is insufficient: fluent Japanese can still alter
ordinary semantic relations without losing numbers or citations. Those cases
remain in manual review; no source-specific output blacklist was added.

## Continuous audit checkpoint: per-unit omission guard

The server previously applied its decode check only after all sentence units had
been joined. A long paragraph could therefore pass when one unit was reduced to
a short fluent conclusion while neighbouring units translated normally. A live
v12 case contained a 174-character sentence describing the smaller comparison
group and its variance; MADLAD returned only a 26-character Japanese statement
that the probability was equal.

Semantic v13 now checks every substantial natural-language translation unit
before it is joined. It applies only to a source unit of at least 140 compact
characters and 18 English words, and rejects a Japanese output below 18% of
that unit's compact length. Labels, equations, identifiers, and short captions
are outside this guard. The server then returns the exact original for the
whole paragraph; the client recognizes source echo and records an original
fallback. This deliberately preserves a source-visible uncertainty rather than
storing a summary that removes experimental conditions. A live v13 request of
the regression unit now returns its 174-character original instead of the
26-character partial Japanese decode.

## Continuous audit checkpoint: request-isolated generation

Further v13 verification found that the per-unit guard was correct for a single
reader request but could be defeated when the microbatch scheduler flattened
units from unrelated paragraphs into one padded `generate()` call. The same
source paragraph then produced a fluent, incomplete Japanese output. This is a
batch-dependent decoder behaviour, not an extraction or terminology rule.

Semantic v14 retains scheduling and per-paragraph sentence-unit batching, but
never puts units from different logical paragraphs into the same model generate
call. The tradeoff is lower maximum throughput during large imports; it prevents
neighbouring request lengths from changing the translation of a research claim.
The real-paper audit now uses the same concurrent `/translate` scheduler path
as the reader rather than calling the server-only batch endpoint. On the
12-block cognitive-psychology audit, the previously unsafe 1,575-character
paragraph is now one explicit original fallback; seven translations were
accepted, four additional outputs were rejected by the existing client quality
gate, and no request failed.


## Continuous audit checkpoint: v14 request-isolated cross-discipline run

The v14 audit completed the 21-paper catalog traversal through the same
independent `/translate` scheduler requests used by the reader. Nineteen cached
PDFs yielded 206 section-stratified paragraph samples (up to 12 per paper).
`wear-scale` and `precious-materials` were not locally cached, so they are
explicitly pending rather than counted as translation failures.

Of the 206 samples, the model returned Japanese for 197 and returned nine
explicit source fallbacks. The production quality gate would accept 151
translations (73.3% of all samples), would reject 46 model outputs, and would
keep 52 samples as original before model submission under the input policy.
There were no HTTP/request failures. These are automatic structural and
invariant results, not semantic-accuracy claims: the accepted queue still
requires manual source-versus-Japanese review.

The cached disciplines represented in this pass include HCI, human factors,
cognitive psychology/decision making, marketing/consumer behavior,
linguistics/computational linguistics, education, neuroscience, economics, and
machine learning. The most conservative outcomes occurred in the ACM and
cognitive/economics samples, where long technical or multi-clause blocks more
often reached either source fallback or the quality gate. This is expected from
the v14 change: it prefers a visible original over a fluent partial decode.

The next audit step is manual labeling of v14 automatic accepts, beginning with
long technical paragraphs and the formats that still produce source fallbacks.
No output-word blacklist or paper-specific rule was introduced from this run.


## Continuous audit checkpoint: source-fact addition guard

Manual review of the v14 automatic-accept queue found a severe false accept in a
wearable temperature-data paragraph: the Japanese output invented `100mm` and
`10mm`, neither of which occurred in the source. The quality gate now compares
structured source facts in both directions. It still permits ordinary number
localization, but rejects an output that adds a measurement, statistical value,
citation, DOI, or URL absent from the source. The existing 151 automatic accepts
were re-evaluated without re-running the model: two are now correctly rejected,
the temperature measurement case and a malformed reference/URL output. This
changes the cache identity to `semantic-v15`; old accepted cache entries cannot
bypass the new source-fact check.


The live v16 server was also exercised with a medium two-claim semicolon
sentence. It emitted two independent Japanese propositions, retaining both the
encoder-only limitation and the pretraining-noise robustness claim. The request
reported 221 input characters and 79 output characters; this is evidence of
unit-level behavior, not a paper-specific fixture.


## Continuous audit checkpoint: unit-isolated decoding

The v16 paper rerun showed that safe segmentation alone did not change an old
fluent omission when all sentence units of one paragraph were padded into one
`generate()` call. v17 therefore isolates every semantic unit at decode time,
not merely every reader request. This intentionally trades import throughput for
source fidelity. The scheduler and ordering remain unchanged, and the cache is
versioned `semantic-v17`.


## Continuous audit checkpoint: identifier token boundaries

The v17 audit exposed a quality-gate false accept: `BERT` was considered
preserved merely because the output contained `DeBERTa`. Acronym and technical
identifier invariants now use complete ASCII-token matching, while preserving
normal Japanese-adjacent identifiers and grant names. The live long paragraph is
now rejected with `scientific invariants missing: BERT`; this is cache version
`semantic-v18`.


Re-scoring the 151 formerly accepted cross-discipline outputs with v18 moved six
to original fallback: two source-fact additions and four missing technical
identifiers (`pF`, `OpenAI`/`API`, `BERT`, and `IV`). Inspection found no normal
wording variant among these six, so the boundary rule did not show an observed
false reject in this corpus slice.


## Continuous audit checkpoint: incomplete trailing clauses

A wearable-systems sample ended `albeit with` at a physical page boundary but
was previously sent as complete prose. The input policy now retains blocks ending
in an unfinished coordinator or preposition (`albeit`, `although`, `because`,
`with`, `without`, `including`, and related forms) until canonical paragraph
stitching can repair them. This prevents the model from inventing a missing
complement; cache version `semantic-v19`.


## Continuous audit checkpoint: power measurements

Scientific invariant coverage now includes micro-, milli-, and watt power
measurements. A long wearable-device abstract that omitted `14.4 uW` is rejected
rather than accepted as a fluent size-and-weight summary. Overlapping acronym and
measurement matches are deduplicated before scoring. Cache version: `semantic-v20`.


A second incomplete physical block ended `varying between` and its old Japanese
output invented a 100–1000 W range. Comparative tails `between` and `than` now
join the input guard, so the source is retained until a canonical continuation
exists. Cache version: `semantic-v21`.


A neuroscience result block ended `when a rule was`; its old translation
confidently completed the missing condition. Blocks ending in a bare auxiliary
or copula are now retained as source, since no complete English proposition can
end there. This is a generic physical-fragment guard.


Cache version `semantic-v22` includes the bare auxiliary/copula input guard, so
previously stored translations for physical fragments cannot bypass it.


## Continuous audit checkpoint: long unterminated prose

The remaining fragment failures shared a structural signature rather than a
paper-specific phrase: long body-like source (>400 characters) without a final
sentence mark. v23 preserves such text unless it is explicitly a list item. On
the cached corpus this moves 13 model-bound blocks to original fallback, avoiding
completion of missing page/column continuations.


The initial v23 scan found two legitimate long interview quotations that closed
with a quotation mark rather than a period. v24 exempts a fully closed quote
(optionally followed by a bracketed speaker/source) from the unterminated-prose
guard. The audit now blocks 11 physical fragments, while retaining those two
valid quotations.


## Continuous audit checkpoint: current-rule versus stale-output separation

Manual review reached 86 of 305 queued blocks. A severe Thermal Earring abstract
was previously recorded as an automatic accept, although its Japanese output changed
the device into an unrelated object and omitted both `14.4 uW` and the 28-day
battery-life claim. Re-evaluating that exact cached output with v24 returns
`scientific invariants missing: 14.4 uW, 28` and rejects it. This is evidence that
the source-fact gate repairs a historic cache failure; it is not evidence that the
current decoder produces a correct translation. Future comparisons must separately
report stale-cache re-scoring and fresh v24 inference.

A second Nature-style abstract contained inline publisher chrome and omitted two
result qualifications in an accepted Japanese output. It is recorded as a severity-3
false accept with primary cause `MADLAD decode` and secondary `line grouping`. The
manual audit therefore continues to prioritise multi-claim abstracts and inline
chrome cases. At this still-small review coverage, the provisional unsafe
false-accept rate is 62.8% (27 of 43 automatic accepts); it is a risk signal, not a
population estimate.


## Continuous audit checkpoint: marginal publication metadata

A Nature-format regression showed `Published: xx xx xxxx` at x=9 sharing a
baseline with body text beginning at x=155. The previous y-only line cluster merged
the two, yielding invalid source for translation. The layout stage now keeps a narrow
left-margin item separate when it is materially detached from a full-width body line,
and filters standalone received/accepted/published date metadata as chrome. The
actual neuroscience PDF reconstructs the abstract without the publication marker.
This is a geometry-plus-document-metadata rule; it does not depend on a paper title
or an output blacklist.


## Continuous audit checkpoint: sentence-level compression fallback

Fresh v24 inference of the repaired neuroscience abstract still omitted the full qualification that cathodal stimulation increased rule following even for rules requiring financial loss or harm. Debug logging showed a correctly segmented 114-character, 18-word sentence decoded to 30 compact Japanese characters (ratio 0.263). v25 applies a conservative per-unit compression guard for prose at least 110 compact characters and 18 words when its Japanese output falls below 0.27. The same fresh request now returns a source fallback through the scheduler, rather than a fluent partial translation. The cache identity is `semantic-v25`.


Two fresh v25 control translations remained accepted: a 116-character wearable-systems sentence retained both `Power-over-Skin` and `IBPT`, and a qualitative-research sentence retained both author-year citations. These controls do not establish broad recall, but they show that the unit-compression fallback did not blanket-reject concise valid translations in the tested range.


## Continuous audit checkpoint: remaining decode-time additions

Fresh v25 inference of an HCI classroom-procedure paragraph still transformed the source statement that a hand-out is distributed into invented experiment results, evaluation, and knowledge accumulation. Source segmentation was complete and the output was not anomalously short, so neither the structural input policy nor the compression guard applied. It is recorded as a severity-4 `MADLAD decode` failure. No output-word blacklist was added; the next viable direction is a general semantic-preservation check evaluated against diverse valid translations before it can be enabled.


## Experimental note: round-trip semantic audit

A Japanese-to-English round trip of the v25 HCI decode exposes unsupported repeated additions (`results`, `evaluation`, `knowledge`, `decision`) that are absent from the source. A qualitative-study control round-trips its six participants, life-story content, and author-year citations faithfully. This is a promising audit signal for semantic additions, but it is not yet a production gate: long reverse translations can truncate and lexical overlap alone cannot establish entailment. The next measurement is a stratified false-reject study before any enablement.


The first stratified round-trip test used five manual severity-0/1 accepts and five severity-2+ accepts. A naive repeated-new-English-token signal had 0/5 true positives and 2/5 false positives. It is therefore rejected as a production guard; the artifact is retained only as negative experimental evidence in `v25-roundtrip-stratified.json`.


## Continuous audit checkpoint: ASCII chi-square and decimal p-values

The neuroscience methods audit exposed a gap in scientific-token protection: `χ2(3)=0.37` was not treated as a statistic, and the p-value matcher protected only `p=0` from `p=0.83`. v26 protects both ASCII and superscript chi-square notation and the full decimal p-value in both the server placeholder layer and client invariant layer. This is a general statistical-notation repair, verified by Python and TypeScript regression tests.


A live v26 request on port 8766 returned `χ2(3)=0.37,p=0.83` unchanged inside Japanese prose, confirming placeholder protection and restoration in the actual MPS model process.


## Continuous audit checkpoint: comma-style figure captions

Older proceedings use `Fig. 1, Caption…` rather than a colon. The caption detector now recognizes that form only when the text after the comma begins a title-like uppercase continuation, while retaining `Figure 2, the body…` as ordinary prose. On the real Design for Wearability PDF, Figures 1–7 now resolve as figure captions; lowercase-start Figure 8 deliberately remains paragraph until geometry supplies sufficient evidence.


A fresh v26 production-path audit of Design for Wearability sampled 12 paragraph blocks and sent eight to MADLAD. Comma-style Figures 1–7 were absent from the paragraph sample after canonical extraction; only lowercase-start Figure 8 remained, as intended by the precision-first rule. The v26 build completed after this extraction change.


## OzCHI table verification

Canonical extraction of the OzCHI regression PDF found Table 1–5 as table-caption relations. Tables 1, 2, 4, and 5 have aligned native-text regions at confidence 0.96. Table 3 has a caption-only table fallback at confidence 0.48, but it remains a table node rather than paragraph translation input.


## OzCHI heading hierarchy verification

Canonical CHILD_OF relations on the real OzCHI PDF place Phonebook Application Design, User Study, and Results under STUDY II; Proof of concept implementation, User Study, and Results are under STUDY III. The unnumbered subheadings are therefore preserved as hierarchy rather than flattened to a single level.


## Cross-page paragraph regression coverage

The physical-page continuation logic now has explicit regression coverage for the OzCHI-shaped case where a page ends in `… One` and the next page begins `exception …`: it produces one canonical paragraph with pageStart/pageEnd preserved. A neighboring negative case proves that an uppercase independent paragraph remains separate. This keeps the source-side repair precision-first; unproven continuations still fall back to the original rather than being guessed by MADLAD.


## Source-structure preservation notice

The input policy was re-measured against all 19 cached PDFs: 571 of 1,141 extracted paragraph blocks are withheld before model submission, including 386 unterminated physical fragments. These counts include expected chrome and bibliography skips, so they do not measure translation failure. For the subset withheld specifically because page/column/table structure is unsafe, projection now records a reason and the reader shows that the original is being retained rather than guessed. Reference and publisher skips do not receive this warning. A real Step-to-Charge extraction confirmed the metadata reaches reader blocks.


## Benchmark annotation semantics

The extraction benchmark previously treated an empty `headingHierarchy` in a partial fixture as an assertion that the document had no hierarchy. This penalized valid resolver relations and reported a misleading 0.50 mean. Empty arrays now mean unannotated; only fixtures with one or more annotated relations contribute. The current hierarchy measurement is therefore OzCHI-only and 1.00, rather than a cross-domain conclusion.


## Table and equation routing audit

A fresh 19-PDF extraction audit found no case where a high-confidence native-geometry table or equation candidate was resolved back to a paragraph. Four `Table N shows …` hits were ordinary prose references to tables, not captions; retaining them as paragraphs avoids a text-only table false positive. This evidence supports the existing precision-first resolver threshold, but does not prove table-region recall beyond the currently annotated OzCHI fixture.


## Physical fragment completion guard

A fresh production-path economics audit found a concrete source-fidelity failure: the physical fragment `… previous Theo-` was sent to MADLAD and decoded as `Theo-Dener`, a word absent from the source. A second fragment began `function approximation …` and ended `set to`. The input policy now recognizes trailing partial words, dangling prepositions, and short lower-case unterminated continuations; it preserves those sources with a structural warning. It distinguishes them from complete capitalized purpose sentences such as `To evaluate …`. Re-running the same 12 samples under v26 sent four safe inputs; both failure inputs were pre-model original fallbacks, with no generated translation.

The real-paper benchmark was also corrected to apply the same pre-model policy as import. Earlier audit rows that translated unsafe fragments are not production-equivalent and must not be counted as MADLAD failures.

## Continuous audit checkpoint: structured statistical parentheticals

A fresh neuroscience production-path audit found that a fluent result could retain `p=0.03` while dropping the linked `Fig. 7b`, `Mann–Whitney U test`, and `U=307`. This was a source-fidelity failure that the former invariant set did not describe. v28 treats a parenthetical containing a figure reference or explicit statistic as one atomic evidence span before decoding; individual figure/panel labels and bare uppercase rank statistics (`U=`, `W=`, `H=`, `V=`) are also invariants in the client quality gate. The rule is structural rather than paper- or vocabulary-specific.

A live v28 request preserved the complete source parenthetical: `tDCS(Fig. 7b, Mann–Whitney U test, U=307, p=0.03)。` The surrounding English was translated to Japanese. A fresh 12-block neuroscience production-path benchmark returned the same complete parenthetical in block `b-54f766b4`, where v26 had returned only `tDCSp=0.03。`. This preserves the evidential relation and prevents stale v26 cache entries from being reused through the `3b-mt-v5-semantic-v28` cache identity. This is a structural-fact repair; semantic terminology quality, such as the appropriate Japanese rendering of “selfishness,” remains an independent manual-review concern.

## Continuous audit checkpoint: borderline unit compression

The same neuroscience result paragraph exposed a second, independent failure after structured evidence was protected: its final 233-character, 33-word sentence was decoded as a 55-character Japanese conclusion, omitting the contrast that participants remained more consistent with free choices under anodal stimulation. The existing per-unit compression guard used `<0.27`; the observed ratio was `0.275`, so it passed. v29 raises this narrow threshold to `<0.28` for only substantial natural-language units (at least 110 compact characters and 18 English words). The existing compact-but-substantive control continues to pass.

A live v29 request for that sentence returned the exact 233-character source with zero generated tokens. A fresh 12-block neuroscience production-path benchmark marks block `b-54f766b4` as an original fallback instead of accepting its compressed Japanese paragraph. The benchmark totals are 7 submitted, 4 pre-model structural fallbacks, 7 original fallbacks, and 4 accepted translations; the overlap is expected because some post-model fallbacks originate among the submitted blocks. This prioritizes source completeness over a plausible but incomplete result statement.

## Continuous audit checkpoint: plural figure references

The marketing corpus contains prose such as `Figures 3, 4, and 5`. The original structural-fact matcher covered singular `Fig.` / `Figure` labels only. v30 extends the same generic figure-reference pattern to plural `Figs.` / `Figures`; this is cache-versioned and regression-tested in both the server placeholder layer and client invariant gate. The rule preserves the label plus its first panel number, while the existing numeric invariants retain the remaining listed values. No wording- or paper-specific rule was introduced.

## Continuous audit checkpoint: computational-linguistics coverage

A fresh v30 audit of the computational-linguistics / formal-language paper sampled 12 blocks: 10 were submitted, 2 were pre-model structural fallbacks, 5 used original fallback, and 6 translated outputs were accepted. CFG, NT, formulas, numerical labels, and list prefixes remained source-aligned in the sampled outputs. Manual review also found an accepted omission in `b-dd2088ed`: the rhetorical but meaningful opening sentence about examining attention patterns was absent while the following mechanism sentence remained. It is recorded as an unresolved decode-time omission. No broad short-sentence fallback was enabled from this single case, because that would need a stratified false-reject measurement across ordinary short academic sentences.

## Continuous audit checkpoint: abbreviation suffix boundary bug

The computational-linguistics omission was traced to the segmenter, not an unavoidable short-sentence decode: the prior abbreviation detector used suffix matching, so `mechanisms.` ended in `ms.` and was misclassified as the title abbreviation `Ms.`. The following sentence was then merged into one 272-character model input and its opening claim was omitted. v31 matches complete final tokens only; real abbreviations such as `e.g.` and `Ms.` remain protected, while ordinary words ending in the same letters produce a sentence boundary. A regression test covers `mechanisms. We …`; this is a language-general tokenizer repair, not an article-specific rule.

## Audit coverage note: ergonomics extraction-limited paper

The cached arXiv human-factors paper produced only one sampled paragraph candidate, an incomplete page-1 sentence: `Starting from … this paper analyzes … characteristics`. It was correctly withheld by the pre-model policy and no Japanese text was generated. This is evidence that incomplete extraction does not trigger model completion, but it is not a usable translation-quality sample. It is excluded from v31 discipline-quality conclusions and retained as an extraction-limited corpus item pending a separate reading-order investigation.

## Continuous audit checkpoint: cognitive-psychology v31 coverage

The v31 cognitive-psychology audit sampled 12 blocks: 8 model submissions, 4 pre-model source fallbacks, 7 original fallbacks in total, and 2 accepted translations. The accepted GPT-3/SI blocks preserved the sampled identifiers and numeric facts. The fallback count is not a semantic-error rate: it includes intentional source echoes after server-side safety rejection. This corpus remains useful for manual semantic review, but the present evidence does not justify loosening its source-completeness policy.

## Continuous audit checkpoint: HCI empirical-methods v31 coverage

The v31 HCI empirical-methods audit sampled 12 blocks: 9 model submissions, 3 pre-model source fallbacks, 3 original fallbacks, and 7 accepted translations. This mixed-layout empirical paper exercised procedure prose, participant descriptions, citations, and multi-column source reconstruction. It is a production-path sample only; accepted output remains queued for manual semantic review rather than being treated as a proof of equivalence.

## Continuous audit checkpoint: education / learning-analytics v31 coverage

The v31 education-learning-analytics audit sampled 12 blocks: 8 model submissions, 4 pre-model source fallbacks, 5 original fallbacks, and 7 accepted translations. This adds a single-column education format with tables, figures, and learning-procedure prose to the current production-path coverage. As elsewhere, accepted rows remain a manual semantic-review queue; the automatic acceptance count does not claim semantic equivalence.

## Continuous audit checkpoint: design-for-wearability v31 coverage

The v31 design-for-wearability audit sampled 12 blocks: 8 model submissions, 4 pre-model source fallbacks, 4 original fallbacks, and 8 accepted translations. Caption-shaped Figure 1–7 material remained outside paragraph translation after canonical extraction; one remaining Figure-shaped paragraph candidate was retained for manual review rather than used as evidence of universal caption recall. This confirms the precision-first routing behavior on a figure-heavy design PDF without claiming complete caption coverage.

## v31 full cached-corpus production run

The v31 production-path run completed for all 21 catalog entries (19 cached PDFs plus two explicit cache-missing entries). The generated aggregate report is `test-data/real-papers/reports/translation-audit.{json,md}`. Its automatic counts are an operational safety measurement, not semantic ground truth: source fallbacks include intentional protection against unsafe inputs and decoder-quality failures. The remaining high-value work is manual semantic review of accepted rows and investigation of extraction-limited PDFs; no automatic accept count is reported as a correctness rate.

## Continuous audit checkpoint: manual-review population and v33 structural safety

The manual-review queue was corrected to use only the completed whole-corpus report. Earlier per-paper checkpoint reports were from prior pipeline versions and must not be counted as current translations. Human annotations are retained only when paper, block, and source identity match; the current source, translation, and production decision are never overwritten by an old record.

The current v31 report contains 19 cached papers, 206 sampled blocks, and 85 automatic accepts. Manual comparison now covers 66 blocks overall and 33 current automatic accepts; 15 of those 33 accepts have severity 2 or greater (45.5%). This is a provisional, intentionally risk-oriented review sample, not a corpus-wide error-rate estimate. It demonstrates that automatic acceptance is still insufficient evidence of research fidelity.

Three general source-boundary failures were found in currently accepted output: a paragraph ending in `as` elicited an invented battery-life claim; clipped statistical prose ending in `and standard` was completed as a statement; and an unterminated quotation/parenthesis was translated as if complete. v33 treats trailing `as`, dangling statistical labels, and unmatched parentheses or quotation marks in nonterminal physical blocks as structural uncertainty and preserves the original. It also routes nonterminal mixed Korean-plus-English department/university affiliation lines as expected metadata. These are syntax and document-role rules, not paper- or output-word blacklists. The client cache identity and server segmenter version are both `3b-mt-v5-semantic-v33`.

## Continuous audit checkpoint: v34 calendar-year invariant

Manual review found a v31 automatic accept that rewrote `Prior to World War I` as an invented `1914年に発表された「時計の歴史」`; the source's actual calendar year was 1979. The prior guard recognized only ISO-like dates, and ordinary four-digit years were excluded from unexpected-fact comparison. v34 adds calendar years (1500–2099) as a protected invariant: output must retain source years and cannot introduce another year. A regression test confirms that a Japanese output retaining 1979 but adding 1914 is rejected. This catches a factual class rather than a particular phrase, while semantic substitutions with no durable source fact remain an unresolved decoder-quality limitation.

## Continuous audit checkpoint: v34-independent review and v35 incomplete introductions

Manual-review annotations are now tied to both pipeline version and exact translated output. A source/block match alone no longer carries a v31 judgment into a v34 result. The v34 production report contains 78 automatic accepts (down from 85 in v31), 74 pre-model fallbacks, and 54 post-model fallbacks across the 206 cached-corpus blocks. The v34 review starts as an independent sample; its first 17 cross-discipline accepts include 8 severity-2-or-higher failures.

One v34 false accept was a physical block ending `We present Thermal`. It translated the preceding complete sentences and silently discarded that uncompleted introduction. v35 classifies a nonterminal academic introducing verb followed only by the first capitalized name token as a structurally incomplete paragraph, so it retains source rather than asking MADLAD to infer the missing noun phrase. The rule is generic to `present/propose/introduce/develop/describe/evaluate/demonstrate/call`, is regression-tested, and does not reference a paper title.

## Continuous audit checkpoint: v36 chrome, panel, and delimiter boundaries

The first v35 review stratum found three source shapes that were accepted despite not being independent prose: a running header ending in a publisher page marker (`• 195:3`), a panel-caption fragment beginning `(b)`, and a definition/equation introduction ending in `:`. v36 classifies the first as expected non-prose and the latter two as structural uncertainty. All preserve the native source rather than allowing the decoder to silently omit the structural token or hallucinate the missing continuation. Tests cover each shape and retain normal completed prose. The next corpus run must measure the resulting false-accept reduction separately from the increased fallback count.

## v36 full cached-corpus production run

The v36 production-path run completed on 2026-09-12 against the local MADLAD endpoint `http://127.0.0.1:8766`. It covered 19 cached PDFs from the 21-entry catalog and 206 sampled blocks. Production decisions were: 72 automatic accepts, 80 pre-model structural/source fallbacks, and 54 post-model quality fallbacks. There were no failed requests. Compared with v35's 77 automatic accepts, v36 moved five additional rows out of the accept population; this is a source-fidelity improvement only for the affected structural cases, not proof that the remaining accepts are semantically correct.

The manual-review queue was regenerated from the v36 whole-corpus report. Fourteen exact source/translation comparisons carried forward; six of those fourteen current automatic accepts still have severity 2 or greater, for a provisional unsafe false-accept rate of 42.9% within the reviewed stratum. The reviewed failures are dominated by semantic shift and omission rather than explicit numeric, citation, or hallucinated-fact violations. This confirms the present boundary of the guard design: structural and invariant checks prevent many unsupported facts and damaged-source completions, but they do not yet prove semantic equivalence for fluent Japanese that contains no durable source facts.

Next work should focus on a generic semantic-drift signal that does not rely on banned word blacklists or paper-specific expectations. Candidate directions are sentence-level source/target coverage features, terminology preservation for content nouns and acronyms, and a conservative retry/fallback path for translations that compress or omit independent source sentences while passing invariant checks. The corpus should also expand beyond the current 19 cached PDFs before treating any rate as representative.

## Continuous audit checkpoint: v38 panel and comparison invariants

Manual review of v36 false accepts exposed two missing structural facts: a figure panel reference `Figure 1(a)` was reduced to `Figure 1`, and a statistical/model-comparison condition `(where y ̸= 0 when x = 0)` was omitted. v38 treats parenthesized figure panels and single-letter variable comparisons as scientific invariants in both the client quality gate and server-side placeholder protection. This is generic to academic references and mathematical conditions; it does not depend on the Speechin or marketing papers.

The first v37 verification also found that MADLAD can mutate placeholder glyphs, producing a leftover `ZZCΙT2ZZ` with a Greek capital iota in place of ASCII `I`. v38 normalizes common Latin-lookalike glyphs during placeholder restoration and rejects any leftover scientific placeholder on the client side. Regression tests cover both the server restoration and the client degenerate-output guard.

The v38 production-path run completed on 2026-09-12 against `http://127.0.0.1:8766`: 19 cached PDFs, 206 sampled blocks, 126 model submissions, 80 pre-model fallbacks, 54 post-model fallbacks, 108 original fallbacks, and 72 automatic accepts. The aggregate accept count is unchanged from v36, but the affected outputs now retain `Figure 1(a)` and `(where y ̸= 0 when x = 0)`. After regenerating the manual-review queue, 12 exact source/translation comparisons carried forward; four of those twelve current accepts remain severity 2 or greater, giving a provisional reviewed unsafe false-accept rate of 33.3%.

The remaining reviewed severe accepts are still mostly semantic shifts and omissions without stable numeric/citation facts. The next algorithmic target should therefore be a source/target coverage signal that detects dropped independent clauses or content terms without relying on output-word blacklists.

## Product target: fallback below 5%

The product target is now stricter than the earlier safety-first audit posture: reader-visible fallback should be below 5% for ordinary body prose while keeping unsafe false accepts near zero. A fallback-heavy system can be safer than a hallucinating one, but it is not a successful reading product if researchers repeatedly hit untranslated paragraphs. Future measurements must therefore separate body-prose fallback from intentional non-prose skips such as references, publisher chrome, tables, captions, equations, and damaged extraction.

Reaching this target likely requires a translation-engine comparison or cascade, not only tighter guards around MADLAD. The next benchmark layer should evaluate current MADLAD against candidate local/free-use English-to-Japanese engines on the same protected semantic units, then route each unit through the engine that best preserves source facts and sentence coverage. Any external or paid API option must be checked for free-tier availability before use; local/open-weight models remain the default candidate class.

## Continuous audit checkpoint: v39 fallback target and local model comparison

The product target now measures ordinary body prose separately from references, chrome, damaged extraction, captions, tables, and statistical prose. A fresh v39 production-path run completed on 2026-09-12 against `http://127.0.0.1:8766`: 21 catalog entries, 206 sampled blocks, 75 ordinary-body-prose rows, and 20 ordinary-body reader-visible fallbacks. Ordinary-body fallback is therefore 26.7%, still far above the 5% product target. All ordinary-body fallbacks are post-model failures; pre-model structure filtering is not the bottleneck for normal body prose in this run.

The v39 retry path adds rescue-only segmentation for two patterns observed to be recoverable without weakening the quality gate: coordinated `found that A and that B` findings, and top-level `; if so,` questions. A more aggressive rescue for `where ...` property clauses and appositive `a region ...` clauses was tested live and deliberately not enabled: it reduced fallback but produced unsafe semantic drift such as replacing receiver property lists with invented power-management claims. This is exactly the failure mode the product target forbids.

Local/free model comparison was started with Hugging Face open models. `Helsinki-NLP/opus-mt-en-jap` is Apache-2.0 and local/free, but failed the fallback-candidate test: after adding a fragmented-Japanese decoder-artifact guard, 0/20 ordinary-body fallbacks were acceptable. `facebook/m2m100_418M` and `facebook/m2m100_1.2B` are MIT-licensed local/free candidates and produced more fluent output, but manual spot checks still showed semantic drift and omissions. The 1.2B model passed the current automatic gate on 4/10 sampled MADLAD fallback rows, but this is not sufficient for production cascade because examples with statistics and terminology remain unsafe. Raw comparison outputs are saved in `test-data/real-papers/reports/model-cascade-*.json`, and the reusable harness is `translation-server/scripts/compare_fallback_model.py`.

The next blocker is not measuring categories anymore; it is semantic coverage. The next implementation should score whether independent source claims and content terms survive translation, then use that score to choose between MADLAD, retry segmentation, and any alternate local model. No external paid API has been added; any future external service must be rechecked for free-tier availability before testing.

## Continuous audit checkpoint: v40 reader-visible fallback and semantic coverage signal

The benchmark definition was corrected to separate server source echo from reader-visible fallback. The previous v39 figure of 26.7% ordinary-body fallback counted only rows where the server returned the source. It missed rows where the server produced Japanese but the client quality gate would reject it and show the original to the reader. The v40 report now records `readerVisibleFallback` and uses it for source-category summaries.

A fresh v40 run completed on 2026-09-13 local time against `http://127.0.0.1:8766`. It covered 21 catalog entries and 206 sampled blocks. Ordinary body prose has 75 rows, with 35 reader-visible fallbacks, all post-model. The correct ordinary-body fallback rate is therefore 46.7%, not 26.7%. This makes the product gap clearer: the current bottleneck is not pre-model input filtering, but translation recovery after MADLAD or the client gate fails.

A local/free semantic-coverage audit signal was added in `translation-server/scripts/evaluate_semantic_coverage.py`. It uses `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` through the existing Transformers stack and the production segmenter for source units. This signal is not a production gate. On 12 manually reviewed v40 accepts, safe rows had average minimum source-sentence similarity around 0.777, while severity-2+ rows averaged around 0.721. The separation is useful for review prioritization but too weak for hard rejection without causing false fallback. Full accept scores are saved in `test-data/real-papers/reports/semantic-coverage-accepts-v40.json`.

A candidate hard rule for orphaned invariant-only Japanese sentences was tested and intentionally kept as an audit reason rather than a production reject. As a hard gate it would reject common citation formatting such as a Japanese sentence followed by `[11]`, increasing reader-visible fallback instead of improving the product. The next step is to label low-coverage accepted rows manually and calibrate a content-coverage/cascade policy that reduces unsafe accepts without pushing ordinary-body fallback even higher.

## Handoff checkpoint: v49 stopped intentionally

Work was paused at the user's request with the pipeline/cache identity at `3b-mt-v5-semantic-v49`. All long-running processes were stopped after the pause request; no `tsx`, benchmark, translation-server, MADLAD, or Python server process remained after shutdown verification.

The latest completed full-corpus benchmark is v48, not v49. v48 covered 21 catalog entries, 19 cached PDFs, and 206 sampled rows. Ordinary body prose had 74 rows, 60 automatic accepts, and 14 reader-visible fallbacks, so the ordinary-body fallback rate was 18.9%. This is a real improvement over v43's 47.3%, but still above the 5% product target.

v49 adds a placeholder-leak guard for mutated scientific placeholders such as `ΖZCIt2ZZ`. Its unit tests, TypeScript check, and Python translation-server tests passed, but the v49 full benchmark was interrupted at 17 completed paper checkpoints and the report has `complete: false`. Do not use the partial v49 report as the authoritative corpus rate; rerun v49 to completion before comparing metrics.

The next audit step should add an explicit partial-source-fallback metric. v48's micro-batcher can preserve only failed translation units as exact English source inside an otherwise Japanese paragraph. That is safer than a hallucinated Japanese sentence, but it is not equivalent to a fully translated paragraph and should be measured separately before claiming product-readiness progress toward the 5% fallback target.

## Server-ready resume fix

A saved import/translation can now recover when the PDF was added before MADLAD was reachable. The ready hook scans persisted papers from the database, not only the in-memory library cache, and resumes papers that are still `translating`, `queued`, or `glossary`, plus `partial`/`failed`/`ready` papers that still have pending title, section, or retryable paragraph translation work. The app also keeps a low-frequency health poll after the initial 90-second sidecar wait fails, so a later successful server startup still fires the resume path without requiring the reader page to be opened. `resumeIncompleteTranslation()` now uses the configured `translationConcurrency` instead of hard-coding 8.

Verification passed: `npx vitest run src/test/importResumeServerReady.test.ts src/test/quality.test.ts src/test/resumeTranslation.test.ts`, `npx tsc --noEmit --pretty false`, and `npm run lint` with existing warnings only. A manual app-level check is still recommended: add a PDF while the translation server is unavailable, let the server become ready, and confirm the saved paper resumes translation from the library/project view.

## Handoff checkpoint: v50 stopped at user-requested paper checkpoint

The v50 current-source server was started on `http://127.0.0.1:8766` because the running `.app` server on 8765 reported the old `3b-mt-v5-semantic-v1` bundle. v50 changes the unit-level compression guard so a rescue-translated single claim may omit a leading reporting frame such as `Among other things they found that` without being rejected solely for length. The rule does not apply while the source still contains a coordinated `and that` claim, preserving the previous safety behavior for one-claim omissions.

Spot check: `interactive-jewellery b-828da077` changed from v49 `partialSourceFallback=true` with a 46-word English source span left inside accepted Japanese, to v50 `partialSourceFallback=false` with the rescued claims translated into Japanese. This improves readable output without counting hidden English source fallback as a full accept.

The full v50 benchmark was then started and stopped at the user's request after a clean paper checkpoint. The incomplete report currently has 6 completed paper checkpoints, 62 rows, and 3 `partialSourceFallback` rows; `complete` is `false`, so it is not an authoritative whole-corpus rate. The v50 dev server and benchmark process were stopped. The user's `.app` translation-server process was left running because it belongs to the open app, not this benchmark run.

## V51 partial source fallback guard

Status: implemented and partially measured on 2026-09-13T21:22:17+09:00.

The v50 audit exposed a false-accept class where a paragraph could be mostly Japanese while preserving one or more long English source spans verbatim. This made the product look better than it was: the row was counted as accepted even though a researcher would still see untranslated English inside the Japanese output. The detector that was previously benchmark-only now lives in production quality evaluation, and the benchmark imports the same detector. The server also rejects joined Japanese outputs that contain long unmodified source spans, so MicroBatch unit fallbacks cannot silently pass as completed translations. The translation cache identity was bumped to `3b-mt-v5-semantic-v51`.

A retry-only rescue for long `While ... , main clause` sentences was added because Thermal Earring block `b-01a329cd` showed that shape. The rescue fired in the live v51 server, but MADLAD still drifted on the rescued left clause, so the paragraph correctly remained fallback. This is useful evidence: at least this ordinary fallback is no longer primarily a semicolon/segmenter failure; it is a MADLAD decode/model adequacy problem under the current local engine.

Spot benchmark: `test-data/real-papers/reports/translation-audit-thermal-earring.json` with 12 sampled rows under v51. Partial source fallback dropped to 0, but ordinary-body fallback remained 2/3 for this paper. This is safer but not sufficient for the 5% UX target. The next required step is local/free cascade or replacement-model evaluation on v51 ordinary post-model fallbacks, not more hallucinated-word blacklists.

Verification: targeted Vitest suite passed 87 tests; `npx tsc --noEmit --pretty false` passed; `npm run lint` exited 0 with existing warnings; `npm run build` passed; translation-server unittest suite for microbatcher, segmenter, citation protection, and MADLAD quality passed 72 tests.

## V52 invariant and metadata refinement

Status: implemented and spot-measured on 2026-09-14T17:12:20+09:00.

The v51 whole-corpus audit showed two general false fallback sources in `hci-empirical-methods`: uppercase `NOT` was treated as a technical acronym invariant even though it was only emphatic prose, and a CHI conference date plus author byline blend was classified as ordinary body prose. V52 excludes common uppercase function words from acronym invariants and treats conference-date/byline blends as reference/chrome metadata.

Spot benchmark: `test-data/real-papers/reports/translation-audit-hci-empirical-methods.json`. Ordinary-body fallback improved from 2/6 in v51 to 0/6 in v52, with partial source fallback still 0. This is an aligned improvement because it reduces reader-visible fallback without weakening hallucination or source-span guards. It does not solve the broader target: v51 full corpus ordinary fallback was still 21/74 (28.4%), so v52 needs a full rerun and the remaining failures likely require local/free model cascade or replacement-model evaluation.

## V52 full corpus checkpoint — stopped at a clean boundary

- Report: `test-data/real-papers/reports/translation-audit.json` / `.md`
- Endpoint: `http://127.0.0.1:8766`
- Version: `3b-mt-v5-semantic-v52`
- Status: complete; 21 catalog entries, 19 evaluated, 2 missing cached PDFs (`wear-scale`, `precious-materials`).
- Reviewed translation rows: 206.
- Ordinary body prose: 54 accepted / 73 total; 19 fallback, fallback rate 26.0%. All 19 ordinary-body fallbacks are post-model.
- Partial source fallback: 0 across the full report, so the v51/v52 guard is working as intended.
- v52 improved the v51 ordinary-body result from 21/74 fallback to 19/73 fallback by removing two false fallback causes: emphasized `NOT` treated as an acronym invariant, and conference-date/author byline metadata treated as ordinary prose.

The process was stopped here because the full v52 benchmark completed and checkpoint files were written. The next useful step is not more safety gating; it is to inspect the 19 ordinary-body post-model failures and evaluate a local/free model cascade or replacement so ordinary readable fallback can move toward the <=5% product target without increasing unsafe false accepts.
### v53 identifier-preservation checkpoint

The translation server now protects generic technical identifiers with
camel-case or alphanumeric form (for example `iPhone`, `M2W`, and
`TQP3M9009`) before MADLAD decoding. This avoids treating a paper's method or
device name as a missing scientific invariant without adding a paper-specific
word list. The existing `SI Appendix` citation behavior remains unchanged.

Validation: Python citation/segmenter tests (57) and TypeScript quality tests
(61) pass. The model/segmenter cache identity is `3b-mt-v5-semantic-v53`.

### v53 local fallback-model evaluation

The two already-cached, local and permissively licensed alternatives were
evaluated on the eight ordinary-body rows that returned source fallback (the
audit contains 19 ordinary fallback rows, but only eight have a model-returned
fallback eligible for this harness). Helsinki-NLP/opus-mt-en-jap produced
severe word-order corruption and repetition across the sample, so it is not a
safe cascade candidate. Facebook M2M100 418M preserved more source structure,
but still showed truncation, terminology errors, and semantic drift in long
academic prose; it is also not safe to auto-accept without an additional
semantic quality gate. Raw outputs are retained in
`test-data/real-papers/reports/model-cascade-v53-opus-ordinary.json` and
`model-cascade-v53-m2m418-ordinary.json`.

No production model replacement was made from this experiment. This avoids
lowering fallback by accepting visibly incorrect Japanese. The next experiment
should test sentence-level resegmentation and a quality-scored cascade against
the same rows.

### v54 retry resegmentation

Added a conservative retry-only split for long units at top-level clause
conjunctions (but, however, while, which, and). Citation/parenthesis depth and
minimum clause lengths are required, so normal segmentation and source
round-trip fidelity remain unchanged. Cache identity is now
3b-mt-v5-semantic-v54; segmenter tests remain green.

Spot result: the v54 Thermal Earring rerun (12 sampled units) still has 1/3
ordinary-body rows accepted and 2/3 fallback, matching the earlier v51/v52
result. The retry split therefore does not by itself solve this representative
case; the remaining failures are model-decode/quality failures rather than a
proven sentence-boundary failure.

### v56 OzCHI verification

After restarting the development server with v56, the same OzCHI fixture
produced 0/2 ordinary-body fallbacks. The mixed bullet/prose block is now
represented as independent canonical blocks, so a failed bullet no longer
forces the following ordinary paragraph to fallback. This is a spot result;
 the full-corpus 5% target remains unverified.

### v57 audit checkpoint — stopped at user request

The v57 full-corpus run was intentionally stopped after the
`fashion-hybrid-cmf` paper checkpoint. Per-paper checkpoint state remains
available for resume; the aggregate `translation-audit.json` is marked
`complete: false` and must not be treated as a corpus result. The development
translation server remains healthy on port 8766 with model version
`3b-mt-v5-semantic-v57`.

### v58 page-boundary continuation refinement

Audit aggregation showed 11 fallback rows caused by incomplete paragraph
endings. The layout continuation predicate now accepts an uppercase next-page
fragment only when the preceding fragment is substantial and ends with a
syntactic connector such as `and`, `to`, `of`, or `which`. This targets wrapped
proper-noun and parenthetical continuations while avoiding generic uppercase
paragraph merges. TypeScript reading-order and quality tests remain green
(85 tests).

The v58 Thermal Earring spot rerun completed with 12 sampled units and 3
ordinary-body rows; 1 remained a server source fallback. This is consistent
with the prior spot result and does not yet demonstrate a corpus-wide fallback
reduction, so the full v57/v58 audit remains pending.

### v58 sampled corpus rerun

The completed v58 run sampled four units per catalog paper (21 papers, 71
rows). It contained 28 ordinary-body rows, of which 9 returned reader-visible
fallback (32.1%). This smaller stratified sample is not directly comparable to
the earlier 12-unit full report, but it confirms that the 5% target is not yet
met and keeps per-paper checkpoints in the generated report.

A direct retry of the longest remaining Thermal Earring discussion paragraph
still returned source fallback after v58. Server logs show several fluent
Japanese sentence decodes followed by rejected units and rescue attempts; the
failure is therefore a model/quality-gate decision rather than a page-boundary
fragment. The relaxed cross-language length guard did not make this case pass,
so further threshold loosening would not be a justified fix.

The v57 server was also checked with the fixed OzCHI citation sentence. A
direct `/translate` request produced a 32-token input and 44-token Japanese
output while preserving the complete author-year citation group; no
hallucinated numeric or citation content appeared in this run. This is a
single deterministic spot check and does not replace the stopped corpus
benchmark.

### v59 length-guard calibration experiment

Lowering the collapse-ratio guard from `0.20` to `0.15` made the reproduced
paragraph return Japanese output, but it failed three existing safety tests for
omitted qualifications and coordinated findings. The experiment was reverted;
production remains at the tested `0.28` threshold. This confirms that reducing
fallback by weakening this guard is unsafe without a stronger semantic check.

The server intentionally uses an all-or-nothing paragraph boundary: if any
translation unit exhausts greedy, beam, and rescue attempts, the request
returns the original paragraph. Joining the other units with one English
fragment would lower the headline fallback count but create a mixed-language
partial fallback, which the existing source-span guard rejects. Future work
therefore needs validated unit-level quality results and an explicit reader
presentation policy before relaxing this boundary.

### v58 full stratified audit result

The resumed 12-unit run completed for all 21 catalog papers (206 rows). Among
74 ordinary-body rows, 17 returned reader-visible fallback (22.97%), down from
the v56 baseline of 20/74 (27.03%). Seven failures were server source
fallbacks and four were degenerate outputs; the remainder were invariant or
negation guards requiring manual semantic review. The result is an improvement
but remains above the <=5% product target.

In the same v58 report, ordinary-body fallback by catalog discipline was:
HCI 0/5, cognitive psychology 3/7, marketing 0/6, linguistics 2/4,
education 0/3, neuroscience 2/6, and uncategorized/other 10/42. The
uncategorized group dominates the residual count, so the next model-quality
experiment should sample those failures rather than tune a single discipline.

### v60 checkpoint — local fallback model comparison paused

The retained `facebook/m2m100_1.2B` comparison contains five ordinary-body
examples. Its outputs are fluent in places but show clear semantic drift,
omissions, malformed terminology, and source-specific substitutions (for
example, “SAMT3”/“Synformer BER” in technical prose). Because this model was
not evaluated by the production quality gate at generation time and is not
consistently faithful, it is **not** enabled as an automatic fallback or
cascade. The experiment process was stopped at this checkpoint; the JSON
report remains available for a later scored comparison against MADLAD.

### v62 runtime spot check

After restarting the development server, startup reported
`3b-mt-v5-semantic-v61`. The OzCHI author-year citation sentence was translated
in one request with the complete citation group preserved and no byte escapes
or invented numeric content. This confirms the v61 server/client path is
active; it is a spot check and does not change the v58 corpus rate.

### v61 full corpus rerun

The full 12-unit-per-paper audit was rerun against the restarted v61 server
(21 papers, 206 rows). Ordinary-body fallback decreased from 17/74 (22.97%)
to 15/74 (20.27%). Degenerate outputs decreased from four to two; the
remaining seven server source fallbacks and invariant/negation cases remain.
The improvement is consistent with byte-escape restoration but is far above
the 5% product target, so no completion claim is made.

### Phase 1 attribution inventory (v61, all 15 ordinary fallbacks)

The following inventory is derived from the completed audit rows and the
rerun in `translation-fallback-attribution.json`. Every current row matched
exactly one re-extracted canonical block; the labels are evidence-backed
triage categories, not a claim that model causality is already proven.

| paper / block | page | reason | chars | primary hypothesis |
| --- | ---: | --- | ---: | --- |
| interactive-jewellery / b-4d8fd90a | 3 | source negation missing | 546 | correct_source_model_failure |
| power-over-skin / b-eed74380 | 5 | invariants missing | 1062 | equation_or_scientific_layout_contamination |
| thermal-earring / b-01a329cd | 24 | server source fallback | 1063 | correct_source_model_failure (pending unit evidence) |
| dont-mind-me / b-fb4b663f | 2 | unexpected invariant 1914 | 982 | structure_mixing (historical prose/chrome candidate) |
| dont-mind-me / b-f55efe09 | 3 | invariant iPhone missing | 516 | quality_gate_false_reject (pending source check) |
| dont-mind-me / b-ea91ca56 | 5 | degenerate output | 754 | structure_mixing (list/prose candidate) |
| step-to-charge / b-f11f1c54 | 6 | invariants M2W missing | 572 | equation_or_scientific_layout_contamination |
| step-to-charge / b-e36ddef0 | 8 | source negation missing | 318 | correct_source_model_failure |
| cognitive-psychology-gpt3 / b-8f2a6a49 | 3 | server source fallback | 1575 | structure_mixing (long paragraph candidate) |
| cognitive-psychology-gpt3 / b-5096fc7a | 2 | server source fallback | 448 | structure_mixing (list/prose candidate) |
| cognitive-psychology-gpt3 / b-b4ed26af | 6 | degenerate output | 215 | structure_mixing (numeric list candidate) |
| linguistics-language-model-physics / b-30cd3318 | 11 | server source fallback | 1180 | correct_source_model_failure (pending unit evidence) |
| linguistics-language-model-physics / b-ebe5dcc2 | 1 | server source fallback | 1496 | reading_order_failure (known two-column page) |
| neuroscience-rule-following / b-9ba3fd27 | 1 | server source fallback | 1397 | reading_order_failure (known two-column page) |
| neuroscience-rule-following / b-026d207e | 4 | server source fallback | 1204 | correct_source_model_failure (pending unit evidence) |

The refreshed v66 inventory has 9 clean-source/model candidates (A), 2
structure-mixing candidates (D), and 3 scientific-layout candidates (E).
All 14 source matches are unique. The A group has one column, no list lines,
no continuation flags, and no structural warnings in the current extraction
diagnostics, so it is the next model/quality-gate investigation set. D/E are
kept separate so extraction fixes are not hidden inside translation retries.

The audit rows report `structuralWarnings: []` for all 14 current cases and provide
pageStart/pageEnd plus model token counts, but they do not retain block-level
bounding boxes. Therefore the six structure-related labels above remain
hypotheses rather than verified attribution. The seven rows with
`server returned source fallback` have no model output to compare and are the
highest-priority candidates for a rerun with `TRANSLATION_UNIT_DEBUG=1` and
captured canonical geometry.

### v63 output-cap experiment

Raising the per-unit generation cap from 256 to 384 tokens was tested against
the longest remaining ordinary-body fallback (1,063 source characters). It
still returned a complete source fallback after rescue attempts, so the cap
did not address the failure. The change was reverted to 256; no unverified
latency or memory cost remains.

The 17 v58 ordinary-body fallbacks were inspected at source/output level. The
four degenerate cases contain byte escapes or severe repetition and are true
decode failures. The seven server source fallbacks are long paragraphs whose
unit-level rescue attempts did not produce a safe complete result. The six
invariant/negation cases include dropped method identifiers, measurements, or
explicit negation; they cannot be safely counted as false rejects without a
human semantic label. This distribution argues for unit-level quality evidence
and a reader presentation policy, rather than relaxing the global gate.

### v61 byte-escape restoration

Some accepted server decodes contained tokenizer byte escapes such as
`<0xE8><0x90><0xBC>`, which the client quality gate correctly treated as
degenerate output. The server now restores only contiguous, valid UTF-8 byte
runs before citation restoration and quality checks; malformed runs remain
visible and are still rejected. This is a representation repair, not a quality
threshold change. Two regression tests were added (74 Python tests pass).

### Pause checkpoint (2026-09-15)

Phase 1 attribution is the next resume point. The 15 remaining ordinary-body
fallbacks are inventoried, but structure-related causes remain hypotheses
because the audit rows lack block-level geometry and translation-unit traces.
No long-running audit or benchmark process is active. The packaged app server
was left running with the user's app, not as an audit job. On resume, capture
canonical geometry and `TRANSLATION_UNIT_DEBUG=1` for each row before changing
the algorithm further.

### Phase 1 attribution evidence (2026-09-15)

`scripts/attribute-translation-fallbacks.ts` re-runs native extraction for the
fallback papers and joins each audit row to its Canonical and layout block.
The generated local report is
`test-data/real-papers/reports/translation-fallback-attribution.json`.
All 15 rows matched exactly one block and now include page-level bounding-box
evidence. Preliminary hypotheses are: A correct-source/model adequacy 9, D
structure mixing 3, E equation/scientific contamination 3. No matched fallback
block currently shows a within-block column switch, so reading-order failure
has not been claimed from this evidence. They are not yet manual ground truth;
the next step is line-level review of
these geometries before implementing additional rules.

The line-level source-integrity pass found 14/15 matched blocks with one
consistent column, no list boundary, and no continuation edge. One block
(`cognitive-psychology-gpt3/b-b4ed26af`) contains four detected list lines and
is marked `review`; it remains a structure-mixing candidate rather than a
model-only failure.

### Fixed-fixture model isolation (existing evidence)

The local fixture report `translation-server/benchmarks/translation-fixture-diagnosis.json`
compares direct MADLAD, MicroBatchScheduler, no protection, production
protection, atomic author-year citation protection, whole-sentence input, and
safe two-chunk input in one deterministic process. Direct and micro-batch use
the same 64 input / 86 output tokens and produce the same Japanese, so no
micro-batch mapping defect is evidenced. Whole-sentence and protected inputs
also match. Atomic citation protection reduces the input to 32 tokens and
preserves the citation exactly; safe two-chunk input produces a distinct but
semantically coherent output (67 input / 92 output tokens). None of these
conditions produces the previously reported unrelated hallucinated facts for
this fixture. This shifts the remaining investigation toward long-form unit
composition and model adequacy, rather than the semicolon splitter or batch
mapping.

The fixture was rerun under the current `3b-mt-v5-semantic-v61` model. Direct,
micro-batch, protection, atomic-citation, whole-sentence, and repeat outputs
were deterministic (32/44 tokens for protected input; 64/86 without
protection). The safe two-chunk condition was 35/51 tokens. No unrelated
hallucinated fact appeared, but wording such as 「移動領域」 remains a
terminology/adequacy defect.

### v61 terminology benchmark (2026-09-15)

The full catalog run completed with `--limit 8` against the current server:
21 papers, 139 sampled rows, and 48 ordinary-body rows. Fourteen ordinary-body
rows fell back (29.17%); reasons were 8 server source fallbacks, 3 orphaned
invariant cases, 2 degenerate outputs, and 1 negation failure. This run uses a
different sample denominator from the earlier 74-row measurement, so it is a
checkpoint rather than a before/after claim. The server was stopped after the
run.

As a small, source-grounded refinement, the glossary normalizer now maps the
model's `移動領域` rendering to `モバイル分野` only when the source contains
`mobile domain`. This does not alter acceptance thresholds or introduce a
target-language blacklist; full-corpus impact still requires a new benchmark.

Output inspection confirms that the invariant-related fallbacks are not mere
gate noise: power-over-skin drops `TQP3M9009`/`dB`, Step-to-Charge drops
`Machine-to-Wearable`/`M2W` and leaks a placeholder, and dont-mind-me invents
the year `1914`. Keeping these as original fallback is therefore correct.
The eight source-echo rows are long ordinary paragraphs with no structural
warning in the sampled block and remain the primary model-adequacy recovery
target.

### v63 free-model comparison (audit-only)

The cached `facebook/m2m100_1.2B` model was evaluated on the eight rows that
the current report marked as complete source fallbacks. It produced Japanese
for all eight, but long rows were truncated or semantically distorted (for
example GPT-3 was rendered with unrelated terms, and neuroscience results
lost qualifications). No scientific-invariant scoring or manual review
supports enabling it as a cascade. It remains excluded from production; the
raw outputs are in `test-data/real-papers/reports/model-cascade-v63-m2m12-ordinary.json`.

### v62 leading-fragment repair

Segmenter inspection found several source-echo paragraphs beginning with a
two- or three-word sentence (`Related work.`, etc.) that was sent as an
independent translation unit. Such a unit has no semantic context and can
poison the paragraph result. Leading tiny prefixes now merge forward, while
colon-ended list lead-ins remain separate. The segmenter cache identity is
bumped to `semantic-v62`; 33 segmenter tests pass.

### v62 benchmark result (2026-09-15)

The same 21-paper, `--limit 8` benchmark completed after the repair. It
remained 139 rows / 48 ordinary-body rows / 14 fallbacks (29.17%), with the
same broad reason distribution. The repair removed standalone tiny units in
segmentation tests but did not move the product metric on this sample; this
layer is a measured plateau for now. The server was stopped after the run.

### v63 placeholder glyph repair

One measured unsafe output contained a scientific placeholder mutated with
Greek/Cyrillic lookalikes (`ΖZCIΤ2ZZ`), causing a valid protected identifier to
be rejected. Restoration now normalizes lookalikes only inside a complete
placeholder-shaped token; ordinary text is unaffected. The pipeline identity
is `semantic-v63`; 77 translation-server tests pass. A full v63 benchmark is
still required to measure fallback impact.

Focused v63 reruns covered power-over-skin (1/2 ordinary fallback),
step-to-charge (1/2), and dont-mind-me (1/3). The affected rows still failed
because the model omitted or concatenated scientific identifiers
(`TQP3M9009`, `dB`, `Machine-to-Wearable`, `M2W`) or invented `1914`; the new
normalization did not change these decisions. The server was stopped after the
focused run.
## v65 proactive concessive segmentation checkpoint (2026-09-15)

`segmenter-v65-concessive.json` に `power-over-skin` の source と model-facing
units を固定した。長い `Although ... , it ...` 節は source を改変せず、
`This offers ...` と `It still ...` の2つの完結した入力へ変換される。
実モデルで後者を単独翻訳した結果、接地面が電力伝送の制約であることを保持した
日本語になった。一方、段落全体では識別子が戻っても内容の置換・省略が残るため、
識別子修復だけで fallback を減らす施策は採用していない。次の評価は v65 の
focused/full benchmark と、長文の意味欠落を検出する候補スコアリングである。

### v65 full sample result

v65 の全体サンプルを完走した結果は 21 papers / 139 rows / 48 ordinary-body
rows / 14 reader-visible fallbacks (29.17%) だった。v62 と同率であり、
proactive segmentation 単独では fallback 率を下げないことが確認された。
ログには技術識別子の反復（例: `AGMMAGMM`）も残るため、quality gate は緩和しない。

### Local model cascade audit

残存 fallback 8件を audit-only で比較した。`Helsinki-NLP/opus-mt-en-jap`
は長文の短縮・反復・不自然な語列、`facebook/m2m100_418M` は数値・引用の
変形と機械的な日本語を示した。いずれも現行 MADLAD の代替として採用しない。
比較出力は `test-data/real-papers/reports/model-cascade-v65-opus-enja-ordinary.json`
と `model-cascade-v65-m2m418-ordinary.json` に保存した。
- **停止チェックポイント (2026-09-15)**: v66 benchmark/監査プロセスは停止済み。21論文・139行・通常本文48行で reader-visible fallback は14行 (29.17%)。coverage audit の不変量候補2件（`thermal-earring`）を次回の手動レビュー対象として残し、再開手順は `CURRENT_STATE.md` に記録した。
- **手動レビュー確定 (2026-09-15)**: `thermal-earring/b-22de2c20` は単位表記差ではなく、末尾内容の脱落と意味変化を含む severity 3 の unsafe false accept。`b-01a329cd` は server source fallback であり安全なfallback。レビュー記録は `test-data/real-papers/audit-manual-review.json`。
- **Phase 1 attribution 更新 (2026-09-15)**: v66の14 fallback全件をPDF再抽出へ一意照合（14/14）。仮説内訳は A=9（clean source/model candidate）、D=2（structure mixing candidate）、E=3（equation/scientific-layout candidate）、未分類=0。これは確定診断ではなく、次のdebug/geometryレビュー順序を定めるための帰属である。
- **Clean-source direct diagnosis (2026-09-15)**: PDFを完全に外した3 fixtureをMADLAD v66へ直接投入。2件は `degenerate translation output` を再現し、1件は例外なしだが `GPT。GPT-3` というsemantic segmentation/decoding異常を返した。direct結果は `translation-unit-fallback-direct-v66.json` に保存し、モデル経路の独立失敗を確認した。
- direct実験の追加所見: thermal-earring は655文字を5 chunksへ分け、`耳の温度は…` と `また,耳の温度を測定した結果…` の短い出力を `implausibly_short` として拒否。linguistics は655文字・3 chunksで `線形プロービングは…BERT` の出力が同じ理由で拒否。cognitive-psychology は559文字・4 chunks、180 input tokens / 151 output tokensで返ったが、chunk境界に由来する `GPT。GPT-3` が残った。これは「例外を消す」だけでは不十分で、chunk単位の意味品質評価が必要な証拠。
- `GPT。GPT-3` 対策として、出力末尾のsource identifier prefixを一般検出するガードを追加（blacklistなし）。既存テストを含むquality/segmenter 48件が成功。全corpus fallback率への影響は未測定で、次回full benchmarkで確認する。
- **v67 full benchmark**: 21論文・139 rows・ordinary-body 48 rowsを完走。fallback 14/48 = 29.17%でv66と同率。orphaned-prefix guardは安全性を強化したが、絶対fallback改善は生まなかった。サーバー停止済み。
- **v67 medium-concessive recheck**: thermal-earring fixtureのproactive分割を5→3 unitへ抑制して直接MADLADへ再投入したが、長い主張の短縮出力が `implausibly_short` で拒否され、beam/rescue後もfallback。入力境界の過剰分割は一因だが、モデルdecodeの意味圧縮も独立した原因として残る。
- **v68 thermal production recheck**: 閾値変更後にthermal-earringをproduction serverで再実行。ordinary-body 2件中1件fallback（1/2）で、`b-22de2c20` はaccept、`b-01a329cd` は従来どおりsource fallback。対象論文のfallback率は改善なし。全体benchmarkは次回実行する。
- **v68 full benchmark**: 21論文・139 rows・ordinary-body 48 rowsを再測定。fallback 14/48 = 29.17%でv67/v66と同率。medium concessive境界変更は既存acceptを維持したが、fallback削減効果は確認できなかった。サーバー停止済み。
- **Per-unit failure instrumentation (2026-09-15)**: `TRANSLATION_UNIT_DEBUG=1` 時に、batch/逐次経路の失敗unit index・長さ・理由・sourceを記録する診断を追加。挙動は変更せず、82件のserver testsが成功。次回A群で実ログを採取する。
- **Thermal debug capture (2026-09-15)**: production serverで3 units中index 0（253 chars / 38 words）が失敗し、短縮decode→beam→rescueの順に拒否されて段落fallbackへ昇格する実ログを採取。詳細は `translation-unit-debug-thermal-v68.md`。
- **暫定安全性指標 (2026-09-15)**: 手動レビュー済み16件中、fallback表示ではない severity 2以上の誤訳が4件（unsafe false-accept 25.0%）。形式的なquality gateだけではsemantic shift/omissionを防げないため、現状は研究用途の無条件accept水準に達していない。
### Phase 2 checkpoint: extraction regression harness

The real-paper extraction command is now functional through an explicit Vitest config. Stale catalog assertions were corrected from cached-PDF observations (cross-page Interactive Jewellery token order, single-column neuroscience page 1, economics multi-column page 14). The full extraction corpus currently passes: 40/40 tests across 2 suites. This is harness/ground-truth maintenance; it does not yet reduce the measured translation fallback rate.

Server regression verification completed in the project virtualenv: 82 Python tests passed. The server and benchmark processes remain stopped after verification.

The v69 fallback analysis artifact now contains all 14 ordinary fallback rows with source lengths, page spans, structural warnings, quality reasons, and A/D/E attribution. Seven are over 1000 characters; all are post-model decisions in the current report. This separates long-unit/model adequacy experiments from the D/E structure cases without changing acceptance behavior.

The v69 direct fixture diagnosis also completed for the author-year citation sentence. A/B/D/E/F produced identical stable output under one process/model; the unprotected condition completed with citation transliteration; and the safe two-unit split preserved meaning. No hallucination or microbatch mapping error was observed. The remaining issue is terminology adequacy ("mobile domain" → "移動領域"), not citation segmentation. Detailed outputs remain in `translation-server/benchmarks/translation-fixture-diagnosis.json`.

The same A–G comparison was re-run under the current v67 engine (v78
checkpoint). Every condition completed: A/B/D/E/F were output-identical,
unprotected C transliterated the citation, and G preserved the clause meaning
after a safe split. No hallucination or microbatch mapping error was observed;
the remaining defect is terminology adequacy (`mobile domain` → `移動領域`).

Measured token counts were A/B/D/E/F = 32 input / 44 output tokens, C and the
deterministic repeat = 64 / 86, and G = 35 / 51 (the two safe units combined).
These numbers are recorded in the JSON artifact and show that the protection
variants changed model input length but did not change this model's decoded
meaning for the cited sentence.

The existing local MLX INT8 MADLAD alternative was load-tested and benchmarked without changing production. It ran successfully, but its representative long introduction omitted several source claims and its title output was truncated, so it is not a safe replacement based on current evidence.

The segmented MLX comparison revealed a general extraction-unit issue: `et al. [8]` was split into an `et al.` fragment and a standalone citation unit, which produced hallucinated output in the latter. The segmenter now treats two-token `et al.` as an abbreviation and keeps the citation attached; 38/38 segmenter tests pass.

### Checkpoint: v75 benchmark paused cleanly (2026-09-15)

The full benchmark was restarted after the quality-gate adjustment and stopped after the first paper completed its 8-unit checkpoint. The persisted report currently contains 1 paper / 8 rows, with 5 ordinary-body rows and 1 reader-visible fallback (20%); this partial sample must not be compared as a corpus-wide rate. Both the benchmark and translation server were then terminated, and the checkpoint remains available for the next continuation.

The TypeScript quality regression suite was rerun at the stop point: 60/60 tests passed. This verifies the current gate change locally, but does not establish the corpus-wide fallback target.

The persisted v69 attribution was rechecked before stopping: 14 failures are classified D=2 (structure mixing), A=9 (model failure on complete prose), and E=3 (scientific/layout contamination). Seven are at least 1,000 characters and three are under 500 characters, so the next experiment must cover both long-unit adequacy and structural contamination.

Regression verification at this checkpoint passed: extraction corpus 40/40 tests and translation-server unittest 83 tests. No production process was left running.

Reading-order regression was also rerun: 27/27 tests passed, including the cross-page continuation stitch case. No extraction change was introduced in this verification step.

An A-cohort diagnostic was started for the cognitive-psychology representative paper (4 units, serial mode) but was stopped when PDF extraction exceeded the bounded run window. Server logs show mixed behavior: ordinary short units translate, while at least one unit is rejected as `implausibly_short` and retried with beam search. This is diagnostic evidence only; the partial run is not included in corpus metrics.

The next A-cohort run is explicitly fixture-based: use the existing fixed sources in `translation-server/benchmarks/translation-unit-fallback-fixtures-v66.json` and compare whole-unit, safe-clause, and protection variants without PDF extraction. Persist raw model inputs/outputs/token counts and quality reasons in `translation-unit-diagnosis-v76.json`.

Batch integrity was hardened: the TypeScript client now rejects a non-array or length-mismatched `/translate/batch` result instead of silently indexing unrelated output onto source blocks. `npx tsc --noEmit` passed.

A regression test covers the mismatch path (`src/test/madladEngine.test.ts`: 1/1 passed), preventing future removal of this safety check.

Combined quality and batch regression run passed: 2 files / 61 tests.

Added `translation-server/scripts/diagnose_fallback_fixtures.py` for reproducible clean-source A-cohort runs. It bypasses PDF extraction, records segmenter units/model inputs and per-fixture output or error, and writes `translation-unit-diagnosis-v76.json`; the script passes Python compilation and the TypeScript typecheck remains green.

Executed the v76 fixture run: cognitive psychology completed 4 units but retained an unnatural GPT-3 boundary in the output; thermal (3 units) and linguistics (3 units) reproduced `degenerate translation output` without PDF extraction. This is direct evidence that at least part of the A cohort is upstream-independent model/unit failure, not a PDF parser artifact. This is attribution evidence only; the latest complete corpus metric remains 14/48 ordinary-body fallbacks (29.17%), and the processes were stopped after capture.
# 2026-09-15 quality checkpoint

The latest synchronized full benchmark reports **12/48 ordinary-body
reader-visible fallbacks (25.00%)**. Historical attribution contains 14 rows;
two are stale because later runs recovered them. Current causes are A=7, D=2,
E=3.

An E-cohort runtime capture established that `power-over-skin` loses protected
`RF` and `TQP3M9009` placeholders during MADLAD decoding. The old restoration
path appended missing values at the end, producing `RFTQP3M9009`. Production
translation now uses strict restoration and falls back before malformed
scientific text is returned. Evidence is stored in
`translation-server/benchmarks/translation-scientific-placeholder-debug-v72.json`.

This is a safety correction, not a fallback-rate improvement; the <=5% target
remains unmet. Python translation-server tests (88/88) and client Vitest tests
(297/297) pass after the change.

## 2026-09-15 v6 attribution reconciliation

The authoritative v6 serial report contains 12 current ordinary-body fallback
rows out of 48 (25.00%). `test-data/real-papers/reports/translation-fallback-attribution.json`
has been resynchronized to those exact IDs; seven rows retained only in older
benchmark runs are no longer counted as current. The validator now reports
12 current rows with primary causes A=7 (complete prose/model or decode path),
D=2 (structure mixing), and E=3 (scientific/layout contamination), with no
stale-row warning. These labels remain subject to manual semantic review and
are attribution evidence, not proof that the model is safe. No translation
server process is running at this checkpoint.

The regenerated v77 summary now also reports format and discipline slices.
Discipline labels are taken from the majority label in existing manual-review
records when the paper catalog has no explicit discipline field; papers without
such evidence remain `unknown` rather than being guessed. Current reviewed
slices are: cognitive psychology 3/6 (50.0%), linguistics 2/3 (66.7%),
marketing 1/3 (33.3%), and HCI 0/3. These are small samples and should not be
treated as population estimates.

The manual-review taxonomy currently contains 185 records: 16 completed and
169 pending. Among 93 records explicitly accepted by the production decision,
4 have severity >=2, giving an observed unsafe false-accept rate of 4.30% in
the reviewed subset. Labels and severities are emitted in
`translation-fallback-attribution-summary-v77.json`; unlabeled records are
kept out of the denominator for this metric.

The clean-source A-cohort fixture rerun (MPS, current model, bypassing PDF
extraction) is recorded in
`translation-server/benchmarks/translation-unit-diagnosis-v76.json`.
Thermal-earring reproduces a degenerate short-unit failure through greedy,
beam, and rescue attempts; the cognitive fixture completes after per-unit
rescue with citation 24 retained; the linguistics fixture completes after an
identifier-drop retry but remains truncated at its final clause. These results
separate residual A failures from PDF extraction while preserving the strict
fallback safety boundary.

The controlled OzCHI author-year comparison is stored in
`translation-server/benchmarks/translation-unit-variants-v79.json`. Four
conditions (unprotected, current protection, atomic author-year protection,
and current protected unit) all produce one semantic unit without semicolon
splitting. Protection preserves the exact citation group; the unprotected
decode transliterates citation years. The final negated mobile-domain claim is
retained in every condition, with only a terminology-quality issue remaining.
No hallucinated facts were observed in this controlled run.

The current-report coverage pass (`translation-coverage-v66.json`) examined 78
translated ordinary-body rows. Sentence coverage and length-ratio alarms were
zero, but exact invariant matching found 10 rows with at least one missing
source invariant, including 5 rows that were not reader-visible fallbacks.
This is evidence that fluent outputs can pass coarse sentence/length checks
while losing scientific tokens. The signal remains audit-only until token
normalization and false-positive calibration are added.

The audit-only semantic coverage evaluator was rerun on 14 reviewed translated
blocks with the local multilingual MiniLM model. Three reviewed rows had
severity >=2; their mean minimum source-sentence similarity (0.729) was not
lower than the 11 safe rows (0.638), so this embedding score cannot serve as a
standalone unsafe-translation gate. Results are stored in
`test-data/real-papers/reports/semantic-coverage-reviewed-v42.json` and remain
an audit signal only.

After the v7 terminal-boundary ranking change, the same matrix was rerun. All
four outputs were byte-for-byte equivalent to the v6 capture; the new ranking
signal did not select a different candidate in this case. It remains a
general safety-oriented tie-breaker, but this fixture provides no measured
fallback improvement.

The audit-only invariant comparison now applies NFKC, Unicode-hyphen,
whitespace, and case normalization. Rerunning the same 78 rows reduced
apparent invariant-loss alarms from 10 to 7, removing three formatting-only
false positives. The remaining seven rows stay queued for manual token review;
production acceptance behavior is unchanged.

## Translation coverage v67 (audit-only provenance update)

The normalized invariant audit was rerun and versioned as `translation-coverage-v67.json` (`3b-mt-v5-semantic-v67-audit-normalized`). Across 78 ordinary translated rows, low sentence coverage and low length ratio remain 0; invariant loss is 7 after NFKC, Unicode-hyphen, whitespace, and case normalization (raw v66 loss was 10, including three formatting-only mismatches). This is diagnostic evidence only; it does not loosen the production quality gate or alter fallback decisions.

### A-cohort failure-mode triage (audit-only)

`fallback-a-subtypes-v1.json` records a reproducible heuristic triage of the current ordinary-body fallback rows into decode/truncation, long-unit omission risk, scientific-token loss risk, and other model-adequacy buckets. These labels are deliberately provisional and require manual semantic review; they are not production routing rules. The artifact is the input set for the next selective-cascade/candidate-selection experiment.

### Selective cascade audit v1

The current fallback inventory was joined with the previously captured local Opus and M2M100-1.2B outputs in `selective-cascade-audit-v1.json`. Invariant retention and length are recorded as safety triage signals only; no alternate model output is promoted without semantic review. This preserves the safety boundary while enabling the next candidate-selection experiment.

### Selective cascade audit v2 correction

The cascade comparison was regenerated with Opus and M2M100-1.2B kept in separate per-model maps. This fixes an audit join defect in v1 that could overwrite one candidate, without changing production behavior. The corrected artifact is `selective-cascade-audit-v2.json` (12 fallback rows; 6 with captured alternatives).

The corrected cascade artifact was screened with a conservative audit threshold requiring complete recorded-invariant retention and length ratio ≥0.35. It produced 0 automatically eligible alternate candidates among 12 fallback rows; M2M100-1.2B is comparatively stronger than Opus but still shows truncation or invariant loss. No production cascade was enabled.

### Local model inventory checkpoint

The local cache was inspected before expanding the cascade. It contains only the already evaluated MADLAD, Opus, M2M100-418M/1.2B families plus the MiniLM evaluator; the repository bundles MADLAD MLX only. Therefore no additional untested offline translation candidate is available without a new model download and licensing/size review. Production remains unchanged.

### Semantic relation audit signal

The audit coverage scorer now records a conservative negation relation (`sourceNegation`, `translationNegation`, `negationPreserved`). The current 78-row sample contains 4 possible negation relation losses. This remains audit-only because lexical Japanese negation detection has false positives/negatives; it is used to prioritize manual review and future relation-aware candidate selection.

The four negation-relation flags are accepted rows rather than fallbacks, making them the highest-priority potential unsafe false-accept candidates for manual review: `interactive-jewellery/b-4d8fd90a`, `significant-other/b-70cd9829`, `design-for-wearability/b-96ae98eb`, and `neuroscience-rule-following/b-ddf5ca5d`. No automatic rejection is enabled from this signal.

The coverage audit now also records contrast relations (for example `however`, `although`, `unlike`, and `whereas`) alongside negation. Japanese contrast markers are checked conservatively. This is audit-only evidence for candidate selection and manual review, not an automatic fallback rule.

The resumability metadata was corrected so `audit-progress.json.lastBenchmarkVersion` matches the authoritative full-corpus report (`3b-mt-v5-semantic-v71-strict-restore-v6-full-serial`) rather than the older review-generator default. This is bookkeeping only.

### Candidate licensing checkpoint

`facebook/nllb-200-distilled-600M` was checked as a possible free local model. Its Hugging Face model card lists CC-BY-NC-4.0, so it was excluded before download for product use without a commercial-license review. No model download or production change was made. The local candidate ledger is `local-model-candidate-ledger-v1.json`.

### Additional Apache candidate benchmark

`Helsinki-NLP/opus-tatoeba-en-ja` (Apache-2.0) was evaluated locally on three fallback rows. It produced malformed spacing/punctuation, domain terminology corruption, and truncation, so it is not a safe cascade candidate. Raw output is `translation-server/benchmarks/model-cascade-opus-tatoeba-v1.json`; production remains unchanged.

The three Opus-Tatoeba outputs were screened with the same conservative safety signals used for cascade triage. **1/3** met the mechanical invariant/length screen, but manual inspection is still required and the candidate remains excluded from automatic routing. It remains audit-only and is not eligible for automatic cascade routing.

Manual spot-check of the one Opus-Tatoeba row that passed mechanical screening found severe semantic corruption: GPT-3 identifiers, pill counts/causal relations, and the counterfactual question were not preserved. This is a concrete false-eligibility example and confirms that candidate selection needs relation-aware semantic review before any production cascade.

The cascade acceptance policy is now explicit: invariant retention and length are necessary but insufficient. A candidate must also pass relation-aware semantic review covering negation, contrast, counts/conditions, and terminal claims. The Opus-Tatoeba false-eligibility example is retained as a regression guard against promoting fluent but structurally wrong output.

The contrast audit signal was tightened to high-precision discourse markers; weak conjunctions (`but`, `while`, `instead`) are no longer treated as standalone contrast evidence, while paired Japanese forms such as `だけでなく` and `ものの` are recognized. This is an audit precision correction only.

Manual review of two queued relation flags found one real issue and one false positive: `interactive-jewellery/b-4d8fd90a` omits the source's “not the first” claim (severity 2), while `significant-other/b-70cd9829` correctly preserves the not-merely/but relation. The review labels are stored in `audit-manual-review.json`; production behavior is unchanged.

An ID-only semantic relation review queue was added at `semantic-relation-review-queue-v1.json`. It contains 8 flagged rows from coverage v67, with negation/contrast flag types and reader-visible status but no copyrighted excerpts. Manual comparison remains required; no production gate change was made.

Manual relation review of three queued rows found one serious semantic shift/omission (`dont-mind-me/b-fb4b663f`, severity 3), one correct relation (`marketing-consumer-response/b-85131724`), and one minor concessive weakening (`power-over-skin/b-eed74380`, severity 1). These labels are recorded in `audit-manual-review.json`; production behavior is unchanged.

The semantic relation queue is now **5/8 reviewed**, with 3 pending. Judgments include one severity-3 semantic shift, one severity-2 omission, one severity-1 wording issue, and two correct/false-positive cases. Queue progress is persisted in `audit-progress.json`.

Two remaining neuroscience relation flags were manually reviewed and marked correct in the ID-only queue: `b-e30c258d` preserves the whereas contrast, and `b-ddf5ca5d` preserves the neither/nor fairness result. The the ID-only queue now records 2/8 reviewed; other reviewed rows are tracked in the manual-review file.

The manual-review generator now derives the benchmark version from the report, preventing metadata rollback to v50. Its regenerated queue reports only current-key matches (9/139), so the durable progress ledger was restored to the authoritative 19 completed / 166 pending totals; no review judgments were removed.

The progress ledger's diagnostic version now explicitly identifies the v67 relations audit (`translation-coverage-v67-relations`), covering both negation and contrast signals.

The ID-only relation queue was reconciled against durable manual-review records and now reports 5/8 durable manual-review matches, with 3 pending. This fixes progress bookkeeping without changing translation behavior.

The final pending design-for-wearability relation flag (`b-96ae98eb`) was reviewed: the not-only/but-also relation is retained, but terminology and figure references are awkward (severity 1). The ID-only queue records this judgment; durable manual-review matches remain separately tracked.

The final two relation-queue entries were reviewed: `power-over-skin/b-eed74380` has a severity-1 concessive weakening, and `dont-mind-me/b-fb4b663f` has a severity-3 semantic shift. The ID-only relation queue is now complete (8/8); the broader manual-review corpus remains 19/166.

Audit tooling caveat: rerunning the manual-review generator materialized 9 completed / 130 pending current-key records and replaced the prior local 19/166 snapshot. The benchmark-version rollback bug is fixed, but historical review records with changed source keys are not preserved by the generator. This is tracked as a tooling issue; no translation behavior changed.

The attribution summarizer now includes and deduplicates `archivedReviews`, preventing future loss of archived safety evidence during queue regeneration. The current durable review file contains 13 completed / 130 pending records; the earlier 19/166 snapshot was partially overwritten before this fix and remains historical only.

The manual-review generator now rehydrates both active and archived reviews before rebuilding. Future source-key changes will preserve prior judgments. The current durable file remains 9 completed / 130 pending because the earlier overwrite had already removed its archived records; this patch prevents further loss.

## Ordinal/uniqueness relation review (2026-09-15)

The audit-only ordinal signal (`first`, `last`, `only`, `unique`, and
Japanese equivalents) flagged seven accepted rows. Manual comparison found two
severity-2 omissions: the interactive-jewellery paragraph drops “not the
first”, and the cognitive-psychology paragraph drops the experimentally added
third option. Two rows soften an ordering or descriptor nuance (severity 1),
and three flags were false positives or adequately rendered. These findings
are recorded in `semantic-relation-review-queue-v2.json` and synchronized into
`audit-manual-review.json`. They are review evidence only; the production
quality gate remains unchanged until a precision/recall evaluation supports a
safe policy.

## Current resumable baseline (2026-09-15)

The authoritative v77 attribution summary currently covers 48 ordinary-body
rows and 12 reader-visible fallbacks (**25.00%**), all post-model (primary
causes A=7, D=2, E=3). Durable manual review contains 139 rows: 19 completed
and 120 pending. Among reviewed accepted rows, 2 are severity >=2 unsafe
false-accept candidates (2/67 = 2.99%). The 5% product target is therefore
not met. The next work item is continued manual review and evidence-backed
model/cascade evaluation; no fallback threshold has been loosened.

### Manual review batch: cognitive psychology and wearability (2026-09-15)

Ten additional rows were compared manually. Five had no translated output and
were confirmed as safe source fallbacks (severity 4 for reader usability), one
source block contained interleaved list/citation markers and was classified as
extraction contamination (severity 3), and four translated rows retained the
main claim with either correct or minor wording quality. No new unsafe accepted
translation was inferred from this batch; the fallback burden remains a
separate product metric.

### Manual review batch: wearability, social acceptability, economics (2026-09-15)

Ten further rows were reviewed. Confirmed issues include a subject-changing
translation (“wearable products” rendered as website design), a severity-4
empty-output fallback, a severity-4 numeric/claim alignment failure with
unrestored placeholders, and two incomplete source blocks caused by extraction
boundaries. The updated audit-only reviewed-accepted safety estimate is 7/67
severity>=2 (**10.45%**); this increase reflects newly reviewed evidence rather
than a production regression. Product fallback remains 12/48 (25.00%).

### Manual review batch: economics and education (2026-09-15)

Ten additional rows were reviewed. Several economics rows are incomplete
mathematical/column fragments and were classified as source-fragment failures;
complete economics prose generally retained its claims. One education glossary
row has a terminology error (`教学` for teaching activities), while the longer
LA/EDM comparison preserves its contrast and overlap. The reviewed accepted
severity>=2 estimate is now 8/67 (11.94%); product fallback remains 12/48.

### Manual review batch: education, ergonomics, and design (2026-09-15)

Ten rows were reviewed. The batch found two terminology errors in educational
analytics, four extraction fragments, and several metadata/non-body rows. The
reviewed-accepted severity>=2 estimate is now 10/67 (14.93%); this is expanded
manual evidence, not a production regression. Product fallback remains 12/48.

### Manual review batch: design and HCI (2026-09-15)

Ten rows were reviewed. Four design rows are incomplete extraction fragments;
HCI bullets mostly preserve their technical claims, with one
counterbalancing terminology error. The reviewed accepted severity>=2 estimate
is 11/67 (16.42%), while the product fallback metric remains 12/48 (25.00%).

### Manual review batch: linguistics and interaction design (2026-09-15)

Ten rows were reviewed. One long linguistics paragraph had no output, and one
interaction-design paragraph omitted the scope of its structural claim. Most
short definition/list rows preserved their claims with minor wording issues.
The reviewed accepted severity>=2 estimate is 12/67 (17.91%); product fallback
remains 12/48 (25.00%).

### Manual review batch: linguistics and marketing (2026-09-15)

Ten rows were reviewed. Long linguistics and marketing paragraphs frequently
fell back with no output, while complete equations and model descriptions
preserved their main claims. A mathematical continuation beginning with
“where” was classified as a source fragment. The reviewed accepted
severity>=2 estimate remains 12/67 (17.91%); product fallback remains 12/48.

### Manual review batch: neuroscience, marketing, OzCHI (2026-09-15)

Ten rows were reviewed. Several neuroscience and OzCHI methods/abstract rows
were safe empty-output fallbacks; one marketing block contained an embedded
arXiv header (chrome contamination), and one OzCHI permission fragment was
severely corrupted. Complete participant and study-objective rows preserved
key facts. The reviewed accepted severity>=2 estimate remains 12/67 (17.91%);
product fallback remains 12/48 (25.00%).

### Manual review batch: OzCHI and power-transfer research (2026-09-15)

Ten rows were reviewed. Complete OzCHI study-objective text was accurate, but a
related-work paragraph omitted a “neither” claim and a statistical-results
paragraph had no output. Power-transfer rows mostly fell back safely, including
one long safety paragraph with SAR/mA values. Reviewed accepted severity>=2 is
13/67 (19.40%); product fallback remains 12/48 (25.00%).

### Manual review batch: power transfer, PPG, significant-other (2026-09-15)

Ten rows were reviewed. Two PPG rows were incomplete extraction fragments; the
remaining complete significant-other prose preserved its central claims with
mostly minor wording issues. The product fallback metric remains 12/48
(25.00%); the reviewed accepted severity>=2 estimate remains 13/67 (19.40%).

### Manual review batch: SpeechIn and wearable powering (2026-09-15)

Ten rows were reviewed. One SpeechIn contribution bullet contains a severe
repeated “face” hallucination despite a fluent output; several powering rows
are safe empty-output fallbacks, and two contain embedded arXiv/chopped source
contamination. Complete SpeechIn study summaries preserve counts and accuracy
values. Reviewed accepted severity>=2 is 13/67 (19.40%); product fallback
remains 12/48 (25.00%).

### Manual review completion (2026-09-15)

The remaining 11 rows were reviewed, completing the 139-row manual queue.
Final review labels are: correct 19, minor wording 48, omission 36,
source-fragment 24, semantic-shift 5, chrome contamination 3, terminology
error 3, and numeric error 1. The audit-only severity>=2 accepted estimate is
15/67 (22.39%); this is evidence that the current automatic gate is unsafe for
research use and is not a reason to loosen fallback. Product fallback remains
12/48 (25.00%).

## v8 production guard follow-up (2026-09-15)

The server now applies the same generic phrase-repetition guard as the client.
It rejects material repetition of Japanese kanji/phrase n-grams while allowing
normal repeated technical terms. Focused and full translation-server tests pass
(16/16 focused, 93/93 full). A full v8 corpus rerun is still pending; the last
measured product baseline remains 12/48 ordinary-body fallbacks (25.00%).

## v8 reviewed corpus checkpoint (2026-09-15)

The v8 local MADLAD run covered 21/21 catalog papers and 139 sampled units. The dedicated review queue now contains 139/139 reviewed rows. The reviewed summary (`reports/translation-v8-reviewed-summary.json`) records 65 accepted translations and 74 reader-visible fallbacks; the ordinary-body subset is 48 rows with 12 fallbacks (25%). Among accepted rows, 15 are severity >=2 unsafe false accepts (23.08%).

Three of those 15 are source fragments caused by PDF extraction/paragraph reconstruction and are excluded from model-cascade experiments. The remaining 12 are model-quality candidates. Existing M2M100-1.2B and Opus alternatives produced 6 captured candidate outputs but 0/6 passed the conservative invariant/length gate, so cascade remains disabled. The next experiment must use `reports/model-quality-unsafe-v8.json` and must report semantic adequacy separately from source-integrity failures.

The benchmark runner now supports `--resume` and waits for `/health` model readiness before issuing requests, preventing transient model-loading 503s from polluting a checkpoint. Client regression is 307/307, translation-server regression is 93/93, and lint/typecheck pass.

## Phase 2 continuation: same-fixture model and relation audit (2026-09-15)

The ordinary-body baseline remains 48 sampled blocks with 12 reader-visible
fallbacks (25.00%). Manual review covers all 139 sampled rows; 15/65 accepted
rows have severity >=2 (23.08% unsafe false accepts). The <=5% target is not
met.

All alternate-model experiments below use the exact 12-row
`model-quality-unsafe-v8.json` fixture. Helsinki Opus EN-JA and M2M100 418M
show severe drift/truncation or numeric corruption. M2M100 1.2B greedy and
beam=4 candidates were manually compared and yielded 0/12 safe rescues. The
candidate selector and cascade remain audit-only; no model replacement has
been enabled.

The semantic coverage audit v68 now measures invariants, negation, contrast,
ordinal/uniqueness, and condition/causal relations. After calibrating valid
Japanese condition renderings, condition false positives are 0/75. Remaining
relation flags are intentionally review signals, not automatic rejection rules.
See `reports/semantic-relation-signal-precision-v1.json`,
`reports/same-fixture-model-summary-v1.json`, and
`MODEL_ROUTING_DECISION_V1.md`.

Next work must either produce a genuinely distinct, license-approved local
candidate on the same fixture or improve semantic relation evaluation and
routing with reviewed positive rescues. Surface metrics alone must not reduce
fallbacks or bypass source-claim review.

## Phase 2 checkpoint: Gemma 2 9B same-fixture audit

A local Ollama `gemma2:9b` run completed for all 12 fixed model-quality unsafe blocks. Exact outputs and latency are in `test-data/real-papers/reports/model-quality-gemma2-9b-v1.json`; the combined surface-signal comparison is `candidate-selection-gemma-m2m-v1.json`. Several outputs are coherent and preserve numbers, but at least one long block truncates and the OzCHI sample still shows terminology/semantic risk. Therefore this is evidence for further review only: no production routing or fallback-policy change was made. All 12 rows require manual source-claim labels before a selective cascade can be considered.

### Gemma 2 9B manual review checkpoint

All 12 outputs were compared to their source claims. Review v1 records 9 apparent rescues, 1 conditional output with a remaining untranslated domain term, and 2 semantic/attribution rejects; the incomplete source-fragment row is explicitly retained as an extraction failure. See `test-data/real-papers/reports/model-quality-gemma2-9b-manual-v1.{json,md}`. This is fixed-fixture evidence only; no production model routing has changed.

### Selective cascade simulation (audit-only)

On the fixed 12-row model-quality unsafe fixture, an oracle simulation using the Gemma manual labels would select Gemma for 9 rows and retain fallback for 3; selected rows with severity ≥2 were 0. This demonstrates potential rescue capacity but is an optimistic, post-hoc upper bound and does not justify production routing. See `selective-cascade-gemma-v1.json`; next work is held-out selection without manual labels.

Automatic selector calibration found a safety gap: 10/12 Gemma outputs pass current hard surface signals, while manual labels identify only 1/12 as clean and flag the rest for omission, semantic shift, numeric, or terminology errors. Shape/invariant checks alone therefore cannot drive routing; semantic coverage remains the next required evaluator.

### Semantic coverage corpus calibration

The local multilingual MiniLM evaluator was run across all 139 manually reviewed rows. Per-row source-sentence and full-pair similarities are stored in `test-data/real-papers/reports/semantic-coverage-v2.json`. This establishes a corpus-wide calibration dataset for measuring false accepts/rejects against manual severity labels; it remains audit-only pending threshold calibration.

Threshold calibration shows the MiniLM similarity signal is insufficient alone: at min-source similarity 0.85, 2/18 unsafe rows remain accepted (11.1%) while 37 safe rows are rejected. Lower thresholds leave 6–14 unsafe accepts. This prevents promoting embedding similarity as a standalone production gate.

### Semantic coverage calibration curves

Generated `test-data/real-papers/reports/semantic-coverage-calibration-v1.json` over 45 thresholds for both minimum source-sentence and full-pair similarity. Each point reports unsafe acceptance and safe rejection against manual severity labels. It remains audit-only and does not change production fallback behavior.

### Composite semantic coverage calibration

Created `semantic-coverage-composite-calibration-v1.json`, combining minimum source-sentence similarity with penalties for negation/contrast/ordinal/condition and scientific-invariant loss. Threshold trade-offs are recorded against manual severity labels. This remains audit-only pending held-out validation.

### Baseline resynchronization

Using the current authoritative files, the audit has 21 papers and 139 rows. The current ordinary-body predicate selects 82 rows, of which 17 are reader-visible fallbacks (20.7%). The manual-review file has no `productionDecision` values, so unsafe accepted counts are taken from the explicit `unsafe-accepted-v8.json` report (15 rows). Model identity: `3b-mt-v5-semantic-v71-strict-restore-v8`.

### Gemma held-out smoke

A three-row ordinary-body held-out smoke produced mixed results: one coherent output, one clear mid-sentence truncation, and one fluent output requiring semantic review. This supports keeping Gemma audit-only until completeness and semantic checks are calibrated.

### Gemma generation-limit follow-up

The held-out row that previously truncated was rerun via Ollama API with `temperature=0` and `num_predict=512`; it completed and retained the citation/claims. The earlier truncation is therefore at least partly generation-limit related. Broader semantic validation is still required before any cascade routing.

### Generation capacity fix (v9)

Raised the bounded MADLAD decoder cap from 256 to 384 tokens for both single and batch paths, based on observed long-unit truncation. The model identity is now `3b-mt-v5-semantic-v71-strict-restore-v9` so stale translation cache entries are not reused. Existing guards remain active; translation-server tests pass 97/97. This change requires a fresh representative benchmark before production quality claims.

### Runtime packaging note

The currently running macOS `.app` bundle was inspected and still contains the v8 server source. The v9 generation-cap change is present only in the source worktree until a new Tauri bundle is built and restarted. This checkpoint intentionally leaves the existing app process untouched.

### v9 Tauri bundle verification

`npm run tauri:build` completed successfully. The generated `.app` timestamp is 2026-09-15 15:59:24, and its bundled translation server contains `strict-restore-v9` plus `MAX_NEW_TOKENS = 384`. The pre-existing server process was left running; a full app quit/relaunch is required for runtime v9 activation.

The existing app server remains healthy on port 8765 (`/health`: ready, model loaded), but it was intentionally not restarted after the v9 build. Runtime v9 verification remains pending a user-approved full app relaunch.

Added `scripts/verify-bundled-translation-server.sh` for resumable runtime checks (bundle timestamp, model version, generation cap, and process path) without process mutation.

### v9 runtime launch follow-up

The old PID 2108 is now gone after the user restart. A new server PID appeared briefly (58895) but exited before `/health` became available; port 8765 is currently closed. No crash report appeared in the recent DiagnosticReports listing. The next verification must launch the app from Terminal and capture translation-server stderr.

### v9 runtime activation confirmed

After the user relaunched the app, a new bundled server PID 60582 appeared. `/health` initially reported model loading, then reported `ready` with `model_loaded=true`. The process path is the v9-verified `.app` bundle. The API does not expose the model-version string directly, so version confirmation is based on the bundled source plus the post-build process path.

## v9 baseline resynchronization (2026-09-15)

`reports/baseline-v9.json` is the machine-readable baseline. The strict `ordinary-body-prose` source category contains 48 rows with 12 post-model fallbacks (25.0%). The product UX predicate is broader (paragraph role without source fallback): 82 rows with 17 reader-visible fallbacks (20.7%). Both figures are retained because they answer different questions; the latter is the target metric for the <=5% product goal. The v9 packaged runtime is active, but no model cascade is enabled yet.

## Phase 2 checkpoint: relation-aware candidate audit (2026-09-15)

The candidate-selection harness now records condition, temporal, and trend relation preservation in addition to numeric, negation, contrast, length, and mixed-script signals. A conservative audit-only relation gate rejected 3/12 Qwen 14B fixed-fixture candidates and 2/3 held-out candidates. Multi-model ranking remains unsafe without label-blind semantic evidence, so no production routing change was made. Current product baseline remains 17/82 reader-visible ordinary-body fallbacks (20.7%); the <=5% objective is still open.

### Relation signal calibration v4 (2026-09-15)

After disambiguating `where`, `when`, and plain `more/less`, the Qwen14 fixed-fixture audit rerun reports 9/12 hard-signal passes, 12/12 relation-signal passes, and 2/12 conservative gate exclusions. These are audit metrics only; labels are not used for routing.

### 2026-09-15 evaluation harness checkpoint

Added a CLI-level regression for paperId-free held-out candidate rows. The
selector now demonstrably preserves those rows through JSON loading, matching,
and audit selection; this is audit-only and cannot change production routing.
Translation-server tests: 105 passed. Product baseline is unchanged at
17/82 reader-visible ordinary-body fallbacks (20.7%).

### Candidate-selection scope audit (2026-09-15)

The conservative selector reports are now explicitly scoped. The 12-row corpus
fixture is an enriched severity>=2 cohort: all 10 rows that passed the relation
gate are still manually unsafe, while 2 are rejected. The three-row held-out
fixture has only one eligible row. These data cannot estimate rescue precision
or false-accept rate because they contain almost no known-good candidates.
This finding is saved in `reports/candidate-selection-scope-v1.json`. Production
routing remains unchanged; the next required experiment is a label-blind mixed
quality held-out fixture with accepted and fallback rows.

### Mixed-quality held-out fixture scaffold (2026-09-15)

Created `reports/mixed-quality-heldout-v1.json` with 24 ordinary-body cases
(12 baseline accepted and 12 reader-visible fallback), selected deterministically
across the existing corpus. Baseline translations are included as inputs, while
manual semantic labels remain intentionally unfilled; this prevents the enriched
unsafe-cohort bias seen in the earlier selector reports. The fixture is ready for
label-blind candidate generation followed by independent review and must not be
used as production evidence until those labels are completed.

### Benchmark client authentication (2026-09-15)

The real-paper benchmark now supports the runtime `MADLAD_SERVER_TOKEN`
environment variable and sends it as `X-Paper-Reader-Token`, allowing audits to
match the packaged app's authenticated API without storing secrets. The first
retry for `significant-other` did not finish and was interrupted; no production
code or server process was changed.

### Authenticated audit resumed (2026-09-15)

After the benchmark client began sending `MADLAD_SERVER_TOKEN`,
`significant-other` produced and checkpointed 2 translation units through the
packaged server. The run is intentionally partial (limit 12) and is not counted
as a completed paper; the checkpoint can be resumed without discarding output.

### Resume semantics fix (2026-09-15)

`benchmark-real-paper-translation.ts --resume` now treats a paper as complete
only when its checkpoint contains at least the requested `--limit` rows. This
prevents a partial audit from being silently skipped. During the retry the app
server socket closed; the partial report is retained and no process was
restarted by this session. `tsc --noEmit` and all 106 translation-server tests
pass.

### Audit request resilience (2026-09-15)

Added a bounded request timeout (default 180 seconds, configurable with
`MADLAD_BENCH_REQUEST_TIMEOUT_MS`) and one retry for transient fetch failures in
the real-paper benchmark. This prevents an unavailable server from leaving a
run waiting indefinitely while preserving atomic checkpoints. It is audit-only.

### Partial-row preservation (2026-09-15)

Fixed resume handling so a failed retry retains any prior partial rows instead
of replacing them with an empty error entry. Completion still requires the
current requested row limit. The already-overwritten `significant-other` report
cannot recover its former two rows from that file, but subsequent interruptions
are now resumable without data loss.

### 2026-09-15: power-over-skin 12-unit checkpoint

`power-over-skin` を packaged translation server へ authenticated request し、`--resume --limit 12` で既存 partial rows を保持したまま12 unitsへ拡張した。結果は `test-data/real-papers/reports/translation-audit-power-over-skin.{json,md}` に保存。これは corpus coverage の追加であり、モデル切替・production routing は行っていない。

### 2026-09-15: step-to-charge 12-unit checkpoint

`step-to-charge` を packaged server で12 unitsへ拡張し、既存の監査 checkpoint を保持した。レポート `test-data/real-papers/reports/translation-audit-step-to-charge.{json,md}` に結果を保存した。

### 2026-09-15: interactive-jewellery 12-unit checkpoint

`interactive-jewellery` を packaged server で12 unitsへ拡張し、結果を `test-data/real-papers/reports/translation-audit-interactive-jewellery.{json,md}` に保存した。

### 2026-09-15: dont-mind-me 12-unit checkpoint

`dont-mind-me` を packaged server で12 unitsへ拡張し、`test-data/real-papers/reports/translation-audit-dont-mind-me.{json,md}` に保存した。

### 2026-09-15: Phase 2 aggregate resynchronization

最新の `translation-audit-*.json` を横断した探索的集計を `reports/corpus-phase2-summary-v1.json` に保存した。レポート間で同一paperの重複があり得るため、これは傾向把握用で、正式な重複排除済みbaselineではない。正式指標は v77 attribution summary（ordinary 48 / fallback 12、25%；manual reviewed accepted 67中 severity>=2 15、unsafe false accept 22.39%）を継続使用する。

### 2026-09-15: mixed-quality alternative candidate generation

17-case label-blind fixture に対して `facebook/m2m100_1.2B` の候補を生成し、input/output token数と audit quality flags を `reports/mixed-quality-m2m12-v1.json` に保存した。production routing は変更していない。意味レビュー完了前のため、cascade rescue rate や安全性の証拠としては扱わない。

### 2026-09-15: mixed-quality candidate comparison

MADLAD既存出力と `facebook/m2m100_1.2B` の17件を同一source/block単位で比較し、`reports/mixed-quality-candidate-comparison-v1.json` に保存した。候補は全件生成されたが、数値・引用・早期終了フラグと意味の自然さは別途レビューが必要なため、production cascadeは未導入。

### 2026-09-15: selective cascade simulation (audit-only)

M2M100候補に保全系品質フラグを適用し、通過候補のみをMADLAD fallback救済対象とする選定をシミュレーションした。結果は `reports/selective-cascade-simulation-v1.json`。これはcandidate eligibilityの測定であり、baselineAccepted自体を正解ラベルとはみなしていない。本番cascadeは未導入。

### 2026-09-15: ergonomics sample-shortage verification

`ergonomics-human-factors-ihci` を `--limit 12 --resume` で再実行したが、eligible unit は1件のみだった。サーバーは処理を完了し、1 rowを保存した。12件未達は抽出可能サンプル不足であり、翻訳モデル失敗とは分類していない。

### 2026-09-15: candidate semantic coverage comparison

MADLAD/M2M100の34候補を同一MiniLM evaluatorで比較した。MADLAD平均 min-source similarity 0.700（<0.60: 4/17）、M2M100 0.590（<0.60: 8/17）。候補間の差は小さく、埋め込みスコア単独では安全な選択器にならないため、manual review prioritization用のaudit signalとして保存した。

### 2026-09-15: pending manual review priority queue

未レビュー7 rowsを source category と長さで並べた `reports/manual-review-priority-v1.json` を生成した。構造混在・list・長文を先に確認できるが、意味ラベルとseverityは手動レビュー完了まで未確定。

### 2026-09-15: review metrics resummarized

`npm run audit:summarize-review` で132 reviewed blocksを再集計した。全体は automatic accept 46.21%、pre-model fallback 37.88%、post-model fallback 15.91%、semantic error 30.30%、unsafe false accept 21.31%、extraction-induced error 19.70%。ordinary-bodyは44 reviewedで post-model fallback 25%、semantic error 27.27%、unsafe false accept 15.15%。7 rowsは未レビューのため暫定値。

### 2026-09-15: pending audit runner completed

pending runnerを `--limit 12` で実行し、2件を処理して `failures=0`。`ergonomics-human-factors-ihci` は1 unit、`neuroscience-rule-following` は11 unitsで、いずれも抽出可能サンプル上限に達した。監査結果とreview queueは保持した。

### 2026-09-15: pending runner short-fixture fix

eligible unitがlimit未満の正常完了fixtureを毎回再処理していたrunner判定を修正した。正常完了（`complete=true`, entry errorなし）は件数に関係なく完了扱いとし、途中失敗はentry errorで引き続き再開対象とする。dry-runでpending=0を確認した。

### 2026-09-15: CAT-Translate candidate triage

キャッシュ済み `cyberagent/CAT-Translate-1.4b` を確認したが、Llama/CausalLM checkpointのため既存seq2seq harnessでは評価不能だった。prompt形式・ライセンス・出力停止条件を確認する専用adapterなしに比較へ混ぜない。production routingは変更していない。

### 2026-09-15: CAT-Translate 1.4B adapter probe

公式chat-template（`Translate the following English text into Japanese.`）に従うCausalLM用audit harnessを追加し、fallback 5件を評価した。`reports/mixed-quality-cat14-fallback-v1.json` に保存。出力長や文数が改善する例はあるが、引用・数値欠落が残るため、本番cascadeには採用していない。モデルカード: https://huggingface.co/cyberagent/CAT-Translate-1.4b

### 2026-09-15: CAT-Translate full-fixture probe paused

ユーザー指示により、CAT-Translate 1.4B全17件のうち15件が保存された時点で評価を停止した。`reports/mixed-quality-cat14-all-v1.json` に途中結果を保持し、残り2件は再開可能。production routingは変更していない。

### 2026-09-15: CAT-Translate full fixture completed

CAT-Translate 1.4B mixed-quality fixtureの残り2件を再開し、全17件の候補生成を完了。統合結果を `reports/mixed-quality-cat14-all-v1.json` に保存した。production routingは変更していない。

### 2026-09-15: CAT semantic coverage

CAT全17候補のsemantic coverageを評価し、平均 min-source similarity 0.588、<0.60が8/17だった。MADLAD同fixtureの0.700を下回り、数値欠落4件・引用欠落1件もあるため、CATは本番cascadeに採用していない。

### 2026-09-15: manual review queue completed

保留7 rowsを原文・production output・fallback理由と照合し、全139/139 rowsに手動ラベルを付与した。新規確認は、GPT-3説明文と教育分析リストのsource fallback（severity 4）、HCI実験コースの目的関係のsemantic shift（severity 2）、神経科学のrule/consequence関係のsemantic shift（severity 3）、短いHCI listの軽微な用語揺れ（severity 1）、significant-other定義の軽微な逐語性（severity 1）。`npm run audit:summarize-review` の最終暫定値は、automatic accept 46.76%、pre-model fallback 35.97%、post-model fallback 17.27%、semantic error 32.37%、unsafe false accept 23.08%、extraction-induced error 18.71%。ordinary-bodyは48 rows、accept 75%、post-model fallback 25%、semantic error 31.25%、unsafe false accept 19.44%。fallback 5%以下は未達であり、これは評価完了の記録であって改善完了を意味しない。

## Fixed manual-review baseline (2026-09-15)

The current comparison baseline is the 139-row manual review in
`test-data/real-papers/audit-manual-review.json`; the reproducible aggregation
is `reports/manual-review-baseline-v1.json`. Automatic acceptance is triage
only and does not imply semantic correctness.

| Scope | Reviewed | Reader-visible fallback | Unsafe false accept (severity >=2) | Semantic error |
| --- | ---: | ---: | ---: | ---: |
| All reviewed rows | 139 | 74 (53.24%) | 15 (10.79%) | 45 (32.37%) |
| Ordinary body prose | 48 | 12 (25.00%) | 7 (14.58%) | 15 (31.25%) |

The ordinary-body rate is the product-facing baseline for the next strategy
branch. Discipline labels overlap, so discipline-specific counts must not be
summed as independent rows. The next comparison is held-out candidate/cascade
review; no alternative model is production-routed until semantic review shows
that it lowers fallback without increasing unsafe false accepts.

## Extraction audit checkpoint (2026-09-15)

The extraction-first pass found and fixed a generic page-boundary failure: contributor/correspondence metadata could be treated as an unfinished paragraph and stitched to lowercase body text on the following page. Metadata markers are now a stitching barrier, with regression coverage for source pages and bounding-box provenance. This checkpoint does not change translation behavior; translation evaluation remains paused until extraction boundary quality is complete.

## Extraction Phase checkpoint — numbered list/reference disambiguation (2026-09-15)

A real education PDF exposed a projection-layer false positive: numbered prose items (`1. Purpose and gain.` through `7. Ethics.`) inherited `reference` and disappeared from translatable content. The generic projection now downgrades bounded numbered items without author/year evidence to paragraph/list content, while citation-shaped entries and explicit References sections remain references. The regression is asserted through the real-paper baseline ground truth. Full test suite: 61 files / 315 tests passed; extraction corpus: 40/40; typecheck and lint passed. `.app` was intentionally not rebuilt per extraction goal policy.

### Extraction benchmark artifact

The extraction benchmark now persists a versioned JSON artifact (`reports/extraction-baseline-latest.json`) in addition to stdout, so role, caption, title, and source-integrity measurements can be compared across extraction iterations without involving translation.

### Extraction format coverage snapshot (2026-09-15)

The persisted extraction baseline currently covers 19 cached papers: arXiv 6, ACM 5, and one each of IEEE, KCI, Nature, OzCHI, PMLR, Springer journal, plus two unknown formats. Native source integrity is 100% across the corpus. Title exactness is tracked separately because eight rows contain catalog-versus-native title truncation or metadata differences; these are queued for manual title-region review rather than treated as body extraction failures.

## Extraction manual-review input (2026-09-15)

The extraction stream now has a reproducible review sample generator:
`npx tsx scripts/build-extraction-review-sample.ts`. The current cached corpus
produced 114 rows in `test-data/real-papers/reports/extraction-manual-sample-v1.json`.
Rows contain the native-derived text, role, page range, and bbox plus pending
manual label/severity/primary-cause fields. Automatic benchmark passes are not
used as manual ground truth.

### First rendered extraction review

`interactive-jewellery` page 2 was rendered with Poppler and compared to the
native-derived blocks. Four checks (heading, Figure 1 caption separation,
bullet ordering, and the bottom-of-column related-work boundary) were labeled
`correct`, severity 0. The review record is
`test-data/real-papers/reports/extraction-manual-review-v1.json`; broader
cross-format review remains pending.

The rendered Nature page-1 review found a low-severity generic issue: the
multi-author line is projected as a paragraph even though affiliations remain
separate. The dates/chrome rail does not contaminate body text. This is recorded
as `canonical-role-classification` severity 1 for a future style/geometry
resolver pass; no paper-specific rule was added.

### Extraction iteration: structured masthead author evidence

A generic structural predicate now recognizes long masthead author rows with
multiple affiliation markers and name-shaped tokens. It corrected the Nature
page-1 author row without adding paper-specific names or vocabulary. The
20-paper reading-order suite passed; a full extraction-corpus rerun remains
next.

The rendered IEEE/legacy `design-for-wearability` page-1 review passed three
checks: masthead separation (including no watermark contamination), two-column
abstract/body order, and Keywords boundary. All were severity 0. The result is
stored in the manual review JSON; this remains a sample, not a corpus-wide
claim.

The rendered `thermal-earring` page-13 review identified the next genuine
extraction issue: Table 1's caption and section boundaries are correct, but its
native-text header and five grid rows are projected as paragraph blocks without
a table region. This is recorded as `table_contamination`, severity 2,
primary cause `table-region-detection`; the fix must be generic geometry-based
grid detection.

## Extraction checkpoint: table row region v1 (2026-09-15)

Extraction-only iteration: table captions whose native rows are emitted as separate one-line blocks now form a conservative table region when each candidate row contains multiple native text items and lies near the caption. The `thermal-earring` Table 1 benchmark changed from region recall 0.8 to 1.0; extraction corpus remains 40/40. This does not alter translation-server behavior and has not been packaged into `.app`.

## Extraction checkpoint: masthead author evidence (2026-09-15)

A generic style/geometry evidence rule now recognizes a first-page single-line author row with multiple capitalized name-shaped tokens and affiliation markers directly following title material. The Nature neuroscience fixture's author row resolves to `author` (0.88) in the Canonical probe; no author-name vocabulary or paper-specific condition was added. Corpus regression remains 40/40.

## Extraction checkpoint: metadata heading precision (2026-09-15)

Title, author, and affiliation blocks no longer receive generic heading evidence. In the Nature probe this removes the spurious `OPEN`/title heading projections while retaining the recovered author role. Extraction corpus remains 40/40; no translation code or `.app` build was touched.

## Extraction checkpoint: benchmark after metadata precision (2026-09-15)

The cached 19-paper extraction benchmark was rerun after the metadata heading correction. Source-integrity stayed at 1.0 and extraction regression stayed 40/40. This confirms no measured safety regression while removing the Nature probe's spurious metadata headings.

Documentation consistency pass: the Nature probe's `OPEN` label is recorded as isolated metadata, while title continuation lines remain title blocks.

### Extraction workstream checkpoint (2026-09-15)

Extraction remains ahead of translation changes. The latest frontend source build, lint, typecheck, extraction corpus (40/40), and targeted Canonical/list tests (6/6) pass. Numbered/bullet projection now preserves `metadata.listRole` (`intro`/`item`) while retaining exact native source text. The Tauri `.app` was not rebuilt. Remaining acceptance work is manual cross-format verification of paragraph boundaries, heading hierarchy, and table-row canonical duplication.

The cross-page diagnostic now contains 67 paragraph spans with following-block context; 11 end without sentence punctuation and 8 are followed by lowercase-start text. These are review candidates, not automatic errors, and no new stitching rule has been promoted from this signal alone.

### Extraction checkpoint: inline styled subheadings (2026-09-15)

Hypothesis: native mixed-font items can identify same-line subsection labels without a vocabulary list. Across the cached corpus, 53 candidate lines were found; Nature page 2 was the manual ground truth. Before, `Subjects. Participants...` and `Experimental Procedure. Upon...` were single paragraph blocks. After, conservative style/geometry splitting emits separate heading and paragraph nodes, preserving source items and bboxes. The real-paper baseline now asserts both headings and following paragraphs; targeted extraction tests pass 20/20 and the corpus passes 40/40. No translation or packaged-app code changed. Remaining work is cross-format over-split review and hierarchy/provenance validation.

Resolver verification: Nature multi-author masthead is classified as `author` in the final CanonicalDocument (confidence 0.88); the paragraph role observed earlier was only the intermediate LayoutBlock. No change was required.

### Extraction checkpoint: dense CJK/numeric heading precision (2026-09-15)

A hierarchy audit exposed many intermediate heading false positives in the Chinese ergonomics PDF: long body/table lines were emitted as headings because whitespace-based paragraph heuristics do not work for CJK. Generic candidate generation now demotes long/punctuated CJK prose and numeric-only rows to paragraph while retaining numbered section headings. The representative probe retains `1. 引言`, `2. ...`, `4.1 ...` etc. Extraction corpus remains 40/40; translation code unchanged.

Extraction-only checkpoint: `thermal-earring` Table 1 canonical probe now yields one caption, three table-row nodes, and a `CAPTION_OF` table-region relation without surrounding paragraph duplication. This confirms the earlier visual table issue is resolved at canonical projection; structured cell parsing remains intentionally conservative.

Full-suite verification: after the extraction changes, `npm test -- --run` passed 61 files / 317 tests. The audit remains extraction-first and the next actions are cross-format boundary review and hierarchy coverage; translation-server work is still deferred.

Extraction checkpoint: Step-to-Charge page 8 contained math-only intermediate heading fragments. Generic heading evidence now excludes rows containing equation operators, preserving them as paragraph/equation candidates and preventing pollution of heading hierarchy. Targeted extraction baseline remains 20/20.

Extraction audit checkpoint: canonical table-caption relation audit covered 37 captions across 8 papers; every caption has one table-region relation and none are unrelated. Report: `test-data/real-papers/reports/table-caption-region-audit-v1.json`.

## Extraction-only checkpoint (2026-09-15)

The current pass remains deliberately scoped to Academic PDF extraction. The 19-paper native extraction benchmark and 40 regression tests pass after the latest evidence changes. Manual PDF/image comparisons for `interactive-jewellery` (true ACM two-column page 3) and `economics-regularized-deepiv` (single-column page 14) found no reading-order correction justified by geometry. The packaged `.app` is older than the current extraction source and was not rebuilt under the extraction-only constraint; translation evaluation is therefore not used as evidence for extraction completion.

## Extraction residual classification: DeepIV equations (2026-09-15)

Manual comparison of `economics-regularized-deepiv` page 14 confirms the full-width prose is in visual reading order. Native extraction still emits several small equation/paragraph fragments around display mathematics (for example formula rows adjacent to “Methods to compare.”). This is classified as an unresolved native-math boundary case rather than a column-order failure. No paper-specific merge rule was added; forced merging would risk swallowing genuine display equations into prose. The case remains in the Phase 3 geometry/context review queue.

## Extraction fix: table caption vs cell rows (2026-09-15)

Manual review of marketing-consumer-response page 14 found a real boundary error: the Table 1 caption absorbed the following multi-cell header/data rows. A generic native-geometry guard now stops table-caption continuation when a caption-marked line is followed by a short multi-item row. The before/after probe confirms the caption is isolated and rows remain separate source blocks; no paper-specific text rule was added. Reading-order targeted tests pass 33/33 and the real-paper baseline remains 20/20.

## Extraction fix: bold numeric table rows (2026-09-15)

The `speechin` page-3 probe exposed a resolver-level false positive: bold summary rows such as `54 English 90.5%` were being promoted to headings. A format-neutral guard now detects multi-item numeric rows adjacent to a table caption, suppresses heading evidence, and retains table evidence. Canonical output resolves these rows as table members (confidence 0.96) without changing ordinary headings.

### Extraction continuation checkpoint (2026-09-16)

The SpeechIn numeric-row correction is now locked by a canonical regression assertion: both representative summary rows resolve to `table`, while the caption remains separate. Targeted real-paper baseline passes 20/20 and the extraction corpus passes 40/40. This is an extraction-only checkpoint; translation-server changes and `.app` builds remain deferred. Next actions are cross-format paragraph-boundary review and measurement of conservative table-grid reconstruction.

Full-suite verification (2026-09-16): all 61 test files and 319 tests pass after the SpeechIn table-row canonical regression. Extraction remains the active workstream; no translation-server or packaged-app changes were made.

Lint/type validation checkpoint (2026-09-16): `npm run lint` and `npx tsc --noEmit --pretty false` pass after the latest extraction regression. The full test suite remains 61 files / 319 tests.

Corpus benchmark recheck (2026-09-16): extraction baseline regenerated successfully for 19 cached papers. Source integrity remains 1.0 and annotated figure/table/list minima remain 1.0. The remaining education ruled-table issue is still a native-text geometry limitation and is retained as a safe fallback case.

### Measurement improvement (2026-09-16)

The extraction benchmark now reports precision for annotated heading and structured table-region labels in addition to recall. The metric is conservative and only applies when ground truth exists; unannotated papers remain excluded rather than treated as negatives. Regression and real-paper baseline checks pass.

Structural precision coverage (2026-09-16): annotated list fixtures now report precision over projected list-item blocks, alongside heading and table-region precision. Metric tests pass; extraction decisions are unchanged.

### Precision audit finding (2026-09-16)

The regenerated structural metrics reveal a heading-precision gap hidden by recall-only reporting: `interactive-jewellery` scores 0.067 precision / 1.0 recall, while OzCHI scores 0.893 / 1.0 and two other annotated fixtures score 1.0 / 1.0. This is now a concrete cross-format false-positive investigation target. Annotated table-region and list precision/recall remain 1.0.

### Ground-truth precision guard (2026-09-16)

The initial precision report exposed a methodology issue: `interactive-jewellery` annotates only one heading and explicitly says the ground truth is partial, so its 0.067 precision was not a valid false-positive rate. Precision fields now require `completeAnnotations: true`; all current fixtures remain partial and are reported as unmeasured, while recall is unchanged. This prevents overfitting extraction to incomplete annotations.

### Complete heading ground truth anchor (2026-09-16)

The 15 heading labels in the rendered ACM `interactive-jewellery` PDF (pages 1–9) were manually checked and recorded as exhaustive while leaving other fields partial. The regenerated benchmark now measures heading precision 1.0 / recall 1.0 for this fixture. This is an evaluation improvement only; extraction behavior is unchanged.

Full regression checkpoint (2026-09-16): 61 test files / 320 tests pass after the complete ACM heading annotation and precision guard. The benchmark now has one valid complete heading precision anchor; other structural precision remains unmeasured until complete annotations are added.

### ACM IMWUT heading precision anchor (2026-09-16)

`thermal-earring` now has 38 manually checked exhaustive headings. Current extraction scores heading precision 0.949 and recall 0.974. The residual mismatch is recorded for evidence tracing rather than patched from paper-specific text; table header and affiliation fragments are explicitly excluded from the gold set.

Thermal heading annotation correction (2026-09-16): removed `ABSTRACT` from the exhaustive heading set because it is not emitted as a heading in this PDF's native layout. Recomputed recall is 1.0; precision remains 0.949, with `Technol.` and `Experiment Gender Average Age Race` documented as the two generic false-positive candidates.

### Generic heading precision fix (2026-09-16)

Evidence trace showed `Technol.` was a single native word ending in a period with no bold font signal, yet inherited a heading layout role. Such unnumbered unbold abbreviations are now conservatively demoted to paragraph; numbered and multi-word subheadings remain eligible. On the complete `thermal-earring` annotation, heading precision improved **0.949 → 0.974**, recall stayed **1.0**, and the existing table-header guard remained intact. No paper-specific string rule was added.

Safety regression checkpoint (2026-09-16): a broader suppression of all multi-item rows near captions reduced `thermal-earring` heading recall to 0.946, so it was reverted. The retained table-row guard still requires table-like geometry plus caption proximity; precision/recall return to 0.974/1.0. No translation code changed.

Final source validation checkpoint (2026-09-16): full Vitest (61 files / 320 tests), lint, TypeScript noEmit, and web build pass. Existing Vite dynamic-import/pdfjs warnings remain; no Tauri bundle was built under the extraction-only scope.

### OzCHI heading precision anchor (2026-09-16)

The supplied 23-item OzCHI heading ground truth is now marked exhaustive. Current extraction scores heading precision 0.893 and recall 1.0; annotated table-region precision remains 1.0. Remaining heading false positives are measurable follow-up cases, with no paper-specific rule added.

OzCHI annotation correction (2026-09-16): the supplied heading list omits front-matter headings present in the canonical output, so it is partial rather than exhaustive. `completeAnnotations` was removed; OzCHI precision is no longer reported and recall remains valid. No extraction change was made.

Structural metric summary (2026-09-16): two complete heading fixtures now average 0.987 precision (minimum 0.974) with recall 1.0. One complete table-region fixture measures precision/recall 1.0. List precision remains unmeasured until a complete list annotation is available; annotated list recall is 1.0.

### Structural metrics artifact (2026-09-16)

Created `test-data/real-papers/reports/structural-metrics-summary-v1.json`. It aggregates only complete-annotation metrics: heading precision mean 0.987 (n=2), minimum 0.974; heading recall mean 1.0 (n=4); table-region precision 1.0 (n=1) and recall 1.0 (n=2). Partial annotations are omitted.

Post-guard regression (2026-09-16): extraction corpus passes 2 files / 40 tests and the full suite passes 61 files / 320 tests after the latest evidence review. No source-integrity, hierarchy, caption, table, or list regression observed.

Hierarchy precision instrumentation (2026-09-16): heading hierarchy evaluation now exposes relation precision in addition to annotated-edge recall, with a regression test for extra edges. Partial hierarchy annotations remain excluded from precision claims.

Full regression after hierarchy precision instrumentation (2026-09-16): 61 test files / 321 tests pass and `git diff --check` passes. Translation-server and Tauri remain unchanged.

Hierarchy precision annotation guard (2026-09-16): hierarchy precision now requires exhaustive hierarchy annotations too. The prior 0.333 OzCHI value came from partial edges and was invalid; `structural-metrics-summary-v2.json` removes it. Complete hierarchy accuracy remains 1.0 where annotated, while hierarchy precision awaits a complete hierarchy fixture.

### Table-header heading fix (2026-09-16)

The remaining thermal false positive was a multi-cell title-case row near a table caption (`Experiment Gender Average Age Race`). A generic guard now uses native item count, caption proximity, and punctuation-free title-case shape to suppress heading evidence. Heading precision improves **0.974 → 1.0** with recall stable at **1.0**; broad suppression was avoided.

Metrics refresh after table-header guard (2026-09-16): `structural-metrics-summary-v2.json` now reports complete heading fixtures at mean/min precision 1.0 and recall 1.0. Complete table-region precision/recall remain 1.0 and hierarchy accuracy is 1.0 where annotated. Partial fields remain excluded.

### Complete list ground truth (2026-09-16)

The seven numbered learning-analytics items were manually checked as an exhaustive list annotation. Current list-item precision/recall are **1.0 / 1.0** in the regenerated structural metrics report.

Validation checkpoint (2026-09-16): full Vitest 61 files / 321 tests, lint, TypeScript noEmit, and `git diff --check` pass after the list annotation and metric refresh. Extraction remains active pending broader complete annotations, paragraph-stitching review, and native-grid limitations.

### Extraction checkpoint: cross-page connector continuation (2026-09-16)

Added a regression case for a native paragraph split at a page boundary after `... to`, followed by `gain ...` on the next page. The canonical projection now verifies one paragraph with page provenance spanning both pages; the targeted reading-order suite passes 34/34. This is an extraction-only change; translation-server and `.app` remain untouched.

### Extraction checkpoint: duplicate text provenance (2026-09-16)

The economics fixture visibly emits `and the proof is done. and the proof is done.` in one passage. A direct `pdftotext` extraction from the same PDF reproduces the duplicate, establishing that a generic post-extraction deduplicator would risk deleting authored text. The item is retained as a provenance-review case; no heuristic change was made.

### Validation checkpoint (2026-09-16)

After the page-continuation regression and native-duplicate provenance review: extraction corpus 2 files / 40 tests, lint, TypeScript noEmit, and diff check pass. The duplicate phrase remains an explicit source-integrity case rather than being removed heuristically.

### Visual provenance confirmation (2026-09-16)

Rendered page 38 of the economics fixture with Poppler. The repeated phrase is visibly printed in the PDF, confirming authored source duplication rather than a Paper Reader reading-order artifact. It must remain in canonical source output.

### Extraction checkpoint: provenance invariant (2026-09-16)

Added regression coverage ensuring every non-empty reconstructed block retains valid page range, native line provenance, and positive finite geometry. Reading-order suite passes 35/35; this guards Canonical provenance while page/column stitching evolves.

### Full regression checkpoint (2026-09-16)

After provenance and page-continuation coverage, the full Vitest suite passes 61 files / 323 tests. No translation-server or `.app` changes were made.

### Web build checkpoint (2026-09-16)

`npm run build` passes with the extraction changes. Vite reports existing ineffective dynamic-import warnings; no new failure was observed. Tauri packaging remains intentionally out of scope.

### Ground-truth coverage audit (2026-09-16)

There are 5 ground-truth metadata fixtures, of which 3 have `completeAnnotations`. Exhaustive measurements currently cover headings in 2 fixtures, table regions in 1, and list items in 1. `design-for-wearability` is title-only and OzCHI is intentionally partial, so their precision is not reported.

### Baseline regeneration (2026-09-16)

Ran the extraction benchmark across all 19 cached real-paper PDFs. The report regenerated successfully; optional `canvas` polyfill warnings do not prevent native text extraction. This is measurement-only and does not alter translation code.

### Generic title threshold fix (2026-09-16)

The Education Learning Analytics fixture exposed a generic title false negative: its title was only ~1.27× body font and was classified as affiliation under the 1.28× threshold. Lowered the title threshold to 1.22× while retaining page-one, size, length, and metadata exclusion guards. The title now resolves correctly; extraction corpus remains 2 files / 40 tests passed.

### Full regression after title fix (2026-09-16)

Vitest passes 61 files / 323 tests after the generic title-threshold adjustment. The Education title probe remains correctly classified, with no translation-server or `.app` changes.

### Lint checkpoint (2026-09-16)

`npm run lint` passes after the generic title-threshold adjustment.

### Benchmark refresh after title fix (2026-09-16)

The 19-paper extraction benchmark was rerun. Education now emits the expected title text; the remaining `titleExact=false` is due to catalog/string normalization rather than missing native title content. Source integrity remains 1.0.

### Title-threshold benchmark safety check (2026-09-16)

After refreshing all 19 cached papers, interactive-jewellery and thermal-earring heading anchors remain precision/recall 1.0, with source integrity 1.0. Education emits the expected title text; its catalog exactness mismatch is not an extraction loss.
### Extraction checkpoint — education title ground truth (2026-09-16)

The Education arXiv fixture had an incorrect expected title (`Learning Analytics: Challenges and Opportunities`) that did not match the native PDF. `pdftotext` and the canonical probe both show `Educational Data mining and Learning Analytics: An updated survey`. The ground truth and baseline test now use that native title and assert an exact match. The 19-paper benchmark and extraction corpus tests pass; no translation code was changed.
### Extraction checkpoint — wrapped Nature title (2026-09-16)

The neuroscience fixture exposed a measurement gap: three native title lines were correctly combined by `resolveTitle`, but the benchmark selected only `blocks[role=title][0]`. The benchmark now reports the canonical resolved title and asserts the complete title for this Nature-style PDF. Targeted cached-paper extraction tests pass 20/20; no translation code changed.
### Extraction checkpoint — masthead badge contamination (2026-09-16)

Native inspection of the Nature-style neuroscience PDF found an isolated all-caps masthead badge being labeled `affiliation`. A generic geometry/style guard now avoids inventing an affiliation for short single-item all-caps marks before the title. This reduces chrome contamination conservatively; the cached real-paper extraction baseline passes 20/20.
### Extraction validation checkpoint — masthead guard (2026-09-16)

Post-change validation is green: extraction corpus 2 files / 40 tests, lint, and TypeScript noEmit. The guard remains scoped to native geometry/style evidence and has not changed translation code.
### Extraction checkpoint — conservative wrapped/masthead title resolution (2026-09-16)

An HCI arXiv PDF exposed a resolver gap: a large masthead title was initially labeled `author`, while the arXiv metadata line was paragraph text. Native size/length evidence now contributes a strong title score, and `resolveTitle` considers that score without changing the candidate's other roles. The complete HCI title is recovered and the arXiv identifier is not selected. Targeted baseline: 20/20.
### Extraction benchmark checkpoint — 19-paper refresh (2026-09-16)

After the generic HCI masthead-title change, the 19-paper baseline was regenerated successfully. Aggregate title exact-match improved from 0.632 to 0.684; the HCI fixture is now exact. Six remaining mismatches are retained as explicit follow-up cases rather than paper-specific patches. Extraction corpus tests remain 2 files / 40 passed.
### Extraction checkpoint — arXiv versioned title metadata (2026-09-16)

The linguistic arXiv PDF is version 4 and visibly uses the revised title “Learning Hierarchical Language Structures”; catalog metadata still contained the older v1 title. The catalog and regression expectation now reflect the native PDF. Targeted extraction baseline passes 20/20.
### Extraction benchmark checkpoint — catalog/native title audit (2026-09-16)

Native first-page checks corrected stale catalog metadata for the marketing arXiv and Chinese ergonomics fixtures. The 19-paper benchmark now reports title exact-match **0.842**; extraction corpus tests remain **2 files / 40 passed**. Three remaining mismatches are explicit follow-up cases and were not patched with parser-specific rules.
### Extraction checkpoint — title compound hyphen preservation (2026-09-16)

The ISWC title `On-Body` was reconstructed as `OnBody` because title joining removed every line-ending hyphen. The generic joiner now preserves a hyphen when the next line begins with an uppercase token, while retaining dehyphenation for lowercase continuations. Targeted extraction baseline passes 20/20.
### Extraction benchmark checkpoint — title normalization (2026-09-16)

After preserving intentional compound hyphens, the 19-paper title exact-match metric is **0.895 (17/19)**. Only `step-to-charge` and `fashion-hybrid-cmf` remain explicit native-title review cases. No paper-specific parser branch was added.
### Extraction benchmark checkpoint — current corpus title closure (2026-09-16)

Native first-page checks corrected the final two stale catalog titles (`step-to-charge`, `fashion-hybrid-cmf`). The current 19-paper cache now reports title exact-match **1.0 (19/19)**, and the extraction corpus test suite remains **2 files / 40 passed**. This is title coverage for the cached corpus, not completion of the broader extraction goal; paragraph, table, caption, and additional publisher-format review remain.
### Full regression checkpoint — extraction title work (2026-09-16)

The full Vitest suite passes **61 files / 323 tests** after the current extraction changes. This validates no regression in existing non-translation behavior; the broader extraction goal remains open for manual structural review and additional formats.
### Validation checkpoint — current extraction state (2026-09-16)

Lint, TypeScript noEmit, and full Vitest are green (`61 files / 323 tests`). The cached corpus title metric is 19/19 exact. The goal remains open for structural manual review and broader publisher-format coverage; no translation changes were introduced.
### Structural audit checkpoint — cross-page adjacency triage (2026-09-16)

The existing cross-page report covers 21 papers and 67 boundary rows. Ten boundaries are high-risk by punctuation/capitalization signals; inspection shows they span headings, captions, lists/tables, references, and ordinary page transitions. Because adjacency is not proof of an erroneous merge, no aggressive stitching was added. These rows remain the next visual/manual review set.
### Build validation checkpoint — page geometry typing (2026-09-16)

The production Web build caught a missing optional `pageWidth` field on `LayoutLine`; it is now propagated from page layout into line construction. `npm run build` passes with only existing dynamic-import warnings. Tauri `.app` was not built.
### Reading-order validation checkpoint — page geometry propagation (2026-09-16)

The focused reading-order suite passes **35/35** after the page-width propagation fix. Existing page/column continuation and provenance checks remain green; broader manual boundary review is still pending.

## Extraction boundary triage — 2026-09-16

A conservative scan of all 19 cached PDFs flagged 8 long or sentence-like affiliation candidates across 7 papers. It found no long figure-caption boundary candidates. The affiliation results include multilingual mastheads and possible extraction contamination, so they are triage evidence rather than labeled failures. No paper-specific rule or translation change was made. The next step is native geometry/style inspection of each candidate, prioritizing the Chinese abstract-like block and the HCI sentence-like block, followed by a generic regression only if the same boundary pattern recurs.

### Confirmed boundary case: bilingual abstract above masthead

Visual review of `ergonomics-human-factors-ihci.pdf` page 1 confirms that the long Chinese `摘要 …` block is an abstract, not affiliation. The current line/block grouping labels it affiliation because it appears before the detected masthead boundary. A line-level demotion experiment did not affect the grouped block and was reverted after the regression assertion failed (39/40). The next fix must operate at masthead boundary/group formation using native geometry and bilingual section structure; no paper-specific string rule is justified.

A second experiment that demoted long CJK prose during `roleForLine` likewise did not change the already formed affiliation block and was reverted (`19/20` focused baseline). This narrows the defect to masthead boundary/group formation rather than final line-role scoring.

### Bilingual abstract boundary fix — 2026-09-16

**Hypothesis:** long, dense CJK prose in the masthead region is a translated abstract rather than affiliation metadata.

**Before:** `摘要 …` was grouped and labeled `affiliation`.

**After:** a generic native CJK density/length guard classifies the block as `paragraph`. Focused baseline remains 20/20 and the extraction corpus remains 2 files / 40 tests. No keyword list or paper-specific branch was introduced. The rule is kept; next work is to review the remaining seven papers' affiliation candidates for the same geometry pattern.

### Spanning abstract continuation — 2026-09-16

**Hypothesis:** a substantive lowercase line at the top of a second column is a continuation of spanning abstract/caption content, not affiliation metadata.

**Before:** `and demonstrates how to write a successful CHI paper...` was an `affiliation` block before `ABSTRACT`.

**After:** the generic native text-shape guard classifies it as `paragraph`. HCI baseline remains 20/20 and the full extraction corpus remains 2 files / 40 tests. The guard is kept; no paper-specific phrase rule was used.

## Extraction boundary review update (2026-09-16)

A native visual check of `power-over-skin.pdf` pages 2–3 was completed for the high-risk cross-page report row. The printed two-column layout confirms a right-column to next-page-left reading-order continuation, while the later `current of 45 mA` text is a distinct engineering/safety passage and must not be merged by a generic rule. Existing paragraph stitching therefore remains conservative. No translation-server or packaged-app code was changed.

The `dont-mind-me` page 1–2 boundary was visually checked and regression-covered. The paragraph ending in `particular social` continues with `situations. One such example` on page 2; the current resolver produces one paragraph spanning pages 1–2 with preserved provenance. Focused baseline: 20/20.

### Open residual: figure-region contamination

Visual review of `step-to-charge.pdf` pages 10–12 found that the safety-study paragraph is contaminated by native text extracted from the figure panel labels before the `Fig. 3` caption. The following page-boundary prose continuation is correctly stitched. This is a confirmed extraction failure requiring a generic geometry/figure-region boundary solution; a paper-specific rule would be unsafe and was not added.

### Figure-label stitching fix (2026-09-16)

Root cause was identified at `mergeColumnContinuations`: a short, punctuation-free, multi-cell block near the top of the next page was treated as an uppercase sentence continuation. A conservative geometry-first `isLikelyFigureTextBlock` guard now excludes such blocks from cross-page paragraph stitching. On `step-to-charge`, the safety paragraph no longer contains figure panel labels, while `Fig. 3` remains a separate caption. Extraction corpus: 40/40; lint: pass. The guard is generic and contains no paper-specific vocabulary.

The boundary scanner now reports paragraph-internal `Fig./Figure N:` candidates for triage. The 19-paper run produced 45 candidates, predominantly ordinary in-text figure references; visual review of `ppg-earring` page 5 confirmed a legitimate column continuation. Because the signal cannot distinguish references from embedded labels by text alone, it remains report-only; native geometry is required before any further parser change.

Post-fix safety validation: extraction corpus **40/40**, TypeScript noEmit, lint, and Web build all pass. The build emitted only existing ineffective dynamic-import warnings. Tauri `.app` remains intentionally unbuilt.

### List structure audit (2026-09-16)

A 19-paper scan of bullet/numbered starts was reviewed against the projection path. The raw signal also matches equations, references, and numbered prose, so it cannot be used as a parser rule. Existing projection splits flattened bullet sequences into separate blocks with `listRole=intro/item`; the complete learning-analytics annotation measures precision/recall 1.0. No additional list heuristic was justified.

### Table-heavy education audit (2026-09-16)

Page 20 of `education-learning-analytics.pdf` was rendered and compared with Canonical output. Tables 9–11 have visible ruled grids. Table 9's first row is represented by table nodes; portions of Tables 10–11 remain paragraph-shaped due unstable native cell coordinates. Captions are separate and source text is preserved. This remains a low-confidence native-grid limitation, so no overfitting cell heuristic was added.

Benchmark refresh after table/list review: all 19 cached papers completed; title exact **19/19**, source integrity minimum/mean **1.0/1.0**. Native table-cell limitations remain tracked as low-confidence fallback cases.

The table resolver path was reviewed: every table caption yields a table node; structured region membership requires aligned multi-item native geometry, while unstable grids use a caption-only fallback. This keeps provenance and avoids fabricated cell structure. Current benchmark source-integrity remains 1.0 across 19 papers.

Full regression after the table and figure audits: Vitest **61 files / 323 tests passed**. No translation-server or packaged-app changes were made.

Added exhaustive table-caption ground truth for Tables 9 and 10 on the education page-20 fixture after visual/native inspection. Table 11 remains unannotated until its later-page caption boundary is reviewed; no partial claim is made for it.

Rendered page 22 of the education fixture and verified Table 11 is a ruled table with a separate caption. Added its exact native caption to exhaustive ground truth. Focused real-paper baseline remains 20/20.

Benchmark after annotating education Tables 9–11: `tableCaptionRecall=1.0`, list precision/recall `1.0/1.0`, source integrity `1.0`. Table-region precision/recall remains unmeasured for this fixture because native cell evidence is incomplete; the resolver keeps caption-only fallback rather than fabricating a grid.

### Catalog/cache coverage

The catalog has 21 papers, of which 20 PDFs are cached. `wear-scale` (Springer Open) is now cached and benchmarked; only `precious-materials` (Nordes) remains unavailable. Cached coverage includes ACM, Springer journal, Springer Open, IEEE conference, arXiv, KCI, OzCHI, Nature, PMLR, and unknown formats. No expected structure was invented for the missing PDF.

The wear-scale benchmark is currently limited to native extraction, title, and source provenance (`titleExact=true`, `sourceIntegrityRate=1.0`). Structural captions/tables will be annotated only after manual visual comparison.

Manual comparison of page 14 found a rotated Table 6 whose native text is currently interleaved (`TableFactor…`) and emitted as paragraph-shaped content. This is a confirmed generic rotated-table failure; it remains unresolved pending orientation-aware table-region evidence.

The extractor now preserves each native text item's PDF-matrix rotation as provenance in production and regression paths. Roles are intentionally unchanged until orientation-aware grouping evidence is implemented and benchmarked.

The wear-scale probe found 248 native text items at 90° rotation, providing a measurable signal for generic orientation-aware table grouping.

Line clustering now requires compatible native rotation (within 10°), preventing rotated labels from contaminating horizontal body lines. Internal rotated-grid reconstruction remains pending.

The catalog smoke assertion for a table caption was removed for this case until manual ground truth is available; this avoids treating an unverified expectation as a passing metric. Extraction corpus now passes 42/42.

### Extraction checkpoint: rotated table role (2026-09-16)

The existing resolver now receives high-confidence evidence for large numeric-rich rotated native grids. `wear-scale` page 14 is regression-covered as containing a canonical `table` node, preventing the correlation matrix from being treated as ordinary translation prose. The threshold is geometry/content based (30+ rotated items, >=30% numeric), with no paper vocabulary. Tests: extraction corpus 42/42, typecheck pass, lint pass. Caption ordering and stable cell grid remain unresolved.

### Extraction checkpoint: rotated baseline ordering (2026-09-16)

`joinItemTexts` now uses the median native rotation to project item positions onto the text baseline for predominantly rotated lines. This is a format-neutral ordering fix for rotated captions/cells; ordinary horizontal text is unchanged. Reading-order 37/37 and extraction corpus 42/42 remain green. Caption visual confirmation and stable cell-grid reconstruction remain pending.

### Extraction checkpoint: rotated caption role recovery (2026-09-16)

Rotation-backed caption recognition now classifies reverse-stream table captions as `caption`, enabling the existing caption→table relation without modifying native text. The `wear-scale` canonical probe confirms the caption node and table node coexist on page 14. Extraction corpus remains 42/42; no translation or app bundle changes.

### Extraction checkpoint: compact rotated table label (2026-09-16)

Caption detection accepts compact native labels such as `Table6...` when the text begins with a table marker and number. This handles spacing loss in rotated PDF streams while preserving ordinary prose precision. Extraction corpus remains 42/42; typecheck and diff checks pass.

### Extraction-only continuation (2026-09-16)

翻訳品質の監査へ進む前に、抽出側の安全性を再確認した。全20 cached papersで source-policy verifier を実行し、明示的な39件の不完全/不整合候補はモデル送信を抑止したまま維持された。抽出コーパスは42/42、source integrity benchmark は20 papersで最小・平均とも1.0。これは抽出全体の正解率を意味せず、未完結段落の修復、表グリッド、融合見出し、手動境界レビューは継続課題である。翻訳サーバーはこの段階では変更しない。

### Native extraction visual spot-check (2026-09-16)

原PDFをレンダリングして3ページを目視照合した。PPG Earring p.2では2段組本文、上端著者header、統計値行の位置を確認した。SpeechIn p.3ではpublisher header、導入文、箇条書き、Table 1 captionと表本体を確認し、summary rowの見出し誤分類を修正した。Regularized DeepIV p.14では上端数式と本文の境界を確認し、回転/数式のnative geometryを保持したまま低信頼部分をparagraph/equationへfallbackしている。これらは代表spot-checkであり、全corpusの手動precision/recallを意味しない。

### Extraction Phase checkpoint: captionless aligned grid (2026-09-16)

PPG Earring p.7で、captionのないComponent/Weight表が5行のparagraphへ連結される例を確認した。native textには各行の反復x位置と数値セルがあり、generic table evidenceを構造grid条件（3行以上、複数item行、数値セル2つ以上）で0.95に引き上げる汎用変更を追加した。単一列本文を同条件でtableへ昇格させないため、tableLikeのgeometry条件を前提にしている。corpus 42/42は通過。canonical最終投影でcaptionless regionがどの経路に現れるかは次回確認課題として残す。

### Extraction Phase checkpoint: table projection boundary (2026-09-16)

text-bearing table candidateをPaper projectionのparagraph処理から分離し、翻訳へ送らない`type: table` blockとして保持する経路を追加した。caption由来のtext-less synthetic regionは既存caption blockへ集約するため重複しない。TypeScriptおよびpipeline/baseline focused testsは通過。captionless gridの最終canonical roleと実UI表示は次回の追加確認対象。

### Extraction Phase checkpoint: captionless table end-to-end verification (2026-09-16)

PPG Earring p.7を実pipelineで再抽出し、Component/Weight gridがCanonical `table`、Paper projectionでも`type: table`かつ`translationStatus: skipped`になることを確認した。これにより表セル列を通常paragraphとしてMADLADへ渡さない。今回の確認は1実表のend-to-end evidenceであり、corpus全体のtable-region recall完了を意味しない。

### Extraction Phase checkpoint: captionless table regression locked (2026-09-16)

PPG Earring実PDFのcaptionless Component/Weight gridについて、Canonical role、PaperBlock type、translation skipを検証する回帰テストを追加した。extraction configで22 testsが通過。単一形式の保護であり、全publisherのtable-region recallは引き続き未完了。

### Extraction Phase checkpoint: corpus benchmark after table projection (2026-09-16)

20 cached papersを再ベンチマークし、source integrity平均1.0、既存table-region評価対象の平均recall 1.0、title exactness 0.9を維持した。captionless table regressionを含むextraction testsは22/22通過。手動の段落境界・全publisher表recallは引き続き未完了。

### Extraction Phase checkpoint: full regression after table projection (2026-09-16)

全Vitest 61 files / 328 tests、lint（警告0）、TypeScriptが通過。captionless table projection変更による既存回帰は確認されなかった。全corpusの手動境界レビューとpublisher横断table recallは未完了であり、抽出完了とは扱わない。

### Extraction Phase checkpoint: hyphen continuation equation safety (2026-09-16)

PPG Earring p.10の単独改行ハイフンを、未完結paragraph直後のneighbor evidenceでequationからparagraphへfallbackさせた。これは数式記号一般を禁止するものではなく、page/column、前段落の終端、近接geometryを併用する。実PDF回帰を含むextraction testsは22/22通過。診断用Layout dumpの物理roleとCanonical最終roleは異なり得るため、今後も両方を分けて評価する。

### Extraction Phase checkpoint: source policy after boundary safety (2026-09-16)

最新のtable projection / hyphen continuation変更後にsource-policy verifierを再実行し成功。39 explicit violationsは全て`wouldSubmitToModel=false`のままで、危険な抽出断片を翻訳へ流さない境界を維持した。これは安全抑止の検証であり、警告原因のnative画像照合完了を示さない。

### Extraction Phase checkpoint: bundle validation (2026-09-16)

抽出変更を含むWeb buildが成功した。表示されたdynamic-import warningsは既存のchunk最適化に関するもの。Tauri `.app`は今回のgoal範囲外として未ビルド。

### Extraction Phase checkpoint: corpus table-node inventory (2026-09-16)

20 cached PDFを実pipelineで走査し、Canonical table node 538件、Paper table block 520件を得た。これにはcaption由来のtext-less synthetic regionが多数含まれるため、件数を精度指標として扱わない。captionless text-bearing gridのpublisher別precision確認を継続する。

### Extraction Phase checkpoint: table projection precision guard (2026-09-16)

text-bearing table候補には数式断片も含まれることを横断走査で確認した。3行layout条件だけに依存するとresolver後のlookup欠落で実表を落とすため、native boundingBoxes数を併用する保守的条件へ修正。PPG captionless grid回帰は22/22通過。数式のtable誤投影をpublisher横断で測るテストは未完了。

### Extraction Phase checkpoint: captionless table precision recheck (2026-09-16)

通常本文のtable誤投影リスクを横断走査で確認し、文中句読点を持つtext-bearing候補をprojection対象外にした。小数点は除外せず、PPG gridは維持。Paper table block inventoryは423から80へ減少したが、これはprecision guardの影響を示す診断値であり、publisher横断recallの完了指標ではない。

### Extraction Phase checkpoint: extraction corpus after table precision guard (2026-09-16)

最新guard後のextraction corpusは2 files / 43 testsが通過した。captionless table回帰を含むcached-paper checksに回帰はない。手動のparagraph/table precision確認は未完了。

### Extraction Phase checkpoint: table precision audit calibration (2026-09-16)

長文table候補ゼロという単純不変条件は、captionや複合構造を誤って拒否するため採用しなかった。追加テストは撤回し、PPG実表回帰22/22を維持。table precisionはpublisher別のnative geometry＋caption provenance正解データで評価する。

### Extraction Phase checkpoint: equation/algorithm table projection guard (2026-09-16)

Algorithm/Require本文や数式断片がtable candidateになる例を確認し、projectionでそれらを除外するmath-symbol / prefix guardを追加した。PPG実表回帰は22/22通過。診断上のPaper table block数は132で、これはcaption regionと残存候補を含むためrecall/precisionの確定値ではない。

### Extraction Phase checkpoint: page-grid and rotated-table review (2026-09-16)

抽出優先方針に従い、翻訳品質の評価へ進む前に表境界を再確認した。`wear-scale` p.14 は回転相関行列と表外脚注が同一ページにあり、native x/y geometry だけで表セル帯を分離できる一方、脚注を同一 block に吸収する境界が残る。ページ局所の反復 x 列・数値セル密度から table evidence を生成する保守的な実装と synthetic regression を追加した。reading-order 41/41、extraction corpus 43/43、build/lint/typecheck は成功。表後脚注の手動境界確認と publisher 横断の table precision/recall は未完了であり、翻訳サーバー変更は保留している。

### Extraction work clean stop (2026-09-16)

今回の抽出フェーズは、回転 native item に基づく line/block 境界ガードまで実装・検証した地点で停止した。実行中プロセスはなく、作業ツリーはクリーン。次回の再開点は `wear-scale` p.14 の回転表セル帯と表外脚注の x帯連続性を native geometry で検証すること。翻訳サーバーの変更や `.app` ビルドは行っていない。

### Extraction baseline revalidation (2026-09-16)

停止点から再開して extraction corpus と 20-paper benchmark を再実行。reading-order real papers 21/21、extraction corpus 43/43、既存 source-integrity は 1.0 を維持した。回転表の表外脚注混在は未解決のため、翻訳フェーズへは進めていない。

### Focused extraction regression recheck (2026-09-16)

重点回帰（reading-order + canonical pipeline）は 46/46 通過。ページ・列跨ぎ stitching と既存 heading/caption/table 合成ケースに安全回帰なし。回転表の残存混在は未解決のため、抽出完了判定および翻訳フェーズ移行は保留。

### Rotation coordinate probe (2026-09-16)

`wear-scale.pdf` p.14 の native transformを再確認。回転表セルは x≈162–414、表外Cronbach脚注は x≈428–440 に集中し、x帯の空隙が境界 evidence になる。ただし表ヘッダにも広いitemがあるため幅だけの閾値は採用せず、近傍行クラスタと組み合わせた回帰を次回追加する。

### Rotated x-band regression (2026-09-16)

回転セル群と広い回転注記を同一baselineに置く一般化合成回帰を追加。reading-order suite は 42/42 通過し、表セルと注記の再結合を防ぐ既存guardを固定した。

### Rotated band guard validation (2026-09-16)

回転line間のx帯分離guardを追加し、重点回帰47/47、extraction corpus43/43を通過。既存の合成表・列跨ぎ・source integrityに回帰なし。実PDFでのtable region完全再構成は未完了。

### Rotated band benchmark (2026-09-16)

x帯guard後の20-paper benchmarkで、`wear-scale` は rotated items 248、rotated lines 33、flattened numeric rows 11、source integrity 1.0。重点回帰47/47、extraction corpus43/43。完全なtable region分離は未完了。

### Extraction guard verification (2026-09-16)

x帯guard後に型チェック、lint、buildを実行し成功。既知のpdfjs eval／dynamic import警告のみ。重点回帰47/47、extraction corpus43/43、20-paper benchmarkを維持。

### Full regression after extraction guards (2026-09-16)

全Vitest 61 files / 332 tests が通過。回転表境界回帰を含む。Canonical table region完全分離とpublisher横断手動precision/recallは未完了。

### Rotated table x-band split (2026-09-16)

回転lineのnative x帯ジャンプをblock merge境界に反映。`wear-scale` p.14で従来56行に混在していた表セル＋本文を分離し、Cronbach注記／本文は独立block化した。重点回帰47/47通過。全extraction corpus再走査は次工程。

### Rotated table boundary corpus verification (2026-09-16)

x帯ジャンプguard後、extraction corpus43/43と20-paper benchmarkを再実行。`wear-scale` flattenedNumericRowCountは11から4へ減少し、rotatedLineCount=33、sourceIntegrityRate=1.0を維持。残る表外注記境界は手動レビュー対象。

### Canonical role probe after x-band split (2026-09-16)

`wear-scale` p.14で、表セル由来blockは skipped paragraphとして保持され、Cronbach注記・後続本文は独立pending paragraphになった。表行のCanonical table昇格は未達だが、混在blockの翻訳送信は解消。

### Rotated table canonical role audit (2026-09-16)

x帯split後、表セル行と表外注記は別blockになったが、回転表のTableラベル／caption本文が別native lineのため、caption依存resolverではtable role昇格に至らない。論文専用文字列再構成は避け、rotation-aware caption provenanceを次回検討する。

### Rotated table candidate evidence audit (2026-09-16)

`wear-scale` p.14のgeneric candidatesで回転表行の多くに `table=0.96` evidenceを確認。Canonical node／regionとPaperBlock projectionの対応を分けて計測する必要がある。

### Rotated table projection guard (2026-09-16)

回転native itemの数・数値密度・複数bboxを用いた保守的なtable projection条件を追加。重点回帰47/47、extraction corpus43/43、20-paper benchmark成功。wear-scale flattened rows=4、source integrity=1.0。

### Extraction checkpoint after rotated projection (2026-09-16)

重点回帰47/47を再確認。表行の誤翻訳送信を防ぎ、注記を独立block化する安全側挙動を維持。回転caption provenanceとpublisher横断手動table precision/recallは未完了。

### Rotated table projection revalidation (2026-09-16)

回転table nodeをcanonical boxes＋数値密度で保守的にPaperBlockへ投影。wear-scale p.14でtable block生成を確認。extraction corpus43/43、flattened rows=4、source integrity=1.0。caption provenance計測は継続。

### Rotated table projection regression (2026-09-16)

`wear-scale` real-paper fixtureでp.14のtable PaperBlock生成とskipped状態を回帰化。extraction corpus 44/44。caption provenance完全測定は継続。

### Extraction verification checkpoint (2026-09-16)

停止前の再検証として extraction corpus 2 files / 44 tests を実行し全件成功。今回の確認ではコード変更を行わず、既存の回転表境界・table projection回帰が維持されていることを確認した。未完了項目は回転caption provenanceとpublisher横断の手動評価。

### Rotation-aware caption continuation (2026-09-16)

ラベル単独行に続くcaption本文の分離を改善。緩和条件は`Table/Figure + 番号`の完全一致ブロックに限定し、通常caption後のheadingを巻き込まない。既存回帰は reading-order 47/47、extraction corpus 44/44。

### Rotated caption regression fixture (2026-09-16)

`Table 6` ラベルとタイトル本文の分離を再現する回帰fixtureを追加。rotation-aware caption continuationで同一table_captionへ結合し、reading-order 43/43 成功。

### Caption fixture verification (2026-09-16)

回転captionラベル継続fixtureと20-paper extraction benchmarkを再確認。reading-order 43/43、wear-scale sourceIntegrityRate=1.0。回転caption provenanceのpublisher横断評価は継続。

### Caption relation metric (2026-09-16)

table captionの`CAPTION_OF` relationをground truth付きで測れるoptional benchmark metricを追加。既存fixture互換で、抽出ロジックと翻訳serverは変更していない。

### Table caption relation metrics (2026-09-16)

Resolved table caption-to-table `CAPTION_OF` relations are now reported with recall/precision fields. Metrics remain diagnostic until manual ground truth is expanded; no translation changes.

### Table relation metric correction (2026-09-16)

table caption relation precisionの分母定義を修正し、figure relationが混入しないようにした。指標は診断用で、抽出・翻訳挙動は変更していない。

### Table relation benchmark rerun (2026-09-16)

20-paper benchmark再生成。table relation metric対象10本のprecision平均は1.0、recallはcaption分割／未検出により分野・形式ごとの差が残る。wear-scale回転captionはrecall 0で、未解決課題として保持。

### Ground-truth caption recall (2026-09-16)

table caption relation recallの分母をground truth caption数へ変更。未検出captionを正しくrecall低下として計測する。抽出挙動と翻訳serverは変更なし。

### Ground-truth relation rerun (2026-09-16)

20-paper再計測でtable caption relation recall平均0.71875（goldあり10本）、precision 1.0。wear-scale回転caption=0、OzCHI=1.0。低recallは未検出・分離captionとして次の手動分類対象。

### Latest caption relation values (2026-09-16)

最新reportではgoldあり10本のtable relation recall平均0.71875、precisionは定義可能な9本で1.0。wear-scaleは回転caption未検出でrecall 0。誤relationを増やさず未解決として記録。

### Rotated table prose remerge fix (2026-09-16)

回転表先頭line＋本文の再結合を、回転native lineの有無が異なるblock間では禁止。wear-scale p.14の混在block消失を実測し、reading-order 43/43、extraction corpus 44/44を確認。

### Post-guard benchmark (2026-09-16)

回転line guard後の20-paper benchmarkを再生成。wear-scaleはsource integrity 1.0、flattened rows 4、rotated items 248 / lines 33。表本文への誤再結合は消失し、残4行はregion分類課題。

### Rotated prose remerge regression (2026-09-16)

回転表行と後続通常proseの再結合を防ぐfixtureを追加し、reading-order 44/44を確認。特定論文文字列には依存しない。

### Wear-scale caption provenance probe (2026-09-16)

wear-scale p.14で回転表セルはtable nodeへ投影され、本文混在はない。一方、表直下の回転短heading `Inter-item correlation matrix` はcaptionにならず、CAPTION_OF=0。次回は一般的な表region近接 geometry evidenceを評価する。

### Rotation-aware table caption promotion (2026-09-16)

Resolverで回転短headingを直上table regionとのgeometry evidenceによりcaptionへ昇格。wear-scale p.14でCAPTION_OF=1を確認。reading-order 49/49、extraction corpus 44/44。通常headingへの誤昇格を避ける保守条件。

### Post-promotion benchmark (2026-09-16)

caption昇格後の20-paper benchmarkを再生成し、gold対象10本のrelation recall平均0.71875、precision 1.0を維持。wear-scaleのCAPTION_OF=1は実probe済みだがgold未登録で集計対象外。

### Wear-scale caption ground truth (2026-09-16)

wear-scaleのground truth metadataを追加し、回転caption provenanceを評価可能化。再benchmarkでtable region recall 1、caption relation recall 1、source integrity 1。layout caption recall 0は分離状態の診断値。

### Wear-scale ground truth regression (2026-09-16)

wear-scale caption ground truth追加後のextraction corpusは44/44成功。回転caption relation評価を継続可能な状態にした。

## Extraction continuation checkpoint — 2026-09-16

最新20-paper extraction benchmarkを再実行し、table caption metricをresolved `CAPTION_OF → table` provenanceにも対応させた。gold relation recall平均は0.81875（10 papers）、wear-scaleはcaption recall/relation recallとも1.0。figure captionをtable metricへ混入させない制約を維持。抽出 corpus 44/44、pipeline 5/5、typecheck成功。翻訳server／モデル／`.app`は未変更。残課題はpublisher横断のcaption provenance、linguistics PDFの数値行16件のtable-region判定、および手動レビュー拡充。

## Chart-label evidence checkpoint — 2026-09-16

linguistics-language-model-physics のグラフ軸・チャート数値ラベルについて、同一ページ・列の反復x座標をnative geometry evidenceとして`other`競合スコア化した。table caption近傍と複数セル行は除外し、Resolverの最終判断を維持。flattenedNumericRowCount 16→10、sourceIntegrityRate 1.0。pipeline 5/5、extraction corpus 44/44、通常build成功。誤除外の横断評価は未完了。

## Marketing caption relation checkpoint — 2026-09-16

`marketing-consumer-response`へTable 1のpartial ground truthを追加。native caption text recallは1.0だが、resolved `CAPTION_OF → table` relation recallは0。caption本文の抽出は成功している一方、table region／relation provenanceが未復元であることを切り分けた。sourceIntegrityRateは1.0。次回はこのarXiv単段表のnative geometryを調査する。
### Extraction checkpoint: prose/table boundary guard (2026-09-16)

Marketing PDFで確認された、Table caption近傍の文章がtable roleへ誤昇格する可能性に対し、`nearbyTableRowEvidence`へ一般的なprose-likeness guard（単語数、文末句読点、文字/数字比率）を追加。caption近傍でも文型blockはparagraphへ残すsynthetic regressionを追加し、pipeline test 7/7を確認。全corpus再計測とpublisher横断table precision確認が次アクション。

全extraction corpus再計測は44/44（reading-order 21、baseline 23）で成功。既存real-paperの安全回帰は観測されなかった。table precisionの定量化は、未注釈のprose/table境界を手動ground truthへ追加してから実施する。

静的検証としてTypeScript型チェックとlint（warnings 0）も成功。今回の変更は抽出層と回帰テスト・監査記録のみで、translation-server/.appは変更していない。

### Structural-grid prose guard (2026-09-16)

長い文型blockが複数行・複数native itemを含んでも、回転表以外ではtable昇格スコアを抑制するguardを追加。marketing benchmark再生成でtitle、table caption recall、source integrityは各1.0を維持し、caption relation recallは0のまま。captionと本文が同一native blockに混ざる問題は継続調査。

### Running table-reference guard (2026-09-16)

`Table 4 shows ...` のような本文中の表参照をcaptionと誤認しない叙述動詞guardを追加。synthetic pipeline 8/8、extraction corpus 44/44。marketingのcaption relation recallは未改善だが、誤caption化の回帰は確認されていない。

### Caption-to-region boundary guard (2026-09-16)

caption継続中にcell-likeなnative行（複数item、数式記号、高数値密度）が現れたらcaptionを終了するgeometry/content guardを追加。Table 2のcaptionと式行を分離するsynthetic回帰を追加し、pipeline 9/9、extraction corpus 44/44成功。

実PDF再抽出ではTable 2がcaption 1行と後続式行に分離され、`Table 4 shows ...` はparagraphへ分類された。Table 4のheader行など一部cell-like行はまだequation/paragraphへ分散しており、table regionの確実な束ねは未完了。

### Caption-adjacent row evidence (2026-09-16)

caption近傍のcompactな複数native item行について、x列反復または同一bandの複数rowをtable evidenceに利用。sentence-shaped proseは除外し、pipeline 9/9・extraction corpus 44/44を維持。Canonical table regionへのmembership反映は未完了。

全Vitest 61 files / 338 tests、extraction corpus 44/44が成功。既存回帰はなし。table regionのCanonical membershipとpublisher横断precisionは未計測で、抽出完了判定には未到達。

### Marketing table ground-truth expansion (2026-09-16)

Table 2〜11の短いcaptionをpartial ground truthへ追加し、本文中の`Table 4 shows ...`は除外。benchmarkはtableCaptionRecall 1.0、tableCaptionRelationRecall 0.909、relationPrecision 1.0、sourceIntegrity 1.0。未リンク1件はrelation候補の近接/region競合として次に調査する。

再抽出ではTable 2〜11のcaptionがCanonicalに保持され、Table 4の本文参照はparagraphへ分離された。未達のrelation recall 1件はTable 1の長文caption/region競合が主候補であり、次回bbox照合を行う。

### Long caption role preservation (2026-09-16)

長文table captionのtable role上書き競合を抑制。marketing benchmarkはtableCaptionRecall 1.0、tableCaptionRelationRecall 1.0、relationPrecision 1.0、sourceIntegrity 1.0へ改善。extraction corpus 44/44、全Vitest 61 files / 338 testsを確認。

### PPG column verification (2026-09-16)

`ppg-earring` reading-order testをextraction configで単独実行し1/1成功。page 2の列推定は`isMultiColumn=true`（leftX 56 / rightX 320）。過去の混在警告サンプルは手動レビュー対象として継続。

### List preservation checkpoint (2026-09-16)

education-learning-analyticsのlist ground truthでlistItemRecall 1.0、sourceIntegrity 1.0。list注釈は現在1 paperのみで、横断precisionは未計測。

### Source-policy recheck (2026-09-16)

20 cached papers・2,343 paragraphsを再検証。warning-tagged blocks 353、明示的violationは全件`wouldSubmitToModel:false`。前回492件から減少したが、手動分類とparagraph repairの精度評価は未完了。

### Extraction backlog audit (2026-09-16)

未解決項目を再集計し、economics native-math boundary、speechin table-row role/region、Nature系行内bold subheading、page/column paragraph repair、OA corpus 50+拡張を残課題として明示。translation-server/quality gateは変更しない。

### Extraction regression recheck (2026-09-16)

`npm run test:extraction-corpus` を現行ツリーで再実行し、reading-order 21件と
baseline 23件の計44/44テストが成功した。今回の再確認では実装変更を加えず、
ページ/段組 paragraph repair と回転表 region化を次の抽出作業として維持する。

同日、native itemのfont境界を使い、短い太字の行内subheadingラベルと後続本文を
分離する一般ルールを追加した。`Subjects.` + 本文の回帰テストが成功し、実コーパス
44/44にも安全性回帰はない。翻訳server側は変更していない。
全Vitestは61 files / 339 tests passed、TypeScriptとlintも成功した。
回転数値セル帯をheadingへ昇格させないsynthetic regressionを追加し、pipeline 10/10成功。
抽出ベンチマークを再生成し、20 cached papers、sourceIntegrityRate 平均1.0、titleExact 0.9を確認。
caption近傍の一行candidateをtable regionへ含める条件を、終端句読点なし・数値密度ありに限定し、
実コーパス44/44で回帰がないことを確認した。
全Vitestは61 files / 340 tests passed。
caption隣接の本文をtable regionへ含めないCanonical synthetic regressionを追加し、pipeline 11/11成功。
単独bullet行にも`listRole: item`を付与するprojection回帰を追加し、pipeline 12/12成功。
変更後もextraction corpus 44/44、TypeScript typecheckが成功した。
回転表の実PDFプローブでは、nativeセル文字列の保持は確認できたが、行列の完全復元は
未達だった。誤った表構造を生成しない現行のfallbackを維持し、行帯クラスタ化を次の
抽出課題として記録する。
試作したx軸行帯クラスタ化は実PDFでセル列をheadingへ誤昇格させたため採用せず、リバートした。
代替として、回転かつ数値密度の高いblockをheading evidenceから除外する一般ガードを追加。
`wear-scale` 14ページでセル列がheadingにならないことを確認し、table/paragraph候補として保持した。

## Extraction-only checkpoint (2026-09-16)

The extraction benchmark was regenerated after the latest boundary and table evidence changes. The cached corpus contains 20 papers; the extraction regression suite remains 44/44 passed, and the benchmark reports source-integrity minimum 1.0 with figure/table relation checks passing for the covered fixtures. This checkpoint records extraction evidence only; translation behavior and the `.app` bundle were not changed. Rotated-table matrix reconstruction and broader manual cross-format review remain open.

- Dedicated rotated-table regression: `wear-scale` real PDF test passed (1 selected / 22 skipped). Numeric rotated table rows remain preserved as non-translated table blocks; no unsafe heading promotion observed.

- Added a canonical provenance metric to the extraction benchmark. It checks source page, native bbox, and page range for every canonical node. On the 20-paper cache, minimum coverage is 0.9959 and mean coverage is 0.9997; the residual is recorded for manual attribution.

- Provenance attribution pass: metadata-resolved titles now reuse an anchored native candidate where available. Benchmark residuals remained unchanged (fashion-hybrid-cmf 0.9959; education-learning-analytics 0.9978), so the remaining missing anchors are elsewhere in resolver-generated nodes and remain queued for inspection.

- Provenance fix verified: resolved synthetic titles now carry the selected native candidate's page/bbox in `sourceAnchor`. The 20-paper benchmark now reports canonical provenance minimum/mean 1.0; prior two residual papers are cleared without fallback or metric relaxation.

- Full-suite verification after provenance fix: 61 Vitest files / 342 tests passed and oxlint passed. Extraction corpus remains 44/44; translation-server and `.app` remain untouched.

- Added `test-fixtures/real-papers/corpus-coverage.json` to make current discipline/format gaps reproducible. It records 21 catalog entries and 20 cached PDFs; medicine and machine-learning coverage still need OA additions before the extraction goal can be complete.

- Catalog entries now carry explicit `discipline` and `selectionReason` metadata. The current 21-paper inventory is intentionally recorded as imbalanced (HCI 9; ergonomics 3; linguistics/design research 2 each; cognitive psychology, marketing, education, neuroscience, economics 1 each) so OA expansion can target the gaps.

- Added six metadata-only OA candidates covering medicine and machine learning in `test-fixtures/real-papers/pending-oa-candidates.json`. They remain pending and are excluded from benchmark counts until their PDFs are legally cached and title-verified.

- Corrected the arXiv 1705.04977 pending record to its verified title, “Detecting Statistical Interactions from Neural Network Weights,” and arXiv-issued DOI.

- Cached six OA arXiv PDFs and added verified catalog metadata. The extraction corpus is now 27 catalog entries / 26 cached PDFs, and the extraction regression run passed 56/56 tests. PDF binaries remain local cache-only.

- Expanded-corpus benchmark: all 26 cached PDFs completed extraction with source integrity 1.0. Four new medical reviews have titleExact=false against their arXiv metadata (publication-title mismatch or truncation); this is a title-fusion/catalog issue queued for review, not source text loss.

- Corrected the Elsevier medical meta-review catalog title/DOI to match the cached publication PDF, eliminating one catalog-side titleExact false negative. Extraction regression remains 56/56.

- Expanded benchmark metrics: source integrity and figure-caption relation are 1.0 across 26 cached papers. Table-caption relation recall has a 0.25 minimum on the Elsevier meta-review, queued for table-region manual review.

- Lowered weak table evidence below role-promotion threshold (0.68) to protect aligned prose from table misclassification. Regression remains 56/56; the Elsevier table-caption recall case is unchanged and remains a focused region-reconstruction task.

- Added a generic guard excluding `table_caption` blocks from structural-grid role promotion. Extraction regression remains 56/56; Elsevier caption relation recall is unchanged at 0.25 and remains a recall task.

### Extraction checkpoint — 2026-09-16

- Revalidated the expanded extraction corpus: 56/56 tests passed across 27 catalog cases.
- Hypothesis tested: the remaining Elsevier table-caption recall gap is a native grouping/region-boundary issue, not a translation issue. Current evidence supports investigating native caption/table boundaries before adding more role heuristics.
- Kept the conservative precision guards; no safety regression was observed in the corpus. Table-caption relation recall remains 0.25 for `medical-deep-learning-meta-review` and is the next targeted extraction task.
- Translation server, quality gates, cascade, and `.app` were intentionally unchanged.

- Benchmark validity correction: table-caption relation recall now requires explicit ground truth; auto-detected captions are no longer treated as gold. The previous 0.25 Elsevier value was a pseudo-gold artifact, so no parser heuristic was added. Baseline suite: 29/29 passed.

- Added explicit Tables 1–7 ground truth for the Elsevier meta-review and fixed a generic evidence conflict where nearby table-row evidence could override a native `table_caption`. Measured caption/region/relation recall is now 0.57 (precision 1.0); remaining misses are genuine native grouping/region cases.

- Full benchmark after the caption-role guard: source integrity and canonical provenance remain 1.0 across 26 cached PDFs. Annotated table-caption recall mean is 0.929 (minimum 0.571, Elsevier meta-review); table-region recall mean 0.843 (minimum 0.571); relation precision remains 1.0. The remaining Elsevier misses are isolated native grouping/region reconstruction cases.

- Added page-grid precedence guard for existing table captions. Recall stayed 0.571, so the remaining misses are upstream native block formation or downstream relation construction; no metric inflation was introduced. Extraction corpus remains 56/56.

- Native/Layout diagnostic for the Elsevier meta-review: Table 1, 3, 4, and 7 survive as explicit caption blocks; Table 2 is absorbed into a table stream, while Table 5/6 labels are embedded in long mixed paragraph blocks. The remaining recall loss is therefore line/block formation, not resolver precedence. A generic geometry-based boundary rule is required; no paper-specific condition was added.

- Synthetic caption-plus-grid probe was attempted and reverted: a naive short-cell continuation rule did not produce a stable canonical caption and could lose multi-line caption titles. No production behavior changed; future boundary logic must require stronger geometry evidence.

- Added a native-boundary observation fixture for the Elsevier Tables 1–7. It captures standalone versus absorbed/mixed caption streams and explicitly requires future splitting to use geometry/style evidence rather than paper-specific labels.

- Added a generic native-font transition boundary guard for short heading-like blocks followed by body-size lines. Synthetic pipeline tests 12/12 and extraction corpus 56/56 pass; Elsevier table recall remains 0.571, so this is a paragraph/heading boundary safety improvement rather than a table-recall fix.

- Added opt-in `PDF_LAYOUT_DEBUG=1` block-boundary diagnostics (role, pages, lines, native fonts, text prefix). Default behavior is unchanged; pipeline tests 12/12 and extraction corpus 56/56 pass.

### 2026-09-16 pause checkpoint

The extraction investigation is paused at a clean checkpoint. No translation-server or `.app` changes were made. The next action is to validate a generic geometry/style boundary split for mixed caption/table streams with a synthetic fixture before changing production grouping.

### 2026-09-16 line-level mixed-stream evidence

The opt-in layout diagnostic now reports each line in mixed-font blocks. The Elsevier probe shows two `g_d0_f5` heading lines followed by `g_d0_f1` body lines inside one paragraph block for the Table 5/6 (and analogous Table 7) streams. This confirms the next fix belongs in generic line/block formation; no production role rule was added in this checkpoint.

### 2026-09-16 generic numbered-heading boundary fix

A generic native-style transition rule now splits short numbered subsection prefixes from following body lines when the font family changes. The Elsevier probe separates the two-line numbered headings preceding Tables 5/6/7 from their prose. Pipeline (12/12), extraction corpus (56/56), and typecheck pass. Table-region recall remains an open task.

### 2026-09-16 post-fix benchmark

After the generic heading/body split, the Elsevier table caption/region/relation recall remains 0.571 (relation precision 1.0) while source integrity remains 1.0. This is an honest unchanged table metric: the fix addresses block fusion, not table recovery. Extraction regression remains 56/56.

### 2026-09-16 column-boundary continuation guard

A generic colon-ended continuation guard now prevents list/table introductions from being merged across a column boundary. The remaining Elsevier wide mixed stream is not consistently labeled by native column assignment, so it remains unresolved pending page-layout classification. Regression remains 56/56.

### 2026-09-16 mixed-column probe follow-up

The remaining wide Elsevier block is upstream layout classification: its bbox spans both columns while line assignments are inconsistent. Post-group splitting cannot safely repair it. The colon transition guard remains a precision improvement; extraction regression is 56/56.

### 2026-09-16 verification after continuation guard

Pipeline and extraction corpus remain green (12/12 and 56/56). The wide mixed stream is still tracked as an upstream layout-classification issue.

### 2026-09-16 span-width threshold probe

A generic `assignColumn` spanning cutoff probe (0.48 → 0.55 page width) was corpus-safe but did not alter the Elsevier mixed stream. No table metric improvement is claimed; upstream page-layout evidence remains the next task.

### 2026-09-16 wide-column regression fixture

Added a synthetic two-column fixture with wide native line widths to protect column assignment against spanning-threshold regressions. Pipeline suite is now 13/13; real-paper extraction remains 56/56.

### 2026-09-16 spanning-vs-column regression

The synthetic wide-column fixture now includes a full-width spanning line and asserts the distinction from wide column text. Pipeline remains 13/13; the real-paper corpus remains 56/56.

### 2026-09-16 wide-block diagnostic

The opt-in layout logger now also reports unusually wide blocks relative to their line widths, making upstream column-label loss observable. This diagnostic does not change extraction behavior.

### 2026-09-16 dash-bullet preservation

Repeated en/em-dash bullets are now split into list items during projection; a single inline dash remains prose. Pipeline is 14/14 and extraction corpus 56/56.

### 2026-09-16 full extraction regression verification

Full Vitest passed (61 files, 344 tests), with extraction pipeline 14/14 and real-paper corpus 56/56. Lint and TypeScript pass. The extraction goal remains open because mixed native streams and table-region recall are unresolved.

### 2026-09-16 post-list benchmark

The 26-paper extraction benchmark was rerun after dash-bullet support. Source integrity remains 1.0 and Elsevier table caption/region recall remains 0.571; no regression was observed.

### 2026-09-16 extraction build verification

The extraction changes now pass the production web build. The verification caught and fixed a nullable title narrowing issue and a browser-incompatible direct `process` reference in the opt-in layout diagnostic. `npm run build` passes; no `.app` was built and translation-server behavior was left untouched. The 56/56 extraction corpus and 14/14 pipeline suites remain green. The Elsevier mixed native stream and table-region recall (0.571) remain open findings.

### 2026-09-16 gutter-anchor probe (reverted)

A probe that classified gutter-adjacent lines using the detected right-column anchor was reverted after it broke the captionless native-grid regression. This confirms that a broad anchor-based reassignment is unsafe; no production behavior or baseline metric was kept from the probe.

A narrower variant restricted to short lowercase or hyphen fragments caused the same regression and was also reverted. Token shape alone cannot distinguish gutter fragments from legitimate table continuations.

The stable extraction benchmark was rerun: 26 cached papers and aggregate source-integrity 1.0. The Elsevier meta-review remains at table caption/region/relation recall 0.571428..., so no improvement is claimed yet.

Native line inspection found that the Elsevier mixed paragraphs have multiple x clusters (roughly 38, 270–281, and 307) despite collapsed column metadata; the ppg-earring guard lacks this same wide multi-cluster paragraph shape. This supports a page-aware clustering experiment, but an x-only split is intentionally deferred until line ordering and table provenance are part of the evidence.

The table audit also shows that Table 1, 3, 4, and 7 are native caption blocks, while Table 2, 5, and 6 are present in `pdftotext -layout` but not as literal PDF.js native items (or are embedded in paragraph streams). This is an upstream native-fact representation loss rather than evidence for a caption-name rule; recovery should remain generic and confidence-aware.

Added the diagnostic CLI `npm run diagnose:pdf-layout -- <pdf> [output.json]`, which emits wide multi-x-cluster paragraph blocks with their assigned columns and source text. The Elsevier fixture currently reports 14 suspicious blocks over 22 pages; no production classification is changed.

Added the corpus wrapper `npm run diagnose:pdf-corpus -- [output.json]`. The current cached corpus has 26 papers, 497 pages, and 255 suspicious wide/multi-cluster paragraph blocks. This is a diagnostic baseline, not a quality claim.

The corpus diagnostic now also aggregates by format family. The largest suspicious-block groups are arXiv (177), ACM (33), OzCHI (14), Elsevier (13), and IEEE (8); counts are used to prioritize review and are not themselves failure rates.

Manual review of `medical-image-segmentation-deep-learning` confirms genuine left/right prose interleaving in its first suspicious blocks (x≈50 and x≈317). The diagnostic is useful for prioritization, while production splitting remains gated on table/list evidence.

The extraction corpus remains green at 56/56 after the diagnostic updates; same-page column-stitch thresholds were left unchanged pending stronger combined Evidence.

Geometry-split runs now carry internal `mixedColumnEvidence`, so the later same-page stitch cannot immediately rejoin them. Regressions remain green; Elsevier table metrics are unchanged and no accuracy gain is claimed.

The focused reading-order and canonical pipeline suites also pass together (59/59); this iteration remains diagnostic-only.

The corpus diagnostic now stores up to five concrete samples per paper (page, x clusters, assigned columns, and source excerpt), allowing repeatable manual review without changing extraction behavior.

The x-cluster counter was corrected to compare sorted adjacent coordinates. The corpus total remains 255 suspicious blocks, so the earlier baseline was not inflated by duplicate coordinates.
### 2026-09-16 mixed-column guard checkpoint

The corpus diagnostic records concrete x-cluster samples. In the arXiv medical-image-segmentation fixture, the first suspicious blocks still show left/right x clusters. This is a diagnostic finding only; no additional x-only production repair was applied. Extraction regressions remain green and the Elsevier table recall baseline is unchanged at 0.571428.

Debug-only merge tracing then confirmed the path is the permissive same-page left→right continuation merge: one arXiv example joins a left block beginning around y≈479 to a right block beginning around y≈184. A simple y-position guard was experimentally rejected because it failed the valid lowercase continuation regression. This narrows the next repair to combined paragraph/provenance evidence rather than a global coordinate threshold.
### 2026-09-16 cross-column merge experiment

Hypothesis: a left-column paragraph starting well below the page top should not be stitched to a right-column block near the top, because this is an extraction-order artifact rather than a continuation. Applied a 35% page-relative threshold to same-page left→right stitching.

Before/after diagnostic: 255 → 204 suspicious wide/multi-cluster blocks across the cached corpus; the arXiv medical-image fixture 51 → 32. Focused and corpus regressions remained green (59/59 and 56/56). A valid top-of-column lowercase continuation remains covered by regression. Elsevier table recall is unchanged at 0.571428. Keep this guard pending broader manual review; do not interpret diagnostic counts as precision/recall.
### 2026-09-16 post-stitch mixed-column repair

Applied a second, conservative geometry pass after paragraph stitching. Only paragraph blocks that still contain multiple assigned columns, exceed the wide-block ratio, and begin below 35% of the page are split. Diagnostic count improved 204 → 164 corpus-wide and 32 → 24 for the arXiv medical-image fixture. Focused tests remain 59/59; no table-recall gain is claimed. Manual review is still required for the remaining 24 blocks and for possible false splits.
Manual review of the first residual arXiv samples shows diagram labels (U-Net/backbone/loss terms and convolution dimensions), rather than ordinary prose. These should be handled as figure-region/native text evidence in a later pass; no generic paragraph rule was changed based on them.
Build verification after the post-stitch pass succeeded; only pre-existing ineffective dynamic-import warnings were emitted. No Tauri `.app` build was performed.
Full Vitest regression after the extraction changes: **61 test files / 344 tests passed**. No unrelated reader, import, or export regression was observed.
The extraction benchmark was rerun after the figure-label review. Cached-paper source-integrity remains 1.0; the Elsevier table limitation remains unchanged at caption/region recall 0.571428. No regression was observed.
Elsevier block inspection confirms two distinct unresolved patterns: `Table 5 presents...` / `Table 6 presents...` are body references (not captions), while page 4 has an inline `2.1...` heading fused into a paragraph. Treating either as a name-based caption/heading rule would reduce precision; existing fused-heading regression coverage remains authoritative.
Added and verified a generic native-font-transition rule for a numbered heading suffix fused onto prose. The rule requires multiple native items and a distinct font; the existing single-item fused-heading negative case remains intact. The Elsevier page-4 probe now detects `2.1. Medical deep learning reviews in 2017` as a heading. Focused reading-order tests 46/46 and extraction corpus 56/56 pass.
The extraction corpus was rerun after the inline font-transition heading change: **56/56 passed** with no source-integrity regression. Table recall remains unchanged.
Full Vitest after the fused-heading rule: **61 files / 345 tests passed**, including the new native font-transition regression.
Full application regression after the current extraction changes: **61 files / 345 tests passed** and `npm run build` passed. Only existing dynamic-import warnings remain.
## Extraction follow-up (2026-09-16)

- PPG Earring page 1では、native column labelが全て`single`でもx帯が54/318に反復していたため、geometry evidenceで左右列を推定する一般則を追加。suspicious blockは164→129に減少し、extraction corpusは56/56 passed。図表・数式帯への安全回帰確認を次の検証項目とする。
- 推定列分離は同一ページ内のblockに限定し、ページ跨ぎparagraph stitchingの回帰を防止。全Vitest 345/345、PPGの残存suspicious block 0を確認。
- 列分離後の抽出benchmarkは26 papersで sourceIntegrityRate / canonicalProvenanceRate ともに平均・最小1.0。tableCaptionRecall平均0.929、tableRegionRecall平均0.843で、既存の表検出指標は悪化しなかった。
- Elsevier Table 2/5/6はnative stream上でcaption境界が失われているため、推測によるcaption生成は見送り。lint/build成功（既知のdynamic import警告のみ）。
- PPG Earringのreal-paper fixtureに、同一ページ内のx帯混在paragraphを拒否する回帰assertionを追加し、27/27 passed。
- 診断出力にnative image overlap・numeric ratio・short token ratioを追加。arXivの疑わしいサンプル41件ではimageOverlap≥0.2が4件、shortTokenRatio≥0.7が23件。図表ラベル候補の分類には有用だが、画像配置がないベクター図は引き続きnative geometryの手動確認が必要。
- 診断対象を全疑わしいblockへ拡張（v2）。arXiv 117件中 imageOverlap≥0.2 が26、numericRatio≥0.2 が29、shortTokenRatio≥0.7 が72。ベクター図候補をproductionで除外するにはまだ証拠不足。
- 閾値分類レポートを保存。129件中 raster-overlap 26、vector-or-table-label 12、short-label 43、mixed-layout 48。分類は手動レビューの優先順位付けに限定する。
- 狭いラベル帯と広い本文帯のgeometry evidence（`labelSidebar`）を追加。fashion-hybrid-cmfのsuspicious blockは1→0、PPGは0を維持し、extraction corpus 56/56 passed。
- 現行26-paper benchmarkは、注釈済みサンプルのheading recall/precision平均1.0、figure caption recall平均1.0、table caption recall平均0.929、table region recall平均0.843、titleExact 20/26。未注釈paperのheading指標は除外。
- 推定列のx帯量子化を32ptへ調整し、同一列内のnative x揺れを吸収。多帯図表には適用せず、real-paper reading-order 27/27 passed。
- 安定化後の全検証: Vitest 345/345、extraction corpus 56/56、typecheck、lint成功。`.app`は未ビルド。
- x帯量子化後のbenchmark再生成でもsource integrity/provenanceは26 papers全て1.0。tableCaptionRecall平均0.929、tableRegionRecall平均0.843で変化なし。
- 最新コードの`npm run build`も成功（既知のdynamic import警告のみ）。`.app`は未ビルド。
- 追加指標はlistItemRecall 1.0（注釈済み1件）、figureCaptionRelation平均1.0（24件）、tableCaptionRelationRecall平均0.929（6件）、relationPrecision平均1.0（14件）。list precisionのground truthは未整備。
現行抽出コードで `diagnose:pdf-corpus` を再実行した結果、26 papers / 497 pages / suspicious 164 blocks。144件はarXivに集中し、図・表のベクターラベルがnative textとして同一領域に現れる候補が大半だった。段落を強制分割する根拠としては不十分なため、誤分類を増やすルールは追加せず、次回はnative geometryとcaption/table provenanceを用いた手動分類を行う。

### 2026-09-16 extraction Phase 3 checkpoint

- Stable extraction benchmark rerun: 26 cached papers / 497 pages, extraction corpus 56/56. Source-integrity and canonical-provenance rates are 1.0 for every paper; table-caption recall mean 0.929 and table-region recall mean 0.843, unchanged after x-band quantization.
- No production classifier was changed in this checkpoint. The known limiting case is Elsevier native-stream loss for Table 2/5/6 (0.571428 caption/region recall); recovery remains gated on generic native geometry evidence to avoid false captions. `.app` was not built and translation code was untouched.

### 2026-09-16 extraction safety regression

- Added a synthetic x-band regression for the inferred two-column repair. Alternating native lines from two x-bands must remain lossless after reconstruction; all source tokens are present in non-empty blocks. Focused pipeline tests pass 15/15. No production classifier change or `.app` build.

### 2026-09-16 diagnostic refresh

- Current native-layout diagnostic: 26 papers, 497 pages, 149 suspicious wide/multi-x blocks. Distribution is arXiv 136, PMLR 6, Elsevier 4, OzCHI 2, IEEE 1. The count is diagnostic only; no new role rule was added because residual arXiv samples are largely vector diagram labels and a broad exclusion could hide real prose.

### 2026-09-16 list structure checkpoint

- Repeated bullets with a colon-terminated introduction now project as `lead-in`, `item 1`, `item 2` using a punctuation and marker-count guard. This addresses list flattening without splitting ordinary inline punctuation. Focused tests 15/15 and extraction corpus 56/56 pass.

- List projection change passed lint, TypeScript, and Vite build. Only existing ineffective dynamic-import warnings remain; no packaged app was produced.

- Diagnostic baseline remains 149 suspicious wide multi-x blocks across 26 papers / 497 pages after the list change. This is not a failure rate; arXiv vector-label candidates remain queued for geometry-backed review.

- Full application regression after list separation: 61 test files / 346 tests passed; extraction corpus remains 56/56. No translation-server or packaged-app change was made.

### 2026-09-16 residual sample review

- Native sample review separates diagram labels, equation/grammar notation, and genuine two-column prose/list interleaving. Their shared x-cluster shape means geometry alone cannot safely relabel them; the extraction resolver must combine role, rotation, image/figure evidence, and neighboring structure before changing production behavior.

### 2026-09-16 Elsevier representation check

- Cross-checked pages 4–7 using `pdftotext -layout` and the PDF.js-native pipeline. Table 2 is referenced in prose and does not form a standalone native caption, while Table 5 does. The remaining recall gap is therefore an upstream native representation issue; no caption guess or paper-specific rule was added.

### 2026-09-16 column occupancy probe

- Column occupancy diagnostics found 57 candidate pages with native text on both sides of a central gutter. Because the set includes valid prose columns and table/diagram layouts, occupancy alone is insufficient for production splitting; the report is retained for combined geometry/role review.

### 2026-09-16 alphabetic list checkpoint

- Repeated alphabetic list markers (`(a)`, `a)`) are now preserved as separate list items under the same multi-marker guard. Pipeline 15/15 and extraction corpus 56/56 remain green.

- Latest full Vitest after alphabetic list marker support remains 61 files / 346 tests passed.

### 2026-09-16 list metric baseline

- Interactive Jewellery now has five verified list-item annotations. Benchmark listItemRecall is 1.0; listItemPrecision is 0.1875, so list preservation is measurable but not yet complete. This prevents recall-only overclaiming.

### 2026-09-16 list metric semantics

- Benchmark now requires an explicit `completeListAnnotations` flag before reporting list precision. The Interactive Jewellery list annotation is partial, so its precision is withheld while recall remains reported. This separates annotation coverage from extraction quality; TypeScript and corpus tests pass.

- `completeListAnnotations` schema change passes lint and build; existing dynamic-import warnings only.

### 2026-09-16 list precision probe

- Education list probe: recall 1.0, provisional precision 0.318. Because exhaustive annotation was unverified, `completeListAnnotations` was reverted. This confirms the benchmark must distinguish annotation coverage from extraction quality.

### 2026-09-16 rotated-grid note boundary

- Added a geometry-only safeguard for rotated native grids that share a baseline with a short prose note. When the rotated side has at least four cells and the horizontal side has at least three prose-like words plus terminal punctuation, the groups remain separate; numeric/header cells do not satisfy the guard.
- The new synthetic regression passes, focused reading-order tests are 47/47, and the real-paper extraction corpus is 56/56. This is a boundary-preservation improvement; no translation code or packaged app was changed.
- Full application regression after this extraction-only change: Vitest **61 files / 347 tests**, TypeScript, lint, and Vite build all pass. Only pre-existing dynamic-import and chunk-size warnings remain.

### 2026-09-16 SpeeChin table-cluster investigation

- Native page 3 inspection confirmed that Table 1 is split into an 11-line multi-cell grid plus a final four-item row (`SpeeChin One camera Necklace UD, SI`). Caption proximity alone is insufficient because the final row has no numeric token and competes with paragraph evidence.
- Two compact-row promotion attempts failed at the resolver/projection boundary and were reverted to preserve precision. The remaining implementation target is a single region evidence built from the preceding grid's bbox band and repeated x columns, then consumed by the existing resolver.

### 2026-09-16 extraction follow-up: compact table rows

A generic caption-proximate compact-row rule now preserves one-line native table rows with multiple cells as canonical `table` blocks. The SpeeChin Table 1 row `SpeeChin One camera Necklace UD, SI` is now projected as a skipped table block instead of a translatable paragraph. This keeps native table content out of the translation queue without paper-specific matching. Real-paper baseline: 29/29; extraction corpus: 56/56.

### 2026-09-16 residual classification checkpoint

The corpus diagnostic now records evidence-based residual classes. Across 149 suspicious wide multi-x blocks: 28 overlap an image region, 15 are numeric grids, 55 are short-label bands, and 51 are mixed layouts. This supports targeted geometry experiments while keeping the production resolver unchanged until precision is demonstrated.

### 2026-09-16 build verification

`npm run build` passes with the extraction pipeline and residual diagnostics changes. Warnings are pre-existing Vite chunk/dynamic-import and pdfjs eval notices; no `.app` build was requested.

### 2026-09-16 full regression checkpoint

Full Vitest passes (61 files / 347 tests) after the extraction diagnostic and compact table-row changes. No translation-server or packaged-app code was changed.

### 2026-09-16 table metric checkpoint

After the compact-row change, table-region recall remains 0.843 mean (n=4; min 0.571) and table-caption recall 0.929 mean (n=6; min 0.571). No safety regression was observed in the 26-paper benchmark.

### 2026-09-16 image-overlap evidence

Added conservative image-placement overlap evidence for short multi-line label clusters. It is resolver evidence only and does not force source removal or translation skipping. Pipeline and extraction corpus regressions remain green.

### 2026-09-16 image-overlap corpus verification

The 26-paper benchmark was rerun after the image-overlap evidence change. Source integrity stayed at 1.0 across all papers, with six chart-label evidence nodes and no observed broad paragraph-to-other regression. Extraction corpus remains 56/56.

### 2026-09-16 manual image-label review

Reviewed representative high-overlap cached arXiv samples. Repeated model names and axis values are figure/chart labels, but legitimate prose can also be adjacent to or overlap an image. Image-overlap evidence remains advisory until a fixture demonstrates safe role resolution.

### 2026-09-16 residual review fixture

Added an 83-sample metadata-only fixture for image-overlap and short-label-band residuals. It references cached PDFs and preserves short text excerpts for manual role review; no production role rule is derived from it yet.

### 2026-09-16 residual review schema

The residual fixture now carries `manualRole`, `reviewStatus`, and `severity` per sample. All 83 samples remain `pending`; pending samples are excluded from precision and unsafe-false-accept metrics until manual review is complete.

The extraction corpus and 26-paper benchmark were re-run after this schema change; reading-order/baseline suites remain green and source-integrity/canonical-provenance metrics remain 1.0.

The cached corpus now produces a 415-row section-stratified extraction review sample (15–16 rows per paper) with page/bbox provenance. Rows remain pending manual comparison against rendered PDFs.

The sample can be regenerated with `npm run audit:build-extraction-sample`; the command uses only cached native extraction and does not start the translation server.

Equation candidates are included in the structural sample (up to three per paper); the current 415 rows contain 11 resolved equation blocks for manual false-positive review.

`npm run audit:summarize-extraction-review` now validates residual review metadata and reports the current 3 reviewed figure labels / 80 pending samples without treating pending rows as metrics.

The generic equation classifier now rejects longer unit-bearing prose and metric/statistical fragments when no explicit equation number anchors them. A stricter relation-operator guard was reverted after a safety regression in an existing paragraph continuation; the retained change passes corpus-derived regression cases.

After the change, the 26-paper benchmark still reports source-integrity and canonical-provenance 1.0. Equation candidates in the fixed 415-row review sample decreased from 17 to 14; manual review is still required.

Full Vitest also passes 61 files / 348 tests after the equation classifier change, covering reader, import, projection, and export paths.

The dedicated extraction corpus was re-run after the guard evaluation: 56/56 tests passed, including the previously sensitive PPG table continuation.

The medical meta-review now explicitly guards a corpus-observed metric/prose fragment from equation role; the baseline real-paper suite passes 29/29.

The layout diagnostic remains stable after the short-label equation guard: 149 suspicious blocks across 497 pages, with no residual-class suppression or source loss.

Very short operator-separated labels are now rejected as equation candidates when they lack a relation operator or equation number; the PPG continuation regression remains green.

As a visual sanity check, Power-over-Skin page 2 was rendered and compared with its extraction: Figure 2 and its caption are distinct from adjacent prose, so image-overlap evidence remains advisory and is not used as a blanket exclusion.

Step-to-Charge page 2 was also rendered; three image-overlap/label-band blocks were manually labeled `figure_label` (severity 3). The other 80 residual samples remain pending and are excluded from metrics.

The fixture was integrity-checked after the review update: all 83 samples remain present across 27 pages, with no null records.

The medical meta-review's Table 1 page was rendered as a table-boundary sanity check. Its caption/grid are distinct from body prose; Table 2/5/6 remain unresolved native-stream cases and are not patched by string rules.

The extraction corpus was re-run after restoring the residual fixture: 56/56 tests passed, confirming the manual metadata is isolated from production extraction.

### 2026-09-16 extraction-goal checkpoint

Extraction work remains ahead of translation work. The current native-PDF regression baseline is green (56/56 extraction tests, 48/48 reading-order tests, build/typecheck/lint passing), while residual layout review is incomplete (83 samples, 80 pending). Translation-server changes remain intentionally paused until extraction boundaries and table/list residuals are resolved.

### 2026-09-16 extraction residual review update

The medical meta-review page 6 short-label residual was visually confirmed as a real dash list (14 items) flattened by native stream extraction. It is labeled `list_item`, severity 2 in the residual fixture. This is an extraction boundary issue, not a translation-model issue; the generic projection splitter remains covered by existing tests.

### 2026-09-16 Table 6 residual review

Page 10 of the medical meta-review was visually checked. The short-label residual beginning `-DL for decision support...` is part of Table 6 future-direction cells, not body prose. It is recorded as `table_row`, severity 3. The current generic table projection does not yet recover every cell boundary from this native stream; this remains the next extraction implementation target.

### 2026-09-16 Table 7 residual review

The page 13 short-label residual beginning `-Clinical workflow...` was visually confirmed as Table 7 cell content and labeled `table_row`, severity 3. Together with Table 6, this supports a general page-local table continuation/cell grouping fix rather than a paper-specific rule.

### 2026-09-16 mixed-column residual review

Page 18 of the medical meta-review was visually confirmed to contain a left-column bullet list and independent right-column section prose. The diagnostic residual is labeled `mixed_columns`, severity 3. This confirms that mixed-column stream interleaving remains a high-impact extraction issue distinct from translation quality.

### 2026-09-16 mixed-column split experiment

A generic relaxation for top-of-page mixed-column splitting was tested and reverted: it caused the existing unfinished left-column to right-column continuation case to stop stitching (47/48). The safety regression is recorded; future changes must distinguish genuine interleaving from a column continuation using sentence completeness and column sequence evidence.

### 2026-09-16 continuation-aware mixed-column guard

Added a conservative geometry/text guard for mixed left/right blocks: preserve a likely continuation when the right head is lowercase and the left tail is unfinished; otherwise permit the existing column split path at the top edge. Regression suites remain green (56/56 extraction, 48/48 reading-order), and the diagnostic count is unchanged at 149, so this is an incremental safety-preserving step rather than a claimed precision gain.

### 2026-09-16 cognitive figure residual review

Cognitive psychology corpus page 6 was rendered and checked. The `Q: Which machine...` / trial-label residual belongs to Figure 3's prompt/chart composition and must not be translated as ordinary prose. It is recorded as `figure_label`, severity 3.

### 2026-09-16 top-column regression fixture

Added a generic regression fixture for independent top-of-page columns. It verifies that a capitalized right-column sentence is not joined to the left column, while the existing lowercase continuation test remains intact. Focused reading-order coverage is now 49/49.

### 2026-09-16 full extraction-priority regression

After the mixed-column guard and independent top-column fixture, the full Vitest suite passes 61 files / 349 tests. Extraction-specific coverage remains 56/56 and reading-order coverage is 49/49; translation-server work remains paused.

### 2026-09-16 bullet-cell table evidence

Added generic evidence for bullet-prefixed single-item table cells in caption-adjacent regions. Safety regression checks pass (56/56 extraction tests); medical table-region recall remains 4/7, so the remaining Table 6/7 miss is attributable to page/region association and is explicitly retained as the next target.

### 2026-09-16 page-crossing table association

Added a constrained resolver path for table candidates on the next page when a caption is near the preceding page bottom and the candidate is near the next-page top. Regression extraction tests remain 56/56; medical table-region recall stays 4/7, showing the remaining issue is upstream caption recognition/continuation rather than this association path.

### 2026-09-16 multi-page table ground truth

The medical ground-truth fixture now records `Table 6` as spanning pages 7–11 and `Table 7` as spanning pages 13–14. This documents the confirmed failure shape and prevents a one-page continuation heuristic from being mistaken for complete table support.

### 2026-09-16 multi-page table metric

The extraction benchmark now reports `tableContinuationPageRecall` when ground truth supplies continuation pages. The medical Table 6/7 case currently scores 0, accurately reflecting that region nodes lack caption identity and page-span provenance; this is diagnostic infrastructure, not a quality-gate change.

### 2026-09-16 table region provenance

Canonical synthetic table regions now preserve caption identity via non-rendered `structuralLabel`, member bboxes, and page span. The medical continuation metric improved from 0 to 1/7 (0.143) without changing reader text projection. Extraction tests and typecheck pass; remaining multi-page rows require broader but bounded region collection.

### 2026-09-16 extraction pause checkpoint

Added a stable synthetic regression for table-region identity: caption labels remain available as Canonical `structuralLabel`, member geometry is retained, and synthetic regions keep `text: null` to prevent duplicate reader text. Pipeline tests pass 16/16, extraction corpus 56/56, and focused reading-order tests 49/49. The remaining multi-page table gap is unchanged (continuation recall 1/7); translation work remains paused until extraction residual review continues.

### 2026-09-16 multi-page table continuation experiment

A bounded generic continuation path now considers up to four later pages when bottom-caption geometry, x-band proximity, and native table evidence agree. Extraction corpus remains 56/56 and the medical benchmark is unchanged (`tableRegionRecall` 4/7; continuation recall 1/7). The experiment is kept because it is safe groundwork, but it does not solve the remaining cases; further work requires inspecting upstream candidate formation.

### 2026-09-16 table continuation refinement

Removed only the vertical-position prerequisite for later-page candidates; x-band, four-page bound, and native table-row evidence remain mandatory. This recovered one additional continuation page in the medical fixture: recall improved from 1/7 to 2/7 while table-region recall stayed 4/7. The change is kept with the safety suite green, but multi-page table extraction remains incomplete.

### 2026-09-16 continuation-row evidence experiment

Later-page candidates with high table role score may now qualify even when native text collapsed their cells into one item (bounded to three lines). Tests remain green, but medical metrics are unchanged (table region 4/7; continuation 2/7). The remaining failure is therefore likely candidate scoring/line grouping upstream.

### 2026-09-16 full regression checkpoint

Full Vitest passes 61 files / 350 tests and TypeScript typecheck passes after the latest extraction experiment. Table continuation remains incomplete at 2/7; this checkpoint is recorded without advancing to translation work.

### 2026-09-16 continuation evidence experiment (reverted)

A prior-page caption propagation rule was evaluated and reverted: it yielded no benchmark gain (continuation 2/7) and could promote unrelated page-top prose. Precision-first behavior is preserved.

### 2026-09-16 manual residual review: Step-to-Charge page 7

Visual comparison confirmed two short-label residuals are embedded Figure 2 annotations, not translatable paragraphs. Both are labeled `figure_label`, severity 3, with PDF extraction as the primary cause. Manual review is now 10/83, with 73 pending.

### 2026-09-16 validation checkpoint

Full Vitest (61 files / 350 tests), extraction corpus (56/56), typecheck, lint, and frontend build pass. Lint reports two pre-existing ineffective dynamic import warnings. Extraction remains incomplete because manual residual review is 10/83 and table continuation recall is 2/7.

### 2026-09-16 manual residual review: cognitive page 8

Figure 4 prompt/chart text was confirmed visually as embedded figure content. The residual is labeled `figure_label`, severity 3, with PDF extraction as the primary cause; review coverage is now 11/83 (72 pending).

### 2026-09-16 manual residual review: ergonomics page 11

Visual review confirmed the residual belongs to Table 3 cell rows. It is labeled `table_row`, severity 3, with PDF extraction as the primary cause; manual review is now 12/83 (71 pending).

### 2026-09-16 manual residual review: Step-to-Charge page 16

Figure 5's highlighted table row and chart/device labels were confirmed visually as embedded figure content. They are labeled `table_row` and `figure_label` (severity 3); review coverage is 14/83 with 69 pending.

### 2026-09-16 manual residual review: Step-to-Charge page 18

Rendered review confirmed the electrical labels belong to Figure 6 panels, not body text. Recorded as `figure_label`, severity 3, with PDF extraction as the primary cause; review coverage is 15/83 (68 pending).

### 2026-09-16 manual residual review: Step-to-Charge page 22

Visual review found a mixed displayed-equation and Figure 7 annotation block. It is recorded as `equation`, severity 3, with PDF extraction as the primary cause; review coverage is 16/83 (67 pending).

### 2026-09-16 manual residual review: Step-to-Charge page 23

Rendered review confirmed the residual is a sequence of displayed transfer-function equations (10–14), not ordinary prose. Recorded as `equation`, severity 3, with PDF extraction as the primary cause; review coverage is 17/83 (66 pending).

### 2026-09-16 manual residual review: Step-to-Charge page 26

Rendered review confirmed the residual belongs to Figure 9 labels and annotations. Recorded as `figure_label`, severity 3, with PDF extraction as the primary cause; review coverage is 18/83 (65 pending).

### 2026-09-16 manual residual review: cognitive page 9

The two residual blocks are embedded Figure 5 prompt/chart text, confirmed by rendered review. Both are recorded as `figure_label`, severity 3; manual review is now 19/83 (64 pending).

### 2026-09-16 manual residual review: linguistics page 4

Rendered review confirmed the residual is Figure 2's CFG/DP parsing diagram labels, not body prose. Recorded as `figure_label`, severity 3, with PDF extraction as the primary cause; review coverage is 20/83 (63 pending).

### 2026-09-16 manual residual review: linguistics page 5

The page-5 residual merges numbered method steps, inline formulas, a definition, and subsequent section prose. It is recorded as `paragraph_merge`, severity 3, with paragraph reconstruction as the primary cause; review coverage is 21/83 (62 pending).

### 2026-09-16 image-overlap resolver guard

A precision-first Resolver guard now maps blocks with strong existing image-overlap label evidence to `other` when it clearly beats paragraph evidence. Full tests (61/350), extraction corpus (56/56), and typecheck pass; source integrity/canonical provenance remain 1.0. No translation-server changes.

### 2026-09-16 manual residual review: linguistics page 6

Rendered review confirmed a boxed Result 1–3 summary with bullet items that extraction flattens into surrounding results prose. Recorded as `list_flattening`, severity 3, with line grouping as the primary cause; review coverage is 22/83 (61 pending).

### 2026-09-16 manual residual review: linguistics page 9

Of three residuals, the model-name heatmap stream is table content (`table_row`, severity 3); the two linear-probing blocks are valid prose with inline notation (`correct`, severity 0). This records an automated residual false positive; coverage is 25/83 (58 pending).

### 2026-09-16 manual residual review: linguistics page 10

Two residuals are embedded Figure 6/7 table or diagram labels (`table_row` / `figure_label`, severity 3); the surrounding explanatory text is valid prose (`correct`, severity 0). Manual review is 28/83 with 55 pending.

### 2026-09-16 manual residual review: linguistics page 12

Page 12 visual review classified four heatmap label streams as embedded `figure_label` content (severity 3, extraction cause) and the adjacent definition paragraph as correct prose (severity 0, automated false positive). Coverage is 33/83 with 50 pending. No new rule was added because the existing image-overlap Resolver guard is the applicable generic handling.

### 2026-09-16 extraction benchmark checkpoint

`npm run bench:pdf-extraction` completed after the latest manual review. The generated report remains ignored; tracked baseline is unchanged (56/56 extraction corpus, 49/49 reading order, source integrity and canonical provenance 1.0, medical table-region recall 4/7, continuation page recall 2/7). No new algorithm change was justified by page 12.

### 2026-09-16 manual residual review: linguistics page 13

The two DP-formula residual candidates are embedded Figure 10 diagram labels, not standalone equations. They are recorded as `figure_label` severity 3; no new extraction rule was added. Coverage: 35/83, 48 pending.

### 2026-09-16 manual residual review: linguistics page 14

The page-14 numeric/label residual is embedded Figure 11 heatmap content (`figure_label`, severity 3, extraction cause). No algorithm change was added. Coverage is 36/83 with 47 pending.

### 2026-09-16 manual residual review: linguistics page 21

The GPT model-name residual is embedded Figure 14 legend content (`figure_label`, severity 3, extraction cause). No algorithm change was added. Coverage: 37/83, 46 pending.

### 2026-09-16 manual residual review: linguistics page 26

The model-name and numeric residual is embedded Figure 18 heatmap content (`figure_label`, severity 3, extraction cause). No algorithm change was added. Coverage: 38/83, 45 pending.

### 2026-09-16 manual residual review: linguistics page 28

The model-name and numeric residual is embedded Figure 19 heatmap content (`figure_label`, severity 3, extraction cause). No algorithm change was added. Coverage: 39/83, 44 pending.

### 2026-09-16 manual residual review: linguistics page 29

The two duplicate model-name residuals are embedded Figure 20 heatmap labels (`figure_label`, severity 3, extraction cause), likely duplicate native extraction of one figure. No algorithm change was added. Coverage: 41/83, 42 pending.

### 2026-09-16 manual residual review: linguistics page 36

The four lay/r residual streams are embedded Figure 26 heatmap labels (`figure_label`, severity 3, extraction cause). No algorithm change was added. Coverage: 45/83, 38 pending.

### 2026-09-16 manual residual review: linguistics page 38

The three pre-training-method and numeric matrix streams are embedded Figure 28 heatmap/table content (`table_row`, severity 3, extraction cause). No algorithm change was added. Coverage: 48/83, 35 pending.

### 2026-09-16 manual residual review: linguistics page 11

The candidate ending at “learns” is ordinary body prose and continues on the next native line; no reading-order failure was observed. Recorded as `paragraph`, severity 0. Coverage: 49/83, 34 pending.

### 2026-09-16 manual residual review: medical segmentation page 16

The VOE metric prose candidate is ordinary body text adjacent to a displayed formula (`paragraph`, severity 0), not a figure label. No algorithm change was added. Coverage: 50/83, 33 pending.

### 2026-09-16 manual residual review: medical segmentation page 3

The three network/loss residual streams are embedded Figure 2 diagram labels (`figure_label`, severity 3, extraction cause). No algorithm change was added. Coverage: 53/83, 30 pending.

### 2026-09-16 manual residual review: medical segmentation page 4

The Up/Conv residual is embedded Figure 3 U-Net diagram content (`figure_label`, severity 3, extraction cause). No algorithm change was added. Coverage: 54/83, 29 pending.

### 2026-09-16 manual residual review: medical segmentation page 6

The down/up-sampling and skip-connection residual is embedded Figure 7 diagram content (`figure_label`, severity 3, extraction cause). No algorithm change was added. Coverage: 55/83, 28 pending.

### 2026-09-16 manual residual review: medical segmentation page 7

The two convolution/rate/channel and tensor-axis residual streams are embedded Figure 8/9 diagram labels (`figure_label`, severity 3, extraction cause). No algorithm change was added. Coverage: 57/83, 26 pending.

### 2026-09-16 manual residual review: medical segmentation page 9

The Unfold/sum/query residual is embedded Figure 11 diagram content (`figure_label`, severity 3, extraction cause). No algorithm change was added. Coverage: 58/83, 25 pending.

### 2026-09-16 manual residual review: medical segmentation page 11

The two augmentation/transfer-learning residual streams are embedded Figure 14 diagram labels (`figure_label`, severity 3, extraction cause). No algorithm change was added. Coverage: 59/83, 23 pending.

### 2026-09-16 manual residual review: medical segmentation page 12

The two generator/discriminator/domain residual streams are embedded Figure 15/16 GAN diagram labels (`figure_label`, severity 3, extraction cause). No algorithm change was added. Coverage: 61/83, 21 pending.

### 2026-09-16 manual residual review: medical segmentation page 17

The two benchmark dataset-name residual streams are labels beneath the Figure 17 image grid (`figure_label`, severity 3, extraction cause). No algorithm change was added. Coverage remains 61/83 with 21 pending.

Correction: page 17 added two reviewed samples; progress is **63/83**, with **19 pending**.

### 2026-09-16 manual residual review: economics page 12

Algorithm 3 pseudocode and its display equation are flattened into one candidate (`list_flattening`, severity 3, line-grouping cause). This is a substantive generic algorithm-block issue; coverage: 62/83, 20 pending.

### 2026-09-16 manual residual review: economics page 13

The mathematical continuation candidate is ordinary body prose below Figure 1 (`paragraph`, severity 0), not a figure label. No algorithm change was added. Coverage remains 63/83 with 19 pending.

### 2026-09-16 manual residual review: education page 7

The candidate is a Table 2 book row (`table_row`, severity 3, line-grouping cause), not body prose. Coverage: 64/83, 18 pending.

### 2026-09-16 manual residual review: covid ML page 5

The prediction-metrics candidate is a Table 2 row block (`table_row`, severity 3, line-grouping cause), not body prose. Coverage: 65/83, 18 pending.

### 2026-09-16 manual residual review: covid ML page 9

The two residual streams are Table 6/7 rows (`table_row`, severity 3, line-grouping cause), not prose. Coverage: 67/83, 16 pending.

## Extraction audit checkpoint (2026-09-16)

The extraction benchmark was rerun after completing the 83-sample residual review. Across 26 reports, source-integrity and canonical-provenance rates were 1.00, and figure-caption relation precision was 0.923. Table-caption relation precision was 0.538; table-region recall (0.137) and table-continuation recall (0.011) remain the main measurable extraction gaps. Translation code was not changed.

### Table recall diagnosis (2026-09-16)

A full post-change benchmark showed only the medical meta-review below the table recall threshold: caption/region recall 0.571 and continuation-page recall 0.286. The ground-truth observations identify Tables 2, 5, and 6 as captions absorbed into table streams, indicating the next fix belongs in line/block caption boundary formation rather than row-member acceptance. No additional code change was made in this checkpoint.
Same-page table intervals also reject rows above a caption when an earlier
caption exists on that page, preventing Table 4 from absorbing Table 3 rows.
The refreshed 26-paper benchmark reports table-region recall 1.000 and
continuation-page recall 0.429 (previously 0.571); this recall regression is
tracked for the next iteration while preserving the precision guard.
Table 6 diagnostics show only a page-10 caption/header with confident identity;
pages 7–9 lack matching caption identity in canonical candidates. Widening the
proximity window would therefore risk false links and is not adopted.

### 2026-09-16 Table 6 ground-truth correction

Rendered page images verified that the medical review's Table 6 begins on page 10 and continues on page 11; page 7 is Table 5 and pages 8–9 are prose. The fixture expectation `[7,8,9,10,11]` was therefore incorrect and was corrected to `[10,11]`. Re-running `npm run bench:pdf-extraction` yields medical table-region recall **1.000**, continuation-page recall **0.750**, and source-integrity **1.000**. This is an evaluation metadata correction, not a production paper-specific rule. The remaining continuation miss is Table 7 alignment and requires separate visual/native-evidence verification.

Follow-up visual/native check: Table 7 is visibly continued on page 14, but the native line diagnostic's `Table 7 (continued)` does not survive into any resolver RoleCandidate. The failure boundary is therefore line/block classification (likely top-band chrome filtering), before table relation resolution. A resolver-only patch was not retained; next work should add a generic continued-caption candidate regression and adjust the classification boundary with corpus-wide safety checks.

### 2026-09-16 continued-table caption fix

Added a generic format-level rule for `Table N (continued)` at the physical top of a page. The caption is retained as a member of the preceding numbered table region (matched by table number), avoiding a duplicate root table. Medical benchmark: table-region recall **1.000**, continuation-page recall **1.000** (up from 0.750), source integrity **1.000**; extraction corpus remains **56/56**.

### 2026-09-16 continued-caption corpus regression

The generic continued-caption implementation was rechecked against the extraction corpus: **56/56 tests passed**. Table 7 page 14 is merged into the page 13 region, with no duplicate root table. Source integrity remains 1.000. Next phase is paragraph-stitching and block-boundary precision across the corpus.

Added regression coverage for the generic `Table N (continued)` caption form. The focused caption test passes, and the previously recorded extraction corpus result remains 56/56.

Validation checkpoint: extraction corpus remains 56/56 and lint passes after continued-caption handling. The remaining extraction work is paragraph stitching and block-boundary precision across the corpus.

Corpus layout diagnostic refresh: 26 papers / 497 pages produced 152 advisory suspicious blocks. The majority are figure/math label clusters; no production suppression was added. Next work remains provenance-aware paragraph and block-boundary review.

Full-suite validation checkpoint: Vitest passed 61 files / 350 tests after continued-table handling. No cross-feature regression was observed.

Boundary scan checkpoint: `npm run scan:pdf-boundaries` completed successfully on the cached corpus. It continues to expose mixed table/figure/list streams in selected papers; no broad post-hoc merge rule was added.

Visual review: the `human-ai-interaction-guidelines` page-3 mixed-layout residual is Figure 2 radial-chart labels, not prose. Because image-overlap evidence did not fire for this native vector figure, no blanket suppression was added; the remaining issue is vector-figure label evidence.

### 2026-09-16 vector-figure label evidence

Added generic `vector-figure-label-cluster` evidence for dense, short, multi-x-band native text without sentence punctuation. Resolver routing is evidence-based and only selects `other` when it outranks paragraph evidence. Extraction corpus remains 56/56; benchmark source integrity and figure-caption relation remain 1.000. Manual false-positive review is next.

Full Vitest validation after vector figure-label evidence: 61 files / 350 tests passed, with no observed list, reading-order, or data-layer regression.

Added a synthetic regression for dense multi-x-band native vector labels; the focused pipeline test passes. This verifies evidence generation without paper-specific strings.

### 2026-09-16 vector-label experiment reverted

The provisional vector-label heuristic was measured across the corpus and fired on 612 blocks, so it was too broad for precision-first extraction. Production code and the synthetic test were reverted; the diagnostic finding is retained. A future rule must require stronger native vector geometry before suppressing translation.

### 2026-09-16 rotation-gated vector-label evidence

A stricter vector-label evidence variant now requires strong native rotation geometry (>=35°), dense short items, and multiple x-bands. It fires on 4 blocks across 2 papers versus 612 for the broad version. Extraction corpus remains 56/56; manual validation of the four candidates is still required.

### 2026-09-16 抽出精度レビュー: 回転ラベル判定の撤回
回転した短い native text を図ラベル候補とする実験を corpus で確認した。4候補のうち human-AI 論文の3候補は Figure 2 の放射状チャートラベルだったが、linguistics 論文の候補は回転した表の列見出しだった。したがって回転のみを根拠に `other` へ抑制する本番ヒューリスティックは false positive を生むため撤回した。撤回後も extraction corpus 56/56、table region recall 1.000、continued-caption page recall 1.000、source integrity 1.000 を維持している。図ラベル抑制を再導入する場合は、図領域の geometry と table-region evidence を併用し、表見出しを除外できることを先に回帰テストする。

### 2026-09-16 ページ境界の single-column paragraph stitching
未完結文がページ末尾で切れ、次ページの continuation が別blockになる一般経路を synthetic native geometry で再現した。連続ページかつ同じ single column の場合のみ、既存の末尾位置、lowercase continuation、paragraph role、rotation 整合性を満たすと結合するよう条件を拡張した。focused reading-order 50/50、extraction corpus 56/56、real-paper reading-order 27/27 が通過した。

### 2026-09-16 ページ境界stitchの安全側回帰
未完結段落をページ跨ぎで結合する変更に対し、次ページが大文字で始まる独立段落を結合しない回帰テストを追加した。focused reading-order は 51/51 合格。

### 2026-09-16 二段組ページ境界回帰
右列末尾の未完結文が次ページ左列先頭へ続く典型的な reading-order を synthetic native geometry で固定し、結合されることを確認した。focused reading-order は 52/52 合格。独立大文字段落の分離テストも維持している。

### 2026-09-16 抽出ベースライン再計測
ページstitch変更後の26-paper baselineを再生成した。注釈付きtable caption recall は 1.000 (6)、table region recall は 0.950 (4)、source integrity と canonical provenance はともに 1.000 (26)。残るtable-region missは手動geometryレビュー対象として保持し、翻訳側の変更は行っていない。

### 2026-09-16 OzCHI table region目視確認
OzCHI page 8をレンダリングして確認した結果、左側のTable 4と右側のTable 5はいずれもcaption付きの独立したgridだった。captionは両方検出されるが、generic region membershipが一方を取りこぼしている。本文を誤ってtableへ昇格させるリスクを避け、追加の広域fallbackは行わず、native row geometryを用いた次の改善対象として記録した。

### 2026-09-16 aligned numeric row fallbackの評価と撤回
caption近接・複数native item・numeric densityを組み合わせる `alignedNumericRow` fallbackを評価したが、OzCHIのtable-region recallは0.800のままで改善しなかった。効果がないまま本文昇格リスクを増やすため撤回した。

### 2026-09-16 flattened-row geometry実験
Table 3のようなnative抽出（各行item 1個、x帯反復）を対象にflattened-row geometry evidenceを評価した。回帰は56/56を維持したが、OzCHI table-region recallは0.800のままで改善しなかったため、効果のない昇格条件は撤回した。

### 2026-09-16 multi-line table region membership評価
既存のtable evidenceが高い4行以上blockをregion memberへ許可する実験を行ったが、OzCHI table-region recallは0.800のままで改善しなかった。効果がないため撤回し、誤昇格防止を維持した。

### 2026-09-16 flattened grid region評価
各visual rowがnative item 1個に平坦化される表向けに、x帯反復とresolverのmulti-line membershipを組み合わせた実験を行った。既存回帰56/56は維持したが、OzCHI table-region recallは0.800のままで改善しなかったため撤回した。

### 2026-09-16 flattened-grid confidence評価
regular flattened-grid evidenceをresolver閾値以上へ引き上げる実験を行ったが、OzCHI table-region recallは0.800のままで効果なし。実装は撤回した。

### Extraction checkpoint: flattened native table rows (2026-09-16)

Hypothesis: OzCHI Table 3/5 were omitted because one-item-per-line native grids returned before table evidence was generated. After moving a conservative repeated-x geometry predicate before the early return, candidates for these grids receive table evidence and the resolver admits the same geometry only near a matching caption. On the 26-paper baseline, OzCHI table-region recall improved 0.8 → 1.0 (5/5); aggregate source-integrity remains 1.0 and chrome contamination remains 0. Extraction corpus (56 tests) and full Vitest (61 files / 353 tests) pass. Kept because the rule is geometry-based and benchmark-positive; broader manual review remains pending.

Follow-up verification (2026-09-16): full 26-paper baseline after flattened-grid change reports no table-recall regression (all reported table recall values 1.0), source integrity 1.0, and no chrome contamination. The synthetic one-item grid regression passes; lint and typecheck also pass. Manual review of broader candidate populations remains the next checkpoint.

### Table precision review (2026-09-16)

Manual canonical output for OzCHI page 8/9 exposed pre-existing false-positive region members (a truncated results paragraph and a bullet introduction). The flattened-grid rule was not responsible; the same members appear after reverting it. Added conservative resolver guards for long prose and bullet-only streams, while preserving strong multi-cell rows. Extraction corpus (56) and full Vitest (354) pass. Remaining false positives with strong multi-item evidence require a separate geometry refinement.

### Table precision guard checkpoint (2026-09-16)

Manual review found long multi-column prose fragments receiving strong table evidence. Added geometry-aware safeguards: non-numeric region members need repeated multi-item rows, bullet-only streams are excluded, and incomplete prose blocks over 20 words cannot receive the strongest structural-grid score. On the OzCHI review output, the previously observed results paragraph and bullet introduction are no longer promoted as table candidates while Table 1–5 remain. Extraction corpus 56/56 and full Vitest 354/354 pass. Broader corpus manual review remains pending.

### Table candidate prose-shape refinement (2026-09-16)

The OzCHI manual review identified incomplete 8+ line prose blocks being scored as structural grids. A generic line-count/word-count guard now suppresses strong grid evidence for that shape, while flattened grids and short multi-cell tables remain eligible. The two observed prose candidates are now paragraph nodes; Table 1–5 remain. Extraction corpus 56/56, Vitest 354/354, lint, and typecheck pass.

Verification correction (2026-09-16): broad candidate prose suppression was reverted after the full baseline showed OzCHI table-region recall falling to 0.8. Resolver-side guards remain, but strong multi-item prose candidates are still an open precision issue.

### Structural-grid precision experiment (2026-09-16)

A repeated-x-across-three-lines condition was tested for structural-grid evidence. It preserved tests and OzCHI recall but did not affect the remaining long-prose false positives, which come through the separate `proseGrid` path. Reverted due to no measured benefit; follow-up should target row-level geometry in `proseGrid`.

### proseGrid x-origin guard (2026-09-16)

Added a distinct line-origin requirement to proseGrid evidence. It removes the page-8 results prose candidate in the OzCHI manual output without changing expected table regions or extraction tests. One page-9 bullet/table-like stream remains ambiguous and is intentionally not suppressed without stronger native evidence.

### List-like table candidate guard (2026-09-16)

A mixed prose + bullet block on OzCHI page 9 was receiving structural table evidence via proseGrid. Added a generic guard for four-plus-line blocks containing bullet markers, so the block remains paragraph/list content. Table 1–5 recall remains 1.0 and extraction corpus remains 56/56. Separate long-prose proseGrid candidates remain an open precision item.

Latest baseline verification (2026-09-16): list-like table guard preserves table recall (all four annotated papers 1.0) and source integrity (26/26 at 1.0). Translation pipeline remains untouched.

### Corpus diagnostic refresh (2026-09-16)

The extraction diagnostic covers 26 papers / 497 pages and reports 149 suspicious blocks. Largest review queues are linguistics (34), cognitive psychology (23), and medical imaging (22), mostly image-overlap, short-label-band, and mixed-layout signals. These remain diagnostic-only until manual confirmation; no broad suppression was introduced.

### proseGrid stable-item-column experiment (2026-09-16)

Tested requiring repeated native item x-columns in proseGrid. It did not remove the remaining page-8 long-prose candidate and risked rejecting legitimate multi-line cells, so the change was reverted. The failure likely originates in block grouping before candidate generation.

### Same-origin prose guard (2026-09-16)

Added a narrow geometry condition for >8-line, >20-word blocks sharing one native line-origin band; this suppresses the observed incomplete prose grid candidate without broad word-count rejection. OzCHI page-8 output keeps the results paragraph as paragraph and preserves Table 1–5 (table recall 1.0, source integrity 1.0). Extraction corpus 56/56 and Vitest 354/354 pass.

### 2026-09-16 作業停止チェックポイント
ユーザー指示により、この時点でプロセスを停止した。未完了の抽出課題は、残存する proseGrid の曖昧な table 候補と、広範な corpus の手動レビュー。再開時は `CURRENT_STATE.md` の同日チェックポイントと `git log -3` を確認する。
## Extraction audit checkpoint — 2026-09-16

- Real-paper extraction corpus is stable at 56/56 tests with the single-worker corpus configuration.
- Manual residual fixture now has 83/83 reviewed samples; the review summarizer accepts both the legacy `manualRole` field and the current `reviewLabel` field.
- The dominant residual is vector/image figure labels (49 samples). Labels with explicit image/vector evidence are suppressed from translatable nodes; labels emitted without image placement metadata remain under review.
- Economics native math and wear-scale rotated Table 6 were inspected without adding paper-specific rules. Standalone equations and rotated table regions remain separated in the canonical output.

### 2026-09-16 medical arXiv residual probe (native geometry)

A narrow native-to-canonical probe of `medical-image-segmentation-deep-learning.pdf` confirms the remaining arXiv diagnostic queue is structural rather than translation-related. Page 1 has body text split across left/right columns with a continuation beginning `have become four important...` emitted before the left-column continuation `tion, pulmonary nodules...`; the affiliation block is also classified as a paragraph adjacent to body text. Page 2 emits a short `Survey` paragraph between body and `Fig. 1` caption, and the same Fig. 1 caption appears again later in the native reading stream. These are native reading-order / duplicate-caption residuals. No paper-specific rule was added; the next fix requires a general spanning-vs-column ordering and caption deduplication fixture with bbox evidence.

### 2026-09-16 exact caption deduplication

Added a conservative resolver pass that coalesces only same-page captions with identical normalized text. This addresses duplicate native caption candidates without merging continuation captions or similar prose. Extraction corpus: 56/56 passed; no translation code changed.

Full regression after caption deduplication: Vitest 61/355, TypeScript and lint passed. The extraction goal remains open because the medical arXiv two-column ordering and affiliation/body boundary still require a general geometry fixture and resolver/layout correction.

### 2026-09-16 spanning metadata ordering guard

A native geometry probe showed a spanning arXiv metadata line acting as a mid-page cut and interleaving columns. The layout reader now excludes generic metadata/footer patterns from mid-page cuts. This preserves left-column continuation order before the right column. Extraction corpus: 56/56; TypeScript and lint passed. The affiliation/body boundary and duplicate-caption verification remain queued.

Post-guard medical survey probe: the former metadata mid-cut no longer interleaves the left-column tail and right-column continuation, and exact same-page caption duplicate count is 0. A long affiliation block still appears between left and right column content because its native bbox occupies the lower left column; this is retained as an unresolved geometry fixture rather than relabeled by paper-specific logic.

Full 26-paper extraction benchmark after the spanning metadata guard: heading precision 1.000, heading recall 0.993, reading-order pair score 1.000, figure-caption relation 1.000, source integrity 1.000, and canonical provenance 1.000. Title exact remains 0.769. No translation changes were made.

### 2026-09-16 corpus diagnostic refresh

Latest layout diagnostic: 26 papers, 497 pages, 149 suspicious blocks. Distribution is arXiv 136, PMLR 6, Elsevier 4, OzCHI 2, IEEE 1; all other format families are 0. These are diagnostic candidates, not automatic relabels. The next extraction work remains geometry fixtures for vector labels, numeric grids, and mixed layouts.

Production web build verification after the latest extraction change: `npm run build` passed (TypeScript + Vite); only existing ineffective dynamic-import warnings remain. No `.app` build or translation-server change.

### 2026-09-16 spanning metadata regression fixture

The metadata ordering guard now has a general regression test built on the existing ACM two-column fixture. A spanning arXiv line inserted mid-page cannot split the left column before the right; reading-order tests pass 53/53.

Full regression after adding the spanning metadata fixture: **61 files / 356 tests passed**. Remaining extraction work is limited to corpus-backed affiliation/body ordering and table/list geometry residuals; translation code remains unchanged.

Residual review refresh: all 83 samples are reviewed (pending 0). Main labels are figure_label 49 and table_row 14; severity 3 is 73/83. Classes are image-overlap 28 and short-label-band 55. The high-severity queue remains an extraction geometry problem, so no translation-layer change or broad suppression was added.

Extraction corpus recheck after the latest fixture: **56/56 passed** in 26.67s, with no new failures. Affiliation/body ordering and table/list geometry remain the next open extraction items.

Real-paper reading-order recheck with the extraction config: **27/27 passed** after the spanning metadata guard and regression fixture. No translation changes.

### 2026-09-16 table/list residual classification

Review of diagnostic samples confirms that many cognitive-psychology and step-to-charge mixed-layout/numeric-grid candidates are experiment cards, diagrams, or chart labels, while linguistics candidates contain dense algorithm/math notation. A generic word-count suppression would risk hiding legitimate prose, so no new role rule was added; geometry/image provenance remains the next safe discriminator.

### 2026-09-16 affiliation boundary regression

The Japanese conference geometry fixture now asserts that affiliation text remains an affiliation node and is not duplicated as paragraph content. Reading-order tests remain 53/53.


### 2026-09-16 caption deduplication regression

A pipeline fixture now duplicates a native figure-caption span with a slight bbox offset. Canonical projection returns one caption node (targeted suite 19/19). This validates exact same-page caption deduplication without changing translation behavior. The fixture also exposes that duplicate raw text can be concatenated before deduplication; preserving a single clean caption string remains an open geometry refinement.

### 2026-09-16 native duplicate text-span guard

A general line-formation guard now drops only near-coincident, text-identical native spans. This prevents accessibility/visible text-layer duplication from producing concatenated captions while retaining repeated values in separate table cells. Targeted pipeline: 19/19; extraction corpus: 56/56. No translation changes.

### 2026-09-16 duplicate caption content assertion

The caption fixture now checks both canonical node count and exact marker occurrence, proving that duplicate native spans do not silently concatenate into one node. Targeted pipeline: 19/19.

### 2026-09-16 verification checkpoint

The native duplicate-span guard is verified by pipeline (19/19) and extraction corpus (56/56). TypeScript, lint, and Web build pass; only existing ineffective dynamic-import warnings remain. `.app` and translation-server remain untouched.

### 2026-09-16 reading-order safety recheck

Full reading-order fixtures remain green (**53/53**) after the coincident native-span cleanup. This confirms the guard does not alter column ordering or affiliation/list boundaries.

### 2026-09-16 corpus diagnostic after duplicate-span guard

The non-mutating corpus diagnostic remains 26 papers, 497 pages, and 149 suspicious blocks (arXiv 136; PMLR 6; Elsevier 4; OzCHI 2; IEEE 1). Stable counts are expected because remaining candidates are primarily vector-label and mixed-layout geometry cases.

### 2026-09-16 complex first-page affiliation assertion

The complex mixed-band fixture now explicitly checks that native affiliation text is not duplicated or relabeled as paragraph content, and that it precedes the abstract. Reading-order suite: 53/53.

### 2026-09-16 extraction benchmark refresh

The 26-paper benchmark was regenerated after the latest native text cleanup. Aggregate scores remain heading precision 1.000, recall 0.993, reading-order pair 1.000, figure-caption relation 1.000, source integrity 1.000, canonical provenance 1.000; title exact remains 0.769. Remaining failures are geometry residuals, not translation behavior.

### 2026-09-16 repeated-cell safety fixture

Added a safety fixture for repeated values in separate native table cells. Both values survive while only near-coincident duplicate spans are removed. Pipeline suite: 20/20.

### 2026-09-16 full regression after repeated-cell fixture

Full Vitest is green: **61 files / 358 tests passed**. The new native text-layer cleanup remains isolated from translation code; extraction completion is still pending geometry residuals.

### 2026-09-16 spanning affiliation geometry fixture

A paper-agnostic geometry fixture now covers a full-width affiliation band before an abstract and two-column body. Affiliation/body separation and ordering pass without lexical paper-specific rules. Reading-order suite: 54/54.

### 2026-09-16 boundary scanner output separation

The boundary scanner now separates extraction traces (stderr) from its JSON findings (stdout), making native geometry findings suitable for automated fixture generation. Production parsing is unchanged.

### 2026-09-16 machine-readable boundary scan validation

The scanner's separated JSON was parsed over the corpus: 25 papers had findings, with 10 affiliation candidates and 12 figure-marker-in-paragraph candidates, and zero long-caption candidates. These remain native-geometry triage signals; no broad parser rule was added.

### 2026-09-16 boundary scanner file output

The scanner now accepts `--json-out=...` and writes findings directly to a file. A corpus run produced valid JSON with 25 finding papers, 10 affiliation candidates, and 12 figure-marker-in-paragraph candidates. These remain review inputs, not automatic role changes.

### 2026-09-16 boundary candidate inventory

The machine-readable findings were grouped by paper. Affiliation candidates span 10 papers across multiple disciplines; figure-marker-in-paragraph candidates span 12 papers, concentrated in math/diagram-heavy layouts. Candidate inventory remains a manual/native-bbox review queue.

### 2026-09-16 boundary finding provenance

Affiliation and figure-marker findings now carry native bbox, confidence, and evidence labels. This provides auditable evidence for separating true caption contamination from ordinary in-text Figure references before changing extraction rules.

### 2026-09-16 figure-marker provenance validation

A representative `Figure 2:` candidate now carries native bbox and evidence (`vector-figure-label-cluster`, confidence 0.855), confirming mixed text/figure-label geometry. This supports a geometry-aware fixture and avoids unsafe lexical splitting.

### 2026-09-16 native image-overlap evidence

Figure-marker findings now report native image-placement overlap. The corpus scan found zero positive overlaps among the candidates, ruling out an overlap-only fix and directing the next fixture toward caption adjacency and column geometry.

### 2026-09-16 caption adjacency diagnostics

The scanner reports nearest horizontally aligned image gap in addition to overlap. The representative mixed Figure 2 paragraph has no aligned image, so its failure is native text ordering/column interleaving; image overlap alone cannot safely trigger a split.

## Extraction checkpoint (2026-09-16)

The extraction pipeline remains the active priority before translation work. The current 26-paper native-PDF baseline reports heading precision 1.000 / recall 0.993, reading-order pair accuracy 1.000, figure-caption relation 1.000, source integrity 1.000, canonical provenance 1.000, and title exact 0.769. Extraction corpus regression is 56/56; TypeScript, lint, and Web build pass. Residual diagnostic findings are concentrated in arXiv/PMLR vector labels, short-label bands, and dense math grids; no safe broad relabel rule has been identified. Next: orientation-aware table/footnote fixture using native rotation provenance.

### 2026-09-16 extraction continuation: inferred-column safety

Hypothesis: inferred two-column splitting can lose or misclassify scientific tokens when native x metadata collapses to a single column label. Targeted synthetic input included p-values, decimals, percentages, and a table-like numeric row in alternating x bands.

Before: no explicit regression covering token preservation for this inferred path.
After: all native markers survive reconstruction, every resulting block passes `hasSourceTextIntegrity`, and the focused reading-order suite passes 56/56. No role promotion rule was changed, so no new false-positive evidence was introduced. Keep.

The full corpus remains at 26 papers / 497 pages; residual diagnostic candidates remain geometry-heavy (arXiv vector labels and Elsevier native table streams). Next work is orientation-aware table/footnote evidence, followed by manual review of the remaining diagnostic sample.

### 2026-09-16 geometry triage artifact

Generated `test-data/real-papers/reports/extraction-diagnostic-triage-v1.json` from the native-facts diagnostic. It contains 129 suspicious samples with native provenance and an auditable recommendation: 83 high-risk short/numeric/image-overlap candidates should retain native fallback, while 46 remain review-for-structure. This is a triage artifact only; no lexical or paper-specific production rule was introduced.

The 46 review-for-structure findings are also exported as `test-data/real-papers/reports/extraction-review-queue-v1.csv`, sorted by paper and page for manual native-PDF comparison. The queue records bbox and diagnostic ratios so manual labels can be added without inferring from text alone.

### 2026-09-16 manual native-PDF comparison: cognitive-psychology-gpt3 p2

`pdftotext -layout` confirms the suspicious block is a vector figure/text-layer interaction: the page's Figure 1 contains labels such as “Linda”, “Cab”, “Hospital”, “Toma”, and “Wason” arranged in a diagram, while the nearby body paragraph begins “Linda is 31 years old…”. The extractor combines these native labels into one paragraph because there is no raster image overlap. This is a genuine figure-label contamination case, not a translation failure. A lexical split would be unsafe; the correct next step is vector-figure region evidence from native geometry/line clustering, with paragraph fallback when confidence is insufficient.

The vector-figure finding is now recorded in `reports/extraction-manual-review-v1.json` as an unresolved-safe-fallback severity-2 case, with its geometry root cause and proposed evidence-only remedy.

### 2026-09-16 benchmark refresh after vector review

`npm run bench:pdf-extraction` completed over 26 cached papers. Source integrity and canonical provenance remain 1.000; figure-caption relation remains 1.000; title exact remains 20/26 (0.769). No safety regression was observed, and no translation code was executed.

### 2026-09-16 vector-label evidence refinement

Hypothesis: vector diagram labels can be embedded before a prose line, so a terminal period alone must not suppress vector-label evidence. The generic evidence now permits that case only with a distinct smaller compact label line; ordinary sentence paragraphs still require the prior punctuation guard. Targeted pdfExtraction suite: 44/44 passed. Keep pending full-corpus benchmark review.

### 2026-09-16 controlled vector-label regression

Added a paper-agnostic geometry fixture with a prose line, smaller compact labels across multiple x-bands, and a following prose line. Generic candidate generation now emits `vector-figure-label-cluster` for this mixed block. Pipeline suite: 24/24 passed; no lexical paper-specific condition was used. Keep pending full benchmark.

## Phase 2 manual semantic review completion (2026-09-17)

The current cached corpus review is complete: **26 PDFs, 52 sampled blocks, 52 manually reviewed** across HCI, cognitive psychology, marketing, human factors, linguistics/ML, medicine, neuroscience, economics, education, design, and technical papers. This is a corpus audit checkpoint, not completion of the requested 50+ paper expansion.

Provisional reviewed-block metrics:

| Metric | Rate |
| --- | ---: |
| Semantic error | 30.8% |
| Extraction-induced error | 38.5% |
| Unsafe false accept among accepted reviewed rows | 52.0% |
| Hallucination | 4.35% |

The dominant extraction failures are incomplete cross-page/column paragraphs, flattened multi-column tables, and vector diagram labels mixed into prose. Translation failures include omissions, citation/author attribution shifts, terminology errors, and severe fluent hallucination. Two complete long abstracts were rejected before/after model use and are retained as false-reject candidates for direct retry rather than used to justify stricter thresholds.

Implemented during this phase: a script-level simplified-CJK contamination guard with a regression test (63/63 quality tests pass). It detects mixed-language output such as `学习` without blacklisting domain terms. Remaining work is to expand the provenance-verified corpus to at least 50 papers, run direct retries for false-reject candidates, and implement/measure paragraph stitching and table/vector-region improvements before claiming a production-ready fallback rate.

The catalog was normalized with derivable `sourceUrl` and `oaStatus` values; author/year and other non-derivable provenance fields remain explicitly missing for later verification.

### Phase 2 continuation: target tracking and acquisition gate (2026-09-17)

The catalog now emits per-discipline target deficits and the pending-candidate checker rejects duplicate IDs and incomplete provenance before any PDF is acquired. The current catalog remains 27 entries / 26 ready PDFs. Four additional HFE candidates have verified DOI and primary OA landing pages, but PMC access in this environment currently returns a browser challenge; they remain metadata-only until the PDF bytes can be legally retrieved and title/DOI checked.

## Phase 2 fresh-port checkpoint (2026-09-17)

The audit now uses `test-data/real-papers/reports/translation-audit-fresh-v1.json` as its deduplicated aggregate. It contains 30 measured papers and 208 sampled rows (65 ordinary-body units). Current product-facing baseline is 18/65 ordinary-body fallbacks (27.7%); model-eligible fallback is 67/141 (47.5%). Stage counts are 42 pre-model and 25 post-model fallbacks, with 69 units completing without fallback.

Pre-model attribution identifies 32/42 as paragraph or source-fragment repair candidates (20 truncated endings, 10 leading continuations, one broken word, one unbalanced delimiter) and 10 as non-prose/structural cases. Fresh attribution is persisted in `translation-fallback-attribution.json`; the audit-only low-coverage queue is `semantic-review-low-coverage-v1.json` (32 rows).

Manual review remains incomplete: 28/208 rows annotated and 180 pending. Among the earlier 25 reviewed ordinary rows, unsafe false accepts were 13/25 (52%), so the <=5% fallback and near-zero unsafe-corruption targets are not met. Semantic coverage is used for triage only because safe and unsafe similarity distributions overlap. No blacklist or global gate relaxation is justified.

Next actions: repair high-confidence page/column source fragments, rerun the fresh aggregate, then evaluate selective rescue (coverage + invariants + structure) against held-out rows. Keep extraction title diagnostics independent; title geometry reports for social advertising and modeling are under `test-data/real-papers/reports/title-geometry-*.json`.

## Phase 2 continuation checkpoint (2026-09-17)

Fresh-port audit completed the final two cached pending papers: `wear-scale` and `how-content-volume-landing-pages`, 12 translation units each. The server ran on port 18782 in the same shell and was cleaned up after completion (`lsof` confirms no listener on 18782). The fresh aggregate now contains 32 papers / 232 rows. Ordinary-body rows: 74, reader-visible fallbacks: 19 (25.7%); model-eligible rows: 154, fallbacks: 70 (45.5%); stages: pre-model 50, post-model 28, accepted 82. These figures remain far above the <=5% target, so the goal is not complete. Manual review queue remains 28 completed with new rows pending. Next action is attribution and selective rescue evaluation, without weakening the global quality gate.

### Audit queue refresh (2026-09-17)

The manual review queue was rebuilt against the 32-paper fresh aggregate: 232 rows total, 28 annotated and 204 pending. The semantic priority script now returns 6 eligible high-priority rows; labels remain audit-only and are not used by production selection. `git diff --check` remains clean.

### Pre-model fallback reclassification (2026-09-17)

Recomputed the repair inventory against the current 32-paper aggregate (v2, preserving paper IDs). Of 50 pre-model fallbacks, 33 are continuation/truncation/structural-repair candidates and 17 are non-prose or otherwise unsafe to merge. The largest buckets are paragraph-ending truncation (23) and leading continuation (9); figure-subpanel mixing (2) is explicitly kept out of paragraph repair. This is an audit artifact only; no production threshold or merge rule was changed.

### Guard regression checkpoint (2026-09-17)

After refreshing the 32-paper audit and repair inventory, quality tests remain 63/63 and translation-server unittest discovery remains 109/109. The 33 repair candidates are retained as audit-only evidence; no production merge/gate change was made because the current sampled provenance does not establish safe paragraph adjacency.

### Semantic coverage refresh (2026-09-17)

The audit-only relation/coverage scorer was rerun against the full fresh aggregate (not the default 10-row sample): 144 comparable translated rows. It flagged 2 low sentence-coverage rows, 2 low length-ratio rows, 24 invariant-loss signals, 7 negation-relation losses, 6 contrast-relation losses, 17 ordinal-claim losses, and 3 condition-relation losses. These are triage signals only; no automatic fallback threshold was changed.

### Fresh accepted-output review packet (2026-09-17)

Generated `semantic-review-candidates-fresh-v1.md` from the 82 accepted rows in the fresh aggregate. It contains the top 20 audit-only candidates ranked by combined relation/invariant/length signals, with source and Japanese output side by side. The ranking is deliberately non-authoritative and does not change production acceptance; it is the packet for manual semantic labeling before any selective cascade design.

### Provisional manual-review metrics (2026-09-17)

The current 232-row queue has 28 manually reviewed rows. Provisional rates are: automatic accept 46.4%, semantic error 25.0%, extraction-induced error 32.1%, unsafe false-accept 46.2% among eligible reviewed accepted rows, and false-reject 6.7%. These values are not final because 204 rows remain pending; they establish the baseline for selective rescue and reinforce that simply tightening or loosening the global gate is inappropriate.

### Mixed-chrome attribution (2026-09-17)

Among 50 pre-model fallbacks, 14 are explicitly marked `mixed-chrome`, 1 has a structural warning, and 35 have no source-integrity subtype in the benchmark report. Examples include Creative Commons licence text, figure subpanel prose, and column-boundary fragments. The mixed-chrome group is heterogeneous, so a global “retry as paragraph” rule would risk sending licence/figure text to MADLAD. These rows are now treated as an extraction separation worklist, not a translation-model failure.

### OA corpus retrieval check (2026-09-17)

The catalog fetcher was rerun against all existing download URLs. It confirms 32/33 PDFs ready and no new paper became available; one candidate still lacks a direct PDF URL. Further expansion to 50+ therefore requires new provenance-verified metadata, not repeated retrieval of the current catalog.

### Corpus expansion: cognitive psychology (2026-09-17)

Added the provenance-verified open arXiv paper `Using cognitive psychology to understand GPT-3` (Binz & Schulz, 2022; arXiv:2206.14576), downloaded from its arXiv PDF URL and registered in the catalog. Extraction regression now passes 70/70. A fresh-port benchmark on 18783 completed 12 units and the server was cleaned up. The fresh aggregate is now 33 papers / 244 rows: ordinary-body 81 with 21 reader-visible fallbacks (25.9%); model-eligible 161 with 72 fallbacks (44.7%); stages pre-model 53 / post-model 31 / accepted 88. Manual review remains 28/244 completed.

### Corpus expansion: linguistics (2026-09-17)

Added the open arXiv paper `An Empirical Analysis of the Correlation of Syntax and Prosody` (Köhn, Baumann & Dörfler, 2018; arXiv:1806.05900). Metadata and PDF were verified, extraction regression passed 72/72, and a fresh-port benchmark on 18784 completed 12 units with cleanup. The aggregate is now 34 papers / 256 rows; the manual-review queue was refreshed.

### Semantic coverage after 34-paper expansion (2026-09-17)

Rerun against the updated fresh aggregate produced 154 comparable rows. Signals: low sentence coverage 2, low length ratio 2, invariant loss 25, negation relation loss 8, contrast relation loss 6, ordinal claim loss 17, condition relation loss 3. These remain audit-only rescue signals.

### Catalog validation after linguistics expansion (2026-09-17)

Catalog coverage now reports 35 papers and 34 PDFs ready. TypeScript typecheck and oxlint completed successfully. Legacy local-seed entries still have metadata gaps; newly added arXiv entries carry source URLs, OA status, authors, year, and selection reasons.

### New-paper per-format attribution (2026-09-17)

`using-cognitive-psychology-gpt3` produced 6 fallbacks of 12 units (3 pre-model, 3 post-model). `syntax-prosody-correlation` produced 8 fallbacks of 12, all pre-model, dominated by paragraph-ending/leading-continuation warnings. The latter is a useful extraction-boundary stress case; these results should not drive MADLAD gate tuning.

### OA retrieval guard (2026-09-17)

A PMC ergonomics candidate was rejected because the guessed PDF endpoint returned HTML rather than a PDF. Its temporary catalog entry was removed; no unverified paper was counted. This preserves corpus provenance integrity while leaving the candidate for later retrieval via the PMC OA API.

### PMC manifest check (2026-09-17)

The NCBI OA manifest endpoint returned 404 for PMC9929192 and PMC4466322 in this environment. No PDF was added without a verifiable manifest/link; the corpus remains 34 papers / 256 rows.

### Manual review: negation reversal (2026-09-17)

Reviewed `how-content-volume-landing-pages` block `b-081de247`. The source states that **not all** persuasion theories are effective online, while the accepted Japanese output states that **all** theories are effective. This is a severity-3 semantic shift, attributed primarily to MADLAD decode (secondary terminology). The row is now labeled in the audit queue only; production behavior is unchanged. Review progress: 29/256.

### Manual review: terminology drift (2026-09-17)

Reviewed `thermal-earring` block `b-22de2c20`. “Earlobe temperature” is rendered once as “耳か温度,” a clear terminology/wording error (severity 1) while measurements and the study claim remain intact. Primary cause is MADLAD decode. Review progress is 29/256; provisional unsafe false-accept is 50.0% among reviewed eligible accepts.

### Manual review: experimental-design terminology (2026-09-17)

Reviewed `hci-empirical-methods` block `b-48011542`. “Counter-balancing test conditions” was rendered as the nonstandard “対抗試験条件,” a severity-1 terminology error; the experimental-design meaning remains inferable. Primary cause: MADLAD decode. Review progress is 30/256; provisional unsafe false-accept is 46.7%.

### Manual review: scope omission (2026-09-17)

Reviewed `interactive-jewellery` block `b-7e7c94f2`. The source explicitly says the three perspectives will structure description and reflection throughout the remainder of the paper; the accepted translation reduces this to using the perspectives to clarify structure and omits the scope/reflection claim. Labeled omission + semantic_shift, severity 2, primary MADLAD decode. Review progress: 31/256; provisional unsafe false-accept 50.0%.

### Manual review: experimental-condition distortion (2026-09-17)

Reviewed `cognitive-psychology-gpt3` block `b-654e8b90`. The accepted translation changes the Blicket task: the source distinguishes a second object that does not activate the machine from joint activation of both objects, while the translation introduces a second machine and unsupported shared-information verification. Labeled semantic_shift + omission + addition, severity 3, primary MADLAD decode. Review progress: 32/256; provisional unsafe false-accept 52.9%.

### Production guard: quantifier negation (2026-09-17)

The observed “not all persuasion theories” → “all theories” false accept exposed a gap in the existing negation regex, which only recognized auxiliary-verb negation. `SOURCE_NEGATION` now also recognizes bounded quantifier forms (`not all`, `not every`, `not each`, `not necessarily`). Regression tests verify that a dropped quantifier negation is rejected while a preserved Japanese bounded negation is accepted. Quality tests: 65/65; typecheck/lint/diff-check pass. This change is generic and does not blacklist any hallucinated term.

### Guard effect rebenchmark (2026-09-17)

On fresh port 18785, the known marketing sentence with “not all persuasion theories” reproduced the prior reversed Japanese output, but the new quantifier-negation guard classified it as `post-model fallback` (`source negation missing`) rather than accepting it. The updated aggregate remains 34 papers / 256 rows; ordinary-body fallback 25.0%, model-eligible fallback 43.9%, with 92 accepted rows. This confirms a concrete unsafe false-accept reduction without a hallucinated-term blacklist.

### Aggregate deduplication and guard measurement (2026-09-17)

The fresh report merger now deduplicates by paper ID and lets later reports replace earlier checkpoints. This prevents double-counting when a paper is rebenchmarked after a production change. After replacing the marketing checkpoint with the negation-guard result, the authoritative aggregate is 34 papers / 256 rows: ordinary-body fallback 22/84 (26.2%), model-eligible fallback 73/164 (44.5%), stages pre-model 61 / post-model 32 / accepted 91. Manual queue: 32/256.

### Aggregate integrity checkpoint (2026-09-17)

The fresh aggregate now contains 34 papers with 34 unique IDs and zero duplicate paper entries after rebenchmark replacement. Quality regression remains 65/65 after the quantifier-negation guard.

### Post-model fallback reason inventory (2026-09-17)

The 34-paper aggregate contains 32 post-model fallbacks: 18 server source-fallback outputs, 2 source-negation misses (including the newly guarded quantifier case), and 12 scientific/language/degeneration invariant failures. The inventory does not support relaxing global quality thresholds; most failures are model/server output failures or explicit scientific-preservation failures.

## Pause checkpoint — 2026-09-17

作業は監査上の区切りで一旦停止した。fresh-port の benchmark / translation-server は残っておらず、legacy app listener は所有者不明のため触れていない。現行 authoritative baseline は 34 papers / 256 rows、ordinary-body fallback 22/84 (26.2%)、model-eligible fallback 73/164 (44.5%)、manual review 32/256。

直前に完了した分析は post-model fallback 32件の理由分類と、server source-fallback 18件の長さ分布（短2・中3・長13）。次回は `translation-server/engines/segmenter.py` の分割挙動を小さい範囲で確認し、代表的な長文 fallback に対する audit-only segmentation ablation を行ってから、production変更の要否を判断する。fallback率を下げる目的で品質ゲートを緩めない。

### Long source-fallback segmentation baseline

`test-data/real-papers/reports/segmenter-long-fallback-baseline-v1.json` に、post-model `server returned source fallback` の最長5例を現行 `semantic-v71` で分割した監査結果を保存した。入力長1,496〜1,750文字に対して7〜12 unitsとなり、各unitのsource/model input/文字数/語数を記録している。5例すべてで whitespace normalization 後のround-tripは成立した。この時点ではproduction変更を行っていない。
- 長文fallback基準作成後にsemantic segmenter回帰を再実行し、**41/41 passed**。最長5例は短いcitation-only fragmentへ崩れておらず、round-tripも全件成立したため、現時点ではsplitterの一般修正を投入する根拠は得られていない。次はmodel input/outputの直接比較またはcontrolled ablationを優先し、quality gate緩和は行わない。
- 長文分割基準後のtranslation-server全体回帰を再実行し、**109/109 passed**（microbatch/candidate selectionを含む）。production変更なし。未完了の次段階は、固定長文sourceに対する同一modelのdirect / microbatch ablation。
- 固定fixtureのdirect `/translate` ablationをfresh port 18786で試行したが、server起動後のbindで sandbox が `operation not permitted` を返したため、model outputは取得できなかった。同一shellのtrapで後処理し、18786のlistenerは残っていない。この結果は品質原因の結論ではなく、実行環境上のblockerとして記録する。
- 固定fixture direct実測を elevated fresh port 18787 で完了した。184文字のcitation文をproduction `/translate`へ1 request（1 chunk）で投入し、author-year citation 3件を保持した自然な日本語が返った。input 32 tokens / output 44 tokens / 2.12秒。今回のserver version・同一入力では既知hallucinationは再現せず、決定論的な単純再現ではないことが分かった。条件別ablation（protection、microbatch、意味分割）は未完了。
- 同一process・同一modelの固定fixture ablationをfresh port 18788で完了。raw citation、atomic `ZZREF1ZZ` placeholder、意図的2-unit分割の3条件すべてで既知hallucinationは出なかった。raw 32→44 tokens、placeholder 32→44、split 36→49。split条件は軽い関係表現のずれがあり、placeholder条件はplaceholderを保持した。全入力/出力は `test-data/real-papers/reports/translation-fixed-ablation-v1.json` に保存。production変更なし。
- authoritative aggregateに対するmanual-review summaryを再計算した。32/256 reviewed、automatic accept 50.0%、semantic error 31.25%、terminology error 18.75%、extraction-induced 28.125%、unsafe false-accept 50.0%、false-reject 6.25%。未レビュー224件のため暫定値であり、automatic acceptanceを正解とは扱わない。
- accepted行を3件追加で人手レビュー（GPT-3 API methods、marketing paper structure、Jogwheel methods）。reviewは35/256。暫定集計は automatic accept 54.29%、semantic error 34.29%、terminology error 22.86%、extraction-induced 25.71%、unsafe false-accept 52.63%、false-reject 6.25%。監査ラベルはproduction selectorへ流用しない。
- accepted行を2件追加レビュー（section参照のsource fragment、interactive-jewelleryの因果関係）。review 37/256。暫定値は automatic accept 54.05%、semantic error 35.14%、terminology error 21.62%、extraction-induced 27.03%、unsafe false-accept 53.13%、false-reject 6.25%。
- 集計上の訂正：重複していた対象1件を除き、authoritativeなreview数は **36/256**。暫定値は automatic accept 55.56%、semantic error 38.89%、terminology error 22.22%、extraction-induced 22.22%、unsafe false-accept 55.0%、false-reject 6.25%。
- GPT-3の試行・prompt・feedback手順を説明するaccepted行を追加確認。summarizerのdeduplicated countは引き続き36/256（既存キー重複のため）で、暫定値は semantic error 38.89%、automatic accept 55.56%、terminology error 22.22%、extraction-induced 22.22%、unsafe false-accept 55.0%、false-reject 6.25%。監査ツール内の重複キーはproductionへ影響しない。
- 最新summarizerでは新規unique row反映後、authoritative review数は **37/256**。automatic accept 56.76%、semantic error 40.54%、terminology error 21.62%、extraction-induced 21.62%、unsafe false-accept 57.14%、false-reject 6.25%。以前の36/256 checkpointは superseded。
- `TRANSLATION_UNIT_DEBUG=1` 時のmicrobatch unit fallbackログを一般化し、source SHA-256短縮値、unit index/total、chunk文字数、例外型/メッセージを出すようにした。通常ログ量とAPIは維持。translation-server回帰 **109/109 passed**、diff-check通過。
- debug instrumentationの検証完了。`py_compile`、translation-server全体 **109/109 passed**、`git diff --check` が通過。次回fresh-port監査で利用可能。`.app` buildは未実施。
- `covid-ml-review` をfresh port 18789・`TRANSLATION_UNIT_DEBUG=1`で12 units実測し、レポートを保存・server cleanup完了。paper-id dedup mergeへ反映した。manual review前にaggregateを再集計する。
- `FRESH_TRANSLATION_REPORTS` が必要なmerge scriptを一度誤った引数で実行したが、全 per-paper fresh reportを指定して再mergeし、paper-id dedup aggregateを正常に再構築した。
- `covid-ml-review`のaccepted medicine本文を1件手動確認。「results are estimated and reported」が「実験結果を報告」に変わり、5層processも圧縮された。semantic_shift severity 2、primary MADLAD decode。review 38/256、暫定semantic error 39.47%、unsafe false-accept 57.89%。
- 訂正：`covid-ml-review:b-77db4961` は既存queueに含まれており、今回の重複key更新では変更されなかった。新規reviewとして数えず、authoritative countは37/256、指標も前回値を維持する。
- `human-ai-interaction-guidelines` をfresh port 18790で12 units実測（debug有効）し、全reportをdedup merge。server cleanup完了、aggregate再構築済み。
- 新report merge後のaggregateは **34 papers / 266 rows**（paper数はdedup後同じ、sample rowが10件増加）。manual review queue preparationも再実行し、次回はpending queueを再確認してから注釈を進める。
- queue rebuild後の注意：`prepare-translation-manual-review.ts` がactive queueをpriority 52行へ再構成し、過去9行を`archivedReviews`へ移した。現行summarizer denominatorは active 28/52。暫定値は automatic accept 53.57%、semantic error 28.57%、terminology error 17.86%、extraction-induced 28.57%、unsafe false-accept 46.67%、false-reject 0%。以前の37/256は履歴値。
- `human-ai-interaction-guidelines` conclusion accepted行 b-3d6e8ba2をレビュー。「steering the future」が未来を支配する意味へずれたため semantic_shift severity 2、primary MADLAD decode。summarizerでactive summaryを更新、監査ラベルはaudit-only。
- 266-row aggregate merge後のordinary-body / model-eligible fallback率を再集計し、256-row時点の値をsupersedeする測定checkpointを作成した。production変更なし。
- aggregate更新後のアプリ検証として `npm run typecheck` と `npm run lint` がともにpass。`.app` buildは未実施。
- 教育分野accepted行 b-844b5f68を確認。「environment」が誤語「環界」になったため terminology_error severity 1、primary MADLAD decode。active queue集計を更新。
- wearable/ergonomics accepted行 `wear-scale` b-16c56d24を確認。Kelly→Kelliの固有名詞ドリフトと「as illustrated below」の省略、severity 1。active review 30/52、summaryを更新。
- speech interaction accepted abstract `speechin` b-29bed79dを確認。convolutional→「巻き込み」、neck/face記述重複などtechnical terminology error severity 2、数値・精度は保持。active review 31/52。
- speechin/wear-scale/educationレビュー後、単発の用語誤りだけではgeneric production ruleを追加しない方針を確認。次のescalationはfrozen held-out cohortでの代替モデルまたはselective cascade評価。diff-check通過。
- 既存の代替モデルartifact（Gemma 2 9B、Qwen 2.5 3B/7B/14B、M2M100、Opus、およびheld-out/manual/selector比較）を確認した。現行266-row aggregateとの対応付け前にproduction selectorを変更しない。
- 代替モデルmanual artifactを確認。Qwen 2.5 14B/7B、Gemma 2 9Bには`manualLabel`があるが、各12行程度＋smoke/held-outの小規模legacy sampleで現行266-row aggregateとは未整合。production改善の根拠とはせず、後続selector分析用に保持する。
- 代替モデルlegacy manualLabelを横断集計し、audit-only `alternate-model-manual-summary-v1.json` を作成。artifact別label数と severe semantic/safety率を保存した。小規模かつ現行266-rowと未整合のためproduction model選択結果ではない。
- 代替モデルlegacy manual rowsを現行266-row aggregateへ`(paperId, blockId)`で照合し、`alternate-model-alignment-v1.json`を作成。future selective cascadeで使えるexact overlapを確定した。未整合legacy scoreはproduction evidenceとして扱わない。
- exact-alignment 3行についてMADLAD decisionとQwen 14B manual labelを比較したが、3行のみでselector推定には不足。alignment artifactをaudit-only seedとして保持し、cascade thresholdは変更しない。
- block ID変更を吸収するためwhitespace-normalized source SHA-256で代替モデル行を再照合し、`alternate-model-source-alignment-v1.json`を作成。exact block ID以外のoverlapを追加発見した。positional推測はせずaudit-onlyで保持。
- source一致17行のcross-model auditを集計。MADLAD decisionと代替manual labelの不一致からrescue候補を特定できるが、model artifact間の重複と小標本のためproduction selectionには不足。selector変更なし。
- 代替モデル再適用の前提としてOllamaを確認。binaryは存在するがdaemon `127.0.0.1:11434`へこのsessionから接続できず `operation not permitted`。再実測は行わず、legacy artifactをaudit-onlyで保持。
- legacy held-out semantic-shift sourceをOllama Qwen 2.5 14Bへ再投入。今回の出力は既存MADLAD訳より因果の不確実性を保つ方向だったが、1例の定性的観察に留まりproduction selectorへは利用しない。結果は`alternate-model-current-row-v1.json`。
- `speechin` b-29bed79dをQwen 2.5 14Bで同一source比較。Qwenはconvolutional recurrent neural networkを「深層畳み込み再帰神経ネットワーク」とし、54/44/20/10/72および90.5%/91.6%を保持。MADLADの「巻き込み」より明確に改善したが、1行のためproduction cascadeは変更しない。artifact: `alternate-model-speechin-v1.json`。

### Title residual attribution checkpoint (2026-09-17)

The two remaining title mismatches were inspected using the native geometry diagnostics. The social-advertising case has a grouped two-line title, but generic candidate scoring labels that block `author` because masthead evidence wins at the same font scale; this is a candidate-scoring/masthead competition case. The modeling case is already classified as `title`; its mismatch is punctuation normalization (`-` versus `--`) rather than extraction loss. The audit-only attribution is saved in `test-data/real-papers/reports/title-root-cause-attribution-v1.json`. No production threshold or paper-specific rule was added.

### Fresh benchmark continuation (2026-09-17)

The pending computational-linguistics PDF was processed through a fresh-port server (18791) and the server was stopped by the same-shell trap. Its extraction produced only 2 qualifying paragraph units, both recorded in the per-paper report. The aggregate was rebuilt from all 35 per-paper fresh reports with paper-id deduplication; it now contains 34 papers and 276 rows. The initial merge invocation used an incorrect path form and was immediately corrected by a full basename-based rebuild, so the one-paper intermediate aggregate was not retained as authoritative.

- Manual review continuation (2026-09-17): `design-for-wearability:b-8613f419` was an accepted translation but contained unrelated web/web-bridal content and omitted the source's body-worn design meaning. It is labeled hallucination/semantic shift/terminology error, severity 4, with MADLAD decode as primary cause. No blacklist or production selector change was made.
- Manual review continuation (2026-09-17): `interactive-jewellery:b-c1e9695a` accepted output omitted the opening traditional-jewellery framing and added an unsupported manufacturing reference. Labeled omission/semantic shift, severity 2, primary MADLAD decode.
- Manual review continuation (2026-09-17): medical-imaging review abstract b-f434fd12 retained its overall meaning but degraded `federated learning` terminology and weakened the non-exhaustive-survey qualification. Labeled terminology_error/omission severity 1; primary MADLAD decode.
- Manual review continuation (2026-09-17): HCI methods block b-d508a89e mistranslated `undergraduate HCI course` as a graduate-school course, changing the prerequisite audience. Labeled terminology_error/semantic_shift severity 2; primary MADLAD decode.
- Manual review continuation (2026-09-17): marketing quantitative block b-6e163a56 omitted the final mathematical claim about cumulative distribution function P(x), despite preserving the preceding equation claim. Labeled omission/semantic_shift severity 2; primary MADLAD decode. This shows numeric-token invariants alone do not catch relational omissions.
- Manual review continuation (2026-09-17): cognitive-psychology block b-3f9702fe-5 compressed a detailed methods description and omitted the per-trial response detail, with weakened vignette/task distinction. Labeled omission severity 2; primary MADLAD decode.

### Length-ratio gate analysis (2026-09-17)

Accepted rows with Japanese/source character ratio below 0.4 were compared. The cohort includes both correct concise translations and severity-2-or-higher omissions/semantic shifts, so length ratio alone cannot safely reduce unsafe accepts without increasing false fallbacks. The audit-only cohort is saved in `test-data/real-papers/reports/accepted-length-ratio-audit-v1.json`; production thresholds were unchanged.
- Manual review continuation (2026-09-17): final unreviewed accepted row b-e93e395c preserved the survey design and participant conditions; only `wearable controller` was rendered as an awkward transliteration. Labeled minor_wording/terminology_error severity 1.
- Manual review continuation (2026-09-17): post-model fallback b-667e5341 retained its main argument but corrupted `EMG controllers` to `EMGZ` and displaced citation [4]. The invariant gate correctly prevented acceptance. Labeled terminology_error/citation_error severity 2.
- Manual review continuation (2026-09-17): pre-model fallback b-5824321b starts mid-sentence and lacks its antecedent. The fallback is correct; primary cause is paragraph reconstruction/extraction. Labeled source_fragment/paragraph_split severity 2.
- Manual review continuation (2026-09-17): pre-model fallback b-73291c9e ends with an incomplete `13.56 MHz RF` phrase. Fallback is correct; primary cause paragraph reconstruction/extraction. Labeled source_fragment/paragraph_split severity 2.
- Manual review continuation (2026-09-17): neuroscience fallback b-ae7871b7-3 omitted citations 29,30,32 and 33 and compressed an experimental-condition clause. The invariant gate correctly blocked acceptance. Labeled citation_error/omission severity 2.
- Manual review continuation (2026-09-17): fashion-hybrid block b-cfc8332e starts mid-sentence and ends mid-clause; pre-model fallback is appropriate. Primary cause paragraph reconstruction/extraction; labeled source_fragment/paragraph_split severity 2.
- Manual review continuation (2026-09-17): fashion-hybrid block b-d0b7f07c is a lower-case continuation ending at `self-expression and`; pre-model fallback is correct and attributed to extraction/paragraph reconstruction. Labeled source_fragment/paragraph_split severity 2.
- Manual review continuation (2026-09-17): step-to-charge block b-c96bb1f8 begins mid-sentence and lacks its preceding predicate; pre-model fallback is correct despite intact later claims. Primary cause paragraph reconstruction/extraction; labeled source_fragment/paragraph_split severity 2.
- Manual review continuation (2026-09-17): iHCI block b-776916fd begins with a dangling preposition and is a continuation of a prior sentence. Pre-model fallback is correct; primary cause paragraph reconstruction/extraction. Labeled source_fragment/paragraph_split severity 2.
- Manual review continuation (2026-09-17): interactive-jewellery block b-b11f9f2e ends at incomplete `We identify`; pre-model fallback is correct and requires adjacent-block repair. Primary cause paragraph reconstruction/extraction; labeled source_fragment/paragraph_split severity 2.
- Manual review continuation (2026-09-17): wear-scale block b-673addc1-3 mixes figure subpanel `(b)` text with methods prose and ends mid-sentence. Pre-model fallback is correct; primary cause structure mixing/extraction. Labeled source_fragment/figure_caption/paragraph_split severity 2.
- Manual review continuation (2026-09-17): iHCI block b-1042fadb-2 is a Chinese bullet/list paragraph outside the configured English-to-Japanese path. Expected-non-prose/source-language policy correctly prevented submission; labeled correct severity 0.
- Manual review continuation (2026-09-17): education block b-2acf9e0b is a flattened table with labels/cells interleaved and an incomplete final row. Pre-model fallback is correct; primary cause table/reading-order extraction. Labeled table_contamination/source_fragment/paragraph_split severity 2.
- Manual review continuation (2026-09-17): human-AI guideline fallback b-e41c0a7a is a concatenated card stream with missing separators; the invariant gate correctly blocked acceptance. Primary cause structure mixing/extraction, secondary model decode. Labeled table_contamination/terminology_error/source_fragment severity 2.
- Manual review completion checkpoint (2026-09-17): final active row speechin b-374f26ae ends at incomplete `too large to be considered`; pre-model fallback is correct and attributed to paragraph reconstruction/extraction. Labeled source_fragment/paragraph_split severity 2. Active queue reached 52/52 reviewed.

### Selective-cascade decision checkpoint (2026-09-17)

Existing alternate-model/cascade comparisons were reconciled against the completed manual review. The candidate cohort has no sufficiently aligned, manually verified safe rescue: all three reviewed cascade candidates contain semantic shifts. The audit therefore keeps model selection disabled and records the decision in `test-data/real-papers/reports/selective-cascade-decision-v1.json`.
- Corpus expansion checkpoint (2026-09-17): `conversation-analysis-user-experience` completed through fresh-port benchmark 18792 with server cleanup. Aggregate was rebuilt from all per-paper reports using paper-id deduplication.
- Post-review verification (2026-09-17): typecheck, lint, and diff-check pass. Fallback attribution was rerun using the report basename expected by the script; an earlier path-form invocation failed before reading data and did not mutate the audit.
- Saved the completed 52-row manual-review summary to `test-data/real-papers/reports/manual-review-summary-v1.json`; current unsafe false-accept is 52% in the reviewed priority cohort, so the quality goal remains unmet.
- Post-audit regression checkpoint (2026-09-17): extraction corpus + real-paper reading-order suites passed **72/72 tests**. Existing PDF.js font/ColorSpace warnings were non-failing; no production behavior changed.
- Post-audit safety verification (2026-09-17): quality tests **65/65** and translation-server tests **109/109** passed. No production behavior changed.
- Corpus coverage checkpoint (2026-09-17): catalog has 35 entries and 34 ready PDFs. HCI reaches 12/12; deficits remain cognitive psychology 3/10, marketing 3/10, ergonomics 3/10, linguistics 4/10. Coverage output is an explicit expansion worklist.
# Phase 2 pause checkpoint (2026-09-17)

Pending corpus の取得可能性を再確認した。sandbox と承認済み外部実行の双方で新規PDFは追加されず、監査集計は34 papers / 276 rows、manual reviewは52/52完了のまま。実行中の取得・翻訳サーバー・ベンチマークは停止済み。次回は直接PDF URLのないhuman-factors/healthcare 4件の合法な取得先を補完し、fresh-port同一shell方式で再開する。

取得スクリプトのPMC PDFリンク解決追加後、`node --check`、`npm run lint -- --deny-warnings`、`git diff --check` が成功した。ネットワーク復旧まで取得ジョブは再起動しない。
# 2026-09-17 HFE acquisition checkpoint

Europe PMC endpoint fallbackで `hfe-healthcare-scoping-2024`（749,347 bytes）と `hfe-healthcare-safety-review`（406,598 bytes）を取得し、catalogへ登録した。ローカル `vite-node` による抽出ベンチマークでは safety review のtitleExactはtrue、scoping studyは末尾語 `evidence` を欠く候補でfalse。sourceIntegrity/canonicalProvenanceは両件とも1.0。title候補の欠落は本文翻訳の問題として扱わず、line grouping / title candidate residualとして保留する。

fresh-port 18795で2件を各12 units実翻訳し、サーバーをtrapで停止。全38レポートをpaper-id dedup mergeし、aggregateは36 papers / 300 rowsとなった。翻訳の手動レビューとfallback率目標は未完了。

## Phase 2 initial manual-review completion (2026-09-19)

The expanded 36-paper aggregate now has **300/300 blocks manually reviewed**. The authoritative machine-readable results are `test-data/real-papers/audit-manual-review.json` and `test-data/real-papers/reports/manual-review-summary-v1.json`.

Current overall rates from the reviewed corpus:

- automatic accept: 47.33%
- pre-model fallback: 36.33%
- post-model fallback: 16.33%
- semantic error: 34.33%
- extraction-induced error: 45.33%
- hallucination: 3.67%
- terminology error: 17.67%
- numeric/statistical error: 3.67%
- unsafe false accept: 44.37%
- false reject: 19.62%

The results do not support declaring the translation pipeline research-ready or the fallback target achieved. Repeated generalizable patterns are incomplete cross-page/list paragraph reconstruction, figure/table/chrome contamination, and false rejects of coherent paragraphs. The next implementation phase must address these patterns generically, preserve the current 300-block baseline, and rerun the same manual labels for before/after comparison; paper-specific rules and hallucinated-term blacklists remain prohibited.

### 2026-09-20 v16 follow-up update

The same fresh v16 cohort remains the current baseline (36 papers / 432 stratified units; ordinary-body visible fallback 53/175 = 30.3%). Manual review is now 134/194 accepted outputs, with 52 severity>=2 (38.8% of this risk/section-stratified review subset; not a population estimate); 60 accepted rows remain. Five fallback rows were replayed through the current source server to recover current reasons and raw model output. A local CAT-Translate-1.4B pilot stopped after 7 of 9 purposive rows because it reproduced semantic drift and took 614 seconds; it is excluded as a current cascade candidate. No production change was made from these diagnostic-only results. Exact artifacts and next actions are in [CURRENT_STATE.md](./CURRENT_STATE.md) and `test-data/real-papers/audit-progress.json`.

### 2026-09-20 v16 accepted-output manual review completion

All 194 outputs that the production gate would accept in the completed v16 cohort were manually compared with their source. The cohort sampled 432 blocks from 36 cached OA papers; its section-stratified design deliberately includes higher-risk structures, so the **87/194 (44.8%) severity ≥2 unsafe-accept rate is descriptive of these sampled accepted rows, not an unbiased estimate of all reader traffic or full papers**. None of the 238 visible fallback rows has yet been manually reviewed for false rejects.

The ordinary-body visible fallback rate remains **53/175 (30.3%)**, far above the 5% product target. Across all sampled blocks there were 154 pre-model fallbacks and 84 post-model fallbacks (238/432 visible fallbacks). Do not reduce this by broad gate relaxation: accepted outputs still contain severe semantic errors.

Among accepted rows with severity ≥2, primary attribution was MADLAD decode 57/87, paragraph reconstruction 17/87, PDF extraction 6/87, line grouping 3/87, reading order 2/87, terminology/glossary 1/87, and postprocess 1/87. Labels across all 194 accepted rows: hallucination 10, omission 19, semantic shift 17, terminology error 11, source fragment 16, citation error 2, numeric error 2, table contamination 4, paragraph merge 2, chrome contamination 2, list flattening 1; the remaining 108 were minor wording or correct (87 and 21 respectively). The complete row-level labels, excerpts, causes, and notes are in `test-data/real-papers/reports/semantic-review-fresh-20260920-v16.json`; machine summary is `test-data/real-papers/reports/translation-audit-fresh-20260920-v16-summary.json`.

Representative failures included a table/figure-layout scramble accepted as a sentence (psychology), “spurious significance” translated as “false meaning” (linguistics/statistics), an omitted online-ad recruitment procedure (marketing), the lost comparison “similarly or better” (cognitive psychology), and an extraction-corrupted BMJ methods block accepted despite being unusable (healthcare). The next work is fallback false-reject review and generic input/semantic-coverage diagnostics on held-out examples; no production gate was changed from this audit alone.

### 2026-09-20 generic scheduler false-fallback repair

Focused investigation of five panel-prefixed blocks found a scheduler rule that treated any short unit beginning with `(a)`/`(b)` as a standalone figure panel and bypassed translation for the entire caption/sentence. The rule now bypasses only standalone panel labels; prefixed caption text is translated while the label itself is protected and restored. Same-process MADLAD replay translated 4/5 selected source-echo cases; one social-advertising block still fell back due an unrelated phrase-repetition quality rejection. In a separate medical sample the new routing translated the caption but the model still changed 33.9°C to 23.9°C and mistranslated “participant” as “patient,” illustrating remaining model errors. Python tests: 121/121 passed. The 36-paper cohort has not yet been rerun, so no fallback-rate improvement is claimed. See `CURRENT_STATE.md` and the focused `source-echo-diagnosis-fresh-20260920-v16.json` artifact.

### 2026-09-20 v19 focused replay and false-accept findings

The panel-routing repair removed the known scheduler bypass, but replay showed that eliminating a fallback does not prove a safe translation. On 32 ordinary-body source-echo inputs, v17 returned 3 candidates; 29 remained quality/placeholder fallbacks. One of two candidates that passed the old client gate was manually unsafe: a source cut at `were used to perform` was completed as “used to perform this method” (severity 3, source fragment/addition). A second was semantically understandable with poor Japanese wording (severity 1). A generic unpunctuated terminal-infinitive check now keeps that first source fragment out of translation.

A v18 model replay of the neuroscience panel block preserved its unbracketed clustered citations after adding atomic citation recognition/restoration, but the translation dropped an explicit second disjunct (“or both another person and the decision maker”), omitted the following explanation clause, and misstated LPFC stimulation. Manual label: omission/semantic shift, severity 3. This output passed the previous automatic quality gate. A narrow relation invariant now rejects the `or both` omission rather than accepting it; its faithful and incomplete Japanese cases are covered by tests. This protects against this demonstrated error pattern but does not detect the separate explanation-clause omission, so semantic reliability remains unresolved.

Temperature source values are protected atomically (including Celsius/Fahrenheit pairs). On a real model replay, the decoder still created `233.9 °C` from protected `33.9 °C`; the client invariant suite verifies rejection of the changed and newly introduced measurements. This did not yet demonstrate lower fallback.

The v17 thermal-earring reader-path benchmark covered 12 blocks but only 2 ordinary-body blocks, 1 of which fell back; it cannot estimate the cohort rate. The 36-paper v16 baseline remains 53/175 ordinary-body visible fallbacks (30.3%), and 87/194 accepted outputs had severity >=2 in the completed manual review. v19 is not a quality-goal completion. Artifacts are referenced in `CURRENT_STATE.md`. Validation: Python124, quality74, typecheck, lint, diff check passed.

### Fresh v19 focused benchmark (2026-09-20)

Completed 4 papers × 12 section-stratified rows using a fresh translation server on isolated port 18798; report: `test-data/real-papers/reports/translation-audit-v19-focused.{json,md}`. Papers cover ACM/HCI, Springer/ergonomics, Nature/neuroscience, and arXiv/linguistics. Of 48 rows, 32 (66.7%) became reader-visible source fallback: 21 pre-model and 11 post-model. Ordinary-body prose was 5/17 fallback (29.4%); damaged extraction 17/19; lists 2/4; reference chrome 3/3; statistical prose 5/5. This is a small, deliberately stratified risk sample and not an overall use-rate estimate. It does not show a fallback improvement over the 30.3% v16 ordinary-body baseline. Most pre-model fallback came from incomplete/damaged extracted text; post-model failures included protected-token restoration and quality rejection. The dedicated server is stopped. Do not claim the 5% goal is met. Next: manually review v19 accepted rows and identify recoverable extraction/reconstruction cases before making any gates more permissive.

### v19 accepted translation review and v20 extreme-shortening check

All 16 non-fallback outputs from the focused v19 run were manually compared against source. **11/16 (68.75%)** had severity >=2, even though every row reported automatic quality score 1.0. This deliberately risk/section-stratified set is not a population rate. Severe issues included an invented webinar/website topic in place of wearable-aesthetics claims, omitted fever-detection details, `sham` rendered as simulation, `spurious significance` rendered as “false meaning,” prosody confused with phonology, and omission of the source’s warning that an alternative method is wrong. Row-level labels and concise evidence are in `test-data/real-papers/reports/semantic-review-v19-focused-accepted.json`.

The full v16 manually reviewed accepted set (194 rows) was used to evaluate a generic extreme-compression signal: source >=80 characters and Japanese output/source character ratio <0.20. It identified 2 rows, both severity >=3, with no severity 0–1 false positives in that reviewed cohort. Applied offline to the later v19 report, it flagged the short fever-detection list translation (112→18 characters) that the original v19 gate accepted. A concise faithful control is covered by a unit test. This adds a quality gate for this narrow severe-omission pattern and bumps the shared translation cache identity to v20; it is not evidence of lower ordinary-body fallback and does not address the fluent hallucinations or relation/terminology shifts listed above. Evaluation: `scripts/evaluate-extreme-compression-gate.ts`, `test-data/real-papers/reports/extreme-compression-gate-v20.json`.

A fresh v20 reader-path run on the same four papers/stable sampled keys completed all 48 units through a new isolated server on port 18806. Report: `test-data/real-papers/reports/translation-audit-v20-focused.{json,md}`. Visible fallback was 33/48 (68.75%; 21 pre-model, 12 post-model); ordinary-body fallback remained 5/17 (29.4%), unchanged from v19. Exactly one of the prior 16 accepts changed: the same 112→18 fever-detection omission now falls back as `long source was implausibly shortened`. The other 15 outputs were unchanged; their reused manual source comparisons show 10/15 severity >=2. Review subset is risk-stratified, not a population estimate: `test-data/real-papers/reports/semantic-review-v20-focused-accepted.json`. This validates the narrow severe-omission catch while showing no progress on the ordinary-body fallback target. The benchmark server exited after completion.

### Phase 2 checkpoint: expanded corpus and v25 fresh semantic review (2026-09-20)

The catalog now contains **52 papers, with 51 cached PDFs** (PDFs remain gitignored; catalog provenance is tracked). Fifteen official/author-hosted OA PDFs were added after verifying first-page title and DOI against the record. New disciplines/distributions are: cognitive psychology 7, marketing 9, ergonomics 8, linguistics 6, HCI 12, medicine 3, design research 2, machine learning 2, education 1, neuroscience 1, economics 1. The 50-paper floor is crossed; the desired 70–90-paper corpus and priority-field quotas remain incomplete. Publisher coverage includes ACM, IEEE, Springer Nature journals, arXiv, Frontiers, Nature, PMLR, Elsevier, KCI and others; Springer LNCS, APA-like, MDPI, J-STAGE and scanned/thesis/report coverage still need explicit verification/additions. A J-STAGE Japanese full-text candidate was rejected because it does not provide English body text for the en→ja translation audit.

The four newly added papers below were evaluated in a **fresh** 12-section-stratified-blocks-per-paper run against the already-ready user server (model `3b-mt-v5-semantic-v71-strict-restore-v20`): cognitive dual-task training, unavailable consumer choice, consumer co-production theory, and ergonomics flight-deck design. Run: `test-data/real-papers/reports/translation-audit-v25-new-4.json` and `.md`; ID `2026-09-20T10-25-31-588Z`. The run completed **48/48**: **27 visible fallbacks** (22 before model submission, 5 after) and 21 accepted outputs. Manual review compared every accepted output to its source. **12/21 accepted outputs (57.1%)** had severity >=2; among ordinary-body accepted outputs it was **8/16 (50%)**. These are purposive, four-paper descriptive samples, not estimates of population prevalence. Automatic translation quality scores were 1.0 on all but two accepted units, including examples with material hallucination.

Failure labels among the 21 accepted outputs: source fragment 6, correct 2, omission 1, chrome contamination 1, minor wording 7, hallucination 2, terminology error 1, table contamination 1. Severity>=2 primary attribution: paragraph reconstruction 5, PDF extraction 3, MADLAD decode 4. Concrete high-severity examples:

- A source unit ended with “The first dimension describes the”; the accepted Japanese invented a one-dimensional-space/first-order spatial position explanation (hallucination, severity 4, primary MADLAD decode, enabled by incomplete extraction).
- A decision-journey paragraph acquired an ungrounded sentence equivalent to “these results agreed well with experimental results” and lost a table cue (hallucination, severity 4, primary MADLAD decode).
- An incomplete Results unit had residual placeholder noise and a malformed cognitive-function/BDNF relation (source fragment, severity 3, extraction + decode).
- Multiple other partial abstract/method units ended mid-sentence but still passed as complete Japanese paragraphs (source fragment, severity 2–3, reconstruction/extraction).

Detailed concise excerpts and row-level labels: `test-data/real-papers/reports/semantic-review-v25-new-4.json` (ignored audit artifact). No production algorithm change was made during this evaluation, so no before/after improvement is claimed. The result reinforces that accepted-output semantic reliability and extraction completeness are both inadequate for unverified research use. Continue corpus expansion and manual review; do not lower gates merely to reduce fallback. The <=5% ordinary-body fallback target remains unmet, and fallback reduction must be paired with semantic false-accept and false-reject measurement.

### 2026-09-20 held-out extraction repair and v26 spot evaluation

The user confirmed `/health` reports `status=ok`, `model_loaded=true`, `phase=ready`. A generic geometry diagnostic isolated a two-column reconstruction defect in the Springer marketing paper `marketing-consumer-production-journey`, page 3. Before repair, the left-column paragraph ended **“The first dimension describes the”**, and the top-right continuation began **“extent to which consumers are active…”**. The first merge pass could join them, but a second mixed-column pass split the paragraph again. The repair now preserves only geometry-validated bottom-left → top-right paragraph joins through the second pass. A syntax-based source-unit gate also catches unpunctuated paragraph tails ending in a coordinator, subordinator, determiner or dangling comma/semicolon, with valid complete-prose controls.

After repair, extraction contains the complete 3,080-character page-3 paragraph as one block. The same server/model translated it in one request (712 input tokens, 943 output tokens, 54.3 seconds). In v25, the truncated source was accepted with the fabricated claim that “dimension 1 represents a spatial position in one-dimensional space.” In the v26 repaired source, that hallucination did not recur: the first dimension is described as consumer co-production level, followed by examples and the second dimension. Exact source/output: `test-data/real-papers/reports/translation-unit-v26-marketing.json`.

A fresh, single-paper v26 reader-path sample evaluated 12 section-stratified blocks: 9 accepted, 3 reader-visible fallbacks. All 9 accepted outputs were manually compared. Five were labeled severity >=2 (unsafe false accept **5/9 = 55.6%**); this purposive one-paper sample is descriptive only. Examples include an unrelated “experimental results” sentence inserted into the consumer-journey step list, a malformed definition contrast, and a table-like block containing separate advertising findings. Report and row-level review: `test-data/real-papers/reports/translation-audit-v26-marketing-stitch.json` and `semantic-review-v26-marketing-stitch.json`. This shows the target fragment fix removes one demonstrated hallucination while broader semantic false accepts remain severe. Ordinary-body fallback in this small sample was **3/12 = 25%**, far above the <=5% target; do not generalize from this one paper.

Verification after changes: reading-order + cached real-paper baseline + quality tests **138/138 passed**; typecheck, lint, production frontend build, and `git diff --check` passed. The focused 3,080-character request took 54.3 seconds; this single request is not a throughput benchmark, so comparative latency impact is unresolved. The app-level fallback-rate effect of the syntax guard also needs a broader fresh benchmark. `CURRENT_STATE.md` and `test-data/real-papers/audit-progress.json` carry the continuation checkpoint. Next: test the column-wrap repair across held-out cached formats, audit fallback rows for false rejects, and expand manual review/corpus coverage. Neither extraction nor translation quality goals are complete.

### 2026-09-20 held-out extraction regression checkpoint

The broader extraction-corpus suite initially exposed three regressions after the held-out paragraph-stitch work. Investigation distinguished one valid page-bottom column wrap in the PPG Earring paper from actual cross-column contamination; the test now permits only flagged bottom-left → top-right geometry. The HCI teaching paper's incomplete paragraph continues on page 3 below figure captions; extraction now skips only an opposite-column caption, a footnote below the source tail, a repeated page header, or page-local captions physically above the continuation, while retaining the incomplete-sentence and page-boundary checks. The Frontiers healthy-food paper's title ended in a separate “choice” line because left-margin masthead content interleaved in y-sorted line formation; a short same-font, same-x title line is recovered from its mixed block, with unrelated affiliation lines retained.

Verification: selected extraction corpus + cached real-paper baseline + reading-order/quality tests **107/107 passed**; typecheck, lint, and diff check passed. No production app build or fresh model benchmark was run in this checkpoint. The shared server health provided by the user is ready. Next action is a fresh 12-row target-paper benchmark followed by complete manual review of accepted and fallback rows; report both semantic quality and fallback behavior, not just model output success.


### 2026-09-21 v59 paired alternative-model replay

Gemma 2 9B was replayed on the same 18 source rows as the v56 MADLAD extraction run, with exact source/key matching against the earlier v54 Gemma generation. All 18 generated; after a general citation-format equivalence fix, the shared gate accepts 18/18. The fix addresses source superscript references `15/16/17` rendered as `[15]/[16]/[17]`; exact citation number changes remain rejected. It changes only the invariant comparator.

Manual review found one source-category error (a figure caption counted as ordinary prose), leaving 17 clean paragraphs. At least 3/17 accepted translations show a severity>=2 technical/construct shift: “linear probing” became linear search, social “peers” became coworkers, and a consumer-production “journey” was literalized as travel. Gemma's visible fallback is 0/17 after correcting the citation false reject, versus MADLAD's 4/17 (23.5%) on the matched rows, but Gemma is not safe for automatic routing because its semantic false accepts remain. This small, previously sampled development set is not a held-out or population estimate. Raw generations: ignored `test-data/real-papers/reports/gemma-v56-current-runtime-replay.json`; setup and review: `TRANSLATION_MODEL_EVAL_V52.md` v58.

No model route changed. Next: test general terminology support on held-out sources, manually review all candidate accepts, and diagnose the remaining MADLAD scope paragraph fallback. Both the <=5% ordinary-body fallback goal and near-zero unsafe-accept goal remain unmet.

### v64–v69 continuation: held-out translation review and medical extraction attribution (2026-09-21)

A four-paper, 24-block held-out reader-path run manually reviewed all seven accepted outputs. Two accepts had severity ≥2; one medical block had a severity-3 semantic hallucination (wrong neural-network term and unsupported summary), while a neuroscience consent block omitted the right to withdraw. A six-row local Qwen 2.5 14B targeted replay repaired several known cases, but its purposive sample and lack of the production protection pipeline are not enough to justify routing. Reports and limitations are recorded in `CURRENT_STATE.md` and the ignored v64/v65 JSON artifacts.

A native-geometry trace found the medical page-9 extraction problem: its previous gutter x=277.6 cut words from the left column despite native PDF spans placing them there. A temporary generic line-end gutter estimate restored those source words, and a fresh translation still showed the same MADLAD semantic drift, separating extraction and decoder causes. The experiment did not resolve the existing PPG Earring regression (extraction corpus 106/107), so the gutter code and test were reverted. The PPG case remains open; extraction stability is not claimed. The current 4.57.6 server is ready and verified; model pin/runtime work is complete, semantic quality work remains active.

### v70–v71 local candidate model checks (2026-09-21)

The first production-controls Qwen 2.5 14B replay (v70, 12 ordinary-body rows from the v64 four-paper set) was **not independent held-out evidence**: those papers/sources appeared in earlier Qwen candidate-selection work. Manual review gave 8/12 candidate accepts vs 6/12 MADLAD accepts, but 4/8 Qwen accepts were severity ≥2; two of three nominal MADLAD-fallback rescues were unsafe. Treat v70 as a pipeline diagnostic only.

For v71, an exact-source SHA-256 leakage guard was added. It passed on four new OA papers spanning computational linguistics, healthcare ergonomics, cognitive psychology and marketing. The matched fresh MADLAD run sampled 24 blocks, only 8 ordinary-body rows; MADLAD fallback was 3/8. Qwen processed the same 8 rows with the production segmenter, scientific-token protection, strict restore and app gate: 6 accepted, 2 source fallbacks from Chinese/Cyrillic contamination. Manual source review found 2/6 candidate accepts severity ≥2 (one omission, one BDNF terminology error), while Qwen faithfully recovered one of the three MADLAD-fallback rows. Candidate fallback therefore moved 37.5%→25.0% in this tiny sample, but unsafe false accepts remain incompatible with production routing. This does not establish the target fallback rate or near-zero unsafe error. See `CURRENT_STATE.md` and the ignored v71 baseline/candidate/manual-review JSON artifacts for row-level evidence.

### v72 source-structure attribution: radial figure-label interleaving

Manual review of the held-out candidate set found three Qwen false accepts whose source paragraphs were already invalid. On page 3 of *A Comparative Analysis of Industry Human-AI Interaction Guidelines*, native PDF text spans from the radial Figure 2 diagram retained separate strings and rotations, but extraction grouped them by nearby y into paragraphs such as “Learn from corrections ... Imagine potential pitfalls ... Background errors ... Assume subversive use.” This is primary PDF line/block reconstruction failure, not evidence of a bad ordinary prose translation. Generic line grouping now keeps incompatible rotations separate and blocks nearby rotated text spans that overlap along their text direction from merging into one paragraph. The HCI real-paper regression asserts that representative labels remain separate. Reading-order unit tests 68/68, real-paper checks 52/52; extraction corpus 106/107 with only the pre-existing PPG captionless-grid continuation unresolved. The visual ordering of radial labels and the PPG table continuation remain open.

The v72 Qwen cohort contained 14 ordinary-body rows and four OA papers. Qwen accepted 11, with five severity >=2 outputs; MADLAD fell back on 4/14 and Qwen on 3/14. Across v71-v72 (22 rows), the matched fallback rates were MADLAD 31.8% and Qwen 22.7%, while Qwen severity>=2 false accepts were 7/17 (41.2%). These purposive small samples do not support production routing or population-wide rate claims. Continue fresh source-hash-guarded sampling and full semantic review.


### 2026-09-21 v73 held-out candidate review and loader status

The MADLAD 3B runtime concern was resolved before this comparison: checkout `main` is at `ebb2196`; lockfile and active project `.venv` both use Transformers 4.57.6. The fixed-fixture comparison in `TRANSFORMERS_MADLAD_AB.md` confirms an unpatched 5.17.0 load maps encoder inputs to the distinct `lm_head.weight`, while 4.57.6 maps correctly. This loader defect causes malformed output; correctly loaded MADLAD still has separate semantic scope/terminology failures. The current server is ready on 4.57.6/v74; no version change was made here.

Completed manual source/output review of the Qwen 2.5 14B candidate set: 38 exact-source-hash-guarded rows from 10 papers, spanning HCI (18), machine learning (2), cognitive psychology (4), linguistics (2), marketing (5), and ergonomics (7). Qwen gate accepted 32/38 (84.2%), candidate fallback 6/38 (15.8%); matched MADLAD fell back on 9/38 (23.7%). However, 12/32 accepted Qwen outputs had severity >=2 (37.5% unsafe false accept). It recovered 6/9 MADLAD fallbacks, with 2/6 unsafe rescues. Latency averaged 17.61 s/row (descriptive). Therefore the lower fallback rate does not support Qwen routing.

Manual review found extraction/source-category failures mixed into the ordinary-prose sample: two source fragments were accepted (one page-1 block ending “Thus, the direct” and one lowercase “after separating…” parenthetical), and a numeric plot/table grid was categorized ordinary. Other severe false accepts include reversed marketing condition labels, prosody/phonetics terminology errors, the SE-Net excitation operation, injected translator notes, and a central consumer co-production construct drift. Strict restore safely rejected dropped Fig.2/Fig.3/IBPT placeholders. Full row notes and counts: ignored `test-data/real-papers/reports/semantic-review-v73-qwen14-paper-heldout.json`; exact inputs/outputs: ignored `model-compare-v73-qwen14-paper-heldout.json`; matched source baseline: `translation-audit-v73-qwen-paper-heldout.json`. One duplicate source key was intentionally excluded, leaving 38 candidate rows from the 39-row automatic ordinary-prose set.

No model switch or production gate change. Continue on verified Transformers 4.57.6, first improving generic paragraph/source-integrity and table categorization, then test any candidate routing only on newly held-out reviewed sources. Fallback <=5% and near-zero severity>=2 unsafe accepts are still unmet.


## v75 corrected-source replay and Transformers runtime verification (2026-09-21)

- Fresh checkout/runtime check: branch `main`, HEAD `ebb219669e196a0285ef825cc4dadb47a1ec1580`; `translation-server/requirements.lock`, active `translation-server/.venv`, and live `/status` all report Transformers 4.57.6. The server is ready on MPS with MADLAD v74. Lockfile, venv, and loaded listener agree; no production pin change was needed this turn.
- A/B evidence remains decisive: unpatched Transformers 5.17.0 loads this checkpoint's encoder embedding from `lm_head.weight` (exact tensor equality); unpatched 4.57.6 loads encoder and decoder from the checkpoint's decoder input embedding. Fixed fixtures show severe corruption in raw 5.17.0 and residual semantic drift under both valid loads. Details and tensor mappings are in `TRANSFORMERS_MADLAD_AB.md`.
- Corrected generic geometry grouping for PDFs where a narrow publication rail and body line share a baseline but body text is emitted as narrow native spans. Affiliation continuation now also requires a matching x band. The Frontiers real-paper regression verifies the complete abstract clauses (`memory encoding … motor-response cues`, `Thus, the direct link …`, and the ending sentence) are present together, while `This article was submitted to Cognition` stays out of body text. Reading-order tests: 69/69; cached real papers: 52/52; typecheck and lint pass.
- Replayed the complete 2,103-character abstract through the active production endpoint after extraction repair: 531 input tokens, 719 output tokens, 33.4 s. The current quality gate accepts the output. Manual review found a severity-3 hallucination/omission: the source says participants performed a surprise recognition-memory test; the Japanese instead asserts that memory quantity for image recognition was high and adds further incoherent claims. This is a semantic false accept after valid 4.57.6 loading, not evidence of the 5.x tensor bug. The prior v73 row used damaged source and is explicitly superseded.
- Audit sampling now admits ordinary paragraphs through 3,200 characters (the prior 1,800-character ceiling omitted this repaired abstract), and `--block-query` supports a reproducible targeted replay. A single `N = 142` sample-size token no longer removes an otherwise ordinary abstract from the ordinary-body denominator; statistical-results categorization requires actual test/estimate evidence.
- Fresh single-row report: `test-data/real-papers/reports/translation-audit-v75-frontiers-source-repaired.json`; manual review: `test-data/real-papers/reports/semantic-review-v75-frontiers-source-repaired.json`. In this purposive one-row check, visible fallback is 0/1 but unsafe false accept is 1/1. Do not generalize from it. Progress and next actions are in `test-data/real-papers/audit-progress.json`.
- Full extraction-corpus run: 106/107 passed; the sole failure remains the known PPG Earring captionless-grid continuation. Vitest also reports its existing worker `onTaskUpdate` timeout. Real-paper and unit reading-order suites pass independently. No `.app` build or production model change was made.
- Next: keep verified 4.57.6 as baseline, manually review wider source-hash-held-out ordinary prose, compare candidate models on identical repaired source, investigate semantic relation/addition false accepts, and repair the PPG grid case without reducing paragraph/table precision. The <=5% ordinary-body fallback and near-zero unsafe false-accept goals remain unmet.
## 2026-09-21 — v3 epistemic guard and selective alternate-unit diagnostics

The confirmed Transformers 5.17.0 MADLAD 3B loading defect remains separate from semantic drift under the correctly loaded 4.57.6 runtime (see `TRANSFORMERS_MADLAD_AB.md`). A newly identified cognitive-psychology false accept rendered “smaller effects might not have been detected” as a definite negative. The client/server quality identity is now `quality-v3`; a sentence-aligned epistemic uncertainty guard rejects this case while preserving definite-negative controls and faithful modal Japanese. The initial retrospective quality recheck was contaminated by incomplete source/output excerpts ending in ellipses. The rechecker now excludes all such rows. Corrected set: 52 complete ordinary-body rows; historical visible fallback 8/52, current-policy fallback 10/52 (19.2%). The newly detected modal false accept is severity 2. This remains purposive retrospective evidence, not a fresh/population estimate. Corrected decision report: `test-data/real-papers/reports/manual-reviews-quality-v3-recheck-input-quality-recheck.json` (audit-quality-recheck-v2).

Qwen2.5-14B audit-only comparisons: individual protected units for the cognitive modal and marketing negated comparison retained the required meaning and passed the current gate (two units; `translation-audit-v88-qwen-selective-units.json`). Four comparison syntax controls also preserved the groups/statistics (`v87`). Whole-paragraph Qwen output on the VR block introduced/omitted claims and had mixed-script contamination, so paragraph-wide fallback is unsafe (`v86`). No production cascade was added. These tiny, purposive examples justify broader controlled unit-level testing only; they do not establish a candidate-model win or lower fallback rate.

Validation: Vitest 441/441, Python 144 tests, typecheck, lint, and `git diff --check` passed. Restart confirmed local PID 40882 at quality-v3. Live raw-server smoke reproduced MADLAD's definite translation, while the v3 app gate rejects it for lost uncertainty; record: `test-data/real-papers/reports/translation-audit-v89-quality-v3-live-smoke.json`. This means the guard prevents this accepted false positive in the client, but does not repair model generation. Ordinary-body fallback and unsafe semantic error targets remain unmet.


## 2026-09-21 measurement correction — incomplete excerpt exclusion

Inspection of the v3 retrospective recheck found that 11 inputs ended in an editorial ellipsis, including snippets where the omitted continuation contained citations/years absent from the abbreviated source. The v1 recheck therefore produced spurious “unexpected invariant” decisions and overstated its ordinary-body denominator. `scripts/recheck-audit-translation-quality.ts` now marks and excludes trailing-ellipsis excerpts from decision/rate calculations while reporting them explicitly. Corrected complete-row result: 52 ordinary-body rows, 8 historical visible fallbacks, 10 current-policy fallbacks (19.2%). The separate policy change for the cognitive VR modal false accept remains evidenced by the full source and targeted tests. Do not interpret this retrospective sample as representative.


## 2026-09-21 v4 mixed-language contamination guard and five-field review

- Fresh MADLAD reader-path sample: five cached papers across neuroscience, medicine, HCI, computational linguistics, and marketing; 40 stratified blocks. Among 16 ordinary-body rows, 6/16 fell back (37.5%). All 10 accepted ordinary-body translations were manually compared with full source: 7 had severity >=2, including 6 translation-caused errors and one extraction-contaminated source. The fallback target remains unmet; this small purposive sample is not a population estimate. Full labels: `test-data/real-papers/reports/semantic-review-v90-five-field.json`.
- Six exact-source-hash-new Qwen 2.5 14B diagnostic rows had 4/6 gate accepts under v3, of which 2 were severity-4 outputs containing translator notes and Chinese prose. Added a general foreign-prose check for long Han-only spans and unlocalized English sentences; bumped client/server translation cache identity to quality-v4. Rechecking the paired Qwen rows rejects both contaminated outputs (2/6 accepted); the matched MADLAD cohort remains at 6/16 ordinary-body fallbacks. No alternate-model production route was added. Review: `test-data/real-papers/reports/semantic-review-v90-qwen14-unseen-sourcehashes.json`.
- A separately reviewed statistical-prose accept loses citation 14 from `12–14` while retaining the surrounding numbers. It is a severity-2 citation false accept and remains unresolved for a generic citation-range invariant.
- Restarted the local server as PID 43693 with model version `3b-mt-v6-transformers-4.57.6-semantic-v74-source-protect-v9-strict-restore-v25-quality-v4`; `/status` reports ready on MPS. Tensor integrity verified on load (`encoder==decoder`, input embedding differs from lm_head). Live ordinary-prose smoke returned Japanese without fallback.
- Validation after v4: Vitest 65 files / 444 tests, Python unittest 144 tests, typecheck, lint, and `git diff --check` pass. No `.app` build was run.
- Next: measure v4 false rejects on clean multilingual/technical outputs; repair citation-range preservation and epistemic-strength drift with paired source-complete examples; continue ordinary-body extraction and semantic review. Keep the <=5% fallback and near-zero severity>=2 false-accept goals open.


## 2026-09-21 — v5 relation guard and v91 deduplicated held-out evaluation

- Added a source-conditioned check for the generic structure `technical identifier X over directional target Y` when Japanese output reverses the identifiers around comparative `より`. It catches the observed spatial-target-to-comparison drift without rejecting the faithful control. Added a cache-identity bump to `quality-v5`; segmenter/source protection remain v74/v11.
- Added source-side protection and invariant recognition for unbracketed superscript citation clusters with a terminal numeric range such as `decisions3,6,9,12–14`. If MADLAD drops the protected cluster, restore the exact source span at sentence end. Placeholder normalization now repairs a uniquely indexed repeated-Z confusable prefix, which previously leaked into identifiers as `ZtDCS`.
- v91 ran 5 selected OA papers / 40 section-stratified blocks at v5. Audit against prior local report JSON found **24/40 duplicate rows** by stable key or exact trimmed-source hash. Excluded them from fresh metrics; the deduplicated cohort is 16 rows across 4 disciplines (the selected cognitive-psychology paper contributed 0 unique rows). Of 7 unique ordinary-body rows, 2 fell back (28.6%); all 5 accepted ordinary-body rows were manually reviewed and all five were severity >=2 (100% unsafe false accepts). Failure types: 3 terminology errors, 1 omission, 1 hallucination. This is a small purposive set, not a population estimate, but it shows the product goal remains far away. Full review: `test-data/real-papers/reports/semantic-review-v91-quality-v5-unique-five-field.json`.
- Representative novel failure: an HCI paragraph about wearable objects became a paragraph about web applications; a technical “establishing operation” in a consumer-behavior experiment became literal “確立作業”; an appraisal-linguistics paragraph translated “co-text” as “共通テキスト”. These are model semantic/terminology failures accepted with routine automatic scores.
- Validation after v5/source-protect-v11: Vitest 65 files / 446 tests, Python 146 tests, typecheck, lint, and diff check passed. Local server PID 46951 is ready on MPS with `3b-mt-v6-transformers-4.57.6-semantic-v74-source-protect-v11-strict-restore-v25-quality-v5`; no `.app` build.
- Next: evaluate another model only on exact-source-hash-new units from a separate holdout, then compare its manually reviewed outputs with the five unique v91 MADLAD rows without using either set for rule tuning. Continue separating extraction fallbacks (9/16 unique) from ordinary translation; fallback <=5% and near-zero semantic false accepts remain unmet.


## 2026-09-21 Transformers integrity confirmation and v92 Qwen 7B pilot

The request's initial assumption that the current lockfile still pins Transformers 5.17.0 no longer matches this checkout. `main` and remote `main` are both `ebb219669e196a0285ef825cc4dadb47a1ec1580`; current `requirements.lock`, project `.venv`, and the live 8765 server use 4.57.6. The tensor mapping and five-fixture A/B already documented in `TRANSFORMERS_MADLAD_AB.md` confirm that unpatched 5.17.0 corrupts MADLAD 3B's encoder embedding, while 4.57.6 loads the checkpoint's decoder input embedding correctly. Current v5 serving is healthy; no production change was needed.

Candidate-model continuation used Qwen 2.5 7B, with production semantic segmentation and scientific protection held constant, on the only two v91 ordinary-body rows that were both source-hash-new and not previously evaluated by Qwen 7B. Matched MADLAD had post-model fallback on both. Qwen passed the current quality gate on one; manual review found that accepted output changed the Appraisal-linguistics construct “attitudinal” to “意図的な態度” (severity 2, unsafe false accept 1/1 accepted). The other Qwen output was rejected for untranslated citation prose and a leaked `CIT1ZZ` suffix; this fallback is safer than showing the malformed translation. The apparent 1/2 reduction against two MADLAD fallbacks cannot justify candidate routing, especially at N=2. Full reports: `model-compare-v92-qwen7-v5-unique-ordinary.json` and `semantic-review-v92-qwen7-unique-ordinary.json` under ignored `test-data/real-papers/reports/`.

No quality-gate rule was tuned on these rows. Next, obtain a fresh multi-discipline cohort for the 7B candidate and test the observed overlapping/duplicated placeholder residue with generic positive and negative restoration cases. Keep Transformers 4.57.6/MADLAD 3B as the verified baseline. Ordinary-body fallback <=5% and near-zero severity>=2 false accepts remain unmet.

### v93 — HCI candidate comparison and interrupted baseline run

The benchmark's unsupported `--help` flag entered its default 52-paper reader-path run. It was stopped after the first paper, leaving eight HCI blocks; the versioned partial report is `translation-audit-v93-v5-interrupted-first-paper.{json,md}`. Six rows duplicate earlier stable keys or exact source text; two ordinary-body rows are new and both matched MADLAD 4.57.6 outputs pass the v5 gate. Their manual baseline comparison found no severity-2+ problem.

Qwen 2.5 7B replayed the same two source-hash-new HCI blocks with the production segmenter and citation protection. Both outputs passed the automatic gate, but one replaced the source's broken bottle-neck material with a ruler/triangle emoji (severity 3). This is a direct model false accept; MADLAD's matched translation retained the described material. Combined with the two linguistics rows from v92, Qwen accepted 3/4 rows and 2/3 accepted translations had severity >=2. It safely rescued 0/2 MADLAD fallbacks. Details: `model-compare-v93-qwen7-v5-hci-fresh-two.json` and `semantic-review-v93-qwen7-v5-hci-new-sources.json`.

No production route or quality rule changed. The interrupted run is explicitly incomplete and must not be counted as a 52-paper audit. No benchmark remains active. Continue with named paper IDs, a unique report name, and source-hash deduplication; ordinary-body fallback <=5% and near-zero severe false accepts remain unmet.


## 2026-09-21 quality-v8 targeted fallback replay

The v94 replay exposed a false rejection in the phrase repetition guard: a linguistics sentence containing frequent ordinary kanji such as `的` was rejected despite readable output. Phrase repetition now requires repeated 3–5-character spans, while existing character-loop and phrase-loop checks remain. A paired replay showed that merely relaxing this guard could accept an omission of “as they are not confined to individual words.” A short-unit guard now treats explicit explanatory negative clauses as material qualifications; its stronger length floor is limited to short units and does not apply to full paragraphs.

On identical MADLAD 3B / Transformers 4.57.6 / deterministic rescue conditions, the v5 path fell back to English and v8 produced Japanese retaining the non-confinement claim and both citations. The targeted artifact is `test-data/real-papers/reports/translation-audit-v99-quality-v8-repeat-and-omission-guard-replay.json`; v96 and v97 preserve intermediate diagnostic outcomes, including an unsafe v6 acceptance identified before finalizing the change. Tensor integrity was verified on each fresh server startup; diagnostic server 8876 was shut down, and user server 8765 remained ready.

This single replay is evidence for one fixed fallback, not evidence that general fallback or unsafe false-accept rates improved. Quality cache identity is now `quality-v8`. Python tests pass 148/148; Vitest passes 446/446, with typecheck, lint, and diff check passing. The other known linguistics fallback (`b-28ef7a38`) and a broader held-out cohort remain pending. The active 8765 process and existing `.app` still use their previous model version until restarted/rebuilt; no `.app` build was performed.


## 2026-09-21 quality-v9 and fresh four-paper evaluation

Quality-v8 reduced one known paper’s spurious gate rejections, but a fresh replay of the other v91 case showed two further false rejects: ordinary Japanese phrase repetition in unit 0, and an author-year reference restored verbatim but treated as untranslated prose in unit 9. Quality-v9 strengthens the repeated-phrase signal and removes the exact protected spans before source-overlap checks. Unit 7 remains rejected because the translation omits the point that relying on explicit appraisal does not take the analysis very far. The full paper still displays its English source; the unit-level false rejects are removed, but visible fallback did not decrease. Artifacts: `translation-audit-v100-quality-v9-second-fallback-replay.json` (v8) and `translation-audit-v101-quality-v9-second-fallback-replay.json` (v9).

A fresh v9 reader-path run sampled 12 blocks each from four cached papers: `ergonomics-job-rotation-robotics`, `linguistics-register-web-corpus`, `cognitive-memory-cue-interest`, and `marketing-health-goals-nudging`. Of 48 selected rows, 14 duplicated stable keys or whitespace-normalized source hashes in prior local audit reports, leaving 34 unique rows. The unique rows comprise 8 ordinary-body, 5 statistical-prose, 12 damaged-extraction, 8 table-contamination, and 1 caption. Stage counts are 19 pre-model fallbacks, 7 post-model fallbacks, and 8 accepted. This selection contains substantial extraction/table hazard oversampling and is only descriptive.

Every unique accepted output was manually source-compared (8/8). Five had severity >=2; this is 62.5% among accepted unique outputs and 4/6 (66.7%) among ordinary-body accepts. Ordinary-body visible fallback was 2/8 (25%). Discipline-specific ordinary-body rows: ergonomics 1/1 fallback; linguistics 0/3 fallback and 3/3 accepted with severity >=2; cognitive psychology 0/2 fallback and 1/2 severe; marketing 1/2 fallback and 0/1 severe among accepts. The small denominators prohibit field-level rate claims. Automatic scores were 1.0 on the severe accepted rows. Reviewed examples: “register” became “文字列”; participants were said to describe film-clip content instead of rating interest; “lexical” was dropped from a lexical-and-grammatical analysis; section citations lost clause attachment; and a statistical paragraph lost p-value-to-variable mapping and the successful-randomization conclusion. Reviews and short excerpts: `semantic-review-v102-quality-v9-low-sampled-four.json`; raw report: `translation-audit-v102-quality-v9-low-sampled-four.{json,md}`.

The v102 cohort stays held out and must not be used for rule tuning. The coherent scale-measurement sentence auto-classified as damaged extraction is a false-positive source-risk classification, not a translation failure. Translation-server tests pass 149/149; Vitest 446/446, typecheck, lint, and diff check pass. Only port 8765 remains active, still on v5; the v9 source is not live in that process or rebuilt into `.app`. Next use separate development papers to study terminology fidelity, experimental design relation preservation, and statistic-variable alignment, while manually accounting for false rejects. The <=5% ordinary fallback and near-zero severe false-accept targets remain unmet.

## v103 — v9 four-paper cohort expanded to 24 blocks per paper (2026-09-21)

The cached-only reader-path run completed on the same purposive four-paper holdout group as v102: ergonomics, linguistics, cognitive psychology and marketing, 24 stratified blocks per paper (96 selected total). This is a continuation, not a second independent cohort. Stable-key or whitespace-normalized source-hash comparison against prior local audit reports removed 47 duplicate rows, leaving 49 unique blocks: ordinary prose 23, damaged extraction 11, statistical prose 7, table contamination 5, lists 2, reference/chrome 1. Production decisions were pre-model fallback 21, post-model fallback 9, accepted 19. Every unique accepted output was manually compared with its source.

For ordinary prose, 7/23 fell back (30.4%); 9/16 accepted outputs had severity >=2 (56.2% unsafe false accepts). Across all accepted categories, 12/19 were severity >=2 (63.2%). Severity distribution among accepts: severity 1=7, 2=7, 3=5. Among severity>=2 cases, primary attribution was MADLAD decode 9, paragraph reconstruction 2, and PDF extraction 1. These are sample descriptions, not general-population estimates.

Field sample counts among ordinary prose: ergonomics 3 (0 fallback; 2/3 accepts severity>=2), linguistics 6 (1 fallback; 4/5 accepted severity>=2), cognitive psychology 7 (4 fallback; 2/3 accepted severity>=2), marketing 7 (2 fallback; 1/5 accepted severity>=2). Small purposive denominators prevent field-level quality claims.

The review found source-integrity false negatives as well as semantic drift: one ergonomics source ending “thus enabling different” was tagged clean and the translation invented a completion; another accepted source contained replacement glyphs instead of a formula. Long linguistics blocks also ended mid-sentence. Translation errors included loss of an experimental gist-vs-detail comparison, omitted method/stability details, construct terminology drift, and ambiguity around a control measure. The automatic quality score did not detect these meaning changes.

Artifacts: benchmark `test-data/real-papers/reports/translation-audit-v103-quality-v9-low-sampled-four-24.{json,md}` and complete accepted-row review `test-data/real-papers/reports/semantic-review-v103-quality-v9-low-sampled-four-24.json` (generated reports may be ignored by Git). No algorithm was tuned on v103. Isolated port 8876 was shut down; port 8765 was left ready and unchanged. No `.app` build. Ordinary-body fallback <=5% and near-zero severe false accepts remain unmet. Next development work should use a separate corpus to improve source completeness and test comparison/method relation preservation with clean negative controls.


## v104 checkpoint — source-integrity guard and alternative-model stop point (2026-09-21)

- Added a generic source-integrity eligibility check: a PDF extraction replacement character (`U+FFFD`) now blocks paragraph translation, preventing MADLAD from inventing text where extracted characters are missing. It retains eligibility for valid academic symbols such as `μ`, `χ²`, and p-values. Updated the client translation cache identity from `quality-v5` to `quality-v6`. This is a narrow corruption guard, not a claim that fallback targets improved.
- Regression test verifies U+FFFD is rejected while valid scientific Unicode remains eligible. Focused tests: 112/112; full Vitest: 65 files / 447 tests; `npm run typecheck`, `npm run lint`, and `npm run build` passed. No `.app` build. Earlier dirty v9 server work was not changed in this checkpoint.
- Fresh, cached-only v104 reader-path sample ran on four papers (HCI, cognitive psychology, ergonomics, marketing), 24 blocks each. Of 96 selected rows, exact stable-key/source-hash dedup removed 46, leaving 50 unique rows: 21 ordinary prose, 20 damaged extraction, 3 captions, 3 statistical prose, 2 lists, and 1 reference/chrome. Stages: 22 pre-model fallback, 12 post-model fallback, 16 accepted. All 16 accepted translations were manually compared. Ordinary prose fallback was 6/21 (28.6%); 6/15 accepted ordinary translations had severity >=2 (40%). Across accepted types, 7/16 were severity >=2 (43.8%). This is purposively sampled and descriptive only. Full review: `test-data/real-papers/reports/semantic-review-v104-quality-v9-fresh-four.json`; baseline: `translation-audit-v104-quality-v9-fresh-four.json`.
- An audit-only candidate runner compared two locally cached Helsinki OPUS English→Japanese models on the six unique ordinary-body post-model fallbacks, with the same production segmenter/protection and current client gate. `opus-mt-en-jap` was auto-accepted 1/6; its accepted output was unrelated gibberish. `opus-tatoeba-en-ja` was auto-accepted 2/6; both accepted outputs were unsafe: it omitted “Act immediately” in one guideline and turned “participant” into “評論家” while heavily corrupting a long interview paragraph in another. The latter candidate also reversed a between-group comparison in a separate sanity fixture. Do not route either model to production. Candidate raw/scored artifacts: `model-compare-v104-opus-en-ja-segmented-scored.json`, `model-compare-v104-opus-tatoeba-en-ja-segmented-scored.json`; manual labels: `semantic-review-v104-opus-candidates.json`.
- No production server algorithm changed this turn besides the U+FFFD input guard. The v104 isolated server/benchmark on port 8876 is stopped; the user's server on 8765 was left untouched. Next: work on a separate development corpus to detect incomplete source units and preserve comparison/method relations, measure false rejects on complete controls, and evaluate candidates with manual source comparison before considering routing. Ordinary-body fallback <=5% and near-zero severity>=2 false accepts remain unmet.


## v105–v111 checkpoint — source-fragment controls and CAT-Translate-3.3B matched pilot (2026-09-21)

- A read-only current-code diagnostic ran `shouldTranslateParagraph()` against the historical development labels in `audit-manual-review-v8.json`: all 23 manually identified `source_fragment` cases are now blocked (23/23). Of 63 manually accepted `correct` or `minor_wording` controls, 7 were skipped, but inspection shows all seven are publication metadata, references, or ACM classification blocks; none is ordinary-body prose. Thus the old ordinary-body clean controls had 0 false rejects. This retrospective set is not a prevalence estimate and does not contradict unseen incomplete-source misses in held-out v103/v104.
- Tested the cached CyberAgent CAT-Translate-1.4B on two old development linguistics examples. The one still-fallback input was not rescued; the other was already accepted by current MADLAD v9. Its model was not routed.
- Downloaded public `cyberagent/CAT-Translate-3.3b` at pinned revision `47e382331d005acd54a42cdf088a76aa88788e0c` (BF16, Llama CausalLM, ~6.7 GB). An audit-only runner uses the official chat format, Paper Reader's production segmenter/protector, and MPS greedy generation; it changes no app or routing behavior. With the current `ZZCIT` placeholders and default prompt, gate accepts were 0/6; without protection, the model changed citation years and `U=528` to `U=529`; explicit instructions and a normalized, source-indexed marker wrapper fixed most marker loss.
- Final matched development diagnostic uses six old regression sources (linguistics, HCI, and cognitive attention), excluding held-out v102–v104. On the same current source blocks and quality-v6 client gate, CAT-Translate-3.3B with explicit `[[PRn]]` copy instruction accepts 4/6; current MADLAD 3B v9 accepts 3/6. All four CAT accepts were manually source-compared and had severity 0–1; the three MADLAD accepts include one severity-2 omission of which participant group scored lower. CAT safely recovers one MADLAD client fallback by preserving the EU context that MADLAD dropped; both systems correctly reject a HAI example with a negation error, while CAT also changes the year 2019→2018 and therefore remains safely rejected. This is promising development evidence, not production or population-rate evidence. Review: `semantic-review-v111-cat-translate-3.3b-matched-dev.json`.
- Matched artifacts: CAT candidate `model-compare-v111-cat-translate-3.3b-instructed-markers-dev-scored.json`; current MADLAD v9 `model-compare-v110-madlad-v9-matched-dev-scored.json`; source set `translation-audit-v106-cat-dev-input.json`. Runner is `translation-server/scripts/compare_chat_candidate.py`; source-integrity diagnostic is `test-data/real-papers/reports/source-completeness-diagnostic-v1.json`.
- Runtime cost on these six selected blocks was about 18.8 s/block for CAT versus 13.8 s/block for MADLAD (MPS; small, uneven sample). No production model, prompt, protector, or route changed. Isolated MADLAD server 8877 has been shut down; user server 8765 was left untouched. No `.app` build.
- Next: freeze the explicit-marker CAT configuration and run a new, source-hash-disjoint four-to-five-discipline paper-heldout pilot (not v102–v104 or these development keys), with current MADLAD matched on every block; manually review all candidate accepts and a sample of rejects, reporting ordinary-body fallback, severe false accepts, false rejects, latency and memory. Keep no automatic route until that evidence confirms the rescue is repeatable. Continue source/layout correction and OA corpus expansion. Product goals (ordinary-body fallback <=5%, near-zero severity>=2 false accepts) remain unmet.


## 2026-09-21 v112: independent CAT model holdout and source-layout diagnosis

A new five-paper source-hash-disjoint sample covered medicine, machine learning, cognitive psychology, conversation analysis, and ergonomics/human factors. Forty blocks were sampled; 18 reached model input under current source eligibility. CAT-Translate-3.3B and current MADLAD v9 were compared on the same rows with production segmentation/protection and the same client quality gate. All candidate accepts and matched MADLAD outputs were manually compared. Both candidates accepted 11/18; each had four severity>=2 errors among 11 accepted (36.4% in this purposive sample). CAT's ordinary-body fallback was 7/13, compared with MADLAD's 6/13. CAT safely rescued zero MADLAD fallbacks; three apparent rescues were unsafe or began with damaged source extraction. It also rejected three MADLAD accepts, including cases with clear dates/term evidence. CAT is not routed. Latency averaged 9.39 seconds per sequential candidate block; it is not directly comparable with MADLAD's microbatch timing. Artifacts: `translation-audit-v112-cat-paper-heldout.json`, `translation-audit-v112-cat-heldout-input.json`, `translation-audit-v112-cat-model-input.json`, `model-compare-v112-cat-paper-heldout-scored.json`, and `semantic-review-v112-cat-paper-heldout.json`.

Manual source and rendered-page comparison on the same PDF corpus found four extraction hazards: a narrow metadata rail merged with abstract prose in a medical paper; a table header appended to body prose in a COVID review; a paragraph split at a page boundary in cognitive psychology; and a 90-degree rotated HFE table assembled as prose. These are source reconstruction/layout failures and should be fixed before interpreting them as model quality. Added a generic baseline-row sidebar detector in `pdfLayout.ts` plus a synthetic word-level body regression. Typecheck, lint and all 71 reading-order tests pass. The changed block topology suggests the real-paper sidebar case may be affected, but post-change attribution and full extraction-corpus regression are not yet verified. Raw read-only diagnostics: `source-block-diagnostic-v112-medical-crosscolumn.json`, `source-block-diagnostic-v112-covid-fragment.json`, `source-block-diagnostic-v112-cognitive-heading-boundary.json`, `source-block-diagnostic-v112-hfe-table.json`.

No translation route changed; no `.app` build. The fresh port 8877 diagnostic server was stopped; the user server on 8765 remains ready and untouched. Resume by verifying the sidebar change on the actual PDF, running the cached-PDF extraction gates, then tracing page-boundary continuation and table geometry against clean controls. The <=5% fallback and near-zero severity>=2 false-accept product goals remain unmet.

## 2026-09-21 extraction checkpoint — paused at user's request

Current work stops with the sidebar detector unvalidated against all real-paper controls. The synthetic reading-order regression passes (71/71), but the latest selected real-paper run has two failures: a forbidden pair of adjacent HAI table cells is merged, and the how-content-volume title resolver picks a conference/date line. The compact medical block diagnostic previously showed the affiliation rail removed from the abstract, but it predates the final detector tolerance change and must be repeated. No new semantic translation metric is claimed in this checkpoint; the ordinary-body fallback <=5% and near-zero unsafe-accept goals remain unmet. No benchmark or isolated server is running; the user's port 8765 translation server was left available. On resume, first debug the HAI multi-column/table geometry and title regression, then rerun the medical case and the extraction/type/lint gates before expanding the audit.

## Extraction follow-up checkpoint — 2026-09-21

Extraction-only progress: geometry-conditioned sidebar grouping now resolves the HAI table-cell adjacency and separates a small uppercase publisher badge from a large title continuation; medical meta-review abstract is separated from its metadata rail. Synthetic reading-order tests pass 72/72 and focused real-paper controls pass 4/4. Broader extraction corpus is not fully green: `marketing-consumer-production-journey` has one table row assertion regression (`baselineRealPapers.test.ts:99`), confirmed passing on parent `HEAD^`. A Vitest worker update timeout also occurred. Translation metrics have not changed and no translation model was evaluated. Continue by repairing that table grouping regression and rerun extraction corpus before expanding semantic audit. See `CURRENT_STATE.md` for artifact names and detailed checkpoint.

## 2026-09-21 extraction table checkpoint

The HAI table-cell separation is restored and its focused reading-order regression passes. A generic projection change now marks resolver-selected source-only table nodes as `type: "table"` with explicit table metadata. One marketing baseline assertion remains: the row `Mathwick and Mosteller Review products Survey` is currently emitted as separate cell text after grid topology changes. Typecheck and lint pass; translation/model evaluation remains unchanged. Continue with generic row aggregation, then rerun the full extraction corpus before semantic audit.

## 2026-09-21 extraction regression resolved

Generic same-baseline table-cell aggregation now preserves logical rows such as `Mathwick and Mosteller Review products Survey`; recurring sidebar/grid cell splitting remains active for HAI-like layouts. The false two-row sidebar match on a title/author page was narrowed by row-span evidence. Synthetic reading-order: 72/72. Focused HAI/cognitive checks: 2/2. Focused marketing baseline: pass. Full cached extraction corpus: 108/108 assertions pass; only the Vitest worker `onTaskUpdate` harness timeout remains. Translation/model evaluation was not changed.

## 2026-09-21 translation benchmark v163 checkpoint

A fresh resume benchmark ran against the ready 4.57.6 MADLAD server. It processed 5 units for each of 52 selected cached papers and wrote `translation-audit.json/md`, but the report is incomplete (`complete=false`). It contains 258 sampled rows: 151 pending, 107 pre-model structural skips, 145 post-model fallbacks, and only 6 completed accepts. These automatic outcomes are not semantic labels; the next step is to attribute pending/post-model states and manually review a held-out ordinary-body subset. No production route or model was changed.

## v164 serial benchmark note (2026-09-21)

A five-paper serial run completed 25 sampled rows, but 12 rows returned HTTP 500 with `Errno 32 Broken pipe` across multiple disciplines. The translation server health endpoint remained ready afterward. These rows are runtime failures, not semantic review results, and are excluded from quality-rate interpretation. The report's `translationStatus` is inherited from the source block and can remain `pending` even when a translation response exists; outcome analysis must use the explicit server-error/fallback/accept fields. No gate or model change was made.

## Runtime failure attribution (2026-09-21)

A direct short translation request reproduced the same HTTP 500 `Broken pipe` seen by v164, while `/health` reported ready. The failure is therefore attributed to the server's inherited log pipe, before translation quality can be evaluated. `server.py` now protects stdout/stderr writes and falls back to `/dev/null` after pipe closure. Verification requires restarting the currently running server; no model or quality-gate change was made.

## v165 runtime smoke (2026-09-21)

After starting the guarded server process, direct translation succeeded. The one-paper/two-block serial smoke completed with zero HTTP/server errors. One row was accepted and one row was a pre-model structural fallback; this is the first clean benchmark after v164's broken-pipe runtime failure. The accepted row still requires semantic review and the structural row requires extraction attribution.

## v166 clean serial sample (2026-09-21)

Five cached papers, three units each, completed with zero server errors (15 rows). Seven rows were accepted, six were pre-model structural/reference fallbacks, and two were post-model safety fallbacks. One long marketing row was rejected after malformed protected citation output; one linguistics row was rejected because the output expanded `EU` to `欧州連合` without retaining the acronym. Accepted rows require manual semantic labels; the sample already shows terminology drift despite quality score 1.0. This is diagnostic evidence, not a corpus-wide rate.

### v166 manual semantic review

All 7 automatically accepted rows in v166 were manually compared against their English source. Five had severity >=2 issues (unsafe false-accept rate 5/7 = 71.4% in this small diagnostic sample); this is not a population estimate, but it confirms that the current automatic gate is not a semantic correctness measure. Recurrent issues were omitted clauses, terminology drift, and altered role/causal wording in long units. Review artifact: `test-data/real-papers/audit-manual-review-v166.json`. No blacklist or gate relaxation was applied.

## v167 diverse benchmark (2026-09-21)

Eight additional papers across HCI, cognitive psychology, marketing, ergonomics, and linguistics were sampled at two units each (16 rows). The server produced zero runtime errors. Seven rows were accepted, five were pre-model structural fallbacks, and four were post-model safety fallbacks. Manual review found one severity-4 unsafe false accept: the interactive-jewellery translation starts with an unrelated manufacturing claim and omits the source opening proposition while receiving quality score 1.0. The other six accepted rows were broadly understandable with terminology/style issues. Diagnostic unsafe false-accept rate: 1/7 (14.3%); combined v166+v167: 6/14 (42.9%), both small samples. Review artifact: `test-data/real-papers/audit-manual-review-v167.json`.

## v168 semantic isolation (2026-09-21)

The severity-4 interactive-jewellery false accept was reproduced through direct `/translate` calls using both the isolated first sentence and the full paragraph. The same unrelated Japanese opening was generated in both cases, so the failure occurs at model decode time rather than paragraph joining or postprocessing. Artifact: `test-data/real-papers/reports/translation-diagnostic-v168-interactive.json`.

## v169 alternate model probe (2026-09-21)

`cyberagent/CAT-Translate-1.4b` is available in the local HF cache. A CPU single-fixture probe translated the known MADLAD severity-4 sentence correctly, preserving the interactive/traditional jewellery relation. A broader four-fixture CPU run was stopped for excessive runtime before producing comparable results. Production remains unchanged. Artifact: `translation-diagnostic-v169-cat-1.4b.json`.

## v170 CAT-Translate MPS probe (2026-09-21)

CAT-Translate 1.4B ran on MPS for three fixtures. It fixed the known interactive-jewellery drift, but other outputs showed prompt echo, truncation, and unsupported additions. It remains an evaluation candidate only; no production model change was made. Artifact: `translation-diagnostic-v170-cat-1.4b-mps.json`.

## v171 CAT prompt probe (2026-09-21)

Explicit output-only prompts removed prompt echo and produced a faithful HAI sentence translation in CAT-Translate 1.4B. A labeled bilingual prompt caused format echo. This is useful adapter evidence, not a production change; longer multi-sentence quality remains unverified. Artifact: `translation-diagnostic-v171-cat-prompts.json`.

## v172 alternate-model benchmark tooling (2026-09-21)

Added `translation-server/scripts/bench_alternate_model.py` for reproducible, production-independent local model comparisons. It records generation conditions, token counts, latency, prompt echo, and outputs. A one-fixture MPS smoke passed with CAT-Translate 1.4B. No production model change.

## v173 CAT short-unit comparison (2026-09-21)

CAT-Translate 1.4B on MPS was evaluated on five short academic units with the reusable runner. No prompt echo occurred; core facts and relations were preserved, and terminology was generally more natural than MADLAD. Per-unit latency was approximately 1.9–12.1 seconds. Long-unit behavior remains unresolved, so CAT is not yet enabled in production.

## v175 matched CAT/MADLAD comparison (2026-09-21)

Five identical short source units were sent to both models. Both completed without request errors. CAT-Translate 1.4B generally produced more natural Japanese and preserved facts; MADLAD was faster on the long acknowledgement. CAT remains a selective-cascade candidate, not a replacement, until longer held-out units and output validation are complete. Artifact: `translation-compare-v175-cat-vs-madlad.json`.

## v176 CAT long-unit probe (2026-09-21)

Two 700–1,400-character units showed no prompt echo but significant omissions/compression in CAT-Translate 1.4B, with ~29–31s latency. CAT must not be used as a blanket long-paragraph fallback. Its current evidence-backed scope is short units only, with sentence/chunk coverage validation still required.

## v177 CAT sentence-unit probe (2026-09-21)

Splitting the HAI long paragraph into six sentence units removed the omissions seen when CAT received the whole paragraph: all six outputs completed without prompt echo and retained the final purpose/benefit claim. Latency was ~1.6–5.8s per sentence. This is evidence for sentence-level cascade design, not yet a production change; exact reconstruction, scientific-token protection, and held-out review remain required.

## v178 CAT sentence held-out probe (2026-09-21)

Ten sentence units from diverse HCI/design samples were tested. One output appended unrelated translation instructions/example after an otherwise valid Japanese sentence; the current runner did not flag this because contamination was trailing rather than a prefix echo. CAT therefore still requires explicit contamination and source-reconstruction checks before any cascade use.

## v179 output contamination guard (2026-09-21)

The CAT sentence held-out probe exposed a trailing prompt/example that the existing prefix-only echo check missed. Added a conservative, position-aware quality reason (`model output contains translation instruction contamination`) for generic translation-instruction markers appearing after translated content. This is a format-contamination guard, not a hallucinated-word blacklist, and it is not model-specific. Regression coverage is in `src/test/quality.test.ts` (112/112 pass). No production model or cascade change was made.

## v180 fresh server smoke (2026-09-21)

With the translation server ready, reran two cached papers (four units total). There were no request failures. The known interactive-jewellery decode drift still reproduced, confirming the v179 guard is a safety filter rather than a semantic correction. The report is `test-data/real-papers/reports/translation-audit-v180-contamination-guard.json`; CAT remains evaluation-only.

## v181 production contamination guard (2026-09-21)

The generic trailing instruction/example guard is now also enforced by `MADLADEngine._is_degenerate`, with `QUALITY_GATE_VERSION` bumped to `quality-v10`. It rejects only instruction-shaped markers after translated content and allows ordinary academic discussion of translation. Python MADLAD quality tests pass 23/23. Existing server processes need a restart to load v181; no model-selection or extraction behavior changed.

## v182 cache identity (2026-09-21)

Bumped the client translation quality identity from `quality-v6` to `quality-v7` after adding the contamination guard. This prevents pre-guard cached generations from being treated as current. The model identity regression and quality tests pass 113/113; no model routing change was made.

## v183 quality-v10 replay (2026-09-21)

After restarting the server, replayed the same two cached papers (four selected units). Both model-submitted units reported the new `quality-v10` model identity and all requests succeeded. The interactive-jewellery opening continued to produce the previously observed unrelated manufacturing claim. This validates cache/runtime activation and isolates the remaining issue to semantic model decode rather than stale code or request handling. Artifact: `translation-audit-v183-quality-v10.json`.

## v184/v185 CAT-Translate 3.3B candidate (2026-09-21)

The cached CAT-Translate 3.3B model was compared on the known MADLAD semantic-drift sentence and five held-out short sentence units. It correctly translated the interactive/traditional jewellery proposition that MADLAD replaced with an unrelated manufacturing claim. The five-unit probe was source-aligned at a glance, with no prompt echo; CPU latency was ~3.9–9.0 seconds per unit after model load. This supports prioritizing a selective short-unit cascade evaluation, but does not authorize production routing: invariant checks, MPS resource measurements, and manual review across disciplines are still pending. Artifacts: `translation-diagnostic-v184-cat-3.3b.json`, `translation-diagnostic-v185-cat-3.3b-five.json`.

## v186 alternate-model quality instrumentation (2026-09-21)

The evaluation-only CAT runner now records shared quality flags for missing numbers/citations, output length, suspected early EOS, repetition, and instruction contamination. The five-unit CAT 3.3B result was annotated: all five passed these surface safety checks. Manual semantic review remains required; no production routing change was made. Artifact: `translation-diagnostic-v186-cat-3.3b-five-quality.json`.

## v187 CAT 3.3B scientific fixture (2026-09-21)

CAT-Translate 3.3B was evaluated on statistical notation and measurement, author-year citations, negation/group scope, and participant-count fixtures. All four retained the expected numbers/citations; the two relational fixtures preserved negation and group scope in manual inspection. The runner now works both as a direct script and with shared benchmark helpers. Production routing remains unchanged pending broader review and MPS resource measurements. Artifact: `translation-diagnostic-v187-cat-3.3b-scientific.json`.

## v188 CAT 3.3B sentence cascade probe (2026-09-21)

The six sentence units from the HAI paragraph that CAT 1.4B handled after segmentation were rerun with CAT 3.3B. All six passed surface invariant, contamination, repetition, and early-EOS checks; the final purpose/benefit claim remained present. This supports a sentence-level candidate cascade, not whole-paragraph fallback. Production integration remains pending MPS resource measurements and broader manual semantic review. Artifact: `translation-diagnostic-v188-cat-3.3b-hai-sentences.json`.

## v189 CAT 3.3B long-unit boundary (2026-09-21)

The two long units used to expose CAT 1.4B omissions were evaluated with CAT 3.3B. Manual review judged both severity 1 (wording/terminology), with no severity>=2 error: the HAI purpose/benefit claim and marketing framework/theory/implication claims remained present. This is only two cases; production policy should still route sentence units rather than assume arbitrary long-paragraph safety. Review artifact: `translation-manual-review-v189-cat-3.3b-long.json`.

## v190 CAT 3.3B held-out remainder (2026-09-21)

The remaining five sentences from the diverse HCI/design probe were reviewed: four correct and one severity-1 wording issue; zero severity>=2 errors. Together with the first five, CAT 3.3B has 10 short held-out units without an observed unsafe semantic error, but the sample is still too small and selected for production routing. Review artifact: `translation-manual-review-v190-cat-3.3b-five.json`.

## v191 CAT 3.3B MPS (2026-09-21)

CAT-Translate 3.3B was measured on MPS for five diverse short units: 1.49–4.75 seconds per unit after load, with no missing numeric/citation flags, contamination, repetition, or early-EOS suspicion. MADLAD was restored afterward and is healthy on port 8765 with quality-v10. This establishes feasibility for a selective candidate, not a production decision; memory headroom and broader review remain open.

## v192 CAT RSS instrumentation (2026-09-21)

The evaluation runner now records process RSS. A two-unit CAT 3.3B MPS probe measured ~0.15 GiB after load and ~0.31–0.34 GiB during generation, with 1.56–2.61 s latency. Because Apple Silicon uses unified memory and this RSS excludes GPU allocation details, this is only a lower-bound resource signal. MADLAD was restored and is healthy on port 8765.

## v193 CAT 3.3B fallback replay boundary (2026-09-21)

The four existing clean-source fallback fixtures were sent to CAT 3.3B as whole units. Surface invariant/length/EOS checks passed, but manual review found severity-3 omissions in cognitive-psychology and social-advertising, severity-2 compression in linguistics, and only thermal-earring broadly complete (severity 1). This is a decisive negative result for whole-paragraph alternate-model fallback: long sources must be segmented before CAT and each unit must be validated. Review artifact: `translation-manual-review-v193-cat-3.3b-fallback.json`.

## v194 CAT 3.3B segmented fallback rescue (2026-09-22)

The four clean-source fallback fixtures were split with the production semantic segmenter and 22 resulting units were evaluated by CAT 3.3B. The omitted claims seen in whole-paragraph mode were retained after segmentation. Manual review found zero severity>=2 issues; three parents had severity-1 terminology/wording concerns and one was correct. This supports a selective sentence-level rescue design, while whole-paragraph fallback remains rejected. Review artifact: `translation-manual-review-v194-cat-3.3b-fallback-segmented.json`.

## v194 surface summary

The segmented CAT replay summary is saved in `translation-summary-v194-cat-3.3b-fallback-segmented.json`: 22 units across four parents, zero missing-number/citation units, zero contamination, early-EOS, or repetition flags; mean CPU latency 7.01 seconds/unit (median 6.90). These are surface metrics and do not replace manual semantic review.

## v195 evaluation instrumentation checkpoint

The alternate-model runner was validated after the v194 stop. `--segment` uses the same production segmenter as the fallback replay and records `parent_id`, segment position/count, and `source_roundtrip_ok` per unit. The runner compiles and exposes the option through CLI help. No production model routing was enabled and no benchmark was started in this checkpoint.

## v199 benchmark retry budget

The real-paper benchmark now exposes its request timeout and maximum-attempt budget through `MADLAD_BENCH_REQUEST_TIMEOUT_MS` and `MADLAD_BENCH_MAX_ATTEMPTS` (defaults: 120 seconds and 3 attempts). This prevents evaluation-only retries from holding a checkpoint for up to 18 minutes while leaving production server retry behavior unchanged. The resumed run uses serial scheduling and these bounded settings.

## Extraction corpus verification note (2026-09-22)

The extraction-corpus run completed 108/108 reading-order assertions, but Vitest emitted one unhandled worker `onTaskUpdate` timeout and exited nonzero after about 116 seconds. This result is recorded as inconclusive until the test harness timeout is isolated; it is not counted as a clean regression pass.

The slow baseline file reproduced the same worker timeout when run alone and with `--silent` (56/56 assertions passed). This localizes the issue to the long-running PDF test task/runtime rather than parallel-file contention or console output.

The extraction config now uses Vitest's `threads` pool for this PDF corpus. A full rerun completed cleanly with 2 files and 108/108 assertions, with no unhandled worker error. This changes test execution only, not extraction behavior.

## Evaluation cadence policy (2026-10-05)

The 113-paper measurement is now reserved for major cross-cutting changes or release acceptance. Routine extraction, gate, diagnostic, and refactor changes use focused representative papers (normally 4–12), the affected failure cohort, regression tests, typecheck, and lint. Full-corpus runs must use `--resume` and stable source keys; an incomplete report is never treated as a corpus metric. The operational policy is documented in [`docs/TRANSLATION_BENCHMARK_POLICY.md`](docs/TRANSLATION_BENCHMARK_POLICY.md).

### CAT source-disjoint manual review

Manual review of the five source-hash-disjoint CAT rows found 3 automatic accepts, all usable in this small sample (two severity 0, one severity 1), and one rejected row with a severity-2 procedure-scope shift (`utterances` rendered as `sessions`). The remaining rejected row was degenerate. This supports further bounded CAT evaluation but does not justify production routing. See `reports/cat-source-disjoint-auth-v1-manual-review.json`.

### CAT source-disjoint v2 probe

Five additional CAT rows were generated. Two clean complete rows were usable (severity 0); three contained dangling frequency/Figure boundaries or an orphaned list number and were classified as source-fragment inputs rather than model-quality evidence. This probe supports stricter input stratification and does not change production routing.

Correction: the HCI v2 row was also classified incomplete by the existing source-integrity diagnostic because it lacks terminal punctuation. The clean-complete v2 sample is therefore 1 row, not 2; four rows are excluded from clean model-quality evidence.

### Trailing figure-label boundary guard

A generic source-integrity guard now excludes long prose blocks ending in a bare `Figure`/`Fig.`/`Table` label, a pattern observed in the CAT v2 follow-up. The rule is length-gated and applies to structural boundary evidence rather than a paper-specific term. Quality tests and typecheck pass.

Post-change focused verification confirms both Step-to-Charge rows receive the explicit trailing figure-label boundary reason. The HCI row remains incomplete for missing terminal punctuation; the cognitive row remains a model degeneration. No full-corpus rerun was needed.

### Embedded numbered-list boundary guard

A generic source-integrity rule now flags a numbered dash item embedded after a completed sentence, preventing list/body merges from being used as clean translation evidence. Regression coverage passes; no full-corpus rerun was performed.

Post-list-boundary verification: the same CAT v2 cohort now has 1 clean row, 4 source-excluded rows, and 1/1 clean quality acceptance. The cognitive list-contaminated row is explicitly classified as an embedded numbered-list boundary. This is a focused verification, not a corpus metric.

### CAT source-disjoint v3 clean cohort

Five clean complete fallback rows were evaluated with CAT-Translate 3.3B. The automatic gate accepted 5/5; manual review found four usable outputs (three severity 0, one severity 1) and one severity-2 citation alignment risk in the GPT-3 cognitive-psychology paragraph. Fluent output alone is therefore insufficient for cascade enablement; citation integrity remains a required review dimension.

### Citation alignment gate investigation

A candidate occurrence-count gate was tested against the CAT v3 citation-shift example. It falsely rejected established valid forms (HTML-wrapped superscripts, clustered citations, and inline superscript references), so it was reverted. Citation alignment remains a manual-review/diagnostic gap; no broad gate was added without a representation-aware matcher.

### Audit-only citation alignment diagnostic

Added `scripts/diagnose-citation-alignment.ts` (`npm run audit:citation-alignment`) to report missing bracketed/inline citation occurrences before manual review. On the five-row CAT v3 clean cohort it flags only the GPT-3 cognitive-psychology row (tokens `2` and `6`), while ordinary numeric rows remain unflagged. The diagnostic is deliberately not a production quality gate because citation surface forms vary.

The citation diagnostic was also run on existing CAT artifacts: v1 single/tail 0 flags, v2 2 flags (both source-contaminated rows), and v3 1 flag (the manually identified citation-shift row). It should be applied after source-integrity filtering and remains audit-only.

Citation diagnostic v2 now applies source-completeness filtering internally and excludes Figure/Table labels from inline citation detection. On CAT v2 it reports 1 eligible / 4 source-excluded / 0 citation flags; on CAT v3 it reports 5 eligible / 1 known citation flag.
