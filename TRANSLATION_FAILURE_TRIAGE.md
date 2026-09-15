# Translation failure triage

This note is generated from the persisted v69 fallback attribution and is the starting queue for the next quality iteration.

| Cause | Count | Evidence | Next experiment |
|---|---:|---|---|
| A: complete source, model inadequacy | 9 | canonical prose matched layout; no structural warning | compare whole-unit, safe clause units, and an independent local/free model while preserving invariant checks |
| D: structure mixing | 2 | prose block contains list/structure boundaries | repair block boundaries before translation; measure source reconstruction |
| E: scientific/layout contamination | 3 | missing/unexpected scientific invariants or orphaned identifiers | isolate scientific spans and table/equation regions before model input |

Seven failures are at least 1,000 characters and three are under 500 characters. Therefore a single max-length or retry change cannot explain the full tail. The current production fallback remains 14/48 ordinary-body rows (29.17%) in the last complete corpus run; the v75 run was intentionally partial (1 paper, 8 rows) and is not a new corpus metric.

The next change must record source, model input, output, and quality reasons per unit, then compare A/D/E cohorts separately. Acceptance must remain invariant- and semantics-gated; increasing fallback by rejecting valid prose is not an improvement.

The current attribution inventory contains 13 `sourceIntegrity=provisional-pass`
rows and one `sourceIntegrity=review` row (the latter is the list-mixing
candidate). All 14 rows are canonical `paragraph` nodes on a single page; this
is evidence about the sampled failures, not proof that the complete corpus has
clean extraction.

The v79 thermal clean-source comparison adds a stronger A-cohort observation:
whole-source and semantic-units-joined inputs both fail on the same first
253-character unit after greedy, beam, and rescue attempts. This rules out a
simple whole-paragraph join as the sole fix for that fixture; the remaining
candidate is model adequacy or a better semantic split that preserves the full
claim.

The v79 rescue-units-joined condition also failed on the same unit, so the
existing rescue splitter does not recover this case. This is a reproducible
model-side failure under three input layouts, not evidence that the quality gate
alone should be relaxed.

The linguistics fixture reproduced the pattern independently: both whole-source
and semantic-units-joined variants failed on the first unit containing BERT, with
the same `implausibly_short` rejection. Its rescue-unit list was empty and is
now correctly omitted rather than submitted as an empty model input.

The E-cohort raw-decode capture adds a concrete restoration finding. In the
`power-over-skin` unit, `RF` and `TQP3M9009` are both protected before decode,
but the model emits neither placeholder. The legacy restore path appended both
missing values at the end, yielding `RFTQP3M9009`. The production path now uses
strict restoration and rejects a dropped placeholder before that malformed text
can be returned. The raw evidence is preserved in
`translation-server/benchmarks/translation-scientific-placeholder-debug-v72.json`.

A cached free alternative (`Helsinki-NLP/opus-mt-en-jap`) was evaluated on the
seven current source-fallback rows. Every output was truncated or nonsensical,
so it is not safe as a cascade candidate; the raw comparison is saved in
`translation-server/benchmarks/model-cascade-opus-v72.json`.

The cached free `facebook/m2m100_1.2B` model was also run over the same seven
rows. It produced longer text than opus-mt but still had semantic drift,
technical-term corruption, repetition, and generation-cap truncation. It is
not safe as an automatic cascade without a semantic validator; results are in
`translation-server/benchmarks/model-cascade-m2m100-1.2b-v72.json`.

The cognitive fixture is the complementary failure: whole and semantic inputs
both pass the current gate (180 input / 230 output tokens), but both omit the
source's final A/B-versus-C/D condition. This is a concrete unsafe semantic
omission that length and degeneracy checks do not catch; it should feed the
content-coverage calibration set before any gate relaxation.

The persisted A-cohort unit inventory gives the next experiment a bounded
scope. Current production segmentation yields the following unit lengths
(characters) for the affected blocks: thermal-earring `253, 209, 191, 206,
200`; cognitive `59, 147, 101, 138` and `269, 50, 100, 137, 187`; linguistics
`211, 163, 342, 224, 236` and `152, 250, 208, 168, 203, 248, 261`;
neuroscience `67, 188, 165, 162, 187, 131, 143, 86, 260` and `343, 174,
310, 282, 91`. This shows that the A failures are not explained by one fixed
length threshold. The next implementation should instrument per-unit decode
outcomes and test a generic, conservative semantic rescue for the 300+ character
units, while retaining the source fallback for any unit that remains unsafe.
