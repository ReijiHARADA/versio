# Mobile EPUB storage benchmark

Generated: 2026-11-04T05:34:08.082Z

This measures the exact one-paper phone-sync output: EPUB 3 with the current mobile image optimization enabled. It runs the browser extraction path, creates a Paper Package in memory, and calls the production EPUB exporter. The EPUB is itself a ZIP container; there is no outer ZIP for one-paper phone sync.

Translation is deliberately not run. Extracted original text is used as the ordinary untranslated fallback, so these numbers measure reflow and retained visual assets, not the small language-dependent difference between English and Japanese text encodings.


The benchmark does not change image quality, dimensions, or encoder settings to improve the result. It uses the current phone-sync exporter default: ordinary PNG figures may be converted to JPEG at quality 0.92 and capped at 1600 px only when the result is smaller; tables retain their PNG assets.

## Coverage

- Discovered PDF paths: 1511
- Exact-content duplicates excluded from independent statistics: 79
- Unique PDF contents: 1432
- Measured: 1432; successful: 1423; failed: 9; unmeasured: 0
- Success rate: 99.4%


## Failures

| Source PDF | Error |
| --- | --- |
| `test-fixtures/real-papers/pending-pdfs/epmc-a-physiology-based-mathematical-model-of-the-renin-angiotensin-system-bo.pdf` | page.evaluate: Target crashed  |
| `test-fixtures/real-papers/pending-pdfs/epmc-crispr-based-functional-genomic-screening-in-neurodegeneration-mechanist.pdf` | page.evaluate: Target crashed  |
| `test-fixtures/real-papers/pending-pdfs/epmc-engram-cell-vulnerability-in-neurodegeneration-from-mechanistic-insights.pdf` | page.evaluate: Target crashed  |
| `test-fixtures/real-papers/pending-pdfs/epmc-grasp-a-response-locked-paradigm-that-reveals-low-beta-desynchronisation.pdf` | page.evaluate: Target crashed  |
| `test-fixtures/real-papers/pending-pdfs/epmc-machine-learning-and-deep-learning-for-earthquake-monitoring-a-systemati.pdf` | page.evaluate: Target crashed  |
| `test-fixtures/real-papers/pending-pdfs/epmc-perceived-user-experience-comfort-and-ergonomics-of-an-add-on-backstop-f.pdf` | page.evaluate: Target crashed  |
| `test-fixtures/real-papers/pending-pdfs/epmc-st-hadp-spatio-temporal-hierarchical-attention-diffusion-policy-for-long.pdf` | page.evaluate: Target crashed  |
| `test-fixtures/real-papers/pending-pdfs/epmc-use-of-artificial-intelligence-in-education-and-training-of-radiology.pdf` | page.evaluate: Target crashed  |
| `test-fixtures/real-papers/pending-pdfs/epmc-validity-of-digital-measurement-of-visual-acuity-and-contrast-sensitivit.pdf` | page.evaluate: Execution context was destroyed, most likely because of a navigation. |

## Results (successful PDFs only)

- Original PDFs: 3075.84 MiB
- Synced EPUB files (actual compressed container): 1189.10 MiB
- EPUB payload before ZIP compression: 1359.73 MiB
- Mean per-paper reduction: 52.7%
- Median per-paper reduction: 61.7%
- Total-capacity reduction (sum of bytes): 61.3%
- Papers whose EPUB was not smaller: 124 / 1423

Images/tables in the exported EPUB account for 1263.17 MiB before EPUB ZIP compression. The exporter retained 10968 extracted figure/table assets; it dropped 0. 5210 visual blocks had no raster asset in the extraction package and therefore use their text/equation fallback rather than being silently counted as retained images.

## Content profile

Profiles use the share of uncompressed EPUB payload occupied by retained image/table assets: text_centered <10%, mixed 10–<50%, asset_centered ≥50%.

| Profile | PDFs | Mean reduction | Median reduction | Total reduction | EPUB ≥ PDF |
| --- | ---: | ---: | ---: | ---: | ---: |
| asset_centered | 1224 | 47.3% | 54.6% | 59.5% | 117 |
| mixed | 47 | 92.0% | 95.3% | 96.4% | 0 |
| text_centered | 152 | 84.3% | 95.8% | 97.7% | 7 |

## Presentation claim

Use the **total-capacity reduction** only if this final run has no unmeasured PDFs, with this scope note: “In a local corpus of 1423 successfully converted unique academic PDFs, Versio’s phone-sync EPUBs used 61.3% less total storage than the source PDFs; image-heavy papers can be larger.” Do not call it an unconditional product-wide average, and retain the success/failure count in speaker notes.

## Reproduction

`npm run bench:mobile-epub-storage -- --all --output test-data/real-papers/reports/mobile-epub-storage-latest.json`

The raw per-paper results are at `test-data/real-papers/reports/mobile-epub-storage-merged.json`; no original PDFs or EPUBs are committed.
