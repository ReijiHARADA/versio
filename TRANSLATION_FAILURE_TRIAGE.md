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
