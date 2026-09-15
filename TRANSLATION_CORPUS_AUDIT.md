# Cross-disciplinary translation audit

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
