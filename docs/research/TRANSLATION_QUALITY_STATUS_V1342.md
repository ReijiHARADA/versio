# Translation quality status v1342

## Current measured baseline

- Fresh catalog: 52 papers, 102 sampled units.
- Ordinary-body: 59 rows, 58 unique source hashes.
- Reader-visible ordinary fallback: 10/58 (17.2%).
- Partial-unit source projection: 4 rows.
- Whole-item or quality fallback: 6/58 (10.3%).
- Target: <=5% ordinary-body reader-visible fallback with no severity>=2 unsafe accepts.

## What is established

- Extraction/read-order regression: 108/108 passed.
- Translation/quality unit tests: 235/235 passed.
- MADLAD embedding integrity is verified at startup and current risk-row output is reproducible.
- qwen2.5:7b: 0/5 safe rescues.
- qwen3:14b no-think: 1/5 automated passes; reviewed candidate severity 1.
- qwen2.5:14b: 1/5 automated pass, but reviewed as an unsafe false accept because of Chinese contamination and malformed relation.

## Release position

Do not enable a global alternate-model cascade, relax relation gates, or add output-word blacklists. The current evidence does not prove a safe path to <=5%. Keep source fallback for unresolved semantic risks and preserve partial-unit projection for independently validated units.

## Required next evidence

1. A held-out language scorer that distinguishes Japanese kanji compounds from Chinese contamination without a word blacklist.
2. At least 20 held-out ordinary-body rows for any proposed verifier or consensus cascade.
3. Manual review showing zero severity>=2 false accepts and a measured reduction in whole-item fallback.
4. Regression tests for extraction, reading order, scientific invariants, and cache/model versioning.
