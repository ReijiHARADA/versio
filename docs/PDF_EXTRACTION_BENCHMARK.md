# PDF Extraction Benchmark

This is a development-only evaluation layer. It evaluates extraction before
translation, and never changes a production parser or a translation model.

## Metrics

The benchmark follows the task separation used by
[OmniDocBench](https://github.com/opendatalab/OmniDocBench):

It shares metric vocabulary, not a leaderboard: Versio uses its own
frozen scientific-PDF cohorts, human-review workflow, and split/leakage rules.
It also adds Block F1, paragraph-boundary F1, and caption-relation F1 because
those structures directly affect the Reader projection.

| Dimension | Metric | Direction | Requirement |
| --- | --- | --- | --- |
| Text | CER, NED | lower | complete text annotation |
| Layout/roles | IoU (0.5) role-aware Block F1 | higher | complete block annotation |
| Reading order | block-ID edit distance | lower | complete ordered block list |
| Paragraphs | adjacent-boundary F1 | higher | complete boundary annotation |
| Figure/table ↔ caption | relation F1 | higher | complete human-authored caption pairs |
| Tables | ordered-tree TEDS | higher | complete table trees |
| Display formula | NED, CDM | NED lower, CDM higher | complete formula annotations |

`formula_cdm` is deliberately `N/A` until scores are supplied by the official
local CDM renderer. Formula NED is not called CDM. This avoids claiming a
render-equivalence score from a text-only approximation.
Block F1 requires both region and role agreement. Text, reading order, and
paragraph-boundary metrics instead align blocks by region, so a role mistake
does not hide a separate text or ordering mistake.

Every report emits both `evaluatedDocuments` and `evaluatedUnits`. Its displayed
`value` is explicitly tagged `macro_document_mean`: each reviewed paper has
equal weight, while the unit count exposes the amount of supporting evidence.
A dimension without complete annotation is `null`/`N/A`, never 100%.
An empty gold selection fails by default, so a CI job cannot pass without
actually evaluating a reviewed document. Use `--allow-empty` only to inspect
an intentionally empty split.
For a regression gate, use `--require-metrics blockF1,textCer,readingOrder`
to fail when any required metric has zero evaluated documents rather than
treating N/A as a successful run.
When a full-document parser artifact is scored against selected annotated
pages, order, boundary, and caption-relation units outside those pages are
excluded; only the relative order and relations inside the annotated scope are
evaluated.
If the reviewed selection contains no table or no display formula at all, that
metric is also N/A rather than an empty-set perfect score.
Reading-order edit distance treats each aligned block ID as one token; it does
not compare the spelling of parser IDs.
Reading-order scoring also requires the prediction artifact to list every
scoped predicted block exactly once. An incomplete parser order is `N/A`, not
a shorter sequence that can hide ordering failures.

The runner validates gold before scoring. Declaring a dimension `complete`
without its block text, ordered IDs, boundary pairs, table tree, or
human-authored formula text/LaTeX is an error, not an implicit perfect score.
It also validates parser artifacts (unique IDs, finite positive regions,
well-formed tables, and known boundary references) before scoring. A parser
may provide a partial reading order, but that dimension remains N/A until the
order covers every scoped block exactly once.

## Autonomous development gate

New human annotation is not required to reject obvious regressions during
development. The bounded seven-paper development gate reuses only the existing
fixture gold already stored under `test-fixtures/real-papers/ground-truth`:

```sh
npm run bench:pdf-extraction:development
```

It checks diverse development layouts (ACM, IEEE, Springer, KCI, OzCHI,
Elsevier, arXiv) in isolated per-PDF workers with a default 240-second
per-paper timeout, progress, partial report, and non-zero failure status. It
writes a local report. Workers use the project's local `vite-node`, so this
gate has no registry/network dependency. It is a regression signal only:
the documents are development fixtures and must not be reported as validation
or held-out generalization accuracy. It neither uses the current extraction as
gold nor starts translation.

The gate also fails label-free invariants: native source text must survive
reconstruction (`sourceIntegrityRate = 1`) and every Canonical node must retain
PDF provenance (`canonicalProvenanceRate = 1`). These are integrity checks, not
claims about reading order or semantic roles.

## Unknown-document health gate without new labels

Before human review is available, run a frozen validation or held-out cohort
through a separate label-free gate:

```sh
npm run audit:pdf-extraction:unlabeled -- --cohort test-fixtures/extraction-benchmark/validation-cohort-v1.json --all
```

Each hash-pinned PDF is extracted twice in an isolated worker. The gate rejects
non-deterministic output, invalid or unanchored Canonical regions, dangling or
self-referential relations, non-reproducible native layout text, and Reader
blocks that cannot be traced back to a Canonical node. It writes a local report
and has per-paper timeout/progress/failure handling. It does **not** calculate
or imply CER/NED, Block F1, reading-order accuracy, TEDS, or CDM: those remain
N/A until human-authored ground truth exists.

The report also lists strong native formula and table-caption anchors that do
not overlap an `equation` or `caption` Canonical node. They are triage hints for
which unknown pages to inspect next, not false-positive/false-negative labels
and never gate the run by themselves.

## Data isolation

- The existing 113-paper corpus is **development** data, including all of its
  derived tests and annotations.
- A held-out document must have a unique `leakageGroup`: do not share the same
  PDF, source hash, publisher template family, or near-duplicate source with a
  development/validation document.
- `test-fixtures/real-papers/heldout-catalog-v1.json` is not an independent
  extraction benchmark: as of 2026-10-22, five of its six filenames also occur
  in the development catalog. It may be useful for translation diagnostics, but
  must not be used to claim extraction generalization.
- PDFs, raw snapshots, reports and external-CDM outputs remain in
  `test-data/extraction-evaluation/` (gitignored). Commit only reviewed gold
  labels under `test-fixtures/extraction-benchmark/gold/`.

The manifest at `test-fixtures/extraction-benchmark/manifest.json` records the
split and leakage group. Its one synthetic development fixture only exercises
the evaluator; it is not a quality claim. A held-out score requires reviewed
gold, not a parser snapshot.

`independent-cohort-v1.json` freezes five local, CC-licensed candidate PDFs
from publisher/template families absent from the development catalog (JMIR,
MDPI, Cureus, Wiley, BMC). They are source-hash- and publisher-family-disjoint
from the locally available development corpus (verified by the command below),
but remain **unscored candidates** until a reviewer completes the gold labels.

`validation-cohort-v1.json` separately freezes four candidates (Dove Medical
Press, SAGE, Oxford University Press, PNAS). Its publisher families are
disjoint from both development and held-out cohorts, so validation tuning
cannot consume the independent test set.

```sh
npm run audit:extraction-benchmark-cohort
npm run audit:extraction-benchmark-splits
```

The cohort check detects duplicate candidate IDs/hashes/groups, changed source
files, source-hash collisions, and publisher-family collisions with the
development catalog. A manual template-family check remains required for a
publisher label that is too broad to identify a specific layout.

Generate fresh Versio prediction artifacts only on explicit selection;
this invokes no translation service:

```sh
npm run snapshot:extraction-benchmark-cohort -- \
  --ids heldout-nature-machine-learning-mobility,heldout-plos-drug-side-effects
```

Use `--all` only to process the frozen five-paper cohort. The command verifies
each local PDF's SHA-256 against the frozen cohort manifest before extraction,
reports per-paper progress, honours `--timeout-ms`, and stops cleanly on
`SIGINT`.

Create a local bundle for visual review in Evaluation Studio (then open the
same source PDF and import this bundle):

```sh
npm run prepare:extraction-benchmark-review -- --id heldout-jmir-shopautiplan
```

Use `--all` only for an explicit cohort-wide review preparation. It verifies
the local PDF hash before annotation, reports progress, writes each local
bundle independently, and honors timeout/SIGINT. Existing review bundles are
never overwritten unless `--overwrite` is explicitly supplied:

```sh
npm run prepare:extraction-benchmark-review -- --all --timeout-ms 300000
```

Track which human-reviewed pages are actually eligible for each metric:

```sh
npm run audit:extraction-benchmark-review-progress
```

For an in-progress bundle, create a non-scoring extraction triage queue:

```sh
npm run triage:extraction-partial-review -- --input /path/to/paper.evaluation.json
```

It groups explicit `extra` deletions, role corrections, and human-added
missing regions by role and prioritizes pages. These are partial observations,
not exhaustive gold or training labels, so the command never emits accuracy.

## Artifact format

`src/evaluation/benchmark/schema.ts` defines two parser-neutral JSON artifacts:

- `ExtractionBenchmarkGold`: human-authored source hash, split, completeness,
  blocks, order, boundaries, tables, and formulas.
- `ExtractionBenchmarkPrediction`: a parser's blocks and optional structure.
  This lets Versio, Docling, and GROBID be scored against identical gold.

Block, table, and formula matching is one-to-one by page-region IoU (0.5), not
by parser node ID. IDs remain diagnostics only, so an external parser can be
compared fairly without copying Versio identifiers.

`predictionFromSnapshot` in `src/evaluation/benchmark/adapters.ts` converts an
Evaluation Studio snapshot into a Versio prediction artifact. It maps
unsupported internal roles to `other`. Equations are exported as their native
linearized `text`, never fabricated LaTeX. It exports Canonical paragraph
splits and Reader-native table rows when those structures exist, but never
invents missing rows, LaTeX, or gold labels.

Export a Studio bundle's immutable snapshot for a benchmark run:

```sh
npm run export:extraction-benchmark-prediction -- \
  --input test-data/extraction-evaluation/paper.evaluation.json \
  --output test-data/extraction-evaluation/predictions/paper.prediction.json
```

After a reviewer has marked a page complete with both predicted and gold
coverage, create *block-level* gold from that human-reviewed bundle:

```sh
npm run create:extraction-benchmark-gold -- \
  --input test-data/extraction-evaluation/paper.evaluation.json \
  --output test-data/extraction-evaluation/gold/paper.gold.json \
  --id heldout-paper --split heldout --leakage-group publisher-template-family
```

The converter refuses incomplete pages. It can produce reviewed block/role
labels, but **never** adopts parser text as text gold. To score CER/NED, enter
`正しいテキスト` for every evaluated block and mark `テキスト` complete; otherwise
text remains N/A. Boundaries, table trees, and formula LaTeX likewise remain
N/A until their complete gold targets are authored.

For reading order, Studio now has a `正しい読み順` editor. Add every canonical
block for the reviewed page, place them with the arrow controls, then mark
`readingOrderComplete`. The converter enables the metric only when that list
contains every block exactly once; otherwise it remains N/A.
For a block that continues onto a later PDF page, add it to each page's list:
the exported order retains the page-region ID and does not collapse it back to
the node's first page.

For paragraph boundaries, use `正しい段落境界` to author each gold pair, then
mark `段落境界` complete. The converter uses these pairs rather than assuming
that adjacent predicted paragraphs form the gold boundary set.

For figure/table associations, use `正しい図表とキャプションの対応` to author each
caption → figure/table pair, then mark `図表関係` complete. The common artifact
uses page-region IDs, so parser-specific relation IDs never become gold.

For each selected equation, enter reviewed formula text for Formula NED and,
when available, reviewed LaTeX for CDM; for each table, enter a JSON
tree such as `{"tag":"table","children":[{"tag":"tr","children":[{"tag":"td","text":"cell value"}]}]}`.
`text` is optional, but when supplied it is included in TEDS so cell-content
corruption is not hidden behind an otherwise correct table shape. Mark the
corresponding `数式` or `表構造` completeness checkbox only after every such
block on the page is authored. Formula NED compares like representations
(linear text or LaTeX), TEDS then becomes scoreable, and CDM remains N/A
until an official local CDM result is supplied.
An equation added as a `認識漏れ` region appears in the same formula editor once
its role is set to `equation`; author its formula text as well so missing
formulas contribute to both Block Recall and Formula NED rather than silently
dropping out of the metric.

When a local official CDM environment is available, export only IoU-matched
gold/predicted formula pairs, run that evaluator, then attach the returned
per-prediction score:

```sh
npm run export:extraction-benchmark-cdm -- --gold gold.json --prediction prediction.json --output cdm-input.json
npm run apply:extraction-benchmark-cdm -- --prediction prediction.json --cdm-input cdm-input.json --scores cdm-scores.json --output prediction-with-cdm.json
```

`cdm-scores.json` is either `{ "scores": [{ "pred_idx": "…", "score": 93.2 }] }`
or a `{ "predicted-id": 93.2 }` map. The apply command checks every score
against the exported CDM input's source hash and matched prediction formula
IDs; score output for another PDF or formula pair is rejected. Scores are
never synthesized by this project.

No prediction is promoted to gold automatically.

## Commands

Run focused metric tests:

```sh
npx vitest run src/test/evaluation/standardMetrics.test.ts src/test/evaluation/benchmarkEvaluate.test.ts
```

Score already-created artifacts (bounded selection by default):

```sh
npm run eval:extraction-benchmark -- \
  --gold-dir test-fixtures/extraction-benchmark/gold \
  --prediction-dir test-data/extraction-evaluation/predictions \
  --split heldout --output test-data/extraction-evaluation/heldout.report.json
```

For an explicit full run, add `--all`. The runner prints document progress,
honors `--timeout-ms`, writes the completed partial report on `SIGINT`, and
returns a non-zero status when interrupted or timed out.

Reports include category slices for publisher, discipline, layout and language,
plus each document's critical failures. A reviewed zero-score paragraph
boundary, caption relation, or table TEDS result is critical; so are a 0.25+
CER, reading-order distance, or formula NED. Unannotated dimensions remain
N/A and never create a critical failure. Compare a later run only against the
same source hashes:

```sh
npm run eval:extraction-benchmark -- ... --compare previous.report.json
```

The comparison lists every comparable metric delta and marks a regression using
the correct direction (lower is better for CER/NED/reading order; higher is
better for F1/TEDS/CDM). Non-overlapping or unannotated metrics remain N/A.
Add `--fail-on-regression` to make a comparable regression exit non-zero for a
CI/release gate; it does not fail for N/A or a source-hash mismatch. Add
`--fail-on-critical` to fail only when a reviewed document has a critical
failure; N/A dimensions remain non-failing.

## Annotation order

1. Select 4–8 source-hash-disjoint papers across publisher/layout/discipline.
2. Assign them to `heldout` before reviewing output. Preserve the source hash.
3. Annotate a page completely for each dimension being scored. In particular,
   CER/NED requires explicitly typed `正しいテキスト` for every block; a correct
   verdict alone is not text ground truth. Otherwise leave that dimension
   unchecked so it stays N/A.
4. Run the current parser and competitors into separate prediction artifacts.
5. Compare reports by split and metric, including critical failures; do not use
   the development score as a release-quality claim.
