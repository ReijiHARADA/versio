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

## GROBID

No local GROBID service is running (`127.0.0.1:8070/api/isalive` unavailable). Docker/Podman is not installed in this environment, so a reproducible local GROBID comparison could not be run without introducing a separate server/runtime installation. No production change was made.

## Apple Translation framework

The system contains `/System/Library/Frameworks/Translation.framework`, but the installed Command Line Tools Swift compiler and macOS 26 SDK are from different Swift toolchain builds. A minimal `import Translation` program fails before execution with an SDK/toolchain mismatch. Therefore no translation quality result was produced. Apple Translation is also a native Swift framework, not a drop-in HTTP/Python backend for the existing translation-server process; integration would require a native helper or Tauri-side Swift bridge and availability/model-download handling.

## Decision

- Keep MADLAD as production translation for now.
- Keep the current CanonicalDocument extraction pipeline as production.
- Add Docling/GROBID as optional benchmark adapters only after a normalized block-level comparator exists.
- Revisit Apple Translation only with an Xcode/Swift toolchain matching the SDK and a native helper design.
