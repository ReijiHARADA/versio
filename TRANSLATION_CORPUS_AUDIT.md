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

## Extraction checkpoint (2026-09-16)

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
