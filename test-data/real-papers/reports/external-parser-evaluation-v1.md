# External parser/translation evaluation v1

Date: 2026-10-09

## Scope

This is an isolated feasibility/accuracy check. Production extraction and translation were not changed.

Fixture: `test-data/real-papers/interactive-jewellery.pdf` (ACM TEI'16 paper).

## Docling 2.135.0

Command (Python 3.12 via `uvx`):

```bash
uvx --python 3.12 docling test-data/real-papers/interactive-jewellery.pdf \
  --to md --to json --no-ocr --output /tmp/paper-reader-docling-v1
```

Runtime: macOS 26 arm64, 25.6 s after model download.

Observed output:

- title and author names were recovered cleanly;
- four affiliation rows were recovered, including the email/marker metadata separately from the affiliation text;
- abstract and section headings were recovered;
- figure 1 was represented as an embedded base64 image;
- publisher copyright/permission text was inserted into the introduction flow;
- the Markdown export is not a drop-in replacement for Paper Reader's canonical blocks because images are emitted as very large inline base64 data and table/figure relations are not mapped to the app's `CanonicalDocument` model.

Conclusion: Docling is a promising **offline comparison extractor**, especially for scanned/complex PDFs, but this run does not justify replacing the existing resolver. It needs an adapter plus post-processing and a broader corpus benchmark.

## GROBID 0.9.1

Docker/Podman is not installed, so a local Java distribution was built from the official 0.9.1 source with Homebrew OpenJDK 21. The service started on `127.0.0.1:8070`; `/api/isalive` returned `true` and `/api/version` returned `0.9.1`. `interactive-jewellery.pdf` was processed with `POST /api/processFulltextDocument` (HTTP 200) into `/tmp/grobid-v1/interactive.tei.xml`.

Observed output:

- title and abstract were recovered;
- affiliations were identified;
- figure 2's caption absorbed the following body paragraph, while Paper Reader's current resolver keeps that boundary separate;
- the author structure was less reliable than the current projection (multiple authors/locations were collapsed into two large author records);
- references were segmented into TEI `biblStruct`, which is useful, but requires a CanonicalDocument adapter.

Conclusion: GROBID is useful as a **secondary scholarly-structure signal**, especially for references and TEI metadata, but this run does not justify replacing the current extraction pipeline.

## Apple Translation framework

The system contains `/System/Library/Frameworks/Translation.framework`. With the matching Xcode beta toolchain, a native Swift smoke test compiled and invoked `TranslationSession` successfully, but translation returned `TranslationError.Cause.notInstalled` for English→Japanese. The required language pack is not installed and the headless helper cannot complete the user-facing download flow. Apple documents `TranslationSession` as an on-device native API with an `installedSource` initializer and `prepareTranslation`/translation-task flows; it is not a drop-in HTTP/Python backend. Integration would require a native helper or Tauri-side Swift bridge plus language availability/download UI. No quality score was produced because no translation output was available.

## Decision

- Keep MADLAD as production translation for now.
- Keep the current CanonicalDocument extraction pipeline as production.
- Add Docling/GROBID as optional benchmark adapters only after a normalized block-level comparator exists.
- Revisit Apple Translation only with an Xcode/Swift toolchain matching the SDK and a native helper design.
