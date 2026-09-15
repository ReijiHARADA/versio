# Academic PDF Extraction Architecture

Production architecture for Paper Reader. Research background: [ACADEMIC_PDF_EXTRACTION_RESEARCH.md](./ACADEMIC_PDF_EXTRACTION_RESEARCH.md).

Source of Truth is **CanonicalDocument**, not pdfLayout, GROBID, Docling, OCR, or a Format Profile.

Paper / Section / PaperBlock are a **projection** for the existing reader, translation queue, and annotations.

## Pipeline

```
Source PDF
    → Native PDF Extraction (pdf.js 3.11 + CMap)
    → NativeDocument          // facts only, no semantic roles
    → Page Classification     // native-text | scanned | garbled | mixed
    → OCR fallback            // Vision, scanned/garbled pages only
    → Generic Heuristics      // pdfLayout as evidence generator
    → Format Detection        // precision-first; else generic
    → Format Profile          // evidence + hard rules if applied
    → Optional Enrichers      // GROBID / Docling when confidence is low
    → Document Resolver
    → CanonicalDocument
    → projectCanonicalToPaper
    → Paper / Section / PaperBlock
    → existing Translation / Reader / Annotation
```

Entry point: `extractAcademicPdf()` (async, File) and `extractFromPages()` (sync, tests).

Import calls only `extractAcademicPdf`. It does not contain column, title, author, figure, or OCR heuristics.

## Responsibilities

| Layer | Owns | Does not own |
|---|---|---|
| NativeDocument | pdf.js strings, bbox, font, metadata | title / heading / paragraph |
| Page classifier | page kind + OCR necessity | final roles |
| Generic (`pdfLayout.ts`) | lines, columns, left→right order, role **candidates** | Canonical roles |
| Format Profile | extra evidence + chrome hard rules after detection | parsing the whole PDF |
| Enrichers | optional extra evidence | replacing native text |
| DocumentResolver | final roles, confidence, relations | UI / DB schema |
| Projection | Paper reader records | re-parsing PDF |

## CanonicalDocument

- `nodes[]` with role, native `text`, bbox, `confidence`, `evidence[]`, `sourceAnchor`
- `relations[]`: `READS_BEFORE`, `CHILD_OF`, `CAPTION_OF`, `AFFILIATED_WITH`
- `format`: detection scores and applied id
- `diagnostics`: layout, reading order, text integrity, semantic, format, relation (legacy column/unicode/paragraph aliases kept)

`RoleCandidate` retains the generic leading role for compatibility, but also
contains competing `roleScores` and a native-text `StyleSignature` (font
family/size, weight, indent, spacing, capitalization). The Resolver chooses
the Canonical role with precision-first thresholds: weak heading, table, and
equation evidence falls back to paragraph.

Heading hierarchy uses numbering when present, then style and document
sequence. This preserves body-size subsection styles without turning every
short sentence into a heading. Equation evidence combines symbolic density,
geometry, and prose/statistical-result negatives instead of treating `=` or
`p <` as sufficient evidence.

## Evidence

```ts
type ExtractionEvidence = {
  source: "pdf-native" | "generic-heuristic" | "format-profile" | "ocr" | "grobid" | "layout-model";
  label: string;
  confidence: number;
  reason?: string;
  page?: number;
  bbox?: BoundingBox;
};
```

Native text is never replaced by GROBID/VLM/OCR when the pdf.js layer is healthy.

## Format Profile

Profiles are not alternate parsers. They add evidence and, **after** a confident detection, hard-rule chrome (ACM permission boilerplate, IEEE licensed-use footer).

Detection stays conservative:

- `APPLY_MIN = 0.75`
- `APPLY_MARGIN = 0.12`
- Precision over recall. Ambiguous → `generic`.

Catalog `formatFamily` is benchmark Ground Truth only.

## Fallback cascade

1. Native + Generic + Format Profile. If overall confidence is high, stop.
2. Header/semantic weak → GROBID enricher (`GROBID_URL` local only).
3. Layout/reading-order weak → Docling enricher (stub; not bundled).
4. Scanned/garbled pages → Apple Vision OCR **before** generic parse.

GROBID and Docling are not production dependencies.

## Relations → Projection

- `READS_BEFORE` is a path over readable nodes. Projection topological-sorts; on a cycle it falls back to generic order.
- `CHILD_OF` uses numbering prefixes, then a level stack. Projection writes `Section.parentSectionId`.
- `CAPTION_OF` links caption nodes to figure/table region nodes. A table region is high confidence only when nearby native text has aligned, short/numeric cell evidence; a caption-only proposal remains a low-confidence image fallback. Projection does not send resolved table cells to paragraph translation.
- `AFFILIATED_WITH` uses superscript/symbol markers, then 1-to-many or positional fallback. `Paper.authors` remains a flat projection.

## Directory

```
src/services/pdfExtraction/
  pipeline/extractAcademicPdf.ts
  native/
  page/
  generic/          # facade over pdfLayout.ts
  formats/
  resolver/
  canonical/
  projection/toPaper.ts
  enrichers/        # ocr, grobid, docling
```

`pdfLayout.ts` is kept as the generic algorithm kernel so column order is not rewritten during the move. `structureService.analyzeStructure` is a compatibility wrapper around `extractFromPages`.

## Translation safety

Before MADLAD, the server protects citations, DOI/URLs, statistical notation,
p-values, sample-size notation, and measurements with restoreable placeholders.
After translation, the client scores language integrity, repetition, length,
and source scientific invariants. Outputs that lose a critical invariant are
rejected so the reader retains the original text rather than a fluent error.

### Affiliation line-wrap boundary

Affiliation lines may wrap after a comma or conjunction and lose the
institution marker on the continuation line. The generic grouping layer now
allows a conservative same-page/same-column affiliation continuation when line
spacing and font size match the masthead and the preceding text ends in a
syntactic connector (or the next line contains an institution marker). This
keeps affiliation metadata together without allowing a body paragraph to be
absorbed after the masthead.

### Author metadata is a page-boundary barrier

Contributor notes and correspondence/e-mail metadata can sit at the bottom of a page and be followed by lowercase body text on the next page. The continuation resolver treats generic metadata markers as a non-stitchable boundary, so page-boundary repair cannot turn author notes into translated body prose. This is a boundary rule, not a paper-specific name or venue rule.

### Native source integrity invariant

Layout blocks expose an integrity check that reconstructs their text from ordered native lines, preserving punctuation and line provenance while allowing only whitespace normalization and legitimate line-break hyphen joining. Extraction fixtures assert this invariant before projection to translation blocks.

### Benchmark source-integrity metric

Each extraction baseline now reports the proportion of canonical blocks reproducible from native ordered lines. This metric is calculated independently of translation and makes punctuation/text loss visible alongside reading-order and structure scores.

### Table evidence precision

A line containing multiple native text items is not sufficient table evidence because ordinary PDF.js word extraction has the same shape. The generic table detector now requires repeated horizontal start columns across multiple rows, plus compact-cell or numeric evidence, and ignores masthead metadata. Low-confidence candidates continue to fall back to paragraph in the resolver.

### Sentence-like blocks are not table grids

Word-level native extraction can make ordinary paragraphs look like aligned cells. The table evidence generator now rejects multi-line, long, sentence-like blocks before grid scoring. This reduces table false positives while retaining compact numeric or short-cell grids; table-heavy fixtures remain required to validate recall.

### Caption orientation

Table-region association is orientation-agnostic: candidate native rows may appear above or below a caption. When no cell geometry is available (for example an image-only table), the resolver preserves the caption and emits a low-confidence fallback instead of fabricating a structured grid.

### Numbered list boundaries

Flattened native text may contain an introduction followed by numbered items. Projection recognizes bounded integer list markers and emits source-preserving parts, while decimal measurements remain intact. This prevents list content from being sent downstream as one paragraph without adding paper-specific vocabulary.

### Numbered list/reference disambiguation

A numeric prefix alone does not make a block bibliographic. During projection, bounded numbered prose markers (`1.`–`20.` / `1)`–`20)`) without nearby year evidence are treated as list content even if a generic upstream candidate proposed `reference`. Reference classification remains enabled for explicit References sections and citation-shaped entries.

### Inline publisher metadata boundaries

Some PDFs flatten masthead metadata, DOI, and the first body sentence into one native text item. The line grouper recognizes a DOI URL with substantive trailing prose as a boundary and proportionally preserves the native bbox for both pieces. Copyright detection uses generic legal/publisher markers and small-type evidence; no venue-specific string is required.
