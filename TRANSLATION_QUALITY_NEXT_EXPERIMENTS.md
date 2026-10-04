# Next translation-quality experiments

The current 52-paper fresh baseline has 58 unique ordinary-body rows and 10 reader-visible fallbacks (17.2%). Four are partial-unit source fallbacks; six are whole-item/quality fallbacks. The current objective remains <=5% without unsafe accepts.

## Proven evidence

- qwen2.5:7b: 0/5 safe rescues on the isolated quality-risk cohort.
- qwen3:14b (no-think): 1/5 automated passes; the one reviewed output was severity 1 wording only.
- qwen2.5:14b: 1/5 automated passes, but the accepted row was a false accept (`照片` mixed into Japanese and malformed final relation).
- Current MADLAD: all five risk rows returned HTTP 200, but the client gate correctly rejected unsafe outputs.

## Next experiments

1. Add a language-identification verifier based on a general Japanese-vs-Chinese scorer or model, not a word blacklist. Evaluate on a held-out set containing both legitimate Japanese kanji compounds and mixed-script contamination.
2. Evaluate a two-model consensus cascade only on post-model quality failures. Require agreement on source invariants and discourse relations; reject disagreement. Measure rescue and false-accept rates separately.
3. Re-run the five-row cohort plus at least 20 held-out ordinary rows after each verifier change. Do not tune on the same accepted row.
4. Keep partial-unit projection separate from whole-item fallback in release metrics.

A production change requires: zero severity>=2 false accepts in the reviewed cohort, no regression in extraction tests, and a measured reduction in whole-item fallback rather than merely more source fallback.
