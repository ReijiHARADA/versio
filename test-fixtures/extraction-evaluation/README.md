# PDF Extraction Evaluation Studio fixtures

`*.evaluation.json` is a portable bundle with two deliberately separate parts:

- `snapshot`: immutable output from one parser run (`CanonicalDocument` plus Reader projection). It is **not** ground truth.
- `review`: labels entered by a human. A page can contribute a precision score only when `predictedComplete` is set, and a recall score only when `goldComplete` is set.

Keep source PDFs and ad-hoc bundles in `test-data/extraction-evaluation/` (gitignored). Commit only reviewed labels that are suitable as durable fixtures, and do not replace the existing `test-fixtures/real-papers/ground-truth/` files. The evaluation schema is in `src/evaluation/schema.ts`.

Run the Studio with `npm run dev:extraction-eval`, select one local PDF, review and export a bundle. Generate a machine-readable report with `npm run eval:pdf-extraction -- --input path/to/file.evaluation.json`.
