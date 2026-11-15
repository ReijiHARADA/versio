# External parser/translation evaluation v1

Date: 2026-10-09

## Scope

This is an isolated feasibility/accuracy check. Production extraction and translation were not changed.

Fixture: `test-data/real-papers/interactive-jewellery.pdf` (ACM TEI'16 paper).

## Docling 2.135.0

Command (Python 3.12 via `uvx`):

```bash
uvx --python 3.12 docling test-data/real-papers/interactive-jewellery.pdf \
  --to md --to json --no-ocr --output /tmp/versio-docling-v1
```

Runtime: macOS 26 arm64, 25.6 s after model download.

Observed output:

- title and author names were recovered cleanly;
- four affiliation rows were recovered, including the email/marker metadata separately from the affiliation text;
- abstract and section headings were recovered;
- figure 1 was represented as an embedded base64 image;
- publisher copyright/permission text was inserted into the introduction flow;
- the Markdown export is not a drop-in replacement for Versio's canonical blocks because images are emitted as very large inline base64 data and table/figure relations are not mapped to the app's `CanonicalDocument` model.

Conclusion: Docling is a promising **offline comparison extractor**, especially for scanned/complex PDFs, but this run does not justify replacing the existing resolver. It needs an adapter plus post-processing and a broader corpus benchmark.

## GROBID 0.9.1

Docker/Podman is not installed, so a local Java distribution was built from the official 0.9.1 source with Homebrew OpenJDK 21. The service started on `127.0.0.1:8070`; `/api/isalive` returned `true` and `/api/version` returned `0.9.1`. `interactive-jewellery.pdf` was processed with `POST /api/processFulltextDocument` (HTTP 200) into `/tmp/grobid-v1/interactive.tei.xml`.

Observed output:

- title and abstract were recovered;
- affiliations were identified;
- figure 2's caption absorbed the following body paragraph, while Versio's current resolver keeps that boundary separate;
- the author structure was less reliable than the current projection (multiple authors/locations were collapsed into two large author records);
- references were segmented into TEI `biblStruct`, which is useful, but requires a CanonicalDocument adapter.

Conclusion: GROBID is useful as a **secondary scholarly-structure signal**, especially for references and TEI metadata, but this run does not justify replacing the current extraction pipeline.

## Apple Translation framework

The system contains `/System/Library/Frameworks/Translation.framework`. After the English/Japanese language packs were installed in System Settings, a native Swift smoke test compiled and invoked `TranslationSession` successfully. Three fixed inputs produced Japanese output, including the known author-year citation sentence and an interactive-jewellery sentence. The outputs preserved the citation group and numeric facts in this probe:

```text
The study examined 20 participants and found no significant difference.
→ この研究では、20人の参加者を調査しましたが、有意差はありませんでした。

The closest related work ... (Sigure & Koseki, 1998; Marquardt et al., 2011; Benko et al, 2009) ...
→ 指固有の相互作用に関する最も近い関連研究は（Sigure & Koseki, 1998; Marquardt et al., 2011; Benko et al, 2009）によって提示されていますが、モバイルドメインにはどれもありません。
```

Apple documents `TranslationSession` as an on-device native API with an `installedSource` initializer and `prepareTranslation`/translation-task flows; it is not a drop-in HTTP/Python backend. Integration would require a native helper or Tauri-side Swift bridge, language availability checks, and a download state in the app. This is a smoke test, not enough evidence to replace MADLAD; a held-out block benchmark is still required.

## Decision

- Keep MADLAD as production translation for now.
- Keep the current CanonicalDocument extraction pipeline as production.
- Add Docling/GROBID as optional benchmark adapters only after a normalized block-level comparator exists.
- Revisit Apple Translation only with an Xcode/Swift toolchain matching the SDK and a native helper design.

## Same-source Apple vs MADLAD comparison (2026-10-09)

The three inputs below were sent to Apple Translation and to the running Versio MADLAD server with the same source/target languages. This is a fixed diagnostic probe, not a corpus-scale benchmark.

| fixture | Apple | MADLAD | fallback | observation |
|---|---|---|---|---|
| 20 participants / no significant difference | Japanese, 29 chars | `20名の参加者を対象に検討したが, 有意差は認められなかった。` | no | both preserve count and negated significance; Apple is more natural |
| author-year citation sentence | Japanese, 95 chars | `指特異的相互作用に関する最も近い関連の研究は(Sigure & Koseki, 1998; Marquardt et al., 2011; Benko et al, 2009)によって提示されたが, 移動領域ではない。` | no | citation group stays intact in both; MADLAD's `mobile domain` rendering is less precise |
| interactive-jewellery semicolon sentence | Japanese, 89 chars | original English fallback | `partial_unit_fallback`, degenerate output | Apple translates the complete sentence; MADLAD rejects the unit rather than displaying a hallucinated Japanese result |

MADLAD request details are in `/tmp/madlad-three.json`: input tokens 17/32/0 (the last unit was protected/rejected before model accounting), output tokens 29/44/0, wall time approximately 44.9 s/34.9 s/17.6 s. The probe confirms that the current safety gate prevents a visibly fabricated translation for the jewellery sentence, but it also produces a reader-visible fallback where Apple succeeds. It does not establish that Apple is universally better; a larger blind review is required.

## Interactive jewellery recheck

The current source projection now drops standalone contact metadata lines that consist of an email address plus affiliation markers. The targeted extraction test passes and the visible projected blocks contain no `@` email line. Author affiliations remain available in the paper metadata/header instead of being injected above the abstract.

The reference section has **not** been fully repaired by the earlier typography change. The current output still has split bibliography entries (for example entry 30/31 fragments projected as ordinary paragraphs around the reference block). The CSS normalization makes reference typography consistent when a block is correctly classified, but it cannot repair extraction/column grouping. This remains an extraction follow-up: reference continuation detection must use geometry and bibliography context, not paper-specific strings.
