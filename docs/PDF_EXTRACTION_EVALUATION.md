# PDF Extraction Evaluation Studio

The Studio is a development-only, standalone Vite entry at `/eval.html`. It never enters the Paper Reader router, starts no translation server, and does not modify a Paper Package or SQLite.

## Start

```bash
npm run dev:extraction-eval
```

Select one local PDF. The browser calculates a SHA-256 identifier, uses the existing PDF.js 3.11 extraction plus `extractFromPages`, and renders the PDF beside either `CanonicalDocument` or the Reader projection. Reviews are automatically saved in browser local storage by source hash. Use **保存/書出し** to produce a portable `*.evaluation.json` bundle and **bundle読込** to resume it on another browser.

For repeatable local work, place PDFs, bundles, and reports in `test-data/extraction-evaluation/`; it is gitignored. Commit only durable human-reviewed labels under `test-fixtures/extraction-evaluation/`, after deciding they are suitable fixtures. Existing `test-fixtures/real-papers/ground-truth/` files are untouched.

## Review protocol

1. Select a block in the PDF or right pane; selection highlights the other pane. Record its verdict, correct role, error types, severity, and comment.
2. Drag an empty PDF region to record a missing gold-side element. The displayed viewport and saved coordinates are both rotation-aware PDF.js coordinates.
3. Mark each page as complete only when it has been reviewed. Set `predictedComplete` only if all relevant predicted nodes were checked; set `goldComplete` only if missing gold elements have also been annotated. The other coverage flags preserve the audit scope for boundaries, order, and relations.
4. Review visible `READS_BEFORE` and `CAPTION_OF` relations for reading order and figure/table-caption pairing. Review the adjacent paragraph-boundary pairs as well. No relation is inferred if it is absent from the parser output.

## Quantitative report

```bash
npm run eval:pdf-extraction -- --input test-data/extraction-evaluation/paper.evaluation.json
npm run eval:pdf-extraction -- --input current.evaluation.json --compare previous.report.json --output current.report.json
```

The report aggregates paper, page, and role metrics and includes evaluated counts. Precision is only reported for pages marked `predictedComplete`; recall is only reported for pages marked `goldComplete`; F1 requires both. Otherwise the field is JSON `null` (N/A), never an accidental 100%. Snapshot parser metadata allows the same labels to evaluate a future Docling or GROBID adapter without production integration.

Current limitation: the boundary score is a conservative count (explicit predicted pairs plus merge/split labels), rather than a full text-span alignment. Relation scoring covers parser-emitted `READS_BEFORE` and `CAPTION_OF` relationships; annotating wholly missing relations is represented in the schema but has no dedicated creation UI yet.
