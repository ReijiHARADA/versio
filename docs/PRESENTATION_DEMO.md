# Presentation demo fixture

This is a filming-only path. `npm run tauri:demo` uses a dedicated Tauri config and Vite `demo` mode; ordinary builds and imports always use `extractAcademicPdf`. The fixture is not an extraction result, is excluded from extraction benchmarks, and must not be presented as extraction or translation accuracy.

## Content

- **Reader paper:** Gemperle, Kasabach, Stivoric, Bauer, Martin, “Design for Wearability” (ISWC 1998), from the local `test-data/real-papers/design-for-wearability.pdf`.
  - Body paragraphs, figure captions, and the 11 references are quoted from the original (selected passages; line-break hyphenation and obvious typos repaired).
  - Figures 1, 2, 4 and the “Guidelines for Wearability” panel are cropped from the PDF page renders; Figures 7 and 8 are the embedded photographs. Figure 3 (nude studio photographs) is intentionally omitted.
  - Level-2 headings follow the paper's own numbered guideline list.
  - The Japanese is a hand-written presentation translation, not MADLAD output.
- **Library:** six real local papers (Design for Wearability, Interactive Jewellery, Power-over-Skin, SpeeChin, finger-specific touch, OSWorld) with their bibliographic metadata only, a workspace tree, and one 38%-progress import card. Only the Reader paper has a body.

Everything lives in `src/services/presentationDemo.ts` and stays in memory; it never reads or writes the ordinary library.

## Prepare and launch

1. `npm run fetch:real-papers` (once) so the source PDF exists.
2. `npm run prepare:demo-video` creates `tmp/versio-demo/Versio-Demo.pdf` and the gitignored figure PNGs in `public/presentation-demo-assets/` (needs poppler `pdftoppm`/`pdfimages` and macOS `sips`).
3. `npm run tauri:demo`. To open a specific screen on launch, set e.g. `VITE_VERSIO_DEMO_START_PATH=/reader/demo-design-for-wearability`.
4. Optional video flow: drag `Versio-Demo.pdf` onto the Library window. The normal import job, Paper Package persistence, Library card, and Reader route run; only the extraction payload is replaced by the fixture. All PDF imports in `tauri:demo` use the fixture.

## Suggested 16:9 MP4 capture

Use macOS Screen Recording at 1920×1080 and export H.264 MP4 at 30 fps.

1. Begin on Library, pause on the import card and the workspace tree.
2. Open “ウェアラビリティのためのデザイン”; let the title, authors, and abstract settle.
3. Use the outline to jump to “1. 配置” (Figure 1), then “ウェアラビリティのためのデザインガイドライン” (the 13-guideline panel).
4. Click Figure 1 to show the shared-element enlargement and close it.
5. Use `⌘F` to find `ウェアラビリティ`, then finish at References or return to Library.

Caption the video as a product demonstration, not an extraction-accuracy sample.

## Verification

`src/test/presentationDemo.test.ts` validates the fixture through Paper Package serialization, persistence, reload, visual-asset retention, translations, and the Library seed. The fixture has no connection to the extraction benchmark corpus.
