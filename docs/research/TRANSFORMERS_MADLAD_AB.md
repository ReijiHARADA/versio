# MADLAD 3B Transformers loading A/B

Date: 2026-09-21 (JST). This diagnostic was run against local cached checkpoint
snapshot `fa184c675da0b5c9e1c8694fccd4e12e2d422094`; no PDF extraction was used
to create the fixed translation inputs.

## Decision

The reported Transformers 5.x loading defect applies to MADLAD-400 3B. The
checkpoint has `tie_word_embeddings: false`, omits `shared.weight` and
`encoder.embed_tokens.weight`, and contains distinct
`decoder.embed_tokens.weight` and `lm_head.weight` tensors. Loading this layout
with Transformers 5.16.1 and 5.17.0 changed the in-memory tie flag to `true` and
silently loaded the encoder embedding from `lm_head.weight`. The same synthetic
layout reproduces this under the project's installed 5.16.1 and 5.17.0. Under
4.57.6, the flag stays false and encoder/decoder inputs match the checkpoint's
decoder embedding.

Before this change, Versio's installed development environment was
Transformers 5.16.1 even though `requirements.lock` specified 5.17.0. The app
source contained a manual post-load reassignment. Strict chunked tensor checks
showed that reassignment restored every encoder row to the checkpoint's
decoder embedding under both 5.16.1 and 5.17.0. Thus the running source server
had been masking the upstream load defect, but direct unpatched loading was
corrupt. The upstream reproduction and layout explanation are in
[Transformers issue #48154](https://github.com/huggingface/transformers/issues/48154).

The project now pins Transformers 4.57.6 and checks embedding integrity at
startup instead of rewriting model tensors. The current server was restarted
from that environment; its startup reports model version
`3b-mt-v6-transformers-4.57.6-semantic-v73-source-protect-v1-strict-restore-v21`
and verified `encoder == decoder`, input embedding absmax 253.00, separate
`lm_head` absmax 2.14. The pre-change translation cache identity is no longer
used.

## Reproducible setup

Environment for full model runs: macOS 26.0 arm64, Python 3.12.14, PyTorch
2.14.0, MPS, `bfloat16`, same local checkpoint and SentencePiece tokenizer
files, greedy generation (`num_beams=1`, `do_sample=false`,
`no_repeat_ngram_size=4`, max input 512, same input-dependent output cap).
Each version ran in a separate process. 4.57.6's package constraints require
tokenizers 0.22.x while 5.17.0 requires tokenizers 0.23.x; the five fixtures'
token-ID SHA-256 values were identical across the two runs. The model/tokenizer
were loaded from cache in offline mode.

The exact source slices, protected model inputs, per-unit input/output token
counts, outputs, EOS/cap flags, source hashes, token-ID hashes, and full tensor
mapping checks are retained locally in ignored reports:

- `test-data/real-papers/reports/madlad-transformers-5.17.0-raw.json`
- `test-data/real-papers/reports/madlad-transformers-5.17.0-ab.json` (the
  existing Versio encoder-to-decoder reassignment, measured before and
  after)
- `test-data/real-papers/reports/madlad-transformers-4.57.6-ab.json`
- `test-data/real-papers/reports/madlad-transformers-5.16.1-app-repair.json`
- `test-data/real-papers/reports/madlad-transformers-4.57.6-server-pipeline.json`

To rerun the fixed fixtures, keep the server stopped to avoid a duplicate model
load, then run `translation-server/scripts/diagnose_transformers_madlad_ab.py`
in a separate environment with the desired Transformers overlay. The committed
script reads stable IDs from the existing local audit reports and performs no
PDF work. The current `.venv` has been updated to the 4.57.6 lock and the live
server is ready.

## Tensor mapping

All equality checks compared every embedding row after casting checkpoint
F32 values to the model's loaded bfloat16 dtype. They use strict
`torch.equal`, in bounded slices, over shape `[256000, 1024]`.

| Load condition | config tie flag after load | Encoder equals checkpoint decoder input | Encoder equals checkpoint lm_head | Decoder / lm_head |
|---|---:|---:|---:|---|
| Transformers 5.17.0, unpatched | true | no | yes | each matches its own checkpoint tensor |
| Transformers 5.17.0, Versio reassignment | true | yes | no | each matches its own checkpoint tensor |
| Transformers 5.16.1, Versio reassignment | true | yes | no | each matches its own checkpoint tensor |
| Transformers 4.57.6, unpatched | false | yes | no | each matches its own checkpoint tensor |

The checkpoint itself contains neither `shared.weight` nor
`encoder.embed_tokens.weight`; it has the decoder input embedding and the
separate output head. `encoder == lm_head` in unpatched 5.x is an exact tensor
match, not an inference from absmax. In 4.57.6 the encoder and decoder both
match the checkpoint input embedding (absmax 253); `lm_head` matches its
separate checkpoint tensor (absmax 2.14).

## Fixed-fixture generation results

The model input token counts were identical across versions. Output token counts
exclude padding and the decoder start token. The “5.17 raw” column uses no
repair. The other two use 5.17's existing repair or the normal 4.57.6 loader.

| Fixture | Input tokens | 5.17 raw output / EOS / cap | 5.17 repaired output / EOS | 4.57.6 output / EOS | Manual comparison |
|---|---:|---|---|---|---|
| “None of the groups…” cardinality/statistical paragraph | 70 | 156 / yes / no | 50 / yes | 50 / yes | Raw output is non-Japanese gibberish. Both corrected loads still narrow “none of the groups” to “両群”; protected `p=0.124` is detached to the end in the direct replay. The frontend scope guard rejects this risk. |
| “Eighty-eight participants…” collective count | 38 | 73 / yes / no | 53 / yes | 53 / yes | Raw output is gibberish. Both corrected loads render the collective total as “from each field/department”; the current client scope guard falls back. |
| Parallel “how to…” course sentence | 32 | 39 / yes / no | 57 / yes | 57 / yes | Raw output is gibberish. With production `no_repeat_ngram_size=4`, neither corrected load repeats the old phrase loop, but the direct decode reorders and adds list-like clauses. The production retry path repairs this fixture via beam search. |
| Dense three-group H-test results | 28 | 108 / no / yes | 39 / yes | 39 / yes | Raw output is gibberish and hits the generation cap. Both corrected loads preserve `H(2)`, all three group labels, and all p-values. |
| Linguistics ordinary-body paragraph historically post-model-fallback | 103 | 258 / no / yes | 95 / yes | 94 / yes | Raw output is gibberish and truncates. Corrected direct decode omits or weakens the “through discriminative features” claim and does not clearly preserve all three named registers. The production quality gate still returns whole-item fallback for this paragraph. |

The 5.17 raw output was degenerate for all five fixtures; statistical and
ordinary-body outputs reached their output caps without EOS. After applying the
existing reassignment, no fixture hit its cap and all reached EOS. The direct
4.57.6 run also reached EOS on all five. The 5.17-repaired and 4.57.6 outputs
were close but not always byte-identical; that residual variation is normal
decode/runtime behavior, not evidence that the bad encoder remains active.

## Semantic interpretation and remaining failure

This result separates two failure classes:

1. **Runtime loading corruption:** confirmed and severe when 5.x loads the
   checkpoint without a fix. It produces malformed scripts, repetition, and
   truncation. The pinned 4.57.6 runtime loads the checkpoint correctly.
2. **MADLAD semantic drift:** still present after the embeddings are correct.
   Group cardinality and participant-count scope errors reproduce in both
   4.57.6 and the 5.x reassignment condition. The client quality gate catches
   those two known relations, but an ordinary-body terminology/coverage issue
   remains. A runtime pin does not, by itself, meet the <=5% fallback or
   near-zero false-accept target.

The repeated phrase regression did not recur under the current four-gram
constraint and production rescue/beam retry. This does not erase the historic
failure; it establishes that the present setting handles that fixture on both
correctly loaded model conditions.

## Current cross-paper check on the corrected runtime

The same ten cached OA papers and same 40 stable-key blocks from the v53
baseline were re-extracted/replayed under the 4.57.6 server as v56. Source text
and selected keys matched 40/40. The result remained 18 pre-model structural
fallbacks plus five post-model fallbacks among the full 40; 17 translations
were fully accepted. Ordinary-body fallback stayed 4/18 (22.2%); the same
figure caption is miscategorized, so manually screened clean prose is 4/17
(23.5%). This is not a fallback improvement over the previous patched 5.x
baseline. The version change fixes runtime integrity and stale-cache identity,
not the model's remaining semantic errors.

Twelve outputs differed across runtime runs. Manual comparison of changed
accepted outputs confirmed material false accepts remain: the factory-worker
study summary invents a decision-support claim and omits the study's user
experience focus; “consumer production journeys” is translated with literal
travel wording; the WEAR paragraph adds an unsupported claim about wearers'
subjective feelings; and the jewelry overview starts with an unsupported claim
that the technology manufactures interactive jewelry. Other changed outputs
were faithful or had only minor wording differences. The known 88-participant
scope output remained rejected and now also drops the aggregate `82` fact.

The benchmark is diagnostic and purposively sampled, not a population estimate.
The 50+ OA paper corpus, <=5% ordinary-body fallback, near-zero unsafe
false-accept goal, and selective cascade remain unfinished. Continue from this
corrected-runtime 10-paper baseline; use held-out papers for future terminology
or model interventions.


## Bundle verification

`npm run tauri:build:fast` completed successfully after fixing four TypeScript project-reference errors in extraction code (geometry evidence typing/weight, median-font argument, and page width propagation). The generated `src-tauri/target/release/bundle/macos/Versio.app` was modified at 2026-09-21 02:48:22 JST. Its bundled translation-server Python reported Transformers 4.57.6; bundled `madlad_mps.py` contains the 4.57.6 runtime guard, v6 cache identity, and fail-closed embedding verification. The application was not launched. Post-fix checks: Vitest 418/418, Python 133 tests + 11 subtests, typecheck, lint, frontend production build, and `git diff --check` all passed.

### Manual review of the 12 changed v56 rows

These labels compare the changed 4.57.6 outputs with their exact English source. Severity uses the audit scale (0 harmless, 1 readability, 2 minor understanding impact, 3 researcher could misunderstand). This is a focused changed-output review, not a random sample.

| Stable block key | Finding | Severity | Primary layer |
|---|---|---:|---|
| `cognitive-vr-mnemonic-processing:b-7570f515` | The collective 88-participant scope remains ambiguous and the aggregate `82` is omitted; the client gate rejects it. | 3 | MADLAD decode / quality gate |
| `ergonomics-quantified-factory-worker:b-3b26bcdd` | Paper roadmap is mostly preserved; terminology is awkward but claims remain aligned. | 1 | MADLAD decode |
| `ergonomics-quantified-factory-worker:b-87478cc0` | Adds a worker decision-support purpose and omits the stated user-experience/activity/benefit/concern study focus. | 3 | MADLAD decode |
| `hci-empirical-methods:b-bf6aefa9` | Course audience and quantitative-method focus are retained with minor compression. | 1 | MADLAD decode |
| `interactive-jewellery:b-76b88e30` | Context paragraph is substantially faithful; minor phrasing issues. | 1 | MADLAD decode |
| `interactive-jewellery:b-c1e9695a` | Opens with an unsupported claim that technology is used to manufacture interactive jewellery. | 3 | MADLAD decode |
| `linguistics-language-model-physics:b-4522bc94` | List item preserves the linear-probing method and contrast with encoder models. | 0 | MADLAD decode |
| `marketing-consumer-production-journey:b-22bb2631` | Acknowledgement and named entities are retained. | 0 | MADLAD decode |
| `marketing-consumer-production-journey:b-f4157aa0` | “Consumer production journey” drifts toward literal travel wording, obscuring the marketing construct. | 2 | MADLAD decode / terminology |
| `social-influence-social-advertising:b-17662e53` | Study-roadmap sentence remains faithful. | 0 | MADLAD decode |
| `syntax-prosody-correlation:b-b015f548` | Main explanation is readable; reference relation `[13]`/`[16]` is uncertain in this long extracted block and needs source-PDF adjudication. | 1 (provisional) | Extraction / postprocess |
| `wear-scale:b-16c56d24` | Adds an unsupported claim that the scale represents wearers’ subjective feelings. | 2 | MADLAD decode |

Among changed accepted outputs, three clear severity-2+ false accepts are recorded here; the scope-shift row is a visible fallback. One row's citation relation remains provisional pending source-PDF adjudication. This focused set is not used as a corpus prevalence estimate.

### Runtime/model priority decision

Keep MADLAD 3B on Transformers 4.57.6 as the reproducible production baseline for now; the loader pin is required, while semantic quality still needs independent work. A larger MADLAD comparison is a high-value next model experiment, with 7B first and 10B only if 7B shows worthwhile semantic gains. Neither checkpoint is cached locally. The Hugging Face file metadata lists about 33.2 GB of 7B safetensors and 42.9 GB of 10B safetensors ([7B files](https://huggingface.co/api/models/google/madlad400-7b-mt/tree/main?recursive=true&expand=true), [10B files](https://huggingface.co/api/models/google/madlad400-10b-mt/tree/main?recursive=true&expand=true)); this Mac currently has 37 GiB free and its data volume is 96% used. I did not download the weights: 10B does not fit, and even the 7B full checkpoint would leave little working space. Both model cards identify Apache-2.0 licensing ([7B](https://huggingface.co/google/madlad400-7b-mt), [10B](https://huggingface.co/google/madlad400-10b-mt)). Until storage is available, continue held-out evaluation with already-installed local Gemma/Qwen candidates against the corrected 3B baseline; do not change production routing based on the current small comparisons.


## Current checkout and live-runtime recheck (2026-09-21 03:58 JST)

Rechecked against current branch `main`, HEAD `ebb219669e196a0285ef825cc4dadb47a1ec1580`. The request's statement that `requirements.lock` is at 5.17.0 is stale: both `translation-server/requirements.lock` and the active `translation-server/.venv` report Transformers 4.57.6. The listener on port 8765 was PID 3501, whose open Python/Torch libraries resolve inside that project `.venv`. After the latest source update it was restarted from that same venv; startup logged model version `3b-mt-v6-transformers-4.57.6-semantic-v74-source-protect-v3-strict-restore-v22` and `embedding integrity verified: encoder==decoder=True, input absmax=253.00, lm_head absmax=2.14, separate=True`. Health reports model ready. No PDF extraction was involved in the loader A/B.

This recheck does not alter the earlier A/B decision: use 4.57.6 (or another tensor-verified runtime), and keep 5.17.0 unpatched out of production for this checkpoint. The app-side reassignment condition demonstrates that repairing the embedding fixes the runtime corruption but does not fix the recurring cardinality/scope/terminology semantic drifts. The current v61 work continues on the verified 4.57.6 model; its residual accepted omissions are recorded separately from the loading defect.


At 2026-09-21 04:05 JST, after reverting an unsuccessful exploratory segmenter experiment, the listener was restarted from the current v74 + source-protect-v3 source. PID 4174 is ready on port 8765, reports the v74/v3/v22 identity, and repeats the same embedding-integrity pass. The startup `OK` warmup is intentionally rejected because it has no Japanese script; the model nevertheless completes startup and health reports ready. No `.app` build was requested or performed in this check.


## v62 current serving check (2026-09-21 04:19 JST)

Current production-side source protection was updated for narrative citations with given + family names and exact restoration. The active server PID 4671 is ready on the project `.venv` (Transformers 4.57.6) and reports model version `3b-mt-v6-transformers-4.57.6-semantic-v74-source-protect-v4-strict-restore-v23`; startup again reports encoder/decoder embedding integrity. A live reader-path request showed `Geoff Thompson (2014)` enter as one protected span and return exactly after decode. This has no bearing on the 5.17.0 loader defect; it is a separate translation-preservation correction.


## Live runtime recheck (2026-09-21 07:00 JST)

The current checkout is still `main` at `ebb219669e196a0285ef825cc4dadb47a1ec1580`. `requirements.lock`, `translation-server/.venv`, and live `/status` agree on Transformers 4.57.6; the loaded server is MADLAD v74 on MPS and ready. No app build or runtime change was made for this recheck.

## User-requested current-main verification and quality-goal continuation (2026-09-21)

The local checkout is `main`, HEAD `ebb219669e196a0285ef825cc4dadb47a1ec1580`; `git ls-remote origin refs/heads/main` returned the same hash. The user's cited commit `7e5c1f65a3dbe3ac7380b2f71068eec66b95e849` is not the current remote main. The worktree contains ongoing translation/extraction changes; they were preserved. Current `requirements.lock` and `translation-server/.venv/bin/python` both report Transformers 4.57.6. The listening PID 46951 has Torch and other Python libraries open from this project's `.venv`; live `/status` reports MADLAD 3B, 4.57.6, MPS, ready, version `3b-mt-v6-transformers-4.57.6-semantic-v74-source-protect-v11-strict-restore-v25-quality-v5`.

The tensor-level diagnosis above remains applicable: this checkpoint snapshot has `tie_word_embeddings=false`, no `shared.weight` or `encoder.embed_tokens.weight`, and separate decoder input and `lm_head` checkpoint tensors. Unpatched Transformers 5.17.0 ties the config and maps encoder input to `lm_head.weight`; 4.57.6 maps encoder and decoder input to the checkpoint decoder embedding. Five same-tokenized fixed fixtures confirm raw 5.17.0 output corruption and show that correcting the loader does not eliminate MADLAD semantic drift. No production version change was made during this recheck because the app/server were already on the tensor-verified runtime.

To continue the quality goal without route changes, Qwen 2.5 7B was replayed through the production segmenter, citation protection/restore and current v5 quality gate on two exact-source-hash-new ordinary-body rows from the v91 cohort. Historical mixed-model reports were inspected per row; a source with prior Qwen 7B output was excluded. Both matched MADLAD rows were post-model fallbacks. Qwen's 3,085-character appraisal-linguistics paragraph was rejected after untranslated citation prose and a residual `CIT1ZZ` token; the shorter paragraph passed the gate but translated technical “attitudinal” as “意図的な態度,” adding intentionality. Manual review therefore found a severity-2 false accept among the sole accepted output (1/1, purposive N=2); the apparent 1/2 fallback reduction does not establish a safe model improvement. Inputs, outputs, token counts and generation conditions are in ignored `test-data/real-papers/reports/model-compare-v92-qwen7-v5-unique-ordinary.json`; review is in `semantic-review-v92-qwen7-unique-ordinary.json`. Qwen 7B is not enabled for production routing.

Next: use a new paper cohort to grow the Qwen 7B source-hash-new sample across disciplines, and separately test strict placeholder restoration against duplicated/overlapping marker output. Keep the v5 baseline on Transformers 4.57.6 while the candidate remains unsafe. The ordinary-body fallback <=5% and near-zero severity>=2 false-accept goal are still unmet.

### v93 cross-field continuation

An exact-source-hash-new HCI pair was added from the first paper of an interrupted reader-path run. Qwen 7B accepted both while adding an unsupported ruler/triangle emoji in place of the described bottle-neck material on one; MADLAD accepted both matched blocks. With the two v92 appraisal-linguistics rows, the fresh candidate sample is four blocks in two disciplines: three Qwen accepts, two severity-2+ false accepts among those three, and zero safe rescues of the two MADLAD fallbacks. Keep Qwen out of automatic routing. The current pinned 4.57.6 server remains ready; no `.app` build was made. Progress and the incomplete first-paper report are recorded in `CURRENT_STATE.md` and `test-data/real-papers/audit-progress.json`.
