# Translation model routing decision (audit checkpoint)

Date: 2026-09-15

The same 12 model-quality rows from
`test-data/real-papers/reports/model-quality-unsafe-v8.json` were used for every
comparison. Surface metrics are not acceptance criteria; a candidate must also
preserve the reviewed source claims and relations.

## Evidence

| Candidate | Same-fixture result | Decision |
| --- | --- | --- |
| MADLAD greedy | Current baseline; 12 rows are severity >= 2 by manual review | Keep as primary, improve/evaluate |
| M2M100 1.2B greedy | 12 rows; 0/12 manually reviewed rescues | Reject as automatic fallback |
| M2M100 1.2B beam=4 | 12 rows; 0/12 manually reviewed rescues | Reject as automatic fallback |
| M2M100 418M | 12 rows; truncation/numeric corruption | Reject as automatic fallback |
| Helsinki Opus EN-JA | 12 rows; severe drift and truncation | Reject as automatic fallback |

The candidate selector reports (`candidate-selection-safety-v3.json`) are
therefore audit-only. Numeric/negation/contrast signals alone selected 9/12,
but source-claim review rejected all 12. No candidate currently demonstrates a
safe rescue rate above zero.

## Production rule

Do not enable cascade, model replacement, or candidate selection from these
results. A future candidate must use the exact same fixture, pass all hard
scientific invariants, and undergo source-claim review before routing is
changed. A candidate that is merely more fluent or longer is not sufficient.

## Next experiment

Evaluate a distinct, license-approved local model only if it is already cached
or explicitly approved for download. Otherwise improve the audit-only semantic
relation evaluator and collect a reviewed positive rescue before changing
production. Keep ordinary-body fallback and unsafe-false-accept metrics as
separate gates.

## License screening

`Helsinki-NLP/opus-tatoeba-en-ja` is Apache-2.0 according to its official
model card, but its same-fixture output is unsafe. `facebook/nllb-200-distilled-600M`
is CC-BY-NC-4.0 according to its official model card, so it is excluded from
product-candidate downloads unless the product's legal use is explicitly
confirmed. No model was downloaded in this checkpoint.
