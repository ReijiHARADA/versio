# Codex handoff: Paper Reader translation quality

Status: paused intentionally at v49. Do not mark the active goal complete.

## Current objective

Improve Paper Reader academic-paper translation quality to practical research use:

- ordinary body paragraph reader-visible fallback <= 5%
- hallucination / numeric / citation / statistical notation / experimental-condition corruption near zero
- do not reduce risk merely by increasing fallback
- keep `TRANSLATION_CORPUS_AUDIT.md` and `test-data/real-papers/audit-progress.json` updated
- if external or paid APIs are considered, recheck free-tier availability before every use

## Process state

All long-running processes are stopped.

- v49 `npm run bench:real-paper-translation -- --limit 12` was stopped at the user's request.
- `test-data/real-papers/reports/translation-audit.json` is a partial v49 report with `complete: false` and must not be treated as the authoritative whole-corpus metric.
- The translation server process and Python resource tracker were killed after the stop request; `pgrep -fl "tsx|benchmark-real-paper-translation|server.py|madlad|translation-server|python.*server"` returned no rows.

## Current pipeline/cache version

`3b-mt-v5-semantic-v49`

Files containing version:

- `translation-server/engines/segmenter.py`
- `src/services/translation/madladEngine.ts`
- `scripts/prepare-translation-manual-review.ts`

## Completed benchmark checkpoints

Last completed full-corpus run is v48:

- 21 catalog entries / 19 cached PDFs / 206 sampled rows.
- ordinary body prose: 74 rows, 60 automatic accepts, 14 reader-visible fallbacks.
- ordinary body reader-visible fallback: 18.9%.
- damaged extraction: 85 rows, 17 accepts, 68 fallbacks.
- lists: 23 rows, 20 accepts, 3 fallbacks.
- statistical prose: 6 rows, 3 accepts, 3 fallbacks.

v49 was started and reached 17 completed paper checkpoints before the user asked to stop. The partial report records `complete: false`; rerun v49 to completion before comparing corpus rates.

## Main changes currently in working tree since v43

- v44: failed chunks retry once with beam search (`num_beams=4`) before rescue segmentation.
- v45: rejected-chunk rescue splitters are enabled for nonrestrictive `where` clauses and appositive `a region ...` clauses.
- v46: scientific protection preserves parenthesized decimal result values such as `(0.006)`; source-grounded terminology normalization handles `wearable/wearability`, `counterbalancing`, `earring(s)`, and source-confirmed `less embarrassing / less impolite / less weird` polarity.
- v47: relaxed the abnormal phrase-repetition detector enough to avoid rejecting valid statistical/social-acceptability prose with repeated academic terms.
- v48: micro-batcher now preserves only the failed translation unit as exact source instead of falling back the entire paragraph.
- v49: client quality guard rejects leftover scientific placeholders even when MADLAD mutates placeholder letters into Greek/Cyrillic lookalikes such as `ΖZCIt2ZZ`.

## Important caveat

v48 reduces paragraph-level reader-visible fallback, but some accepted rows contain mixed Japanese plus exact English source sentences from partial-unit fallback. This is safer than hallucination, but it is not the same as a fully translated paragraph. The next benchmark improvement should add an explicit `partialSourceFallback` metric before using the v48/v49 accept count as product-readiness evidence.

## Tests run after v49 edits

Passed:

```bash
npx vitest run src/test/quality.test.ts src/test/glossary.test.ts
npx tsc --noEmit
cd translation-server && .venv/bin/python -m unittest tests.test_micro_batcher tests.test_segmenter tests.test_citation_protect tests.test_madlad_quality
```

## First commands when resuming

```bash
cd /Users/harada/Desktop/codex/projects/paper-reader
pgrep -fl "tsx|benchmark-real-paper-translation|server.py|madlad|translation-server|python.*server" || true
cd translation-server && PYTORCH_ENABLE_MPS_FALLBACK=1 .venv/bin/python server.py
```

In another terminal:

```bash
python3 - <<'PYRESUME'
import urllib.request
print(urllib.request.urlopen('http://127.0.0.1:8765/status', timeout=3).read().decode())
PYRESUME
npm run bench:real-paper-translation -- --limit 12
npm run audit:prepare-review
npm run audit:summarize-review
```

Confirm `/status` reports `3b-mt-v5-semantic-v49` before benchmarking.

## Recommended next actions

1. Complete the v49 full benchmark and regenerate review summaries.
2. Add partial-source-fallback metrics so English source slices inside accepted output are tracked separately from full translation accepts.
3. Continue manual semantic review of accepted ordinary body prose; do not relax quality gates based only on automatic accept counts.
4. Continue local/free EN-JA model or cascade evaluation. Do not add hallucination-word blacklists or paper-specific rules.
5. If a model/API outside the local stack is considered, verify the current free tier before use.

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

## Current stopping point: v52 full corpus completed

The v52 full corpus benchmark completed cleanly and wrote `test-data/real-papers/reports/translation-audit.json` and `.md`. Metrics: 206 rows, 19/73 ordinary-body fallbacks (26.0%), all post-model, and 0 partial-source fallbacks. Two catalog PDFs remain missing from cache (`wear-scale`, `precious-materials`). The next agent should continue from the 19 v52 ordinary-body post-model failures and evaluate a local/free cascade or replacement model; do not solve this by loosening quality gates or accepting known-bad translations.

## V53 follow-up

Generic protection for camel-case and alphanumeric technical identifiers was
added and the cache identity is now `3b-mt-v5-semantic-v53`. Helsinki-NLP and
M2M100 418M were evaluated on eight eligible ordinary fallback rows; both remain
unsuitable for automatic cascade acceptance because of semantic drift,
truncation, or repetition. Raw reports are under
`test-data/real-papers/reports/model-cascade-v53-*.json`. Continue with
sentence-level resegmentation plus scored cascade evaluation.

The v56 server rerun of OzCHI after canonical list splitting produced 0/2
ordinary-body fallbacks. This confirms the block-level separation is effective
for the mixed bullet/prose failure, while the full corpus still needs rerun.

The v54 OzCHI spot rerun (8 units) produced 1/2 ordinary-body fallback. The
accepted long paragraph translated normally; the fallback was a structure-
mixed block containing a prose lead-in and flattened bullets, suggesting that
list/body separation at extraction is a more promising next target than further
generic sentence splitting.
