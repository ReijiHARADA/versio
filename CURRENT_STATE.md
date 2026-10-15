# 2026-10-15: prose-grid precision and table-cell evidence precedence

The first `repeated-prose-cell-grid` implementation correctly recovered the
captionless education-method table but was too page-wide: a nearby ordinary
paragraph could share two of its x origins and be marked as a table. The
geometry evidence now learns **physical baselines** from native item gaps and
requires at least three repeated, separated anchors on three same-baseline
rows. A candidate must also intersect that proved vertical core, so preceding
body prose stays a paragraph. It supports table headers and long prose cells;
headers are promoted only after the full three-band proof exists.

A second resolver path was lowering an already-proved table score to the broad
`tableLike` fallback score of 0.68. Native-grid evidence now combines by
maximum, preserving stronger document-level evidence. The education regression
therefore verifies all of: header is a table, representative long cells are
tables skipped by translation, and the immediately preceding narrative stays a
paragraph. The CJK checkmark matrix regression still passes.

Targeted regressions, typecheck, lint (pre-existing warnings only), and diff
validation pass. The complete cached 118-PDF extraction baseline and 114-PDF
reading-order suite pass **232/232 in 445.34 seconds** under `caffeinate
-dimsu`. The prior fast `.app` and packaged E2E predate this final precision
pass; rebuild and repeat isolated package import before claiming packaged
acceptance for it.

# 2026-10-15: borderless prose tables and CJK checkmark matrices

Two real-paper regressions remained after the caption-owned native-grid work. An
education paper contains a captionless three-column method table whose cells are
ordinary prose, so its numeric density was insufficient for the existing
captionless-grid evidence and each cell was sent to translation as a paragraph.
Separately, a CJK comparison matrix uses checkmarks (`√`) as column values; its
repeated comparison-row geometry was detected, but a later mathematical-fragment
guard treated the same marks as equation symbols and erased that table evidence.

Generic extraction now adds a high-confidence `repeated-prose-cell-grid`
evidence only for compact page-local bands with **three or more visibly separate
native x anchors**, each repeated across at least three logical blocks. This
recovers qualitative, borderless tables without treating ordinary two-column or
indented prose as a table. CJK checkmark comparison rows retain their existing
repeated-row evidence through the mathematical-fragment guard, while genuine
formula detection remains unchanged. No vocabulary, title, or paper-specific
condition was added.

The education table's method, goal, and application cells and the first three
CJK comparison rows now resolve as `table`, are omitted from paragraph
translation, and carry inspectable geometry evidence. Their real-PDF regressions
pass. Typecheck and lint pass (lint has only pre-existing warnings). The complete
118-PDF extraction baseline plus 114-PDF reading-order corpus passes **232/232**
in **470.41 seconds** under `caffeinate -dimsu`. The broad pipeline suite has
**67/67 assertions passing**; Vitest still exits nonzero only because of an
existing `onTaskUpdate` worker-RPC timeout after completion. A fresh fast Tauri
bundle is still required before the change is called packaged acceptance.

# 2026-10-14: detached native caption-title recovery

A 305-page transport-safety thesis exposed a malformed but common native-PDF
case: `Table 2.5:` and `Light truck crash rates in NSW in 2000 and 2011` are
one visual caption, yet their PDF text objects carry incompatible vertical
coordinates. The title therefore became a paragraph while the identifier was
absorbed into the flattened table-cell row. Layout reconstruction now rejoins
only a bare numbered `Table`/`Figure` identifier with a **unique** one-line
title sharing the page, left edge, font size, font face, and a bounded,
pre-identifier coordinate displacement. Ordinary adjacent captions continue
to use the normal line-gap merge.

The repair is tagged through projection, so only this malformed caption class
forms a boundary during same-baseline table-row aggregation. The Reader keeps
`Table 2.5: Light truck crash rates in NSW in 2000 and 2011` as a separate
table caption instead of folding it into source-cell text. Synthetic and real
thesis regressions pass, as do typecheck, lint (existing warnings only), and
diff validation. The broad `pipeline.test.ts` suite retains two known failures
on the unmodified HEAD as well: the captionless education-method table and the
CJK checkmark matrix currently project as paragraphs. Treat those as a
separate baseline repair, not as evidence against this caption change.

The fast Tauri bundle was rebuilt at **2026-10-14 19:44:08 JST**:
`src-tauri/target/release/bundle/macos/Paper Reader.app`. Its isolated import
of the 305-page thesis wrote a package whose `Table 2.5` block has the repaired
caption metadata and a readable raster table asset. The general packaged E2E
runner timed out while background Vision OCR reported page 1/7, after package
creation; treat full OCR completion as a separate import-progress issue rather
than claiming that acceptance flow passed.

# 2026-10-14: hierarchical table-caption identifiers

The table audit of a long technical thesis exposed an identifier gap: captions
such as `Table 2.5:` were not recognized by the shared layout caption predicate,
because it accepted only one numeric component. `isTableCaption` now accepts
numeric paths and appendix prefixes (`Table 2.5`, `Table A.3.1`) consistently
for ordinary, delimited, continuation, and title-bearing caption forms. This
does not promote a contents entry by itself; the existing dotted-leader and
page-geometry rules still classify navigation entries independently.

Unit regressions cover both hierarchical forms. The real thesis regression
continues to keep its contents entry out of table projection while recognizing
the body caption and avoiding a nearby figure relation. Focused tests,
typecheck, lint (existing warnings only), and diff check pass. This small source
change was included in the next fast `.app` package build.

# 2026-10-14: repeated vector-panel annotation suppression

The table-reader audit still contained plot-panel subtitles from a vector-heavy
computational-linguistics paper. The labels were only one native line each,
so the prior multi-line grid guard could not distinguish them from a table
cell. Generic extraction now recognizes a panel annotation only when an
exceptionally graphics-dense, image-rich page has no nearby table caption and
an exact same-baseline, horizontally separated peer using tiny native type.
This is geometry and repetition evidence, not a vocabulary rule. It leaves
ordinary short text and real captioned tables untouched.

The real regression covers the paired `for GPTrel …` panel labels, which now
resolve to `other` rather than `table`. Across the cached corpus, reader-visible
raw table fragments improve **685→678**, cell-grid fallbacks **495→488**, and
the diagnostic paper improves **55→48**; table captions (**345**), crop-ready
captions (**255**), and extraction errors (**0**) are unchanged. The complete
cached extraction and reading-order corpus passes **232/232** in **464.86
seconds** under `caffeinate -dimsu`; targeted regression, typecheck, lint
(existing warnings only), and diff check pass. The fast `.app` was rebuilt at
**2026-10-14 19:12:23 JST**. Fresh isolated packaged acceptance imported the
real vector-heavy PDF, completed annotation, search, Markdown and
Notion-package export, quit, relaunched, and retained the package
(`result.json`: `ok=true`, searchHits **1**, Markdown **129,271 bytes**,
Notion **80,954 bytes**). No app or bundled translation-server process remains.

# 2026-10-14: caption-owned native table grids and dense-page import bound

Reader-visible table cells were still escaping their numbered caption when a
native PDF table had no reliable raster crop. In OzCHI this produced standalone
cards such as `Comfortable / Finger 1 / 0.000` and `Finger / Phonebook / …`,
which neither read as a table nor belonged in translation. Package projection
now folds a grid into an existing same-page, same-column numbered table caption
only when repeated native x-bands occur across at least three short visual rows.
It preserves the cell geometry for the Reader grid and removes the source cell
blocks, without using paper-specific words. Raw layout is consulted only after
Canonical projection has intentionally absorbed cell nodes, and projected
block ids take precedence so no duplicate card remains.

The optional full-page canvas fallback for figure/table crops can synchronously
stall on vector-dense pages; a promise timeout cannot interrupt that work. Pages
with more than three captions now retain embedded assets and native grids but
skip this expensive whole-page raster fallback. A fresh packaged OzCHI import
completed in **14.4 seconds**, including annotation, search, Markdown and
Notion-package export, relaunch, and persistence (`ok=true`, search hit **1**,
Markdown **45,395 bytes**, Notion **1,030,149 bytes**). Its saved package has
Table 1 (**10 rows**), Table 2 (**5**), Table 4 (**8**), and Table 5 (**1**) as
caption-owned native grids; Table 3 remains its extracted table image. No
bundled translation-server process remains.

The complete cached extraction and reading-order corpus passes **232/232** in
**444.96 seconds** under `caffeinate -dimsu`; the focused package-layout and
OzCHI regressions, typecheck, lint (existing warnings only), and diff check
pass. The fast bundle was rebuilt at **2026-10-14 18:25:33 JST**:
`src-tauri/target/release/bundle/macos/Paper Reader.app`. Continue using
`caffeinate -dimsu` for all lengthy commands because the workstation can sleep
or activate its screen saver.

# 2026-10-14: wrapped table-of-contents precision

Long entries in a table of contents can wrap before the dotted leader and page
number. The first physical line had no leader of its own, so generic geometry
could classify it as a compact table row. The candidate layer now inherits
table-of-contents evidence only when a same-page, immediately following,
indented dotted-leader line exists and at least three such peers establish a
real contents list. This is based on layout relation and does not use paper
titles or heading vocabulary.

The targeted thesis regression verifies that `3 Work characteristics associated
with injury ...` resolves to `other`. The 114-PDF table-readiness audit remains
error-free and improves reader-visible raw table fragments from **728 to 724**
and native cell-grid fallbacks from **537 to 533**, while retaining all **345**
table captions and **255** crop-ready regions. The full cached extraction plus
reading-order corpus passes **232/232 in 460.24 seconds** under
`caffeinate -dimsu`; typecheck and lint pass, with only existing repository
lint warnings. The fast `.app` was rebuilt at **2026-10-14 14:02:40 JST**.
Fresh isolated packaged acceptance then imported the 305-page long-haul
transport thesis, completed annotation, search, Markdown and Notion-package
export, quit, relaunched, and retained the package (`result.json`: `ok=true`,
searchHits=1, Markdown **520,836 bytes**, Notion **1,359,222 bytes**). No
bundled translation-server process remains.

# 2026-10-14: bounded document-level figure extraction

A packaged import of `economics-regularized-deepiv.pdf` initially remained at `structuring: 図を抽出しています...`. Per-page PDF.js timeouts already existed, but a document with several expensive figure/table pages could consume those timeouts sequentially, leaving no import-level bound. `extractFigureImages` now shares a **45-second document budget** across all optional image extraction; each page is limited to both its existing page timeout and the remaining document budget. When exhausted, remaining captions are skipped with progress, while native text, canonical blocks, captions, and table-cell fallback continue to import.

Focused timeout test and typecheck pass. The fast `.app` was rebuilt at **2026-10-14 13:41:42 JST**. A fresh isolated packaged E2E rerun for the same economics PDF completed in **16 seconds** with `exit_code=0`: import, annotation, search, Markdown/Notion-package export, quit, relaunch, and persistence passed (`result.json`: `ok=true`, searchHits=1, Markdown **97,912 bytes**, Notion **217,378 bytes**). No bundled app or translation-server process remains. This runtime-only change does not alter canonical extraction; continue using `caffeinate -dimsu` for long runs.

# 2026-10-14: fragmented mathematical display disambiguation

The table audit found a broad class of false tables in math/economics PDFs: independently positioned formula glyphs and a punctuation-led formula lead-in were receiving generic grid evidence without any table-caption relationship. The resolver now distinguishes (1) low-prose Greek/symbolic fragments as equation evidence and (2) incomplete punctuation-led mathematical clauses as paragraph evidence. It preserves captioned tables and ordinary statistical sentences. Real regressions cover both `, with probability at least … exp(…)` and the standalone `α2 α` fragment in the economics fixture.

The error-free 114-PDF table-readiness audit improves from **807→728** reader-visible raw table fallbacks and **615→537** cell-grid fallbacks. `economics-regularized-deepiv.pdf` improves **55→14** reader fallbacks; `linguistics-language-model-physics.pdf` improves **81→55** through the same symbolic guard; the long ergonomics table fixture remains **133** reader fallbacks with **87** cell grids. The full extraction plus reading-order suite passes **232/232 in 448.07 seconds** under `caffeinate -dimsu`; typecheck, lint (existing warnings only), and diff check pass. The source change is not yet packaged.

# 2026-10-14: packaged figure-panel verification

The fast `.app` containing `d449afb` was rebuilt at **2026-10-14 13:16:42 JST**. The isolated packaged Tauri acceptance again used `linguistics-language-model-physics.pdf` and passed import, annotation, search, Markdown/Notion-package export, quit, relaunch, and persistence. `result.json` records `ok=true`, `searchHits=1`, Markdown export **129,376 bytes**, and Notion package **80,965 bytes**. The harness again left a bundled translation-server process after application exit; it was explicitly stopped, so no Paper Reader process remains.

# 2026-10-14: figure-caption panel-label disambiguation

A further region diagnostic identified Figure 23 and Figure 29 as the source of many apparent table candidates: native axis/grid glyphs were positioned like cells, but lay within a dense vector Figure region whose caption occurred below. Generic evidence now uses figure-caption proximity, native type scale, graphics density, and the absence of a nearby table caption to mark those labels as `other`. This is independent of paper title or label vocabulary. Target checks show Figure 29 table nodes **4→0** and Figure 23 **29→17**; the remaining Figure 23 nodes are outside the deliberately bounded caption relation and remain a follow-up region-grouping task.

The 114-PDF readiness audit is still error-free. Its aggregate raw reader fallback count is **807** (versus **806** immediately before this change), so this rule is retained for the verified on-page correction, not presented as a global-count improvement; the audit combines role assignment with row projection and is not a complete semantic ground truth. The full cached extraction plus reading-order corpus passes **232/232 in 437.59 seconds** under `caffeinate -dimsu`; typecheck, lint (existing warnings only), and diff check pass. This source change has not yet been packaged.

# 2026-10-14: packaged micro-label verification

The fast `.app` was rebuilt at **2026-10-14 12:55:40 JST** with `e32b9db`. Fresh isolated Tauri acceptance used the real `linguistics-language-model-physics.pdf` regression input and passed import, annotation, search, Markdown/Notion-package export, quit, relaunch, and persistence. `result.json` reports `ok=true`, `searchHits=1`, Markdown export **130,206 bytes**, and Notion package **81,148 bytes**. The bundled translation server that survived the harness quit was explicitly stopped; no Paper Reader process remains.

# 2026-10-14: micro-label vector-panel follow-up

A second diagnostic showed that the first dense-vector guard still left one- and two-line glyph labels inside a single image-rich multipanel figure eligible for page-grid table evidence. The evidence now also covers these micro-labels, but only on a graphics-dense, image-rich page with no nearby table caption, tiny typography, and a very short physical block. A real fixture asserts both the multi-line plot tick stream and a standalone `lay1 lay1` panel label resolve to `other` with the recorded geometry evidence.

The refreshed 114-PDF table-readiness audit remains error-free and changes reader-visible fallback counts from **835→806** and native cell-grid fallbacks from **643→614**; the diagnostic language-model-physics paper changes **109→80**. Captioned tables are excluded by construction, and the large ergonomics table fixture retains **91** cell-grid fallbacks. The complete cached extraction and reading-order suite passes **232/232 in 438.24 seconds** under `caffeinate -dimsu`; typecheck, lint (existing repository warnings only), and diff check pass. The follow-up source change is not yet packaged; future package verification must build a new `.app`.

# 2026-10-14: packaged dense-vector verification

The fast Tauri build containing `29ff6ce` completed at **2026-10-14 12:34:43 JST**: `src-tauri/target/release/bundle/macos/Paper Reader.app`. A fresh isolated packaged acceptance imported `linguistics-language-model-physics.pdf`, completed annotation, search, Markdown and Notion-package export, quit, relaunched, and retained the package. `result.json` records `ok=true`, `searchHits=1`, Markdown export **130,190 bytes**, and Notion package **81,167 bytes**. The app exited successfully; its orphaned bundled translation-server process was then explicitly stopped. No app or translation-server process remains.

# 2026-10-14: dense vector-panel table suppression

The 114-PDF table-reader audit exposed a precision failure that remained after prior vector-diagram work: ultra-small native glyph rows inside dense, multi-panel figures could be reconstructed as captionless `table` blocks and appear as reader-visible cell cards. The new generic evidence path assigns `other` only when all of the following hold: there is no nearby table caption, the candidate has tiny native type, the page is graphics-rich, and either repeated same-shaped panel peers exist or the candidate is a micro-grid on an image-rich vector page. Captioned tables remain excluded from this suppression.

A real computational-linguistics fixture now verifies both repeated plot labels and a four-line tick-label grid are not canonical tables. The refreshed 114-PDF readiness audit has no extraction errors and reports **1,333** raw table fragments, **500** crop-backed fragments, **835** reader-visible fallbacks, and **643** cell-grid fallbacks (the immediately prior sequential-row baseline was 1,338 / 500 / 840 / 648). This is a narrow precision gain; remaining fallback grids, especially vector-figure labels in the same paper, still need region-level figure grouping rather than broader role suppression.

Focused regression, `npm run typecheck`, `npm run lint` (existing warnings only), and `git diff --check` pass. The complete cached extraction plus reading-order corpus also passes **232/232** in **461.49 seconds** under `caffeinate -dimsu`. The source change is not yet included in a packaged `.app`; build and isolated Tauri acceptance remain the next verification steps. Keep using `caffeinate -dimsu` for all long-running commands because the workstation can sleep or invoke its screen saver.

# 2026-10-13: high-precision OCR routing and packaged import

A packaged import of the 305-page long-haul transport thesis had previously stalled at `OCR処理中... (1/9ページ)`. Diagnostics showed the first selected page was a completely readable title page emitted as seven large native text items (200 characters), and another selected page held 315 readable native characters. The former `itemCount < 10` fallback incorrectly treated both as scans. A page is now classified as scanned only when it has fewer than ten native items **and** fewer than 80 non-whitespace characters; true image-only pages remain OCR candidates.

The focused classification suite passes **15/15**, typecheck and diff check pass, and the real thesis now selects **7** rather than **9** OCR pages. The full cached extraction plus reading-order corpus also passes **232/232** in **475.75 seconds** under `caffeinate -dimsu`. The fast `.app` containing `f1eb178` was built at **2026-10-13 21:49:15 JST**. A fresh isolated packaged import of that same PDF completed import, annotation, search, Markdown/Notion export, quit, relaunch, and persistence (`result.json`: `ok=true`, `searchHits=1`, Markdown 520,689 bytes, Notion package 1,359,134 bytes). No application or bundled translation-server process remained. All long-running commands used `caffeinate -dimsu`.

# 2026-10-13: packaged sequential-row verification

The fast bundle containing `49a37b8` was built at **2026-10-13 21:34:32 JST**. The isolated packaged OzCHI acceptance completed import, annotation, search, Markdown/Notion export, quit, relaunch, and persistence. Its saved package has **161 blocks**, **5 table blocks**, **5 image-backed tables**, and **0** source-table fallbacks; no bundled application or translation-server process remained afterwards.

An additional packaged import using the long-haul-transport table regression PDF did not reach projection because it stalled in the unrelated OCR step at `OCR処理中... (1/9ページ)` until the 420-second harness limit. The harness and its bundled processes were explicitly stopped after recording the result. Treat this as a separate native/OCR import-stall regression, rather than evidence against sequential-row reconstruction.

# 2026-10-13: sequential native table-row reconstruction

A remaining reader failure was caused by borderless native tables being projected as one `PaperBlock` per physical row. The Reader could render each block as a cell grid, but showed a stack of tiny independent table cards instead of one readable table. `projectCanonicalToPaper` now merges only consecutive table-row candidates that share a page and column, have small vertical gaps, contain at least two cells each, and repeat at least two quantized native x-origins across three or more rows. This is geometry-based and does not use paper-specific terms.

The real ergonomics regression now confirms that the separate `Articulated trucks`, `Passenger vehicles`, and `Total motor vehicles` rows become one source-fallback grid with explicit `tableRows`; ordinary prose, captions, lists, and standalone label fragments remain excluded. Target regression and `npm run typecheck` pass. The full cached extraction plus reading-order corpus passes **232/232** in **445.66 seconds** under `caffeinate -dimsu`; `npm run lint` passes with only the repository's existing warnings. Long-running commands must continue to use `caffeinate -dimsu` because this workstation may sleep or activate its screen saver.

# 2026-10-13: vector-diagram package and corpus verification

The fast Tauri bundle containing the vector-diagram fix was rebuilt at **2026-10-13 20:59:27 JST**. A fresh isolated real-app acceptance imported OzCHI `2686612.2686699.pdf`, completed annotation/search, Markdown and Notion export, quit/relaunched, and retained data. The persisted package contained **161 blocks**, **5 table blocks**, and **5 image-backed tables** with **0** source-table fallbacks. No app or bundled translation-server process remained after acceptance.

The full cached reading-order corpus then passed **114/114** in **114.19 seconds** under `caffeinate -dimsu`. Together with the preceding full extraction baseline (**118/118** in 363.04 seconds), this verifies the general vector-diagram guard across the cached corpus. PDF.js font/ColorSpace warnings remain non-fatal fixture warnings.

# 2026-10-13: vector-diagram/table disambiguation

Corpus triage found a remaining precision failure in a computational-linguistics paper: dense mathematical labels inside a vector Figure 10 diagram were being projected as a source-only `table` because native glyph positions formed a matrix. The resolver now uses a strict competing evidence path: a dense mathematical glyph stream must sit immediately above an overlapping Figure caption on a graphics-rich page, with no nearby table caption. It receives `other` evidence and caps the generic table score. A real-PDF regression fixes the exact Figure 10 shape without relying on a paper name or vocabulary.

The extraction-corpus run after this change passed the full **118-paper baseline**; the subsequent reading-order corpus reported one metadata failure, not a product failure. Visual rendering of `economics-regularized-deepiv` page 14 showed that the page is single-column, so the catalog's incorrect `expectMultiColumnOnPages: [14]` assertion was removed. Its targeted reading-order test now passes. Typecheck, lint, diff check, and the Figure 10 regression pass.

# 2026-10-13: refreshed table-reader corpus audit

After narrowing header-only table recovery to one physical native line, the full cached extraction baseline passes **118/118** in **363.04 seconds** under `caffeinate -dimsu`. The refreshed table-reader audit covers all cached PDFs with no extraction errors: **345** numbered table captions, **255** geometry-crop-ready captions, **1,681** raw table-region fragments, and **1,044** fragments left visible when a reliable crop is unavailable. Of those visible fallback fragments, **852** already contain `tableRows` and are rendered as native cell grids rather than concatenated prose; the audit-only residual taxonomy is `short-label=154`, `structured-grid=852`, `prose-like=11`, `ambiguous=26`, `numeric-grid=1`.

The audit is deliberately diagnostic rather than a blanket suppression rule. The remaining high-volume cases include genuine borderless tables, thesis tables of contents, mathematical/diagram label matrices, and quiz/reference grids. Changes must distinguish these from body text through geometry, caption/figure relations, and typography before changing production roles. `npm run lint` passes with the repository's pre-existing warnings only. Long-running corpus and package commands must use `caffeinate -dimsu`.

# 2026-10-13: packaged OCR timeout hardening

The latest packaged acceptance exposed a separate Tauri-path stall: the OzCHI fixture stayed at `structuring: 図を抽出しています... (5/17)` until the 600-second harness timeout, and even the tiny fixture could remain at `OCR処理中 (1/1ページ)`. `ocrDocument` previously started its timeout only after `doc.getPage()`; page acquisition is now inside the same per-page timeout. A regression test covers a stalled PDF.js `getPage`, and OCR tests pass **4/4**. The fix preserves native text on timeout and prevents a packaged OCR resource stall from holding import forever.

The fast `.app` was rebuilt after this fix at `2026-10-13 15:00:45 +0900`. The full real-paper baseline remains **118/118**. A fresh OzCHI packaged acceptance then completed successfully through import, annotation, search, Markdown/Notion export, quit, relaunch, and persistence (`result.json`: `ok=true`, searchHits=1, exportBytes=45,498, notionBytes=1,115,780). No app or bundled translation-server process remains running.

# 2026-10-13: final table-candidate guard and full corpus verification

The table candidate guard now rejects only long/multi-line caption-adjacent prose (`wordCount > 24` or more than four native lines). Short table cells that end in punctuation remain eligible, preserving marketing table rows without allowing ordinary long prose to become a table. The temporary single-item narrative cap was removed after it caused a false negative in the marketing-consumer-production-journey regression.

The real-paper extraction baseline now uses a 600-second corpus timeout (test infrastructure only; product behavior is unchanged). The full cached corpus passed **118/118** tests in 753.92s. The post-change table readiness audit over 114 PDFs completed with `extractionErrors=0`, `tableCaptions=345`, `cropReadyCaptions=255`, `rawTableFragments=1723`, `cropBackedFragments=610`, `readerRawFragments=1115`, `readerCellFallbacks=900`, and reader fragment kinds `structured-grid=900`, `short-label=158`, `prose-like=17`, `ambiguous=38`, `numeric-grid=2`; these are diagnostics, not claims that all tables have perfect semantic schemas.

`npm run lint` and `git diff --check` pass (only existing lint warnings). The latest fast Tauri bundle was built successfully at `2026-10-13 14:26:36 +0900` at `src-tauri/target/release/bundle/macos/Paper Reader.app`. The previous isolated OzCHI packaged acceptance remains green; rerun it after any further source changes that affect package persistence or reader projection.

# Active PDF extraction objective (2026-10-11)

# 2026-10-13: latest table-row projection and packaged acceptance

After the same-baseline cell projection change, direct extraction of
`2686612.2686699.pdf` produced 201 blocks, 14 table blocks, and 4 blocks with
explicit grid rows. The former OzCHI strings now retain sorted x-positioned
cells (for example `Error dist. | Finger 1 | Finger 2 | Finger 3 | Finger 4`)
for the Reader fallback grid. `npm run typecheck`, focused pipeline/layout
tests, lint, and `git diff --check` pass; lint still reports only the existing
warnings. The fast `.app` was rebuilt at 2026-10-13 13:33:21 JST and the
packaged Tauri acceptance route completed successfully with the real OzCHI PDF:
import, annotation, search, Markdown/Notion export, quit, relaunch, and
persistence all passed (`result.json` export 45,498 bytes; Notion package
1,115,780 bytes). The `caffeinate`-wrapped acceptance left no app or bundled
translation-server process running.

## Verification update (2026-10-13 15:58 JST)

The full cached real-paper extraction suite was rerun after the parallel
native table-column reconstruction with `caffeinate -dimsu`. It passed
**118/118** in **340.33 seconds**. This covers the generic OzCHI-style
parallel-column fix together with the existing title, heading, author,
affiliation, caption, table, reference, reading-order, and page-boundary
regressions. The command output is retained at
`/tmp/paper-reader-extraction-regression-final.log` for this session.

Long-running extraction, corpus, and packaged-app commands must continue to
use `caffeinate -dimsu`: the workstation may sleep or enter the screen saver
while they run.

# 2026-10-13: completed-prose guard beside table headers

A real-paper diagnostic found a results sentence in the Frontiers cognitive
psychology paper (`PVF (r=0.461; p=0.040, n=25). No other significant
associations were observed.`) that was emitted as a skipped table because it
sat below a nearby header-like table region. The source had no table-grid
ownership evidence; the generic header-only row detector was too permissive.
It now rejects complete sentences. Caption/grid/rotated-table paths remain
available for actual tables. The regression confirms this block is a pending
paragraph while the surrounding numeric table rows remain structured tables.
Targeted real-paper regression, typecheck, lint, and diff check pass.

# 2026-10-13: bounded figure-image extraction

The new packaged OzCHI run demonstrated that a single PDF.js figure page can
remain inside `getOperatorList()` or page rendering long after text/table
extraction is complete. Figure crops are optional presentation assets, so
`extractFigureImages` now bounds page opening, operator-list retrieval, and
page rendering to 15 seconds each. A render timeout cancels the PDF.js render
task; the affected page/figure is skipped and the import continues with the
canonical text, captions, and source-only table-cell fallback intact. Progress
is now reported after each completed or skipped caption rather than before a
potentially stalled operation. `pdfServiceTimeout.test.ts` covers timeout and
cancellation; re-extraction, typecheck, lint, and diff check pass. The
previous isolated package run was terminated after exceeding its 600-second
acceptance window, leaving no app or bundled translation-server process.

## Table-crop priority follow-up (2026-10-13)

The first 15-second bound made the app complete, but also skipped captioned
OzCHI table crops on a vector-heavy page. Figure extraction now processes
table captions before optional figure captions, and gives table-bearing pages
one bounded 45-second operation budget. The current fast bundle was built at
**2026-10-13 16:40:27 JST**. A fresh isolated packaged OzCHI acceptance then
completed in **14.7 seconds**: import, annotation, search, Markdown/Notion
export, quit, relaunch, and persistence all succeeded. Its persisted package
has 161 blocks and exactly **5 tables with 5 image assets** (the five captioned
OzCHI tables); no bundled app or translation-server process remained.

# 2026-10-13: header-only table rescue narrowed to physical rows

The refreshed 114-PDF table audit found a Nature-style paper whose two-line
title and first abstract sentence were being converted to source-only tables.
They happened to lie within the broad vertical search range of a
header-shaped layout block, but had no caption or repeated-grid ownership
evidence. The header-only table rescue now accepts a single physical native
line only; wrapped table descriptions remain covered by the stronger
caption/grid evidence paths. Regression confirms the paper's canonical title
and first abstract paragraph stay title/paragraph, while Frontiers numerical
table rows retain their cell grids. Targeted real-paper regression and
typecheck pass; rerun the full corpus before treating this as a baseline.

# 2026-10-13: typography guard for heading/table competition

Corpus diagnosis found a generic failure in which a separated all-caps
section line could inherit a nearby table-caption score from its split native
glyphs. The resolver now uses document-local font-size ratio, spacing-before,
uppercase ratio, and punctuation-free short-line evidence to give a strong
heading score; long single-item prose lines are simultaneously capped as table
evidence. A regression using `detecting-statistical-interactions.pdf` now keeps
`H COMPARISONS WITH LOGISTIC REGRESSION BASELINES` as a canonical heading and
the focused pipeline tests pass. The fast `.app` was rebuilt after this change.

The follow-up table audit after the typography guard remains error-free across
all 114 PDFs: rawTableFragments=1710, cropBackedFragments=605,
readerRawFragments=1107, readerCellFallbacks=901, structured-grid=901,
prose-like=8, ambiguous=36, numeric-grid=2, orphanFragments=1058. This is a
small reduction in table candidates versus the previous run and a larger
reduction in prose-like fragments (17→8); the remaining ambiguous items are
mostly legitimate compact/quiz/reference grids and require region-level
geometry or crop evidence before further role changes.

# 2026-10-13: cross-column continuation projection regression

The 118-paper extraction regression was rerun under `caffeinate`: 117/118
passed. The only remaining red test is the existing
`ergonomics-human-factors-and-ergonomics` fixture, whose per-test timeout is a
hard-coded 180 seconds while its very large PDF extraction exceeds that
budget; it is not an assertion failure. The floated table continuation
assertion now passes after allowing explicitly evidenced table rows that
resolve as `other` to remain transparent, and after deferring continuation
targets that sort before their source by y-coordinate. Typecheck, lint,
focused regression, and the latest fast `.app` build pass.

The post-projection table audit was rerun across all 114 cached PDFs under
`caffeinate`: extractionErrors=0, papersWithTableCaptions=48,
tableCaptions=345, cropReadyCaptions=255, rawTableFragments=1736,
cropBackedFragments=619, readerRawFragments=1119, readerCellFallbacks=904,
orphanFragments=1069. Compared with the prior 649 structured fallbacks,
preserving same-baseline rows raised structured-grid fragments to 904 and
reduced audit-only ambiguous fragments from 113 to 38, prose-like from 50 to
17, and numeric-grid from 106 to 2. These are reader readiness diagnostics,
not a claim that every table's semantic row/column schema is fully recovered.

The latest packaged Tauri acceptance after the continuation fix also passed:
`result.json` at 2026-10-13T05:04:41Z reports `ok=true`, annotation/search
success, Markdown export 45,498 bytes, Notion package 1,115,780 bytes, and
successful quit/relaunch persistence. No app, bundled server, audit, or test
process remains running.

The active goal is **not limited to the OzCHI finger-touch PDF**. That PDF is
one high-value Golden Regression Case because it combines a two-column ACM
layout, a mixed author/affiliation masthead, publisher permission chrome,
statistical prose, borderless and ruled tables, figures, and references. Every
production change must be format-neutral and must also be checked against the
diverse real-paper corpus: ACM/OzCHI, IEEE, Springer/LNCS, Elsevier, Nature,
APA-like, J-STAGE and other journal/conference/preprint/report layouts,
including single/two-column, table-heavy, equation-heavy, old/scanned, and
multilingual PDFs.

# 2026-10-13: same-baseline table cells are preserved as grid rows

The projection reducer previously joined adjacent table blocks on the same
baseline into one `original` string and dropped their x positions. That is the
source of Reader cards such as `Finger Thumb Finger1 ...` even when the role
was correctly `table`. It now carries a sorted `metadata.tableRows` row while
performing the same aggregation, so the existing Reader grid fallback can
render cells instead of a prose-like concatenation. This is a projection-only
change; role resolution and crop suppression are unchanged. `npm run typecheck`
and the focused pipeline/layout tests pass. High-ambiguity corpus inspection
also confirmed that medical/education review papers contain genuine dense
tables, so they are retained for grid/image handling rather than demoted to
paragraphs.

Completion requires both (1) targeted regressions for each diagnosed failure
and (2) held-out, cross-format evidence that the fix does not trade one paper's
success for regressions elsewhere. The end-to-end acceptance route remains
real PDF import in the Tauri app through CanonicalDocument/PaperBlock, Reader
rendering, and Markdown/Notion export. Docling and GROBID are comparison or
optional-evidence sources; neither may replace the canonical resolver or
become a mandatory runtime dependency without corpus-wide evidence.

Native typography is retained as structural evidence throughout diagnosis and
resolution: `fontName`, `fontSize`, bold/italic score, indentation, baseline,
and spacing before/after are combined with geometry and neighboring blocks.
A font change is a boundary clue, not a hard role assignment; matching fonts
can support wrapped-line continuity, while a size/weight/family transition can
support a heading, masthead, caption, table, or bibliography boundary.

# 2026-10-11: font-aware masthead/grid and inline-marker regressions

Font identity and size are now checked when collecting same-baseline native
spans for caption-adjacent table rows, reducing accidental table promotion from
aligned prose. A repeated multi-line grid remains visible as a skipped table
block even when its caption relation points at a synthetic region. Bilingual
Japanese/Latin author rows preserve CJK token boundaries instead of shortening
the row to its romanization. Numbered `(a)`/`1)` markers embedded in a native
prose line stay in that paragraph; only markers at physical line starts split a
list. Full test suite: 757/757; typecheck passes; lint has only pre-existing
warnings. OzCHI and selected cross-format real-paper regressions remain green.
The fast Tauri bundle was rebuilt at 2026-10-11 22:42:58 JST. The staged
translation-server source hashes match the working tree exactly. A process
already running from before this build remains separate; quit/reopen the app
before checking the new extraction behavior in the UI.

# 2026-10-11: Paper Package write/read race found on Tauri path

The isolated packaged Tauri import exposed a real persistence race: a reader
could observe a package while only its first core file had been written, which
produced `Paper Package が不完全です` and an empty Reader. Full package swaps
and mutable checkpoints now share a process-local write queue, while the final
directory rename remains the visibility boundary. A concurrent-write regression
passes. The direct Canonical extraction and all 757 unit/regression tests pass.
The packaged full OzCHI run still needs a clean end-to-end rerun after this
build; the first attempt also encountered the app-side translation-server
startup wait, so its marker is not evidence against extraction quality.

# 2026-10-11: REFERENCES の欠落と表示不統一

本文中段の `UIST '11. ACM, 627-636.` が、先頭の会議名だけで running
header と誤判定され、block 化前に失われていた。会議名型 chrome 判定を
ページ上端に限定し、同じ font family/size・hanging indent・通常行間を
持つ前行へ残すよう修正。明示的 REFERENCES 節では番号のない author-year
形式と `In Proc.` も bibliography evidence として扱い、長いエントリも
一貫して `reference`（小さなグレー表示、翻訳対象外）へ投影する。OzCHI
回帰と ACM/Springer/IEEE/arXiv/Nature/PMLR/Elsevier を含む選択15件は成功。

# 2026-10-11: 指タッチ論文で抽出が図表破片だらけだった

読み順 Kahn がページ無視で後半ページの表セルを ABSTRACT より先に出していた。ready キューを page/y/x で並べる。チャート軸の短語は破棄。番号付き Table N（CAPTION_OF あり）のセル破片はキャプション／実質グリッド以外を投影しない（captionless 行列は維持）。当該PDFは再インポートが必要。Desktop の旧エクスポートは古い抽出のまま。

# 2026-10-11: 保存失敗なのに「同じPDFがすでにあります」と出る

`importPDFV2` が失敗時も `null` を返すため、`startBackgroundImport` がすべて duplicate 扱いにしていた。duplicatePaperId があるときだけ duplicate。分類も `duplicate-block-id` を PDF 重複にしない。画像無し table で空 caption（`"" ?? text`）が Markdown を空にし orphan-structure で保存失敗していたのを修正。

# 2026-10-11: 表が無いのに「表を抽出できませんでした」が大量表示

図表近傍の本文が borderless table region に巻き込まれ、空の Table シェルになっていた。region メンバー条件を厳格化し、本文誤分類は paragraph に戻す。画像の無い table は失敗メッセージではなく抽出テキストを表示。当該PDFには Table 1–5 の数値表もある（再インポートで反映）。

# 2026-10-11: Paper Package が書けず再開後に開けない

原因: Markdown パーサがページ番号ブロックを落とし、`validatePaperPackage` が structure との不一致（orphan-structure）で保存を失敗させていた。失敗は握りつぶされ SQLite 索引だけ残った。パーサでは落とさず、`projectionToPackage` で chrome を除外。保存失敗は再送出。パッケージ無しの索引は起動時に `failed` にする。壊れた行は再インポートが必要。

# 2026-10-11: REFERENCES への会議 running header 混入

TEI/CHI 系のページヘッダ（例: `Share, Show And Tell TEI 2016, February…`）が参考文献の間に本文スタイルで残っていた。抽出で header 扱い／除外し、著者行＋翌ページの `2007. Title…` を再結合。既存論文は再インポート不要（Reader でヘッダ非表示＋結合）。

# 2026-10-11: 本文中のページ番号（脚注スタイル）を非表示

PDF のページ番号が footnote として本文に残り、区切り線＋薄い数字で表示されていた。表示・projection・新規抽出で単独の 1–3 桁数字を除外（原文が空で訳だけ数字の古いパッケージも対象）。既存論文は再インポート不要（Reader 読み込み時に隠す）。

# 2026-10-10: 終了後に論文一覧が消える対策

`library.sqlite` は tmp→rename のアトミック置換＋直列 persist に変更（途中クラッシュでインデックスが空／破損しにくくする）。起動時は破損時に `.bak` / `.tmp` から復旧し、ディスク上の Paper Package があるのに SQLite 行が無い論文はインデックスを再構築する。

# 2026-10-10: 目次ジャンプの信頼性（長文・仮想化）

Reader 左の目次クリックは、本文スクロールコンテナ基準で対象セクションへジャンプする。セクション仮想化中は対象を pin して本文を実マウントし、`scroll-margin-top` を反映した位置合わせが安定するまで pin を維持する。マウント用 IntersectionObserver も本文スクロールルートを root にする。

# 2026-10-09: 設定にライセンス一覧

設定サイドバー最下部に「ライセンス」。本体 MIT と npm / Python / Rust / モデル・アセットの依存を検索・全文表示。一覧は `npm run generate:licenses`（`prebuild`）で `src/generated/thirdPartyLicenses.json` に自動生成。オフライン閲覧可。種別不明は推測せず「要確認」。

# 2026-10-09: macOS タイトルバー下の区切り線

実ウィンドウ（Tauri）ではタイトルバー直下に `1px` の `--color-border` を描画。

# 2026-10-09: macOS タイトルバーをサイドバー色に

実ウィンドウのタイトルバーを `TitleBarStyle::Transparent` にし、`NSWindow` 背景を `--color-bg-secondary`（light `#f8f9fa` / dark `#252526`）へ同期。テーマ変更時は `sync_window_chrome_theme` で追従。`.app`: `src-tauri/target/release/bundle/macos/Paper Reader.app`。

# 2026-10-09: trash CTA radius + hold-to-empty

ゴミ箱行の「元に戻す」「削除」の角RをヘッダーCTAと同じ `radius-md` に揃えた。「削除」は赤アウトライン、「ゴミ箱を空にする」は赤塗り長押し（文言・サイズ固定、ゲージは左→右）。上がりきると実行。

# 2026-10-09: selection highlight = solid blue / white text

目次の現在位置、Reader 右上ツールの選択、設定ナビ／テーマ・セグメント選択、サイドバーの現在行、検索結果・メモカードの選択を、薄い青ではなく **青塗り＋白文字** に統一（`--color-selection-bg` / `--color-selection-fg`）。

# 2026-10-08: Frontiers masthead editor-credit boundary fix

`cognitive-dual-task.pdf` had `Edited by:` / `Reviewed by:` labels mixed into the author-role stream. The projection now treats inline credit labels as masthead boundaries, excluding adjacent editor/reviewer names while preserving the nine paper authors. Targeted author F1 improved **0.7000 → 0.7778**; author projection **24/24**, typecheck pass. This is a generic label/geometry rule; the full 113-paper benchmark remains pending.

The subsequent full corpus rerun completed **113/113** without extraction process failure. Title exactness remained **106/113 (93.8053%)**, unchanged from the prior baseline; the seven misses are catalog/PDF identity or language/spelling disagreements (Russian/Serbian native titles, `behaviour`/`behavior`, a catalog `TND`/`AND` discrepancy, and one fixture whose PDF is a different paper). This confirms the editor-credit change did not regress corpus title extraction; the remaining title misses do not justify a title heuristic change.

The same full structural suite initially exposed the OzCHI Table 2 borderless-region edge case: table-region recall was **0.4** because caption-only synthetic regions had low confidence even when strong caption-anchored region evidence existed. Region evidence is now carried into relation-node projection, so those regions retain their geometry/confidence; the targeted OzCHI benchmark is **tableRegionRecall 1.0**, with heading hierarchy 1.0, source integrity 1.0, and table-caption relation precision 1.0. Focused pipeline/author tests pass **73/73** and typecheck passes. The full 118-paper suite should be rerun after this change.

The rerun completed the full extraction corpus: **232/232 tests passed** (118 real-paper baseline + 114 reading-order checks, 382s). The PDF.js `TT`, `ColorSpace`, and similar warnings remain non-failing parser warnings. No generated benchmark report is retained in the worktree.

The GPT-3 cognitive psychology paper exposed a real line-formation defect: a short vector/diagram annotation at the right edge of a prose line (`A: Option 2.`) was concatenated into the paragraph. Geometry-based inline span separation now keeps the annotation as its own block and preserves the prose; no vocabulary blacklist is used. A regression was added; pipeline tests **50/50** and typecheck pass. The full 232-test corpus should be rerun before packaging this change.

The post-change full extraction regression completed **232/232** again (118 baseline + 114 reading-order, 401s). The GPT-3 paper now keeps the annotation out of the prose paragraph; all existing corpus assertions remain green.

The COVID-ML review exposed a second real issue: a borderless table stream with repeated multi-cell x geometry was emitted as a pending paragraph. A conservative block-level rule now requires at least three numeric multi-item lines and at least three repeated x bands before promoting it to `table`; the block is preserved and skipped for translation. The focused regression now asserts this behavior; pipeline tests **50/50** and typecheck pass.

The latest fast `.app` build includes this table-stream fix and the diagram annotation fix. The bundle completed successfully at 23:49 (unsigned development build).

# 2026-10-08: full 113-paper extraction baseline rerun

After the mixed-masthead fix and PDF.js cleanup, a fresh full `--all` run completed over **113 papers** with title exact **106/113 (93.8053%)**. The repaired digital-marketing PDF is now stable in the serialized report: canonical title `DIGITAL MARKETING: CONSUMER BEHAVIOR`, source integrity 1.0. The remaining seven title mismatches are catalog/PDF disagreements (Russian/Serbian native titles versus English catalog titles, `behaviour`/`behavior`, a likely `TND`/`AND` catalog typo, and one morphology fixture whose PDF content is a different medical paper).

The full cached corpus benchmark completed: **113 papers**, title exact rate **105/113 (92.92%)**. The eight title misses are now classified: several catalog entries expect an English translation while the PDF prints a Russian/Serbian title, one differs only by `behaviour`/`behavior`, one catalog has a likely `TND`/`AND` typo, and one morphology fixture is a different medical paper. The bilingual digital-marketing PDF contains both Russian and English title blocks; the resolver retains the first/native Russian title, which is conservative and avoids inventing a translated title. This run does not justify a generic title heuristic change.

# 2026-10-08: targeted real-paper extraction benchmark

A targeted benchmark over `ppg-earring`, the multilingual applied-linguistics PDF, the HCI systematic review, and the fatigue/occupational-safety PDF produced **3/4 exact titles**. The only mismatch is a source/catalog language mismatch: the PDF's native title is Russian, while the catalog expects an English translated title; metadata fallback preserves the Russian canonical title rather than inventing English text. The other three papers retain exact titles, figure/table relations, and source integrity; the fatigue PDF reports 43 flattened numeric rows and 30 chart-label nodes as expected geometry diagnostics. No generic resolver change is justified by this run.

# 2026-10-08: extraction suite clean single-worker verification

The full PDF extraction suite was rerun with a single Vitest worker to avoid the parallel worker notification timeout: **13 files, 124 tests passed, exit code 0**. The earlier parallel run also had 124/124 assertions passing but exited 1 because of one Vitest worker `onTaskUpdate` timeout.

# 2026-10-08: packaged UI OCR E2E isolation and duplicate-data diagnosis

The packaged UI harness now honors `PAPER_READER_UI_E2E_HOME` in the Rust app-data and source-PDF paths, and the script accepts the legacy `PAPER_READER_ACCEPTANCE_HOME` alias. `npm run tauri:build:fast` succeeds. A rerun with the malformed multilingual OCR fixture still does not reach the target import: the isolated app-data is populated with pre-existing Paper Packages and the Accessibility label lookup for the add-paper action fails, so this run is not evidence about OCR quality. Native extraction remains 124/124 and real-paper regression remains 118/118.

## Current extraction status (2026-10-07)

- 2026-10-07: OCR enrichment now requests only pages selected by the page classifier instead of rendering every page in a mixed document and discarding most results. This reduces unnecessary Vision OCR exposure on healthy native pages while preserving the existing replacement boundary. Added page-selection regressions; OCR/page-class tests **15/15**, PDF extraction suite **124/124**, and typecheck pass.
- 2026-10-07: Tauri Vision OCR Rust path revalidated with `cargo test --manifest-path src-tauri/Cargo.toml ocr`; compilation succeeded and the filtered test target completed without failures (the OCR module currently has no unit tests). Runtime recognition still requires launching the macOS app against a scanned/garbled fixture.
- 2026-10-07: Representative post-change extraction workers for the malformed multilingual title PDF and the 305-page mixed thesis both completed without process or source-integrity failure. The multilingual title mismatch remains a catalog-language disagreement (native/OCR title is Russian while the catalog title is English), not evidence that OCR should overwrite it with metadata.
- 2026-10-07: Fast macOS Tauri build completed successfully after the OCR page-selection and resolver type fixes. The generated `src-tauri/target/release/bundle/macos/Paper Reader.app` was timestamped 22:23:19, and its bundled `translation-server/engines/segmenter.py` hash matches the source. The build is unsigned.
- 2026-10-07: The generated unsigned `.app` was launched successfully; the bundled Rust binary was running and contains the `ocr_image` command. This verifies app startup and resource embedding, but not OCR recognition of a PDF page; that still requires importing a scanned/garbled fixture through the running UI.
- 2026-10-07: Packaged integration E2E was attempted against the built `.app`, but the acceptance harness stalled at `Paper Package tmp validation failed` because another packaged app instance was already running and the harness data contained a stale terminal marker. The run was terminated; this is an E2E harness/environment failure, not an extraction assertion. The existing app process was left untouched.
- 2026-10-07: Improved `persistPaperPackage` to include validation error codes/messages when temporary package recheck fails. Package persistence tests **6/6**, typecheck, and production frontend build pass; this makes the packaged E2E failure diagnosable on the next clean app run without changing extraction behavior.
- 2026-10-07: Rechecked OCR routing on real mixed documents after the page-selection change. The malformed multilingual PDF routes only page 1/11 to OCR; the 305-page mixed thesis routes 9 pages (scanned pages 2, 10, 18, 122, 198, 232, 243 plus garbled transparent-fragment pages 174–175). This confirms the classifier is selecting sparse/garbled pages rather than OCRing the full thesis; no native page was added by the new page-selection logic.
- 2026-10-07: Replayed three previously sensitive mastheads (`hfe-healthcare-scoping-2024`, `cognitive-dual-task-older-adults`, `marketing-neurophysiology-consumer-motivation`). All completed with source integrity **1.0** and catalog title exactness **3/3**; the marketing paper's native title comparison remains false only because its catalog title includes a different subtitle form.
- 2026-10-08: Ran the malformed embedded-font PDF `linguistics-the-role-of-applied-linguistics-and-language-discourse-analysis-in-eng.pdf` through the built Tauri `.app` packaged acceptance path. Import, package persistence, search/export, quit, relaunch, and persistence checks all completed: `ok=true`, `searchHits=1`, `exportBytes=36087`, with no acceptance failure. This is the first end-to-end app-level validation of the Vision OCR routing path; the acceptance harness does not expose OCR text per page, so page-level OCR content remains separately diagnosed by the native Vision check.
- 2026-10-08: Packaged UI E2E was attempted with the same OCR fixture. The app/import path started, but System Events could not click the Open panel because macOS Accessibility permission is disabled (`osascript -25211`); this is a UI automation permission failure, not an extraction assertion. The generated Paper Package files were present in the isolated acceptance home.
- 2026-10-07: Visual/geometry review of the pending Macedonian journal PDF `marketing-impact-of-e-marketing-on-consumer-behavior.pdf` found a generic masthead failure: the second title-case author was flattened together with `Republic of Macedonia` / `Ohrid` location lines and exposed as a long author string. Author projection now keeps the unique short person-shaped line when a small masthead node contains surrounding location/affiliation lines. Focused author projection **22/22** and typecheck pass; the new regression asserts both authors and excludes location leakage. The fix is geometry- and vocabulary-gated and does not alter ordinary body extraction.
- 2026-10-07: OCR routing review of the 305-page thesis `ergonomics-fatigue-and-occupational-safety-in-short-haul-light-transport.pdf` found ordinary citation/journal pairs (`Arnold & Hartley`, `Analysis & Prevention`) incorrectly counted as broken glyphs, routing 43 readable native pages to OCR. The page classifier now recognizes only short all-caps symbol pairs (`АПФ & ПЛ`, `CIP & PL`) as this corruption signal. Page 9 and 28 now classify as native-text; page 10 remains correctly scanned (image-only). Page-class tests **12/12** and typecheck pass.
- 2026-10-07: Added a real-document OCR routing regression for the same thesis: page 10 is image-only and is included in `pagesNeedingOcr` even though the document as a whole is mixed native/scanned. Page-class tests now **13/13** and typecheck pass.
- 2026-10-07: Re-ran the 305-page thesis extraction benchmark after the OCR classifier change. The document remains `mixed`, title exactness remains true, source integrity **0.9997349**, figure-caption relation **1.0**, and table-caption relation **0.9714286**; no regression was introduced. The remaining table relation misses are pre-existing and require separate geometry review.
- 2026-10-07: Table-relation diagnostics on the thesis found a real false positive: `Table 4.1` was linked to the nearby `Figure 4.1` because the table caption and figure region shared a page. Caption relation resolution now constrains table-shaped captions to table targets and rejects body sentences such as `Table 4.4 summarises ...` as structural captions. The focused mixed-page regression passes; the same benchmark's table-caption relation precision improves from **0.9714 to 1.0**, while the underlying `Table 4.1` content still needs separate row/caption boundary reconstruction.
- 2026-10-07: The same thesis page exposed a second boundary issue: the table caption block absorbed all table rows because the first table header was a single centered native item. Caption continuation now treats a large geometry shift after a decimal table label (`Table 4.1:`) as a table-region boundary. `Table 4.1` is now a standalone caption, rows become table/other blocks, and the caption relation correctly targets a table row; title/source integrity remain stable. Focused mixed-page regression and typecheck pass.
- 2026-10-07: Representative post-change extraction rerun passed for the thesis, `wear-scale`, and `medical-image-segmentation-deep-learning`: all titles exact; source integrity **0.999742 / 1.0 / 1.0**; table/figure relation metrics remained **1.0** where annotated; `wear-scale` table caption and region recall remained **1.0**. This is a focused compatibility check, not a replacement for the full corpus regression.
- 2026-10-07: Full PDF extraction suite after table caption boundary/relation fixes passed **13 files / 124 tests** (42.51s). Existing PDF.js font warnings remain non-failing.
- 2026-10-07: After tightening table-caption relation targeting, the full real-paper extraction baseline was rerun and passed **118/118** (290.22s). The earlier OzCHI table-region regression (0.4 recall) was traced to over-prioritizing low-confidence synthetic regions; relation selection now keeps the existing high-confidence table node path while still preventing table captions from linking to nearby figures.

- 2026-10-07: Full application suite after wrapped author recovery passed **72 files / 720 tests** (44.57s).
- 2026-10-07: After wrapped Elsevier author recovery, reading-order regression passed **114/114** (93.06s).
- 2026-10-07: Elsevier meta-review visual review exposed wrapped author nodes (`Jan Egger, Christina` / `Gsaxner, ...`) and a trailing consortium line misclassified as an author. Projection now merges contiguous author-row fragments and resolver demotes institution-shaped author candidates to affiliation. Canonical authors recover all 8 names without the consortium; extraction suite **120/120** and baseline **118/118** pass (`f0e004e`).
- 2026-10-07: Visual review of the Russian/English bilingual title page confirmed the native title, numbered author row, affiliations, and abstract are visually distinct; the canonical extraction keeps these boundaries separate.
- 2026-10-07: Full application test suite after vector-label fixes passed **72 files / 719 tests** (41.39s).
- 2026-10-07: After vector figure-label demotion, reading-order regression passed **114/114** (93.79s).
- 2026-10-07: After vector figure-label role resolution, full real-paper baseline rerun passed **118/118** (294.51s); no extraction regression.
- 2026-10-07: Visual review of `interpreting-neural-networks.pdf` found figure heatmap labels (`F1`–`F10`, `x1`–`x10`) being promoted to heading nodes despite vector-label evidence. Resolver/projection now demote strong vector figure label clusters to `other`, preventing translation and heading hierarchy pollution. Focused regression passes; PDF extraction suite **119/119** passes (`a9c9291`).
- 2026-10-07: All PDF extraction unit/integration suites after math-aware page classification pass: **13 files / 118 tests** (37.33s). Existing PDF.js/fixture warnings remain non-failing.
- 2026-10-07: Visual review of the equation-heavy medical page 9 confirmed the native text layer is legible and structurally usable (figures, two-column prose, equations, and captions). This supports keeping those pages on native extraction instead of OCR after `c89fa7f`.
- 2026-10-07: Equation-heavy medical pages contained valid spaced tensor symbols (`D H W`, `C Q K`) that triggered garbled/OCR routing. Page classification now discounts dense single-letter mathematical notation while retaining true split-glyph signals. The 23-page medical PDF classifies fully as native-text; page-class tests **11/11** and extraction baseline **118/118** pass (`c89fa7f`).
- 2026-10-07: After title-layer deduplication, reading-order regression was rerun: **114/114** passed (96.72s).
- 2026-10-07: After repeated-title-layer fix, the full real-paper baseline was rerun: **118/118** passed (294.96s).
- 2026-10-07: `hfe-healthcare-scoping-2024.pdf` contained an identical three-line title layer twice at the same coordinates, causing duplicated title text and metadata fallback. `joinLines` now removes only exact repeated line sequences with matching geometry; the canonical title is restored once. Focused regression and typecheck pass (`4deacf3`).
- 2026-10-07: `hfe-healthcare-scoping-2024.pdf` exposed false `garbled`/OCR routing from ordinary phrases (`is a need`, `as a result`, initials such as `Marie E Ward`) matching the split-word heuristic. The classifier now ignores ordinary single-letter words/initials and requires a large geometric gap for interleaved short-token evidence. All 13 pages classify as native-text with no OCR routing; page-class tests and baseline **118/118** pass (`6d65913`).
- 2026-10-07: Computational-linguistics PDF exposed an unedited-author-copy publication notice being stitched into the first body paragraph across a page boundary. A generic author-copy/DOI chrome boundary now prevents that metadata from entering paragraph translation; focused regression passes. Broad extraction regressions after this fix: baseline **118/118**, reading-order **114/114**, typecheck pass (`b50d784`).
- 2026-10-07: `significant-other.pdf` exposed a legacy caption form (`Fig.2 Otto Künzli ...`) with no punctuation after the figure number. It was being emitted as translatable paragraph text. `isFigureCaption` now recognizes unpunctuated, title-like continuations while excluding verb-led prose such as `Fig. 2 shows ...`; the following photographer line is retained as caption continuation. Targeted regression passes and typecheck passes (`f0b7d68`).
- 2026-10-07: `covid-ml-review.pdf` exposed a wide review table whose native cells were fragmented into short paragraph blocks across alternating x-columns. Caption-anchored dense-band evidence now recognizes repeated x origins and promotes only short local blocks to skipped table rows, leaving the following long review prose as paragraphs. The focused regression and the full baseline extraction suite (**118/118**) pass; reading-order regression also passes.
- 2026-10-07: A Russian multilingual article exposed a title/author boundary where superscript affiliation numbers caused the author row (`...лаба1, путу...`) to be appended to the title. Title continuation now treats numbered comma-separated name rows as author metadata; the native article title remains separate. Focused title/pipeline tests pass and typecheck passes.
- 2026-10-07: A pending IEEE HCI review PDF exposed a flattened masthead (`ABDALLAH ... ABBASFaculty ... , KHAIRIL ...`) and a two-line associate-editor credit. Affiliation-name recovery now inserts a boundary before institution leads, recovers the trailing all-caps author, rejects funding acknowledgements as affiliations, and stitches the editor credit into non-prose metadata. The focused regression recovers all three authors and keeps the credit out of paragraph translation.
- 2026-10-07: The same IEEE PDF split its keyword list across two paragraph blocks (`... user` / `interaction, user behavior`). A conservative comma-density and lowercase-continuation rule now joins only this short metadata shape; the focused regression confirms the complete keyword list is preserved as one block.

- 2026-10-07: 所属分割・表投影・Figure caption continuation修正後の広域回帰を再実行。real-paper baseline **118/118**、reading-order **114/114**、合計 **232/232** pass（389.71秒）。PDF.jsの既知TT/ColorSpace警告のみで、assertion failureなし。
- 2026-10-07: IEEE所属文の実PDF再診断で、同一機関の行分割（Brunel University London）が重複出力される問題を確認。機関名の正規化と包含関係による重複統合を追加し、医療PDFで所属4系統を重複なしに保持。authorProjection **18/18**、typecheck pass。
- 2026-10-07: IEEE形式の `X is/are with ...` 所属文を、同一native paragraph内の次の著者節で分割して複数affiliationへ投影する汎用補正を追加。医療画像PDFの所属を一つの巨大文字列に潰さず、各機関単位で保持できるようにした。authorProjection **18/18**、typecheck pass。
- 2026-10-07: 著者所属の追加実PDF診断で、`wear-scale.pdf` の同一列折り返し（Events/Hospitality → Management/Iowa State University）を確認。既存所属が1件で、候補が2つの同列native nodeに限られる場合だけ隣接行を結合する高精度補正を追加。HCIの本文断片/Vol・Issue混入、PLOS番号付き所属と合わせ、authorProjection **12/12** pass。既存の段組・編集者欄・interleaved affiliation回帰も維持。全113本の再計測はprojection局所変更のため未実施。
- 2026-10-07: 最新コミット `f3b6d32` で抽出回帰を再実行。`test:extraction-corpus` は **232/232**（real-paper baseline 118 + reading-order 114）pass。PDF.jsのDOMMatrix/Path2D/TT/ColorSpace警告のみで、抽出assertion failureはなし。これは既知fixtureの回帰保証であり、113本全件の目視品質を意味しない。
- 2026-10-07: 新規IEEE systematic-review PDFで、著者行に `Faculty ...` が吸収され第一著者が欠落する問題を再現。所属語で分離し、末尾の大文字著者列を保持する汎用投影補正を追加。所属 suffixも所属一覧へ復元し、`AND`接頭辞を正規化。authorProjection **13/13**、typecheck pass。対象の著者3名とFaculty所属を復元。
- 2026-10-07: 同じIEEE PDFの `The associate editor coordinating ...` が本文段落として抽出される混入も確認。明示的な編集者クレジットをcanonical `chrome`へ分類する一般ルールを追加。author/pipeline/pageClass **52/52** pass、typecheck pass。
- 2026-10-07: 同PDFのページ上部に繰り返される `et al.: <article title>` running headerも本文段落として残ることを確認。ページ上端・`et al.:`・短い定型行の組み合わせを `header` として扱う汎用補正を追加。author/pipeline/pageClass **52/52** pass、typecheck pass。
- 2026-10-07: 出版社横断の10本診断で、日付メタデータの所属混入、引用タイトル説明の所属混入、`PA USA`の地名著者混入を確認。所属フィルタと著者地名フィルタを一般化し、authorProjection **16/16**、pipeline/pageClass **39/39**、typecheck pass。診断では別途、Japanese spacingと所属欠落の残課題も記録した。
- 2026-10-07: 追加診断で、日本語著者名の字間分割（`河 合 隆 史`）をCJK文字間の空白正規化で修正。IEEEの`R. Wang ... are with ...`形式を所属文として復元する汎用抽出を追加し、医療PDFの所属欠落を改善。authorProjection **18/18**、typecheck pass。
- 2026-10-07: 表構造の実PDF診断を実施。`medical-image-segmentation` はtable node 17件、`education-learning-analytics` 90件、`wear-scale` 50件を確認し、既知の数値グリッドはparagraphへ潰れずtable roleへ投影されている。現時点で安全に一般化できる新規table修正は特定できず、誤結合を避けて現行挙動を維持。次はtable nodeとcaption/relationの対応を目視サンプルで検証する。
- 2026-10-07: `wear-scale.pdf` のページ14相関マトリクスを現行Canonical→Paper投影で再確認。数値セル/行は31個以上の`table`ブロックとして`translationStatus=skipped`になり、通常段落としてMADLADへ送られないことを回帰テスト化。pipeline **31/31** pass。
- 2026-10-07: `cognitive-psychology-gpt3.pdf` のFigure 3 captionが、ベクター図の軸ラベルを挟んで2ブロックに分かれる問題を確認。`Figure` caption直後の同一ページで、パネル記号（A-D）を含む近接caption continuationだけを結合し、`Human data taken from... C:` を別段落として翻訳しないようにした。実PDF回帰を追加し、pipeline **32/32**、typecheck pass。
- 2026-10-07: Figure caption結合条件を実データで再確認。キャプション本体が句点で終わっていても、後続が同一ページ・近接位置・`C:`/`D:`等のパネル説明を含む場合だけ継続文として結合するよう調整。author/pipeline **50/50**、typecheck pass。
- 2026-10-07: table/caption relationを3本で再診断。caption **41件中41件**（20+16+5）が`CAPTION_OF` relationを持ち、孤立captionは0件。孤立table nodeは表セル/行の個別regionで、paragraphへの混入ではなかったため、無理なcaption結合は追加していない。

- 2026-10-07: `cognitive-dual-task.pdf` の所属回帰を実PDFで再診断。4機関が上付き番号と段組の同一 native block に交互配置され、編集者欄も同じ block に混在するため、現行 projection は最後の2機関しか安定復元できないことを確認した。番号の後処理だけでは著者/編集者の混入を解消できないため、次の修正対象は line/block grouping 段階での masthead boundary 分離とする。実験的な後処理は誤抽出を増やすため採用していない。
- 2026-10-07: 上記PDFの実データで、所属候補が `sidebarMixed` と誤判定され左列を捨てていたこと、および `Reviewed by:` 以降の正当な所属まで正規化で削除していたことを修正。番号付き候補の低信頼上書きを抑制し、国名が列間混入した `University of ...` を構造的に修復した。`authorProjection` **9/9**、pipeline/pageClass **48/48**、typecheck pass。対象PDFの所属は **4/4** 復元。
- 2026-10-07: 所属修正後の重点3PDF isolated benchmarkを再実行。3/3 process成功、title exact 3/3、interactive-jewelleryのheading/reading-order/caption/list/source integrity、medical meta-reviewのtable metrics、linguisticsのsource integrityを維持。副作用なし。生成レポートは `test-data/real-papers/reports/extraction-isolated-latest.json`。
- 2026-10-07: タイトル継続判定を修正。コロンで終わるタイトルの次行を、少し小さいフォントでもタイトル候補として保持し、雑誌マストヘッド後の複数行記事題を縦順に結合するようにした。113本のisolated benchmarkは **106/113 (93.81%) title exact**、前回105/113から1件改善。見出し・図/表caption・表領域は平均1.0、source integrity平均0.99997、失敗0件。残る7件の大半はPDF現地語題と英語catalog titleの言語不一致で、抽出誤りとは限らない。typecheck/lint pass（既存warningのみ）。
- 2026-10-07: 追加の実PDF診断で、イベント名が記事題に混入するケース、タイトルblockへ著者行が連結するケース、本文冒頭の長い `While ...` 段落がタイトルへ昇格するケースを一般化して修正。イベント/学会masthead除外、行単位の番号付き著者尾部除去、長い引用付き本文のmetadata title fallbackを追加。isolated benchmark **107/113 title exact**（前回106/113）、failed PDFは未取得の `precious-materials` 1件のみ。見出し/reading-order/caption/table指標は既存値を維持。titleResolver 5 tests、authorProjection 9 tests、pipeline 30 tests、pageClass 9 tests pass。なお実PDFのロシア語・セルビア語題は英語catalogとの言語差が残る。
- 2026-10-07: 多言語タイトルに英語 `For citation:` 行がない場合、citation fallbackでタイトルを空にせずnative titleを保持する安全側修正を追加。titleResolver 5 tests、typecheck pass。
- 2026-10-07: masthead実データを追加監査し、HCI PDFで本文断片が著者名へ混入、`Vol./Issue`行が所属へ混入する問題を再現して修正。小文字開始の本文をauthor continuationから除外し、書誌バンドをaffiliationから除外。PLOS形式では番号付き機関行が厳格フィルタで全消失していたため、機関語を含むnative affiliation lineを分割復元する汎用fallbackを追加。実PDFでHCI著者2名・所属2件、PLOS所属2件を復元。authorProjection **11/11**、typecheck pass。

- 2026-10-07: 最新コードで重点3PDF（interactive-jewellery、linguistics-language-model-physics、medical-deep-learning-meta-review）のisolated extractionを再実行。3/3 process成功、title exact 3/3、heading/reading-order/caption/table指標は各fixtureの期待値を通過、source integrity 1.0。medical PDFは `pageKind=garbled` となりOCR routing対象。

- Latest code includes generic title/author/affiliation projection, transparent text-layer detection, Vision OCR routing, sparse-OCR protection, and figure/table label suppression.
- Verified: extraction corpus and reading-order **232/232**, page-class/OCR tests **9/9**, typecheck and lint pass.
- Automated 113-paper title exact metrics are historical regression signals, not visual accuracy; native OCR/runtime validation and full-page visual review remain outstanding.
- Highest-priority remaining cases: transparent text-layer fragments in mixed-column PDFs, complex table/list reconstruction, and real Tauri Vision OCR output verification.

- 2026-10-06: 著者・所属補正後に113本（取得済み113/114、`precious-materials`欠損）のisolated extraction benchmarkを再実行。title exact **105/113 (92.92%)**、native title exact **53/113**、metadata fallback **56/113**。heading/caption/table-region/reading-order指標は既存値を維持し、source integrity平均は約0.99997。今回のベンチマークは著者・所属の完全目視評価ではなく、既存Ground Truth範囲の自動指標である。
- 2026-10-06: Multi-column affiliation blocks now use `LayoutBlock.lines[].items` and x-band clustering to project separate institution strings instead of concatenating columns. Country-only continuation tokens are attached to the neighboring institution column when geometry indicates a wrapped row. Focused author/pipeline tests (30/30) and typecheck pass; broader publisher layouts remain queued for review.
- 2026-10-06: Affiliation projection now collapses exact repeated institution spans while retaining canonical relation IDs. `power-over-skin` now emits one Carnegie Mellon University entry; focused author regression and typecheck pass.
- 2026-10-06: Native line geometry showed same-baseline author items (`Daehwa Kim` / `Chris Harrison`) being rejoined during block grouping. Added a generic author-column boundary when both adjacent lines are person-shaped and horizontally separated; added a focused regression asserting three separate authors and no location author (`authorProjection.test.ts`). Focused test and typecheck pass; remaining affiliation deduplication is tracked separately.
- 2026-10-06: 113本のmastheadサンプルから、著者投影に地名（`Pittsburgh, USA`）、書誌行、メールアドレス、末尾が接続語の断片が混入する一般的な誤抽出を確認。`isNonAuthorMastheadLine` を追加し、著者候補・継続候補・所属候補の境界で除外する補正を実装（`3af9d3b`, `71a879e`）。typecheckとreal-paper extraction回帰118/118は通過。複数著者が同一native lineへ潰れるケース（例: `Daehwa Kim Chris Harrison`）は別のgeometry分離課題として残る。
# Paper Reader 現在状態

- 2026-10-06: 113本の自動抽出指標だけでは見逃す本文汚染を、タイトル診断で追加確認した。インドネシア語ジャーナルPDFでは、ISSN/巻号/発行日帯が本文の先頭行と同じnative line/blockへ連結される形式を確認。`splitInlineBibliographicBand` を行形成前に追加し、構造帯と本文を分離する汎用修正を実装（`e79ba73`）。既存のreal-paper extraction regression **118/118**、typecheck、diff check pass。これは113本全件の目視完了を意味せず、引き続き書式別の目視レビューが必要。
- 2026-10-06: 上記修正後に113本のisolated extraction benchmarkを再実行。取得済み113/114（`precious-materials`はPDF未取得）。自動title exactは **109/113 (96.46%)**（108/113から改善）。残る4件はPDF内の別言語タイトル3件と英米綴り差1件で、雑誌マストヘッド混同は解消。見出しprecision/recall、図表caption、table-regionはこの計測で1.0、source integrity平均1.0（最小0.997）。これは目視確認済みの正解率ではないため、タイトル・本文混入のmanual reviewを継続する。
- 2026-10-06: `linguistics-computational-linguistics` のページ1を目視相当のgeometry診断。`International Journal of Advances in Scientific` が記事題 `Computational Linguistics` より先に選ばれていたため、journal/volume/date → article-title → author の文書順を使う汎用Resolver補正を追加。2語の正当な記事題もメタデータ候補として扱う。代表workerで記事題を復元し、real-paper extraction **118/118**、typecheck pass（`fbe1a7e`）。全件自動再計測は次の大きな抽出変更時に行う。
- 2026-10-06: 残るtitle mismatchをレンダリングで確認。Serbian/Russian PDF 3件は英語catalog titleではなく、PDF上のCyrillic題を正しく抽出していたためground-truth言語不一致/綴り差として記録。一方 `linguistics-the-role-of-applied-linguistics...` はPDF上のロシア語題が見えるのにpdf.js native textが `АПФАПФ...` へ壊れるfont ToUnicode failureを確認（severity 3、open）。`extraction-manual-review-v1.json` に記録した。native metadataがない診断経路では、壊れたタイトル候補を棄却し、同一ページの `For citation:` DOI行からタイトル文を復元する汎用フォールバックを追加した。実ファイル経路では既存のVision OCRを優先し、特定文字列の置換は行わない。
- 2026-10-06: 上記font failureを検出するページ分類を強化。短いglyph反復と記号連結masthead tokenを `garbled` として扱い、macOS Vision OCR fallbackへ `ru-RU` を追加。特定文字列の置換はせず、既存ページ分類回帰を維持。pageClass/extractionConfidence **7 tests pass**、typecheck pass（`0526af9`）。OCR後のロシア語タイトル品質は実PDF再抽出で追加確認が必要。
- 2026-10-06: Vision OCRの認識領域（normalized bounding box）をRust側から返し、JS側でPDF座標へ変換してOCR行のx/y/width/heightを保持するよう修正。従来の全行x=0置換による段組・見出し崩れを防ぐ。`~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml` pass、typecheck、pageClass tests pass（`11c7107`）。
- 2026-10-06: OCR座標変更後の extraction corpus / reading-order 回帰を再実行し、**232/232 pass**（2 test files）。PDF.jsのcanvas/TT警告は既存環境警告で、assertion failureなし。

- 2026-10-06: Word-level native text向けの幾何ベース段組検出を追加。タイトル・著者・図が上部を占める `ppg-earring.pdf` でも本文の二段組（leftX=56/rightX=320）を検出し、Abstractを左段→右段の論理順に復元できることを確認。`Our results validate...` の先頭欠落を解消。pipeline 27/27、reading-order/list 77/77、重点real-paper 3件の回帰を通過。全PDFで完了したことを意味せず、段組・表・ページ境界の残課題は継続。
- 2026-10-06: 既存real-paper extraction baseline 118/118 tests passed after the column change. The Vitest worker emitted one `onTaskUpdate` timeout after all tests had passed during the 206-second run; this is test-runner reporting noise, not a failed extraction assertion. No baseline assertion failed.
- 2026-10-06: 113本の抽出ベンチマークも完走。title exact は 90.27%（102/113）で、残りは主にジャーナルのマストヘッド・リポジトリ表紙・PDF内タイトル分割/別言語タイトルが原因。抽出全体を完了扱いにはせず、次の改善対象としてタイトル候補の文書構造判定を記録。
- 2026-10-06: ジャーナル表紙の `Contents lists` / `Journal homepage` 等を構造証拠として使い、同一ベースラインに分割された記事タイトル候補を再結合するResolver補正を追加。`medical-deep-learning-meta-review` は `Computer Methods` から `Medical deep learning—A systematic meta-review` に復元できた。pipeline/reading-order/list 104/104、typecheck pass。113本全体の再計測は次の大きな抽出変更時に行う。
- 2026-10-06: 上記Resolver変更後に113本を再計測し、title exact は 102/113 (90.27%) から 104/113 (92.04%) に改善。残り9件の多くはPDF自体の別言語タイトル・翻訳題・表紙題で、英語カタログ題との単純一致では抽出失敗と断定できない。`extraction-baseline-latest.json` は生成物のためコミットせず、数値と代表例をここへ記録。
- 2026-10-06: 段組検出の追加回帰で、単段組PDFのヘッダーだけが左右に分かれる誤検出を確認。左右の行数比、縦方向の重なり、各列のYスパンを要求する条件を追加し、`ergonomics-human-factors-and-ergonomics` は単段組へ戻り、`ppg-earring` は二段組を維持。pipeline 28/28、reading-order/listを含む直近104件 pass。変更は未コミットのUI差分と分離して次のコミットに保存。
- 2026-10-06: 上記条件変更後、`ppg-earring` と `ergonomics-human-factors-and-ergonomics` の実PDF回帰を再通過（2/2）。後者のAbstractが単段組の論理順で保持されることを確認。
- 2026-10-06: 段組誤検出修正後に113本全体を再計測。title exact は 104/113 (92.04%) から 105/113 (92.92%) に改善。heading recall平均 0.9932、figure caption recall 1.0、table caption recall 1.0、table region recall平均 0.95、source integrity平均 0.9999。生成JSONはコミットせず、ベンチマーク値のみ記録。

- 2026-10-06: 大規模PDFの抽出回帰を180秒共通タイムアウトで再確認。`ergonomics-human-factors-and-ergonomics` は抽出内容を含め **37.7秒で合格**し、従来の60秒タイムアウトは実抽出失敗ではないことを確認。抽出固有の追加修正はせず、テストの誤判定だけを解消した（`f2ca78c`）。
- 2026-10-06: PDF抽出回帰を再実行（232 checks中229 pass）。`education-learning-analytics` の番号付き本文リストが図ラベル誤判定で消える問題を修正し、`human-ai-interaction-guidelines` の段落が参考文献状態へ誤分類される問題も修正。重点2件は再テスト合格。変更は `7f50d02`。残る1件は大規模PDFの既存60秒テストタイムアウトで、抽出内容の失敗ではなくテスト時間設定の課題。

- 2026-10-05: CAT-Translate 3.3BをMADLAD fallback入力4件で再評価（`cat-focused-fallback-v3`）。4/4が日本語生成（2.8〜12.7秒/件）し、現行cascade品質ゲート再計算では3/4を自動受理。これは小規模監査であり、本番cascade接続や全113本の再計測はまだ行わない。成果物は `test-data/real-papers/reports/cat-focused-fallback-v3.json` と `selective-cascade-v805-quality-recompute.json`。
- 2026-10-05: 同一source cohortでCATを再評価（MADLADのordinary-body post-model fallback 2件）。CAT自動受理は1/2。interactive-jewelleryは引用 `[2]`/`[16]` の欠落で拒否、dont-mind-meは数値保持を通過したが access表現の重複がありmanual確認対象。異なるsource cohortのCAT結果と混同しない。成果物は `test-data/real-papers/reports/cat-same-cohort-v1.json` と品質再計算レポート。
- 2026-10-05: 同じ2件でCATの監査専用citation placeholderを有効化して比較。引用欠落は解消せず、`[2]`/`[16]` がなお欠落し、別unitでは `ZZCIT` 指示文が出力へ漏れた。単純placeholder/prompt方式はCAT rescueの根拠にならず、本番へ接続しない。
- 2026-10-05: CAT同一cohortで検出した「less easy to access」と「easier to access」が同じ日本語述語へ潰れる比較極性の欠落を、一般化したcascade専用relation guard `opposite comparative polarity collapsed` として追加。quality tests **271/271**、typecheck、diff check pass。反対極性を別表現で保持する受理回帰も追加し、全件再計測は不要な局所品質修正として未実施。
- 同ガード後の全TypeScript回帰は **70 files / 652 tests pass**。PDF抽出・reading order・cascade・import/resumeに回帰なし。
- 抽出ベンチマークの範囲ガードを追加後、`--papers thermal-earring` の1本実行を確認。title exactness、source integrity、figure/table caption・region指標はいずれも1.0、heading recall 0.973。引数なし全件実行は明示的に拒否される。
- 比較極性ガード後に同一CAT cohort（2件）を再採点し、自動受理が **1/2→0/2** になった。dont-mind-meの数値保持候補も、反対極性のcollapseを安全側で拒否できることを確認。CATを本番cascadeへ接続する前の安全基準として保存。
- 追加のCAT非citation cohort（4件）は自動ゲート3/4だったが、1件は先頭が`– encourages...`のsource fragmentだったため、CAT品質比較から分離。監査スクリプトに継続断片の除外（`CAT_INCLUDE_INCOMPLETE=1`で診断時のみ含める）を追加し、source reconstruction failureをmodel rescue率へ混ぜない。
- fragment除外後の完全source 3件ではCAT自動受理2/3。manual reviewでは2件がseverity 0、dont-mind-meの比較極性collapseがseverity 3で品質ゲート拒否と一致。非citation ordinary-bodyでもCATを無条件統合せず、relation guardを通す必要がある。レビューは `cat-noncitation-cohort-v2-manual-review.json`。
- 追加のheld-out focused benchmark `focused-heldout-v1`（ppg-earring / design-for-wearability / step-to-charge / wear-scale、各2 units）を完了。ordinary-body 4件は4/4がreader-visible fallbackなし。fallbackはsection-headingの未翻訳・図参照順、listの継続断片、damaged-extractionの未完括弧に限定された。今回の小規模結果ではquality gate緩和やCAT本番接続の根拠は得られず、抽出構造failureとして分離した。全件再計測は未実施。
- 同held-outのordinary-body 2件を手動確認したところ、自動受理2件中2件にseverity>=2の意味ずれがあった。`ppg-earring` はwearablesを「ウェブアプリケーション」と誤訳し、`step-to-charge` は2mWのpeak powerと1mのchannel lengthの関係を崩した。数値の存在だけでは検出できない用語・測定役割のsemantic false acceptとして `focused-heldout-v1-manual-review.json` に保存。品質ゲートの一般化可能な用語/測定役割検出を次の改善候補とする。
- 測定役割ガード `scientific measurement role changed` を追加。英語側で明示された2つの測定役割（power / channel length）と、日本語側の値の最近傍役割が反転した場合だけ拒否し、役割が不明な通常文は変更しない。quality tests 274件、typecheck pass。`focused-heldout-v4`（同2論文・4 units）ではstep-to-chargeの問題出力がreader-visible fallbackへ倒れ、ppg-earring本文は従来どおり完了した。なおstep-to-chargeは未翻訳英文残留も同時に検出されており、ガード単独の寄与率は追加分離が必要。
- CAT独立fallback cohort `cat-independent-heldout-v2`（post-model ordinary-body fallback 4件）を同一ゲートで評価。自動受理2/4、手動では安全な受理1/4。1件はThai metadata + detached numberのsource fragmentをCATが流暢に補完したseverity 4、1件は数値4の omissionで拒否、1件は意味上は妥当だがmethod guardのfalse reject、1件は正しく受理。CAT本番cascadeはまだ統合しない。レビューは `cat-independent-heldout-v2-manual-review.json`。入力抽出スクリプトはfallbackかつpost-modelに限定する修正を追加。
- CAT held-out入力のsource integrityを追加確認し、先頭foreign metadataに加えて `Mage = 25.6...` のような代入途中から始まる断片も除外するよう準備スクリプトを強化。v3ではThai行は除外できたが、代入断片が残ったため、CAT受理率を本番品質の推定には使わない。再評価結果は `cat-independent-heldout-v3.json` に保存。
- `conducting quantitative appraisal analysis` を明示的なmethod evidenceとして認識する一般ルールを追加し、CATのlinguistics行で確認されたfalse rejectを解消。quality tests 275件 pass。保存済みv3 CAT結果の再計算では受理2/4→3/4になったが、代入途中source fragmentが1件残るため、本番cascade統合の判断には使わない。
- `Mage = 25.6...` のように代入式の途中から始まる長いsource blockを `diagnoseIncompleteSource` で抽出fragmentとして扱う安全ガードを追加。通常の数式・本文は対象外。quality tests 276件、typecheck pass。CATのsource-fragment誤受理を本番翻訳へ流さないための一般化可能な入力検証として記録。
- 2026-10-05: CAT比較前のMADLAD重点基準 `focused-before-cat-v1`（4本・16 units）を完了。ordinary-bodyは2/6 fallback（33.3%）、全体は9/16 fallbackだが、6件は構造不良によるpre-model除外。これは全体推定ではなく、CAT cascade比較用の基準値として保存。

最終更新: 2026-10-05

## 現在の実装状態

- 2026-10-05: サーバーが返す one-to-one translation unit mapping に失敗unitが含まれる場合、集約文字列のplausibility判定よりも unit projection を優先するよう修正。成功unitを保持し、失敗unitだけ原文へ戻す経路を単体・batch・resumeで統一した。品質/engine回帰282件、typecheck、diff check pass。113本全件の再計測はこの局所変更では実施しない。
- 同変更の重点再測定 `partial-projection-focused-v1` は2/4本・24 unitsをチェックポイント保存（complete=false）。サーバーはreadyのまま、残り要求が長時間進まなかったためクライアントのみ停止。成果物は `test-data/real-papers/reports/partial-projection-focused-v1.{json,md}` に残し、`--resume` で再開できる。保存済み24 unitsの段階分類は pre-model 10、post-model 3、通常完了11で、全体指標には一般化しない。
- 同レポートに保存された `thermal-earring` 出力には `earring`→「耳かき」の漂移が残っているが、これは保存時点の診断結果。現行の `normalizeSourceGroundedTerminology` にはsource確認済みの `earrings?` 修復と回帰テストがあり、再測定時に正規化後の値を確認する。自動受理を品質達成とは扱わない。
- 監査スクリプトもproductionと同じ `projectSafeUnitTranslation` を使うよう更新。serverがpartial/whole-item fallbackを返しても、one-to-one mappingが検証できれば成功unitを評価し、失敗unitだけを `partialSourceFallback` として記録する。これにより監査のreader-visible fallbackがproduction経路と一致する。typecheck、quality/engine 282 tests pass。
- smoke benchmark `partial-projection-smoke-v1`（thermal-earring、1 unit）を新監査経路で完了。`sourceFallback=false`、`readerVisibleFallback=false`、`wouldAcceptTranslation=true` を確認し、出力中の「耳かき」漂移は現行source-grounded normalization後には発生しなかった。`missingTechnicalNameCandidates` は英語名を日本語転写したため診断値として残る。
- `cadence-dry-run-v1` で重点4本×4 unitsの選択・抽出・チェックポイントだけを確認（モデル呼び出しなし）。通常の確認コマンドが113本全体へ暗黙拡大しないことを再確認した。
- `partial-projection-focused-v2` を4本×4 unitsで完了（16 units、`MADLAD_BENCH_MAX_ATTEMPTS=1`）。ordinary-bodyは6 units中4完了・2 partial source fallback。post-model 3件は全体原文fallbackではなく、one-to-one projectionで成功unitを保持したpartialとして記録された。小標本であり5%目標へ一般化しないが、局所fallback経路が実測できた。成果物は `test-data/real-papers/reports/partial-projection-focused-v2.{json,md}`。
- v2のordinary fallback keyのうち `interactive-jewellery:b-fd49dd32` には既存CAT audit出力が対応し、CATは段落全体を日本語化した候補を生成している。ただしこの出力は同一条件の新規blind review前なので、本番cascadeへの接続根拠にはせず、次の比較対象として記録する。
- 保存済みCAT候補を現行quality evaluatorで再計算すると score 0.871、`scientific invariants missing: [16]` で不合格だった。見た目が流暢でもcitation保持を満たさないため、CATをこのfallbackへ自動投入するだけでは安全なrescueにならない。
- CAT監査スクリプトに bracket citation atomic-protection arm（`CAT_PROTECT_CITATIONS=1`）を追加し、同一1件で実測。`[16]` は復元できたが別の `[22]` が欠落し、quality score 0.871 / `scientific invariants missing: [22]` のまま不合格。単純placeholderでは不十分で、MADLAD側の既存placeholder復元・retry相当が必要と判明。本番変更には未接続。
- citation placeholder保持を明示するpromptも追加して再実測したが、欠落対象が `[22]` から `[16]` へ移っただけで、quality score 0.871のまま不合格。単発prompt強化では解決しないことを確認。

- 翻訳モデル: MADLAD-400 3B、Transformers 4.57.6 runtime。
- 翻訳品質ガード、科学的 invariant、引用保護、partial fallback、選択的 cascade の監査実装が存在する。
- CAT-Translate は監査・比較用で、本番ルーティングには未統合。
- PDF抽出は Native text / geometry / canonical resolver / projection の既存パイプラインを使用。
- macOS `.app` の再ビルドは、コード変更を配布版へ反映する必要がある段階で実施する。
- 最新重点検証: `focused-cohort-current-v3`（4本・48 units）。metadata等の翻訳対象外pre-model skip 13件を本文品質から分離し、本文継続候補5件とpost-model fallback 7件を次の診断対象とした。
- 最新回帰: TypeScript 70 files / 648 tests、Python translation-server 248 tests、typecheck passed。113本全件計測は未実施。
- 直近修正: UUID/GUID/HEXと16進payloadの連結をinvariantとして認識（`a7a89c9`）、whole-item fallbackの単位投影回帰を追加（`62fc557`）。
- UUIDの前後に説明語があるPDF抽出形（`UUID) of 0x1809` → `UUID0x1809`）と、`0x`内の`0`をcitationとして誤認する問題を修正（`82fe640`）。品質テスト269件、typecheck passed。
- 保存済み `thermal-earring` 出力の再評価ではUUID/`0x1809`保持は通過したが、`Unique Identifier` の一意性表現欠落を `exclusivity relation missing` として検出した。これは識別子のfalse rejectではなく意味欠落のため、gateは緩和しない。

## 主要指標

### 2026-10-05: active translation audit checkpoint

- `translation-audit-auth-v1` は `--resume --cached-only --limit 12` で完了済み。
- **113/114 papers、1,155 sampled units** をチェックポイント保存済み（`precious-materials` のPDFのみ未取得）。
- ベンチマークプロセスは終了済み。現在稼働しているのは翻訳サーバーのみで、後続の全件再計測は実施しない。
- **評価運用方針:** 113本全体の再計測は、抽出・分割・品質ゲート・モデル・保護方式などの大きな横断変更を入れた節目に限定する。通常の修正では、focused unit test と 4〜12本程度の代表コホート（変更に関係する分野・書式を含む）を使い、全件ベンチマークは開始しない。
- 全件再計測を行う場合は、開始理由・対象commit・比較する基準値を先に記録し、完了後に本節へ結果を追記する。長時間プロセスを常駐させず、チェックポイント付きで実行する。
- `benchmark-real-paper-translation.ts` は、カタログ全体を暗黙に選ばないよう変更済み。12本を超えるカタログで全件を実行する場合は `--full-corpus` が必須（commit `31da674`）。
- focused cohort `focused-cohort-current-v1`（speechin / dont-mind-me / interactive-jewellery / thermal-earring、48 units）を再計測。ordinary-body は 4/19 fallback (21.1%)、構造入力ポリシーによる事前除外が19件、post-model rejectionは4件。全件指標ではなく、次の修正候補を絞るための診断値として扱う。レポートは `test-data/real-papers/reports/focused-cohort-current-v1.{json,md}`。
- 同コホートのpost-model ordinary failureは `dont-mind-me` の長い統計/本文3件、`speechin` の数値・foreign-script汚染1件。`thermal-earring` のUUID/invariant行はordinary本文ではなくカテゴリ誤分類を伴うため、quality gate緩和の根拠にしない。次の実装候補は長文unitの品質拒否と数値/foreign-script rescueの一般化検証。
- 翻訳サーバーの既存品質回帰（`test_madlad_quality` + `test_mixed_quality_fixture`）を再実行し、74 tests が pass。現時点ではproduction変更を追加せず、上記4件の再現fixture比較を次の実装前提とする。
- `dont-mind-me:b-4c16bae3` の長文統計本文は、現行segmenterで7つの完結文（94〜217 chars）へ分割され、round-trip可能だった。したがってこのfailureは「段落全体を1回で送った」問題ではなく、protected input/decode/quality gate側を優先して切り分ける。診断: `focused-long-unit-segmentation-dont-mind-me-v1.json`。
- 統計値placeholderの影響を比較するため、`MADLAD_EXPOSE_INLINE_STATISTICS=1` の診断専用armを追加。`(0.005)` 等のcompact statisticsだけをモデルへ見せ、citation・測定値等は従来どおり保護する。production defaultは変更していない。citation protection tests 81/81 pass（commit `3493ab7`）。
- 対象unitの現行production出力を保存し、`partial_unit_fallback`（unit 1/3）と統計値由来の英文残留を再現。診断armサーバーはバックグラウンド起動制約でmodel比較まで進められなかったため、通常設定のserverを復旧済み。armの採用判断は未実施。
- 同一model・同一decode条件で統計値公開armをPTY内で再実行。現行保護は `partial_unit_fallback`（298 input tokens）、公開armは fallbackなし（398 input tokens）になった一方、`0.02→1.00`、`0.001→0.1` 等の数値破壊が発生した。したがってplaceholder削減だけでは採用不可で、数値を文脈付きで見せつつ exact restore/検証する方式が必要。比較 artifact: `test-data/real-papers/reports/inline-statistics-ab-v1.json`。通常serverへ復旧済み。
- 公開armの数値破壊を検出するためcompact parenthetical statisticsをinvariantへ追加する案は、既存の統計値再配置を正当に受理するテストを誤拒否したため撤回。quality test 267/267 pass、production quality behaviorは変更なし。
- 同じ4本コホートのpost-model fallback 4件を既存Gemma 2 9Bでselective-cascade監査。quality/citation gateの自動受理は **1/4**（`dont-mind-me:b-68e941f0`）で、残り3件は数値・foreign-script・未翻訳lexeme・否定関係などで拒否。自動受理を手動正解とは扱わず、CAT未導入の代替モデル基準として `test-data/real-papers/reports/selective-cascade-focused-gemma-v1.json` に保存。本番cascadeは変更していない。
- 同一4件をQwen 2.5 7Bでも監査し、自動受理は **0/4**。Gemma 1/4を上回らず、いずれも本番cascadeへ追加しない。artifact: `test-data/real-papers/reports/selective-cascade-focused-qwen7b-v1.json`。Ollamaは停止済み。
- 同一4件をQwen 2.5 14Bでも監査し、自動受理は **1/4**。Gemma 2 9Bと同率で、CAT比較がない現段階では本番cascadeへ追加しない。artifact: `test-data/real-papers/reports/selective-cascade-focused-qwen14b-v1.json`。Ollamaは停止済み。
- CAT-Translate 3.3Bのcached weightsを発見し、同じfallback cohortから4件を直接評価。CAT outputはproduction quality evaluatorで **3/4** が自動受理、1件（`dont-mind-me:b-4c16bae3`）はdegenerate outputで拒否。これはCATの有望な一次証拠だが、手動semantic review・citation/invariant再確認前のため本番cascadeには未接続。artifact: `test-data/real-papers/reports/cat-focused-fallback-v1.json`。
- `translation-audit.json` および別コホートの `CURRENT_STATE` 記録と混ぜず、auth-v1 の完了値を正式な比較対象とする。
- 中間集計（47本/493 units）では全体 fallback 293件、通常本文187件中47件（25.1%）。これは未完了の暫定値であり、目標達成とは扱わない。

### 抽出コーパス

- OAカタログ: **114件**
- PDF取得済み: **113本**
- source integrity 平均: **0.99987**（最小 0.99363）
- canonical provenance: **1.000**
- heading recall 平均: **0.99324**（最小 0.97297）
- table-region recall: **0.950**
- table-caption relation precision 平均: **0.99468**（最小 0.75）
- title exactness: **0.867**。OpenAlex由来タイトルをPDFの正解として未検証のため、品質回帰の指標としては保留。

### 翻訳評価

- MADLAD既存held-out: 30 rows。受理 20/30。
- CAT比較: 30 rows。自動受理 27/30、手動レビューで severity 2 以上 0件。ただし本番未統合。
- Qwen2.5 14B cascade probe: 同一held-out 5 rowsで受理1/5。4件は反復語、未翻訳・foreign-script、科学的invariant欠落などで拒否。本番統合の根拠には不十分。
- 選択的 cascade の監査投影: reader-visible fallback 1/30（3.3%）。同一held-out上の監査値であり、本番保証ではない。
- 新規OAサンプル: 16 papers / 16 blocks、10受理・6 fallback。1論文1ブロックの診断値で、製品fallback率ではない。
- 114本を選択した fresh translation audit を完了（PDF取得済み113本、評価954 units。`precious-materials` はPDF未取得）。全体fallback 624/954 (65.4%)。ordinary-body は 111/360 (30.8%)で、目標5%を未達。内訳は pre-model 4、post-model 107（server/model 由来55、quality gate 32、extraction/structure 17、その他7）。これは現行の実測ベースラインであり、次の改善対象をモデル/品質ゲートと抽出境界に分離できた。
- 追加fresh sample: 4 papers / 8 blocks、3受理・5 fallback。4件は抽出構造由来、1件は長い本文のpost-model品質拒否。
- ordinary-body fallback 111件のsource/fallback段階/quality理由を [`translation-failure-triage-v1.json`](test-data/real-papers/reports/translation-failure-triage-v1.json) に固定。server/protection 55、quality-gate 43、extraction/structure 5、その他8（分類はtriage用で重複理由を含む）。

## 直近の変更

### 2026-10-07 — 表キャプション近傍の誤分類を診断（未採用）

- 表キャプションの近くにある本文が、ネイティブspanのx配置だけで表セルとして扱われる例を診断。
- 長文本文ガードは既存の `marketing-consumer-production-journey` 表セルを段落へ落とし、113本回帰が231/232になったため撤回。
- CJKの `表 3 ...` を単純にキャプション認識する案も、同じページの中国語本文を表領域へ巻き込むため保留。
- 次は caption proximity ではなく、ページ内の行帯・反復x列・セル密度をResolverで統合する必要がある。

### 2026-10-07 — CJK本文の途中切れをtable evidenceの負例に追加

- 中国語本文がページ／列境界で句点なしに切れると、`tableLike` の構造grid判定が table=0.95 を出し、長文本文を表へ昇格させていた。
- CJK文字量と句読点密度を使った `cjkSentenceLikeProse` を、table evidence の負例へ追加。短いセル行や既存の数値表には適用しない。
- `ergonomics-human-factors-ihci` page 11 の長文本文で table score が 0.95→0.68 に下がり、Resolverのtable昇格閾値を下回ることを確認。
- 全コーパス回帰はこの変更後に再実行する。
- `scripts/diagnose-table-geometry.ts` を追加し、caption候補から300px以内の行帯、native x位置、反復列をJSONで確認できるようにした。`ergonomics-human-factors-ihci` では、表1〜3の実際の行帯と本文断片のx列が混在していることを可視化できた。
- CJK比較表で、`√/✓` 記号・短いCJK行・近傍反復x列が揃う場合だけ `cjkComparisonTableRow` をtable evidenceとして追加。対象PDFの4行をtableへ投影し、周辺本文はparagraphのまま保持した。
- 回帰結果: pipeline 40/40、全件抽出コーパス 232/232。

### v1563 — ゴミ箱自動削除の説明と日数変更時の猶予（2026-10-06）

- 設定の説明を「ゴミ箱の項目を自動で完全削除するまでの日数です。」に短縮。
- 日数変更直後に期限切れになる項目はすぐ消さず、変更後の日数分の猶予を付ける（trashed_at を更新）。

### v1562 — ゴミ箱の完全削除をトースト取り消しに（2026-10-06）

- 「今すぐ完全に削除」は行内の二段確認なし。赤塗り白文字ボタン一回でリストから外し、下部トーストの「元に戻す」でキャンセルできる（確定はトースト消失時）。
- 青ステージ上・左余白は 36px に統一済み（v1561）。

### v1561 — ナビゲーションプレビューの青余白（2026-10-06）

- 設定の自動折りたたみ比較プレビューで、青ステージの上・左の余白を 36px に揃えた（右・下のクロップはそのまま）。

### v1560 — 重複PDFインポート行の整理（2026-10-06）

- 同じPDFが既にあるときのライブラリ行をコンパクト化。重複バッジ・重複する説明文・生エラーをやめ、ファイル名＋一行の案内と「既存の論文を開く」／閉じる（×）だけにした。

### v1559 — 翻訳切り替えの粒子モーフィング（2026-10-06）

- 構造確定後は英語本文をそのまま表示し、翻訳到着時に英語字形が細い黒粒子へ溶け、日本語字形へ再形成されつつブラーが溶ける演出を追加（高密度サンプリング・英語→粒子区間は約1.6倍速）。
- 待ち中のスピナー箱表示をやめ、待ち時間の体感を短くする方向に変更。
- 設定 → 翻訳 にローカル確認用プレビュー（再生ボタン付き）を置いた。

### v1558 — サイドバー接近ゾーンで expand 途中まで開く（2026-10-06）

- 自動折りたたみ時、本体＋近傍ブリッジで全開する既存挙動に加え、その外側の接近ゾーンでは同じ expand モーションの約 42% 地点まで進む（別アニメではなく連続した進行度）。

### v1557 — 自動折りたたみプレビューのクロップと透明度（2026-10-06）

- 設定プレビューのウィンドウを青ステージの右端・下端で途切れるクロップに変更。
- 現在の設定側を不透明度 100%、もう一方を約 60% にして選択状態を示す。

### v1556 — メモ作成時は本文ハイライトのみ（2026-10-05）

- テキスト選択からのメモ作成で、選択範囲を本文上にハイライト表示する。
- メモボックス内の引用テキスト表示をやめた（入力欄と操作だけ）。

### v1555 — 目次背景を本文と同じ白に（2026-10-05）

- Reader 左の目次パネル背景を `--color-bg-secondary` から `--color-bg` に変更し、本文と同じ白にした。

### v1554 — サイドバー左端の揃え（2026-10-05）

- 検索ボックス・セクション見出し・ライブラリ／設定アイコン・ワークスペースフォルダの左端を共通インセットに揃えた。
- ツリーの chevron をレイアウト幅から外し（絶対配置）、展開してもアイコン列がずれないようにした。

### v1553 — 自動折りたたみプレビューを青背景の浮かぶウィンドウに（2026-10-05）

- 「自動で折りたたむ」比較プレビューから OFF/ON ラベル・説明キャプション・トグル下の説明文を削除。
- 強い青ステージ上に macOS 風タイトルバー付きウィンドウが浮かぶ見た目に変更。選択中は白いリングで示す。

### v1552 — Reader 中のサイドバー青ハイライトを論文に付ける（2026-10-05）

- 論文を開いているとき、格納フォルダではなくサイドバー上の当該論文行を現在位置としてハイライトするよう修正。

### v1551 — 自動折りたたみ設定プレビューを実UI寄りに更新（2026-10-05）

- 「自動で折りたたむ」の before/after GIF を現行サイドバー＋リーダー風メイン面で再キャプチャ。
- フィクスチャを `修士研究 / Interactive jewelry` 系に更新し、スケルトン棒のプレビューをやめた。

### v1550 — 折りたたみ時は最上位だけ表示の設定を削除（2026-10-05）

- 設定「折りたたみ時は最上位だけ表示」と関連 GIF プレビューを削除。
- アイコンレール時は最上位フォルダのみ、展開時に入れ子を出す挙動は固定のまま。

### v1549 — ワークスペースパスの1行省略（2026-10-05）

- 左上の場所パス（例: `修士研究 / Interactive jewelry / …`）が折り返して2行にならないよう、1行固定＋`…` 省略に変更。祖先セグメントを先に縮める。

### v1548 — サイドバー見出しと新規フォルダ導線（2026-10-05）

- 「ワークスペース」「ライブラリ」のセクション見出しを一段階大きくした。
- 検索直下にあった「新規フォルダ」ボタンを削除し、「ワークスペース」見出し右の + から同じ作成フローを開くようにした。

### v1545 — quality policy facade refactor（2026-10-05）

- `quality.ts` からタイトル、出版メタデータ、参考文献、名称付き見出しの判定を `quality/documentPolicy.ts` へ分離。旧exportはfacadeで維持。
- 品質テスト 250/250、全Vitest 624/624、typecheck、lint、diff checkを通過。品質閾値・fallback条件・モデル設定は変更していない。


### v1544 — fresh benchmark再開（2026-10-05、完了）

- 114本コーパスのstable checkpointを `--resume` で再開。先行実行で63本分を保存後、長文要求が長時間返らない状態を検出したため、翻訳サーバーは維持し、クライアントのみ終了。
- 再開時は1論文あたり4 unitsに縮小し、checkpointを追記してレポートを生成済み。productionの翻訳ロジックは変更していない。
- レポート生成後にordinary-body fallbackと原因分類を再集計済み。


### v1543 — 保守性リファクタリング第一段階（2026-10-05）

- `quality.ts` の退化出力検出を `src/services/translation/quality/degeneration.ts` に分離。
- `quality.ts` は既存のexport名・import pathをfacadeとして維持。品質閾値、fallback条件、モデル設定は変更していない。
- 対象テスト 258/258、全体テスト 624/624、typecheck、`git diff --check` を通過。
- 分割計画と残りの候補は [`docs/MAINTENANCE_REFACTOR_PLAN.md`](docs/MAINTENANCE_REFACTOR_PLAN.md) に記録。


- リスト導入文（コロン終端）を、直後の箇条書き・番号付き項目とは別の安全な翻訳単位として扱うよう改善。
- 実PDFで従来pre-model fallbackだった導入文がMADLADへ送られ、既存ゲートで受理されることを確認。
- 全Vitest **624/624 across 69 files**、抽出pipeline **26/26**、quality tests **250/250**、typecheck pass。
- 詳細な実験ログは [`docs/history/CURRENT_STATE-2026-10-05.md`](history/CURRENT_STATE-2026-10-05.md) を参照。

- 2026-10-07: OCR品質ガード追加後にlint、pageClass 9 tests、typecheckを通過。native本文が十分あるページを短いOCR結果で置換しない条件を確定。残る実機確認はTauriアプリでのVision OCR再抽出のみ。

## 未解決課題

1. 100本規模コーパスの section-stratified translation sampling と manual semantic review が不足。
2. ページ境界・未閉鎖 delimiter・参考文献混入による source reconstruction failure。
3. 長い完全本文の translation-unit / model quality failure。
4. borderless table と flattened numeric rows の汎用抽出。
5. `quality.ts` の責務集中と、品質判定・翻訳ポリシーの依存関係整理。
6. CAT / alternate model の本番統合可否は未決定。

## 2026-10-05: quality policy refactor checkpoint

- `quality.ts` の caption/title の純粋なsource-shape policyを `src/services/translation/quality/sourceIntegrity.ts` へ分離した。旧facadeのexport名と判定順は維持している。
- 品質テスト **257/257**、typecheck、`git diff --check` を通過。品質閾値・fallback条件・モデル設定は変更していない。
- 次は paragraph structure policy の依存（`unsafeParagraphStructureReason` と `shouldTranslateParagraph`）を挙動固定テスト付きで分離するか判断する。翻訳品質の現状目標は未達であり、今回のrefactorを品質改善の実測結果とは扱わない。

## 2026-10-05: packaged-server replay checkpoint

- `.app` 同梱translation serverは `MADLAD_SERVER_TOKEN` を要求するため、診断用 `scripts/replay-translation-fallbacks.mjs` が401になっていた。スクリプトが環境変数を `X-Paper-Reader-Token` として送るよう修正し、トークン自体は保存・出力しない。
- 同一`.app`サーバーで3件を再実行。長いJogwheel本文は約182秒後に `whole_item_fallback`、Silent Speech本文は約101秒後に protected-token restore failureを伴う `whole_item_fallback`、参考文献行はサーバー終了により未完了。これは品質改善の証拠ではなく、長文decodeと保護復元の再現診断である。
- 実行中に`.app`サーバーが終了し、後続の直接再生は接続失敗になった。レポートは `test-data/real-papers/reports/madlad-fallback-replay-v3.json` に保存済み。production routingやgateは変更していない。
- protected-token restore failureのdebugログに、missing spanを `author_year_citation` / `numeric_citation` / `measurement` / `structural_reference` / `identifier` / `other` へ分類する診断情報を追加。判定・retry可否・出力は変更しない。Python品質テスト **153 passed + 3 subtests**、py_compile、差分チェックを通過。
- 翻訳サーバー全体のPython回帰 **247 passed + 11 subtests** を確認。診断分類追加によるsegmenter、micro-batch、citation保護の回帰はない。
- `.app`の稼働サーバー `/status` は `model_version=...semantic-v73...` を返し、現在ソースのv83系より古い同梱物であることを確認。`npm run tauri:build` は clean Python bundle staging まで成功したが、残っている未整理TypeScript/UI差分に起因する build-only typecheck（`LayoutRole`/`process`、Ollama enum、sidebar型など）で停止し、`.app`は更新されていない。`importServiceV2.ts` の未定義 `llmProvider` は修正済み。品質変更の失敗とは分離して記録する。
- その後、build-only型エラーを修正し、`npx tsc -b` を通過。`npm run tauri:build` が成功し、`.app`とDMGを生成した。`.app`更新日時は **2026-10-05 10:15:39**。同梱 `segmenter.py` は `semantic-v83` で、開発ツリーとbyte一致を確認。現在起動中の旧プロセスは再起動するまで旧bundleのままなので、実機反映には旧アプリとserverを終了して新しい`.app`を起動する必要がある。

## 次の作業

- 2026-10-05: citation-alignment audit module追加後の全体回帰を再確認。Vitest **70 files / 641 tests**、typecheck pass。localhost translation server は `semantic-v84` / `phase=ready`。この局所的な監査変更では113本全件再計測を行わず、production routingも変更していない。
- 2026-10-05: 既知の抽出・長文・引用系failureを含む4本（16 units）の限定cohort `post-citation-audit-cohort-v1` を再測定。ordinary-body 6 unitsは **0/6 reader-visible fallback**、構造破損は5件をpre-model source fallbackとして維持、長文citation保護のproduction緩和は行わない。小標本のため全体指標へ一般化しない。
- 2026-10-05: CAT-Translate source-disjoint v5 を5件実行（認知心理学）。自動quality gateは5/5、citation診断は1/5 flagged。手動確認では3件が概ねusable、2件は図・表由来の断片混入（うち1件は `GPT-3 Humans` の配置崩れ）で、CATの安全なproduction cascade根拠にはならない。成果物: `cat-source-disjoint-auth-v5{,-quality,-citation-diagnostic}.json`。
- 2026-10-05: `cognitive-psychology-gpt3` を現行抽出経路で4 units再検証。旧CAT入力にあった `Horizon 1 Horizon 6` 型の図表ラベル列は今回の抽出サンプルには出ず、3件の不完全ブロックはpre-model source fallbackとして保持された。抽出ガードの緩和や追加特例は不要と判断。成果物: `post-figure-label-cognitive-v1.{json,md}`。
- 2026-10-05: CAT source-disjoint v1〜v5を統合。25 rows中、source/structure除外7、clean 18、手動usable 14、severity>=2は4。citation診断flagは4 rows。CATは引き続き本番無効。集計: `cat-source-disjoint-summary-v1-v5.json`。
- 2026-10-05: CAT source-disjoint v6を追加（10 rows）。source/structure除外3、clean 7、usable 7、citation flag 0。v1〜v6累計は35 rows、clean 25、manual usable 21、severity>=2は4。CATは依然として本番無効。集計: `cat-source-disjoint-summary-v1-v6.json`。
- 2026-10-05: CAT v1で確認された手順単位の意味ずれ（`utterance` を `session` と訳す）を、実験記述一般に適用できるsemantic scope guardとして追加。sourceに片方の単位しかない場合の一方向置換だけをcascade拒否し、両方を保持する文は許可。quality **264/264**、typecheck、diff check pass。
- 2026-10-05: scope guard後の全体回帰を実行。Vitest **70 files / 643 tests**、typecheck pass。既存のcanvas.node警告のみ。
- 2026-10-05: scope guardの文単位対応へ微修正後も全体回帰を再確認。Vitest **70 files / 643 tests**、typecheck pass。全件翻訳ベンチマークの再実行は不要な局所変更として保留。
- 2026-10-05: CAT v1 tailを新scope guardで再評価。4 clean rows中、自動受理は **2/4**。`utterance unit shifted to session` を実際に拒否し、他は既存のdegenerate/participant-role guardで拒否。artifact: `cat-source-disjoint-auth-v1-tail-quality-after-scope.json`。
- 2026-10-05: 実CAT出力の `current and previous utterances` → `そのセッションおよび直前のセッション` を固定再現し、文境界がずれてもpaired scope patternで検出するguardを追加。quality **265/265**、typecheck pass。cascade判定はreject。
- 2026-10-05: CAT v1〜v6の保存済み32結果を新guardで再計算。clean 32件中quality gate受理29件。既存のv1 mainにはpaired scope行が含まれず、実例はv1 tailの別artifactで拒否を確認済み。集計は監査用で、本番routingは未変更。

- `docs/MAINTENANCE_REFACTOR_PLAN.md` の順に、挙動固定テストを維持しながら品質モジュールを段階分割する。
- 抽出変更は113本ベンチマークと既存回帰を毎回実行する。
- 翻訳変更はfresh cohort・manual review・semantic false acceptを確認してから採用する。

### v1546 — plural possessive segmentation fix (2026-10-05)

- `segmenter.py` が `linguistics' cognition` の末尾アポストロフィを開き引用符と誤認し、段落内の文境界を隠していた。所有格アポストロフィを引用状態に入れない一般修正を適用し、`SEGMENTER_VERSION` を `semantic-v83` に更新。
- セグメンター回帰 **61/61**。長文診断の単一unitは2件から1件へ減少し、該当本文は4つの文単位へ分割。残る1件は表由来のflattened numeric rowで抽出課題。
- 続けて、resolverが `vector-figure-label-cluster` 等を `other` としたノードを翻訳projectionから除外。医療画像PDFのflattened `1×1 Conv / Rate / Channel` 行はPaperBlockにならず、図内ラベルとして扱われる。抽出pipeline関連テスト **28/28**。
- `speechin` のFigure参照fallbackをPDF外で再現。完全文・第2文単独の両方でMADLADが `The necklace case` を落とすため、原因はplaceholderやPDF結合ではなくdecode側。入力の受動表現を自然な能動表現へ正規化すると改善したが、一般化検証前のproduction適用は保留。
- HCI/心理/マーケティング/人間工学/言語学の受動構文5文でraw/正規化ABを実測。明確な改善はHCI例のみで、他は同等または視点・用語が変化したため、全体rewriteは採用しない。結果は `test-data/real-papers/reports/passive-construction-ab-v1.json`。
- 医療論文の簡体字混入fallbackについて、既存の汚染検出をserver decode rescueにも適用。beam再試行後、`学习` を含んだ出力が通常の `学習` を含む日本語へ変わり、fallbackなしで受理可能になった。held-out全体での改善率は未測定。証拠: `server-simplified-cjk-rescue-v1.json`。
- 同一医療論文を新serverで再監査。ordinary-bodyは **2/2 fallback → 1/2 fallback**、全体は6/8→6/8以外の構造fallbackを含むため、改善をordinary-bodyの1件に限定して記録。残るordinary-bodyはmixed-script decoder corruptionではなく、他の品質理由を別途確認する。
- 残った `CycleGAN` 例は、`サイクルGAN` という正しい技術語表記を混在スクリプト破損と誤判定していた。source identifierのuppercase suffix（`CycleGAN`→`GAN`）を許容する一般条件を追加。quality tests **251/251**、typecheck pass。
- 同一医療論文を品質ゲート修正後に再監査し、ordinary-body fallback **1/2 → 0/2** を確認。全体fallbackは構造fallbackを含むため62.5%だが、今回の改善対象はordinary-body 2件。report: `post-cyclegan-gate-medical-v1`。

### v1547 — fresh quality cohort (2026-10-05)

- `post-quality-12-v1` は指定12件のうち、PDFがローカルに存在する11件（44 units）を処理。`precious-materials` はPDF未取得のため未評価で、レポートの `complete` は false のまま保存されている。
- 抽出構造を除外した evaluable 33 units では fallback **10/33 (30.3%)**、ordinary-body は **1/18 (5.6%)**。ordinary-bodyの唯一のfallbackは `dont-mind-me` の複数unit server partial fallbackで、目標5%に近いが、サンプル18件では達成判定しない。
- 既存のfallback率を達成扱いせず、missing PDFを補完した上で同一cohortを再実行し、manual semantic reviewを追加する。
- 12本コホートの唯一のordinary-body server fallbackを再現し、`“Normal”` / `“Awkward”` を技術名として誤保護する一般的な誤判定を修正。識別子形状または命名文脈を持つ引用名だけを保護し、サーバー quality gate を v36 に更新した。4つの問題文を同一サーバーで再実行し、4/4が日本語訳を返し、fallbackなしになった。
- 修正後の同一11本・44-unit再監査（`post-quality-quoted-label-v1`）は完了。構造除外後33 evaluable unitsのreader-visible fallbackは **14/33 (42.4%)**、ordinary-bodyは **2/18 (11.1%)**。ラベル誤保護は消えたが、`speechin` のIR/SSR・引用欠落、`thermal-earring` の否定/BPM、図参照順、UUIDなど別のpost-model問題が残るため、5%達成とはみなさない。
- IR/BPM/SSRのように本文中で正式名称が展開され、日本語側で自然な展開語になる標準科学略語を、対応する日本語展開（赤外線・心拍・無声音声等）が保持されていれば受理する一般ルールを追加。quality tests **254/254**、全Vitest **628/628**。引用番号欠落や切断文は引き続きfallback対象とする。
- `speechin` の再監査では `infrared (IR)` を「赤外線」とした本文がfallbackなしになったことを確認（`post-acronym-expansion-speechin-v1`）。残る `SSR, [4, 9, 29, ...` の行はPDFページ境界で切れた引用列を含むsource fragmentであり、保護緩和せずExtraction側の課題として扱う。

## 2026-10-05: citation-column stitch verification

- Added a high-precision same-page layout repair in `pdfLayout.ts` for a paragraph whose left-column block ends with an open numeric citation and whose right-column continuation begins with `], and ...`. It requires paragraph roles, same page, horizontal left-to-right order, overlapping vertical bands, and matching body font size.
- On `speechin.pdf`, the extracted text now joins `...[4, 9, 29, 36, 37, 57 ], and capacitive sensors in the mouth [38, 43].` into the preceding paragraph. The paragraph still ends in `Tongue` and is therefore correctly retained as damaged extraction rather than being sent to translation as a complete claim; the next block begins `movement can also ...` and needs a separate conservative continuation repair.
- `post-citation-stitch-speechin-v1` rerun: 4 units; 1 ordinary-body block remains reader-visible fallback because the source still ends at `Tongue`; the clean abstract and list units completed without fallback. This confirms the citation fragment was repaired, while the remaining failure is a word-level column continuation/extraction issue.
- Verification: targeted TS tests 354/354 (quality 254, extraction pipeline 26, reading order 74); typecheck and lint pass. Full-suite rerun remains pending after this extraction change.
- Added a second conservative same-column continuation repair: a long paragraph ending in a short title-case token followed immediately by a lowercase paragraph at the same x/y flow is joined only when font size and vertical gap match. On `speechin.pdf`, `Tongue` now correctly joins `movement can also be inferred...`; the resulting 437-character block remains marked damaged-extraction only because the source block still contains mixed multi-column provenance, but it is no longer sent as an isolated fragment.
- `post-word-continuation-speechin-v1`: the ordinary-body abstract and list completed with no reader-visible fallback; the two extraction-damaged blocks were preserved before model translation. This removes the prior ordinary post-model fallback from the sampled units without relaxing the quality gate.
- Started fresh broad regression `post-extraction-continuation-cohort-v1` with all 114 cached OA catalog papers and 12 section-stratified units/paper (separate report/checkpoint; no prior report mixing). The process is still running in the active benchmark session. First completed papers: `interactive-jewellery`, `significant-other`, `power-over-skin` (36 units total). Early reader-visible fallbacks are being separated into damaged extraction, structural/list, and post-model quality failures; no production gate has been relaxed.
- Fresh cohort progress update: `neuroscience-rule-following` completed; 20/114 papers and 213 sampled units are now checkpointed in `post-extraction-continuation-cohort-v1`.
- Fresh cohort progress: 24/114 papers and 233 units checkpointed; latest `medical-imaging-deep-learning-review` (4 units) and `covid-ml-review` (3 units).
- Fresh cohort progress: 25/114 papers and 245 units checkpointed; latest `medical-image-segmentation-deep-learning`.
- Fresh cohort progress: 27/114 papers and 269 units checkpointed; latest `human-ai-interaction-guidelines`.
- Fresh cohort progress: 28/114 papers and 281 units checkpointed; latest `social-influence-social-advertising`.
- Fresh cohort progress: 29/114 papers and 293 units checkpointed; latest `modeling-human-behavior-cognitive-uncertainty`.
- Fresh cohort progress: 31/114 papers and 305 units checkpointed; latest `osworld-multimodal-agents` (12 units) and `conversation-analysis-user-experience` (0 units).
- Fresh cohort progress: 33/114 papers and 329 units checkpointed; latest `computational-linguistics-nlp-translation` and `how-content-volume-landing-pages`.
- Fresh cohort progress: 34/114 papers and 341 units checkpointed; latest `using-cognitive-psychology-gpt3`.
- Fresh cohort progress: 37/114 papers and 369 units checkpointed; latest `hfe-healthcare-2024` and `hfe-healthcare-safety-review`.
- Fresh cohort progress: 39/114 papers and 393 units checkpointed; latest `cognitive-dual-task-older-adults` and `marketing-unavailable-choice`.
- Fresh cohort progress: 40/114 papers and 405 units checkpointed; latest `marketing-framing-organic-food`.
- Fresh cohort progress: 41/114 papers and 413 units checkpointed; latest `marketing-platform-attitude`.
- Fresh cohort progress: 42/114 papers and 421 units checkpointed; latest `marketing-consumer-production-journey`.
- Fresh cohort progress: 43/114 papers and 433 units checkpointed; latest `ergonomics-job-rotation-robotics`.
- Fresh cohort progress: 44/114 papers and 445 units checkpointed; latest `ergonomics-quantified-factory-worker`.
- Fresh cohort progress: 45/114 papers and 457 units checkpointed; latest `ergonomics-flight-deck-applications`.
- Fresh cohort progress: 46/114 papers and 469 units checkpointed; latest `linguistics-register-web-corpus`.
- Fresh cohort progress: 47/114 papers and 481 units checkpointed; latest `linguistics-appraisal-institutional-discourse`.
- Fresh cohort progress: 48/114 papers and 493 units checkpointed; latest `marketing-neurophysiology-consumer-motivation`.
- Fresh cohort progress: 50/114 papers and 505 units checkpointed; latest `cognitive-memory-cue-interest` and `cognitive-vr-mnemonic-processing`.
- Fresh cohort progress: 51/114 papers and 513 units checkpointed; latest `cognitive-motor-incidental-memory`.
- Fresh cohort progress: 54/114 papers and 549 units checkpointed; latest `marketing-health-goals-nudging`, `hfe-healthcare-patient-safety-review`, and `marketing-online-context-web-evolution`.
- Fresh cohort progress: 55/114 papers and 561 units checkpointed; latest `hci-social-touch-in-human-computer-interaction`.
- Fresh cohort progress: 56/114 papers and 573 units checkpointed; latest `hci-human-computer-interaction`.
- Fresh cohort progress: 58/114 papers and 587 units checkpointed; latest `hci-human-computer-interaction-as-science` and `cognitive-psychology-study-on-the-optimization-effect-of-memory-on-vocabulary-teaching-in-c`.
- Fresh cohort progress: 59/114 papers and 599 units checkpointed; latest `cognitive-psychology-research-progress-of-memory-mechanism-in-cognitive-psychology`.
- Fresh cohort progress: 60/114 papers and 609 units checkpointed; latest `cognitive-psychology-a-tribute-to-the-memory-of-professor-neisser-the-godfather-of-cognitiv`.
- Fresh cohort progress: 61/114 papers and 612 units checkpointed; latest `cognitive-psychology-cognitive-psychology-first-language-and-false-memories`.
- Fresh cohort progress: 63/114 papers and 636 units checkpointed; latest `cognitive-psychology-role-of-educational-psychology-in-the-study-of-memory-conceptual-proce` and `cognitive-psychology-a-study-on-the-teaching-of-chinese-characters-memorization-for-foreign`.
- Fresh cohort progress: 64/114 papers and 648 units checkpointed; latest `cognitive-psychology-the-underlying-reasons-for-making-reminders-an-investigation-on-memory`.
- Fresh cohort progress: 65/114 papers and 659 units checkpointed; latest `cognitive-psychology-participant-nonnaivet-and-the-reproducibility-of-cognitive-psychology`.
- Fresh cohort progress: 66/114 papers and 671 units checkpointed; latest `marketing-consumer-behavior-marketing-and-supply-chains-of-fermented-foods-and-h`.
- Fresh cohort progress: 67/114 papers and 672 units checkpointed; latest `marketing-a-review-of-rural-consumer-behavior-marketing-strategies-and-consumer-`.
- Fresh cohort progress: 68/114 papers and 684 units checkpointed; latest `marketing-integrating-value-at-risk-var-model-into-behavior-economics-for-consum`.
- Fresh cohort progress: 72/114 papers and 711 units checkpointed; latest `marketing-the-blind-box-economy-exploring-consumer-behavior-marketing-strategies`, `marketing-digital-marketing-consumer-behavior`, `ergonomics-6-virtual-reality-and-ergonomics-human-factors`, and `ergonomics-2s2-1-ergonomics-human-factors-in-around-1964`.
- Fresh cohort progress: 74/114 papers and 735 units checkpointed; latest `ergonomics-analisis-pemetaan-bibliometrik-komputational-publikasi-pada-ergonomics` and `linguistics-the-role-of-applied-linguistics-and-language-discourse-analysis-in-eng`.
- Fresh cohort progress: 75/114 papers and 747 units checkpointed; latest `linguistics-eco-linguistics-in-english-reviewing-the-role-of-language-in-environme`.
- Fresh cohort progress: 78/114 papers and 783 units checkpointed; latest `linguistics-internet-linguistics-a-linguistic-analysis-of-electronic-discourse-as-`, `linguistics-text-discourse-dicteme-language-personality-as-basic-concepts-of-text-`, and `linguistics-the-importance-of-discourse-studies-in-linguistics-language-teaching-a`.
- Fresh cohort progress: 79/114 papers and 795 units checkpointed; latest `linguistics-discussion-on-second-language-acquisition-in-cognitive-linguistics-in-`.
- Fresh cohort progress: 80/114 papers and 807 units checkpointed; latest `linguistics-study-of-animal-discourse-in-language-textbooks-from-the-perspective-o`.
- Fresh cohort progress: 81/114 papers and 819 units checkpointed; latest `hci-introduction-to-human-computer-interaction`.
- Fresh cohort progress: 82/114 papers and 831 units checkpointed; latest `hci-intelligent-human-computer-interaction`.
- Fresh cohort progress: 84/114 papers and 843 units checkpointed; latest `cognitive-psychology-research-on-the-effects-of-different-listening-process-models-in-liste` and `cognitive-psychology-chronometric-constructive-cognitive-learning-evaluation-model-measurin`.
- Fresh cohort progress: 85/114 papers and 849 units checkpointed; latest `cognitive-psychology-editorial-the-role-of-the-distinctions-between-identification-producti`.
- Fresh cohort progress: 87/114 papers and 863 units checkpointed; latest `cognitive-psychology-the-validity-of-the-specific-coding-principle-the-explanations-from-co` and `cognitive-psychology-grand-challenges-in-environmental-psychology`.
- Fresh cohort progress: 88/114 papers and 875 units checkpointed; latest `marketing-the-influence-of-social-media-marketing-on-consumers-behavior`.
- Fresh cohort progress: 89/114 papers and 887 units checkpointed; latest `marketing-impact-of-sensory-marketing-on-consumer-behavior`.
- Fresh cohort progress: 90/114 papers and 899 units checkpointed; latest `marketing-impact-of-e-marketing-on-consumer-behavior`.
- Fresh cohort progress: 91/114 papers and 909 units checkpointed; latest `marketing-marketing-communication-and-consumer-behavior-in-digital-era`.
- Fresh cohort progress: 92/114 papers and 921 units checkpointed; latest `marketing-impact-of-green-marketing-on-consumer-behavior`.
- Fresh cohort progress: 93/114 papers and 933 units checkpointed; latest `ergonomics-human-factors-and-ergonomics`.
- Fresh cohort progress: 94/114 papers and 945 units checkpointed; latest `ergonomics-human-factors-ergonomics-in-hydrocarbon-facilities`.
- Fresh cohort progress: 96/114 papers and 959 units checkpointed; latest `linguistics-an-empirical-analysis-of-the-use-of-discourse-markers-by-second-langua` and `linguistics-linguistics-and-politics-russianisms-in-the-western-english-language-p`.
- Fresh cohort progress: 98/114 papers and 983 units checkpointed; latest `linguistics-constructing-or-disrupting-peace-through-language-a-peace-linguistics-` and `linguistics-gender-linguistics-in-the-linguo-limological-aspect-by-the-material-of`.
- Fresh cohort progress: 100/114 papers and 997 units checkpointed; latest `hci-development-of-user-interface-user-experience-using-design-thinking-ap` and `hci-user-experience-analysis-on-mobile-application-design-using-user-exper`.
- Fresh cohort progress: 101/114 papers and 1003 units checkpointed; latest `hci-a-comparative-research-on-usability-and-user-experience-of-user-interf`.
- Fresh cohort progress: 102/114 papers and 1015 units checkpointed; latest `hci-user-experience-design-using-machine-learning-a-systematic-review`.
- Fresh cohort progress: 104/114 papers and 1039 units checkpointed; latest `hci-redesign-of-user-experience-in-inaportnet-using-the-user-experience-qu` and `cognitive-psychology-the-role-of-attention-memory-and-cognition-in-the-decision-making-proc`.
- Fresh cohort progress: 105/114 papers and 1051 units checkpointed; latest `cognitive-psychology-attention-and-entrepreneurial-cognition`.
- Fresh cohort progress: 106/114 papers and 1059 units checkpointed; latest `marketing-the-impact-of-online-advertising-on-consumer-choice-consumption-traps-`.
- Fresh cohort progress: 107/114 papers and 1071 units checkpointed; latest `marketing-a-study-on-the-relationship-between-advertising-value-choice-of-media-`.
- Fresh cohort progress: 108/114 papers and 1083 units checkpointed; latest `marketing-is-digital-advertising-effective-under-conditions-of-low-attention-the`.
- Fresh cohort progress: 109/114 papers and 1095 units checkpointed; latest `marketing-influence-of-advertising-incentives-on-consumers-in-the-digital-enviro`.
- Fresh cohort progress: 110/114 papers and 1107 units checkpointed; latest `ergonomics-fatigue-and-occupational-safety-in-short-haul-light-transport`.
- Fresh cohort progress: 112/114 papers and 1131 units checkpointed; latest `ergonomics-analysis-of-burnout-and-occupational-safety-in-nurses-a-literature-rev` and `ergonomics-risk-factors-for-occupational-fatigue-in-construction-workers-a-system`.
- Fresh cohort progress: 113/114 papers and 1143 units checkpointed; latest `linguistics-the-role-of-morphology-in-computational-linguistics-its-significance-i`.
- Fresh cohort completed: report `post-extraction-continuation-cohort-v1` contains 114 papers and 1,155 sampled units. Automatic attribution: 440 damaged-extraction, 404 ordinary-body-prose, 172 list, 41 statistical-prose, 35 section-heading, 61 reference-chrome, 2 caption. Ordinary-body reader-visible fallback is 118/404 (29.2%), so the <=5% target is not met. Across all rows, 607 fallbacks are pre-model and 155 post-model; this is evidence for a broad extraction/source-completeness problem plus a separate model/quality problem, not evidence to relax gates. Manual semantic review and category-specific fixes remain required.
- Ordinary-body fallback attribution is more specific: 116/118 are post-model and 2/118 are pre-model. The broad pre-model count is dominated by damaged/list/reference rows; ordinary prose needs model-quality and semantic-review analysis rather than an indiscriminate extraction-gate change. Review queue saved as `test-data/real-papers/reports/ordinary-fallback-review-v1.{json,md}`.
- Preliminary semantic review of 17 representative ordinary fallback rows found 9 omissions, 2 hallucinations, 3 semantic shifts, 1 numeric/invariant failure, and 2 source fragments; 11 had severity 4. This confirms that reducing fallback by accepting current outputs would be unsafe. Review artifact: `test-data/real-papers/reports/ordinary-fallback-manual-review-v1.json`.
- Selective-cascade audit dry-run over the fresh report identifies 140 post-model rows with source text eligible for an alternate model and excludes 15 rows with incomplete source; no Ollama endpoint is currently available, so no alternate output was accepted. Dry-run artifact: `test-data/real-papers/reports/selective-cascade-post-cohort-v1.json`.
- Added two behavior-locking quality tests for reviewed participant-fact and bibliographic hallucinations; quality suite now passes 256 tests.
- Benchmark accounting correction: 114 catalog entries were selected, but `precious-materials` had no cached PDF and produced no rows; the measured corpus is therefore 113 papers / 1,155 units, with the missing PDF tracked separately.
## 2026-10-05 validation checkpoint

- Final post-build verification: `npm test` passes (69 files / 631 tests), `npx tsc -b --pretty false` passes, `git diff --check` passes, and translation-server `pytest translation-server/tests -q` passes (247 tests, 11 subtests). The `npm test -- --runInBand` invocation itself is unsupported by Vitest; the plain `npm test` run is the authoritative result.
- The rebuilt macOS bundle is at `src-tauri/target/release/bundle/macos/Paper Reader.app` (mtime 2026-10-05 10:15:39), with bundled `segmenter.py` byte-identical to source and `SEGMENTER_VERSION="semantic-v83"`. The bundled MADLAD source includes the Transformers 4.57.6 / semantic-v83 version components. Fully quit the currently running app/server before launching this bundle; the old process previously reported semantic-v73.
- Resumed fresh benchmark with the ready local server (`translation-audit` run `2026-10-05T01-19-33-121Z`): 112/114 papers, 1,266 evaluable units, 322 model responses, 994 original fallbacks; ordinary-body fallback was 242/447 (54.1%). The run is diagnostic only because 672 units were blocked by the production input policy and 538 damaged-extraction rows dominated the fallback rate. This confirms that relaxing the quality gate alone would not reach the target; the next work must reduce structural/source blocking and separately evaluate the 322 model outputs semantically. One catalog entry still had no eligible blocks and is recorded in the report.
- The authenticated-free benchmark `translation-audit-auth-v1` was restarted after the previous 37-paper run stalled on long-lived requests. The new server/benchmark are live (PIDs 3715/4069); `--resume` skipped 29 checkpointed papers and the report currently contains 38 papers / 381 rows, latest `marketing-unavailable-choice`. Current interim ordinary-body fallback is 29/123 (23.6%); this is not final until all selected papers finish.
- Interim checkpoint diagnostic (not final): 213 sampled rows across those 18 papers include 71 ordinary-body-prose rows; 16 are reader-visible fallbacks (22.5%), with 15 post-model and 1 pre-model. Treat this as directional only until all papers finish; it already indicates that post-model quality rejection remains the dominant ordinary-prose issue.

- Post-extraction continuation benchmark remains available at `test-data/real-papers/reports/post-extraction-continuation-cohort-v1.{json,md}`. The catalog contains 114 entries and 1,155 sampled units; the raw report currently has 109 paper entries with non-empty rows because four catalog entries have empty cached-row results and `precious-materials` is explicitly missing its PDF. Treat `papersWithRows` from the summary artifact as the authoritative paper count until those entries are repaired; do not describe this as 114 fully measured papers.
- Verification after the latest benchmark: `npm run lint` passes with existing warning-only escape/comparison diagnostics; `git diff --check` passes; `npm run typecheck` passes; `npm test -- --run src/test/quality.test.ts` passes (256 tests).
- Translation server and Ollama are stopped/unavailable after the benchmark. No alternate-model result has been collected yet, so no production cascade/protection change is justified from that experiment.
- Benchmark bookkeeping was tightened in `scripts/benchmark-real-paper-translation.ts`: `--resume` now treats an entry as complete only when it has at least the requested per-paper sample count, preventing empty extraction/server checkpoints from being silently counted as complete.
- Added `test-data/real-papers/reports/empty-entry-diagnostic-v2.{json,md}`. The four empty cached entries are now attributed explicitly: no eligible audit blocks after the 90-character paragraph filter (23/1/0/6 paragraph candidates respectively), rather than being reported as silent zero-row successes. This is an audit-sampling/extraction eligibility issue, not evidence that translation succeeded or failed.
- Re-ran those four entries with the server ready; `missing-four-cohort-v1.{json,md}` confirms the same eligibility errors, so no model output was produced for them. The server was then stopped to avoid leaving the local model resident.
- Post-change verification: lint exits 0 with existing warning-only diagnostics, typecheck exits 0, and `translation-server/tests/test_segmenter.py` passes (61 tests, 8 subtests).
- Added `ordinary-fallback-triage-v2.json`: the 118 ordinary-body fallbacks split into 47 server quality rejections, 38 scientific-invariant failures, 13 semantic-relation failures, 8 protected-token restore failures, 4 language/degeneration failures, 2 pre-model cases, and 6 other cases. This confirms the next optimization target is post-model handling/model output, not broad extraction relaxation; the counts remain automatic diagnostics, not semantic ground truth.
- Replayed three held-out ordinary fallback sources directly against the current server in `madlad-fallback-replay-v1.json`. The long participant-method block still triggered partial-unit fallback (52s); the speechin block produced mixed-script/unsupported-content output in 83s; the bibliography block produced an unrelated Japanese citation in 7s, but the production audit's invariant gate correctly rejects that row. These direct outputs reinforce that model decode can drift and that the invariant gate is preventing at least this hallucination from reaching the reader.
- Promoted the replay helper to `scripts/replay-translation-fallbacks.mjs` so future model/protection comparisons can reproduce the same sources without touching production caches. `node --check`, typecheck, and diff checks pass.
- Added the human-readable companion `test-data/real-papers/reports/madlad-fallback-replay-v1.md` with source/output pairs for manual semantic review.
- Local Ollama was available with pre-existing `qwen2.5:7b` and `qwen2.5:14b` models. Audit-only selective-cascade probes were run on three fallback rows: qwen2.5:7b accepted 1/3, while qwen2.5:14b accepted 2/3 by the current gate. The 14B accepted output still contained the Chinese conjunction `其次`, so this is not production-ready evidence; the rejected cases correctly caught mixed Chinese, missing invariants, or untranslated lexemes. Reports: `selective-cascade-qwen25-7b-v1.json`, `selective-cascade-qwen25-14b-v1.json`. Ollama was stopped after the probe.
- A qwen3:14b probe was started but the first long candidate exceeded the 240-second request budget and was terminated; `selective-cascade-qwen3-14b-v1.json` is explicitly incomplete (1 result). It is not a quality conclusion.
- Consolidated the small alternate-model probes in `selective-cascade-model-comparison-v1.{json,md}`. qwen2.5:7b accepted 1/3 (mean 8.4s), qwen2.5:14b accepted 2/3 (mean 15.1s with Chinese contamination in an accepted output), and qwen3:14b is incomplete (1/3, 137.6s). These are diagnostic only and do not justify production routing.
- Added a regression guard for the observed Chinese connective compound `其次` in mixed Japanese output. This extends the existing script-contamination detector (rather than a hallucinated-content blacklist); quality suite now passes 257 tests.
- Re-evaluated the saved qwen2.5:14b outputs with the updated gate in `selective-cascade-qwen25-14b-post-gate-v1.json`: the previously accepted contaminated output is now rejected, leaving 1/3 accepted. This is a gate-safety improvement, not a model-quality improvement or production cascade decision.
- A broader qwen2.5:14b run was started for 10 candidates but was stopped after 3 long results (1 accepted) because the first three already took nearly two minutes each. `selective-cascade-qwen25-14b-v2-10.json` is explicitly partial and must not be treated as a 10-case benchmark.
- Authenticated-free real-paper benchmark `translation-audit-auth-v1` progressed to 39/113 papers and 405 rows; ordinary-body is 134 rows with 36 reader-visible fallbacks (26.9% interim). Benchmark/server remain active; metrics are not final.
- Benchmark checkpoint updated: `translation-audit-auth-v1` is now 40/113 papers, 413 rows; ordinary-body 142 rows, 36 reader-visible fallbacks (25.4% interim). Server and benchmark remain active.
- Benchmark checkpoint updated: `translation-audit-auth-v1` is now 41/113 papers and 421 rows; ordinary-body fallback remains to be recalculated from the live report.
- Benchmark checkpoint: `translation-audit-auth-v1` reached 42/113 papers, 433 rows; ordinary-body 153 rows, 38 reader-visible fallbacks (24.8% interim). Latest `ergonomics-job-rotation-robotics`.
- After checkpoint-preserving restart, `translation-audit-auth-v1` resumed at 41/113 papers, 445 rows; ordinary-body 160 rows, 40 reader-visible fallbacks (25.0% interim). Dedicated server session and benchmark session are active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **54/114 papers and 561 sampled units**, latest `hci-social-touch-in-human-computer-interaction`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **55/114 papers and 573 sampled units**, latest `hci-human-computer-interaction`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **56/114 papers and 585 sampled units**, latest `hci-human-computer-interaction-as-science`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **57/114 papers and 587 sampled units**, latest `cognitive-psychology-study-on-the-optimization-effect-of-memory-on-vocabulary-teaching-in-c`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **58/114 papers and 599 sampled units**, latest `cognitive-psychology-research-progress-of-memory-mechanism-in-cognitive-psychology`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **59/114 papers and 609 sampled units**, latest `cognitive-psychology-a-tribute-to-the-memory-of-professor-neisser-the-godfather-of-cognitiv`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **60/114 papers and 612 sampled units**, latest `cognitive-psychology-cognitive-psychology-first-language-and-false-memories`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **62/114 papers and 636 sampled units**, latest `cognitive-psychology-a-study-on-the-teaching-of-chinese-characters-memorization-for-foreign`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **63/114 papers and 648 sampled units**, latest `cognitive-psychology-the-underlying-reasons-for-making-reminders-an-investigation-on-memory`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **64/114 papers and 659 sampled units**, latest `cognitive-psychology-participant-nonnaivet-and-the-reproducibility-of-cognitive-psychology`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **65/114 papers and 671 sampled units**, latest `marketing-consumer-behavior-marketing-and-supply-chains-of-fermented-foods-and-h`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **66/114 papers and 672 sampled units**, latest `marketing-a-review-of-rural-consumer-behavior-marketing-strategies-and-consumer-`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **67/114 papers and 684 sampled units**, latest `marketing-integrating-value-at-risk-var-model-into-behavior-economics-for-consum`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **68/114 papers and 696 sampled units**, latest `marketing-the-blind-box-economy-exploring-consumer-behavior-marketing-strategies`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **72/114 papers and 723 sampled units**, latest `ergonomics-analisis-pemetaan-bibliometrik-komputational-publikasi-pada-ergonomics`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **74/114 papers and 747 sampled units**, latest `linguistics-eco-linguistics-in-english-reviewing-the-role-of-language-in-environme`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **77/114 papers and 783 sampled units**, latest `linguistics-the-importance-of-discourse-studies-in-linguistics-language-teaching-a`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **78/114 papers and 795 sampled units**, latest `linguistics-discussion-on-second-language-acquisition-in-cognitive-linguistics-in-`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **79/114 papers and 807 sampled units**, latest `linguistics-study-of-animal-discourse-in-language-textbooks-from-the-perspective-o`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **80/114 papers and 819 sampled units**, latest `hci-introduction-to-human-computer-interaction`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **81/114 papers and 831 sampled units**, latest `hci-intelligent-human-computer-interaction`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **83/114 papers and 843 sampled units**, latest `cognitive-psychology-chronometric-constructive-cognitive-learning-evaluation-model-measurin`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **84/114 papers and 849 sampled units**, latest `cognitive-psychology-editorial-the-role-of-the-distinctions-between-identification-producti`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **86/114 papers and 863 sampled units**, latest `cognitive-psychology-grand-challenges-in-environmental-psychology`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **87/114 papers and 875 sampled units**, latest `marketing-the-influence-of-social-media-marketing-on-consumers-behavior`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **88/114 papers and 887 sampled units**, latest `marketing-impact-of-sensory-marketing-on-consumer-behavior`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **89/114 papers and 899 sampled units**, latest `marketing-impact-of-e-marketing-on-consumer-behavior`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **90/114 papers and 909 sampled units**, latest `marketing-marketing-communication-and-consumer-behavior-in-digital-era`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **91/114 papers and 921 sampled units**, latest `marketing-impact-of-green-marketing-on-consumer-behavior`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **92/114 papers and 933 sampled units**, latest `ergonomics-human-factors-and-ergonomics`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **93/114 papers and 945 sampled units**, latest `ergonomics-human-factors-ergonomics-in-hydrocarbon-facilities`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **95/114 papers and 959 sampled units**, latest `linguistics-linguistics-and-politics-russianisms-in-the-western-english-language-p`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **97/114 papers and 983 sampled units**, latest `linguistics-gender-linguistics-in-the-linguo-limological-aspect-by-the-material-of`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **99/114 papers and 997 sampled units**, latest `hci-user-experience-analysis-on-mobile-application-design-using-user-exper`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **100/114 papers and 1003 sampled units**, latest `hci-a-comparative-research-on-usability-and-user-experience-of-user-interf`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **101/114 papers and 1015 sampled units**, latest `hci-user-experience-design-using-machine-learning-a-systematic-review`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **103/114 papers and 1039 sampled units**, latest `cognitive-psychology-the-role-of-attention-memory-and-cognition-in-the-decision-making-proc`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **104/114 papers and 1051 sampled units**, latest `cognitive-psychology-attention-and-entrepreneurial-cognition`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **105/114 papers and 1059 sampled units**, latest `marketing-the-impact-of-online-advertising-on-consumer-choice-consumption-traps-`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **106/114 papers and 1071 sampled units**, latest `marketing-a-study-on-the-relationship-between-advertising-value-choice-of-media-`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **107/114 papers and 1083 sampled units**, latest `marketing-is-digital-advertising-effective-under-conditions-of-low-attention-the`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **108/114 papers and 1095 sampled units**, latest `marketing-influence-of-advertising-incentives-on-consumers-in-the-digital-enviro`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **109/114 papers and 1107 sampled units**, latest `ergonomics-fatigue-and-occupational-safety-in-short-haul-light-transport`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **111/114 papers and 1131 sampled units**, latest `ergonomics-risk-factors-for-occupational-fatigue-in-construction-workers-a-system`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **112/114 papers and 1143 sampled units**, latest `linguistics-the-role-of-morphology-in-computational-linguistics-its-significance-i`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **113/114 papers and 1155 sampled units**, latest `linguistics-computational-linguistics`; server and benchmark remain active.
- Translation audit auth-v1 completed its cached corpus pass: **113/114 catalog papers had PDFs**, with **1 missing PDF (`precious-materials.pdf`)**; 4 cached papers produced no eligible blocks because the sampler minimum was 90 characters. The report contains **1,155 sampled units**. Ordinary-body reader-visible fallback is **118/404 (29.2%)**, so the <=5% target is not met. A machine-readable summary is saved at `test-data/real-papers/reports/translation-audit-auth-v1-summary.json`. Main measured issue is post-model quality fallback in ordinary prose (116/118), while damaged extraction is predominantly blocked pre-model (405/440). Benchmark processes have exited normally; translation server remains running.
- Triage refinement (2026-10-05): the 111 ordinary-body fallback rows contain 55 `server/protection`, 43 `quality-gate`, 5 `extraction/structure`, and 8 `other` classifications. Within `server/protection`, 43 are model-quality rejection and 10 are protected-token restoration failures. Six of those 10 visibly contain malformed layout/metadata (flattened table text, broken columns, or affiliation lines); the remaining clean-looking cases are long citation-heavy prose and require decode/protection A/B before any production change. No blanket protection relaxation was applied.
- Source policy fix (2026-10-05): narrow credential/affiliation lines such as `Associate Member ... Institution ... Engineers` are now excluded from paragraph translation as publication metadata. Ordinary prose about members or institutions remains eligible. Quality tests: **261/261**, typecheck passes; no full-corpus rerun was performed.
- Translation-unit normalization (2026-10-05): when native PDF text drops the opening parenthesis before an author-year citation (`similar ways Bailenson and Yee (2007), ...`), model input now restores that boundary without changing the source slice. Segmenter version/cache identity advanced to `semantic-v84`. Segmenter tests **62/62**, model-version test, typecheck, and diff check pass; no full-corpus rerun was performed.
- Runtime spot check (2026-10-05): after restarting the local server, the detached-citation fixture completed with `model_version=semantic-v84`, no fallback, and a restored `(Bailenson and Yee, 2007)` citation. This is a one-fixture regression check, not a population quality estimate.
- Extended runtime spot check (2026-10-05): two available auth-v1 blocks with detached/inline author-year citation context completed on `semantic-v84` with no server fallback. Artifact: `semantic-v84-author-year-spotcheck-v1.json`. The other two requested keys were not present in auth-v1 and were not substituted with different papers.
- Source-boundary fix (2026-10-05): long blocks ending at a bare `Fig.`/`Figure`/`Table` label are now classified as incomplete cross-references, covering a page/column cut that previously bypassed the numbered-label guard. Quality tests **262/262**, typecheck, and diff check pass; no full-corpus rerun was performed.
- Focused extraction regression (2026-10-05): reran `ergonomics-job-rotation-robotics` (4 sampled units) after the bare-label guard. The `... shown in Fig.` unit stayed pre-model/source fallback with the explicit figure-label completeness reason; it was not sent to MADLAD. Other failures were existing mixed-script/fragment cases. Artifact: `post-bare-fig-v1.{json,md}`; this is a one-paper diagnostic, not a corpus metric.
- Cascade audit hardening (2026-10-05): citation alignment is now shared by the audit diagnostic and selective-cascade benchmark. Cascade results expose `citationAlignment` and `acceptedForCascade`; a model output that drops eligible source citation occurrences is not counted as safe for cascade, while production routing remains unchanged. Targeted tests **264/264**, typecheck, and the citation diagnostic pass (CAT v3: 5 rows, 1 flagged).
- Follow-up checkpoint (2026-10-05): cached audit `translation-audit-auth-v1` has 140 post-model fallback candidates eligible for selective-cascade replay (15 incomplete-source candidates excluded). `scripts/benchmark-selective-cascade.ts` dry-run artifact: `test-data/real-papers/reports/selective-cascade-auth-v1-dry.json`. Ollama CLI exists at `/opt/homebrew/bin/ollama`, but `ollama list` reports no running Ollama server; no alternate-model output has been claimed. Production behavior remains unchanged.
- Selective cascade probe (2026-10-05): Ollama server was started and `curl http://127.0.0.1:11434/api/tags` confirmed local models, including `qwen2.5:7b`. The Node/Vite benchmark process nevertheless received `TypeError: fetch failed` for all 20 probes (localhost isolation between the benchmark runtime and Ollama), so **no alternate-model quality result is claimed**. Artifact: `test-data/real-papers/reports/selective-cascade-auth-v1-qwen25-7b.json` records the transport failures. To obtain valid outputs, run the benchmark from the same host shell where Ollama is reachable.
- CAT decision checkpoint (2026-10-05): consolidated existing CAT-Translate 3.3B evidence in `test-data/real-papers/reports/cat-translate-decision-v1.json`. CAT remains production-disabled. Existing frozen 30-row cascade projection is 1/30 reader-visible fallback (3.3%) with 0 severity>=2 among 10 CAT candidates, but it is not an independent population estimate; prior CAT reviews contain severity-3 terminology/semantic errors and runtime integration is unverified. Next gate is source-hash-disjoint fallback evaluation with complete blind semantic review.
- Extraction/translation quality fix (2026-10-05): resume translation now uses `projectSafeUnitTranslation` for block-level partial server results. Valid one-to-one unit mappings retain successful Japanese units and preserve failed units as exact source; all-failed, title, and section results remain all-or-nothing. Partial blocks are marked `translationOutcome: partial_source_preserved` with failed unit indices. Focused tests 267/267 and typecheck pass. A fresh 113-paper benchmark is still required to measure the fallback change; no quality threshold was relaxed.
- Fresh targeted regression after safe partial projection (2026-10-05): reran 4 audited papers (`dont-mind-me`, `speechin`, `hci-empirical-methods`, `interpreting-neural-networks`), 16 units, with report `translation-audit-partial-projection-v1`. Results are saved for before/after comparison; this is not the full 113-paper refresh.
- Partial projection follow-up (2026-10-05): client-side MADLAD response validation now accepts a safe one-to-one partial unit projection before the whole-text Japanese plausibility check; unsafe/unmapped or all-failed responses remain rejected. Added resume regression covering persisted Japanese units plus exact English source for failed units. Full suite now passes **632/632 across 69 files**, typecheck passes.
- Full audit refresh started (2026-10-05): `translation-audit-auth-v2-partial-projection` is running against 113 cached PDFs (114 catalog entries, one missing), same 12-unit sampling as auth-v1. First checkpoint `interactive-jewellery` completed; benchmark session remains active.
- Benchmark policy checkpoint (2026-10-05): stopped the full 113-paper `translation-audit-auth-v2-partial-projection` refresh at 2 papers / 24 units because the user requested full-corpus measurement only at major algorithm/model/quality-gate milestones. The partial report is retained but is not a corpus-wide metric. Routine changes should use focused representative papers plus regression tests; rerun the full corpus only after a major change.
- Focused post-fix benchmark checkpoint (2026-10-05): `translation-audit-partial-projection-v2` was intentionally stopped after the first paper (`dont-mind-me`, 4 units) because the next paper made no progress for an extended MPS interval. The partial report is diagnostic only; no corpus-wide rate is inferred. Full-corpus runs remain reserved for major milestones.
- Batch partial projection parity (2026-10-05): `/translate/batch` now applies the same safe one-to-one partial projection as `/translate`; added batch regression coverage. Full suite passes **633/633 across 69 files**, typecheck passes. No quality thresholds were relaxed.
- Partial projection source-integrity hardening (2026-10-05): one-to-one partial projection now also verifies that the normalized concatenation of server `translation_units` exactly reconstructs the request source. Missing, reordered, or substituted units therefore remain whole-block fallback. Focused tests (15/15) and typecheck pass.
- CAT source-disjoint probe (2026-10-05): evaluated one previously unmeasured ordinary-body fallback (`interactive-jewellery:b-d753999d`) with CAT-Translate 3.3B. Generation completed in 7.5s (117 input / 77 output tokens), but the current safety evaluator rejected it for `exclusivity relation missing`. Artifacts: `cat-source-disjoint-auth-v1-single.json` and `cat-source-disjoint-auth-v1-single-quality.json`. No production routing change.
- Quality false-reject fix (2026-10-05): CAT source-disjoint probe exposed a natural Japanese exclusivity rendering (`独自の物理的歴史`) rejected as `exclusivity relation missing`. Added generic `独自`/`独特` recognition to the relation evaluator with regression coverage. The same CAT output now passes the evaluator (1/1 instead of 0/1); no blacklist or paper-specific rule. Full suite **634/634**, typecheck passes.
- CAT source-disjoint tail probe (2026-10-05): evaluated 4 additional clean ordinary-body fallback rows with CAT-Translate 3.3B. Automatic gate accepted **2/4 (50%)**; two were rejected for `degenerate output` and `participant role shifted to researcher`. Combined with the prior one-row probe (accepted after the exclusivity false-reject fix), this is **3/5 automatic accepts**, not a semantic safety claim; manual review remains required. Artifacts: `cat-source-disjoint-auth-v1-tail.json` and `cat-source-disjoint-auth-v1-tail-quality.json`.

- Benchmark cadence policy (2026-10-05): 113本規模の全件計測は、抽出/reading-order、segmenter/translation unit、placeholder protection、モデル/Transformers/decode、quality gate/fallback/cascadeなど、複数分野へ影響する大きな変更またはリリース判定時だけ実施する。通常の局所修正は、代表4〜12論文、failure cohort、回帰テスト、typecheck/lintで確認する。詳細は `docs/TRANSLATION_BENCHMARK_POLICY.md`。未完了の全件レポートは全体指標に使わない。

- CAT source-disjoint manual review (2026-10-05): reviewed all 5 outputs from `cat-source-disjoint-auth-v1-single` + `...tail`. Automatic accepts were 3/5; all 3 accepted rows were judged usable for this small sample (two severity 0, one severity 1). One rejected row had a procedure-scope semantic shift (source `utterances` rendered as `sessions`, severity 2); the other was degenerate and correctly rejected. Artifact: `test-data/real-papers/reports/cat-source-disjoint-auth-v1-manual-review.json`. This remains diagnostic only; CAT production cascade stays disabled until a larger held-out cohort and blind review are complete.

- CAT source-disjoint v2 probe (2026-10-05): five additional fallback rows were generated with CAT-Translate 3.3B (`cat-source-disjoint-auth-v2.json`). Manual review found 2 clean complete rows, both usable (severity 0), while 3 rows contained extraction/list-boundary artifacts and were excluded from model-quality conclusions. This reinforces the need to separate source reconstruction failures before comparing models; no production cascade change was made.
- CAT v2 review correction (2026-10-05): the HCI row initially marked clean was reclassified as `source_fragment` after running the existing `diagnoseIncompleteSource` evaluator; it ends without terminal punctuation. The corrected v2 review has 1 clean complete row, 4 source/structure-excluded rows. CAT quality artifact: `cat-source-disjoint-auth-v2-quality.json`.

- Source-boundary fix (2026-10-05): `diagnoseIncompleteSource` now flags long prose ending in a bare Figure/Fig/Table label as a structural boundary (`図表ラベルが段落末尾に混入している可能性があります`), preventing caption/paragraph blends from entering clean model comparisons. Added regression coverage; quality suite 258/258 and typecheck pass.
- Post-boundary focused check (2026-10-05): reran CAT v2 quality evaluation after the trailing figure-label guard. Both `step-to-charge` rows now receive the explicit structural reason `図表ラベルが段落末尾に混入している可能性があります`; the HCI row remains excluded for missing terminal punctuation, and the cognitive row is rejected as degenerate. Artifact: `cat-source-disjoint-auth-v2-quality-post-boundary.json`.
- Source-boundary fix (2026-10-05): `diagnoseIncompleteSource` now flags numbered dash items embedded after a completed sentence (for example `... 40 dollars. 4 - Machine ...`) as list/body merges. Quality suite 259/259 and typecheck pass; this is a generic structural guard, not a paper-specific rule.
- Post-list-boundary verification (2026-10-05): CAT v2 re-evaluation now classifies all four structurally contaminated rows as source-excluded; only `power-over-skin:b-51971114` remains clean (1/1 quality accepted). Artifact: `cat-source-disjoint-auth-v2-quality-post-structure-v2.json`.
- Full regression verification after structural guards (2026-10-05): `npm test` passed 69 files / 636 tests; typecheck had already passed for the same change. The initial `--runInBand` option was unsupported by Vitest and was rerun correctly without it.
- Static verification after source guards (2026-10-05): `npm run lint` exits 0 with the repository's existing warning-only diagnostics; no new error was introduced.
- CAT source-disjoint v3 (2026-10-05): selected five clean complete fallback rows (no source-integrity flags). CAT quality gate accepted 5/5. Manual review judged 4 usable (three severity 0, one severity 1) and found one severity-2 citation alignment risk in the GPT-3 cognitive-psychology paragraph, where inline citation numbers shifted relative to claims. Artifact: `cat-source-disjoint-auth-v3-manual-review.json`; CAT remains production-disabled.
- Citation-integrity follow-up (2026-10-05): attempted a generic citation-occurrence-count gate against the CAT v3 citation-shift example, but existing tests showed false rejects for valid superscript, clustered, and HTML-wrapped citation forms. The experimental code was reverted; production quality behavior is unchanged. Citation alignment remains a diagnostic/manual-review gap rather than a new unsafe heuristic.
- Citation diagnostic (2026-10-05): added audit-only `scripts/diagnose-citation-alignment.ts` and `npm run audit:citation-alignment`. It compares bracketed/inline citation token inventories without changing production routing. On CAT v3 it flags only the GPT-3 cognitive-psychology row (missing citation tokens `2` and `6`); ordinary numeric/measurement rows are not flagged. This is a review aid, not an automatic acceptance gate.
- Citation diagnostic expansion (2026-10-05): ran the audit-only citation alignment tool on CAT v1/v2/v3 artifacts. v1 single/tail had 0 flagged rows; v2 had 2 flags, both structurally contaminated rows; v3 had 1 flag, the manually identified GPT-3 citation-shift row. This supports using the diagnostic after source-integrity filtering and not as a standalone gate.
- Citation diagnostic v2 (2026-10-05): the audit script now excludes incomplete sources itself and ignores Figure/Table numeric labels. Rechecking CAT v2 yields 1 eligible, 4 source-excluded, 0 citation flags; CAT v3 yields 5 eligible, 1 citation flag (the known GPT-3 row). Typecheck passes.
- Regression after citation diagnostic v2 (2026-10-05): `npm test` passed 69 files / 636 tests. The diagnostic remains audit-only and does not affect production translation behavior.
- CAT benchmark deduplication (2026-10-05): `scripts/benchmark-cat-translate.py` now deduplicates whitespace-normalized source text by SHA-256 before applying `CAT_MAX_ROWS`, and records `duplicateSourceCount`. This prevents overlapping report generations from filling a supposedly source-disjoint cohort; Python compilation and diff checks pass.
- CAT source-disjoint v4 (2026-10-05): after excluding source hashes used by v1-v3, evaluated five new clean rows across HCI, cognitive/AI, neuroscience-adjacent systems, and computational linguistics. CAT automatic gate accepted 5/5; manual review found 3 usable severity-0 rows and 2 severity-2 citation omissions (`keyboard 11`, inline Xapian citation `2`). Citation diagnostic flagged exactly those two. Artifact: `cat-source-disjoint-auth-v4-manual-review.json`; no production cascade change.
- CAT cohort summary (2026-10-05): consolidated manual reviews for source-disjoint CAT v1-v4 in `cat-source-disjoint-summary-v1-v4.{json,md}`. Across 20 reviewed rows, 15 remain after source/fallback exclusion; 11 were manually safe for a bounded cascade and 4 had severity >=2 (two citation omissions in v4 plus the prior procedure-scope shift). This is diagnostic evidence only, not a corpus estimate or production approval.
- CAT source-disjoint v7 (2026-10-05): evaluated five additional source-hash-disjoint ordinary-body rows from `interpreting-neural-networks` with CAT-Translate 3.3B. All 5 outputs were complete and manually judged usable (severity 0); quality evaluator accepted 5/5 and citation diagnostic flagged 0. Aggregate v1-v7 is 40 rows, 30 clean after source/fallback exclusion, 26 manually safe clean rows, and 4 severity>=2 rows; CAT remains production-disabled because the held-out cohort is still small and prior severe citation/scope failures remain. Artifacts: `cat-source-disjoint-auth-v7.json`, `cat-source-disjoint-auth-v7-manual-review.json`, `cat-source-disjoint-summary-v1-v7.json`.
- Cascade citation safety (2026-10-05): selective alternate-model acceptance now applies the existing citation-alignment diagnostic at the production opt-in boundary. Eligible source citation occurrences missing from an alternate output are rejected as `citation occurrence missing`; incomplete sources remain governed by the existing source-integrity gate. Added regression coverage for numeric citation omission; targeted 20/20 tests and typecheck pass. CAT remains audit-only/disabled.
- Regression verification after cascade citation guard (2026-10-05): full Vitest passed **70 files / 645 tests**; citation-alignment and alternate-engine tests pass, and the worktree remains clean after commit `e30a70e`.
- CAT source-disjoint v8 (2026-10-05): evaluated five additional source-hash-disjoint ordinary-body fallback rows. Two long e-textile prose rows were manually usable (severity 0); the speech-in row had a severity-2 procedure-scope shift (`utterances` rendered as `sessions`) and was rejected by the quality guard; two GPT-3 rows were correctly excluded as incomplete list/question sources. Automatic quality accepted 2/3 clean rows; citation diagnostic flagged 0. Aggregate v1-v8 is 45 rows, 33 clean, 28 manually safe, and 5 severity>=2. CAT remains production-disabled.
- CAT terminology-prompt probe (2026-10-05): a one-row retry with explicit `utterance`/`session` terminology instructions was invalid as a quality experiment because CAT emitted a Japanese translation of the instruction suffix before the source. The result is retained with `experimentValidity.valid=false`; it is not counted in CAT metrics. `benchmark-cat-translate.py` now records prompt suffix/system prompt/acronym-protection metadata in every audit report to prevent this class of unnoticed contamination.
- CAT terminology system-prompt probe (2026-10-05): moving terminology guidance to the CAT system message avoided prompt-text contamination. A single fixture-specific system prompt that explicitly named `utterance`/`session` passed the quality gate and preserved the distinction, but is not generalizable production evidence. A second single-row probe using only generic terminology guidance still produced `utterance → session` twice and was rejected. No production prompt change was made; artifacts `cat-terminology-system-v1*.json` and `cat-terminology-generic-system-v1*.json` record both results.
- CAT dynamic terminology hint probe (2026-10-05): added an audit-only, frequency/shape-based extractor for repeated content words and passed those hints through the CAT system message. On the same speech-in fixture, the generic dynamic hint still left a participant-role shift and was rejected (0/1). No production prompt or routing change was made; this confirms that simple automatic repeated-word hints are insufficient.
- CAT literal terminology system-prompt probe (2026-10-05): a generic instruction to retain ambiguous technical nouns in English parentheses did not resolve the participant-role shift (0/1 accepted). No production prompt change was made. Together with the dynamic-hint probe, this indicates the remaining CAT error is semantic role alignment rather than simple terminology omission.
- CAT repeated-term placeholder probe (2026-10-05): mechanically protecting repeated content words caused untranslated labels (`participants`, `button`, `figure`, etc.) and a detached figure reference; quality accepted 0/1. This confirms broad repeated-term placeholder protection is harmful for CAT and must not be promoted to production.
- Sentence-alignment false-reject fix (2026-10-05): participant-role scope checking now tolerates a one-sentence boundary shift only when source/output sentence counts differ and an adjacent output sentence explicitly contains the participant role. Same-count aligned role shifts remain rejected. This removed the false rejection on the CAT speech-in system-prompt probe (quality 0/1 -> 1/1) without weakening the existing direct role-shift regression. Quality suite 266/266 passes.
- Regression verification after sentence-alignment guard (2026-10-05): full Vitest passed **70 files / 646 tests** and typecheck passed. The CAT system-prompt fixture remains accepted after the generic alignment fix; direct same-count participant-role regressions remain covered.
- Alignment evidence artifact (2026-10-05): re-evaluated the unchanged CAT system-prompt output after the role sentence-alignment fix; `cat-terminology-system-v1-quality-after-alignment.json` records the 1/1 acceptance and explicitly identifies this as a gate correction, not a model-output change.
- CAT gate recomputation after sentence alignment fix (2026-10-05): re-evaluated stored v1-v8 outputs without regeneration. Across the available artifacts, 33 clean rows yielded 31 automatic quality accepts; outputs were unchanged. This is gate-only evidence and does not replace manual review (which still reports 5 severity>=2 rows in the broader v1-v8 cohort summary).
- Sentence-alignment false-reject follow-up (2026-10-05): utterance/session scope checking now also tolerates neighboring Japanese sentence alignment when counts differ and an adjacent sentence preserves 発話/発言. Same-count and paired current/previous session shifts remain rejected. Quality suite 267/267 and typecheck pass.
- Regression verification after utterance/session alignment guard (2026-10-05): full Vitest passed **70 files / 647 tests** and typecheck passed; worktree clean.
- Verification correction (2026-10-05): reran Python compileall with the project-root path after an earlier relative-path typo; `translation-server/.venv/bin/python -m compileall -q translation-server/engines translation-server/server.py` succeeds.
- Fresh post-diagnostic benchmark (2026-10-05): ran `dont-mind-me` only (4 sampled units) against the ready server after fallback-detail instrumentation. All 4 completed with `fallbackStage=none`; no new rejection-detail rows were produced. Artifact: `test-data/real-papers/reports/translation-diagnostic-post-reason-v1.{json,md}`. This is a focused smoke check, not a corpus metric.
- Fresh diagnostic benchmark (2026-10-05): `speechin` 4-unit smoke run produced 2 successful translations and 2 pre-model source-structure fallbacks; no post-model failure. `interactive-jewellery` 4-unit smoke run produced 2 pre-model structural skips and 2 model outputs, one carrying a non-fallback diagnostic `scientific invariants missing: 9, 11`. This confirms the new reason detail is visible in fresh reports and that source-structure issues remain distinct from model rejection. Artifacts: `translation-diagnostic-speechin-v1.{json,md}` and `translation-diagnostic-interactive-jewellery-v1.{json,md}`.
- Benchmark reason semantics fix (2026-10-05): `benchmark-real-paper-translation.ts` now leaves `fallbackReason` empty whenever `fallbackStage=none`; non-fatal quality diagnostics remain in `quality.reasons`. This prevents accepted translations such as `scientific invariants missing: 9, 11` from being miscounted as fallback causes. Focused typecheck/quality tests pass; fresh 2-unit `interactive-jewellery` run confirms one structural pre-model fallback has a reason and one accepted unit has no fallback reason.

## CAT-Translate fallback review

Manual source/output review was completed for the four-row fallback-enriched CAT-Translate 3.3B artifact (`test-data/real-papers/reports/cat-focused-fallback-v1-manual-review.json`). All four rows had no severity>=2 semantic error; three were gate-accepted and the long statistical row was semantically correct but rejected by the existing degenerate-output gate, indicating one false reject. The interactive-jewellery row remains a source continuation fragment (severity 1 extraction/unit issue). This supports CAT as a bounded audit candidate, but the sample is too small to enable production cascade; expand with held-out fallback rows and numeric/claim review first.

## CAT-Translate expanded fallback review

A second audit-only run evaluated all seven post-model fallback rows from the focused cohort with cached CAT-Translate 3.3B (`cat-focused-fallback-v2.json`). Manual review found 6/7 rows without a severity>=2 issue; one SpeeChin methods row changed “current and previous utterances” to “current and previous sessions” (severity 2 scope shift). The existing quality gate also false-rejected one semantically faithful long statistical row. This rules out enabling CAT solely on automatic acceptance: it can improve readability, but relation/scope review and a conservative cascade policy are still required. See `cat-focused-fallback-v2-manual-review.json`.

## Quality-gate false reject fix

The CAT fallback review exposed a generic false reject: repeated Japanese predicates in a faithful statistical comparison list were classified as phrase degeneration. `evaluateJaTranslation` now permits the shape-only repetition signal when the source contains three or more explicit comparative predicates and the output is sentence-level Japanese; all other degeneration checks remain active. This is a narrow source-structure condition, not a vocabulary exception. Quality tests remain 267/267, and the reviewed CAT statistical row now scores without `degenerate output`.

## Focused cohort after comparative-list gate fix

Re-ran the same 4-paper/48-unit cohort as `focused-cohort-current-v2` after the TypeScript quality-gate change. The cohort remained 19 ordinary-body units with 4 reader-visible fallbacks (21.1%) and 7 post-model fallback rows. This is expected: the changed gate currently affects client/cascade quality evaluation, while the server-side MADLAD fallback classification remains unchanged. The change removes a proven false reject from alternate-candidate evaluation but does not by itself solve the primary server fallback rate.

## Server-side comparative-list gate

Applied the same source-aware comparative-list repetition guard to the Python MADLAD server. This keeps the server and TypeScript quality gates aligned: repeated predicates in a source list of four or more comparisons are not treated as decoder looping when the output is sentence-level Japanese. All translation-server Python tests pass (246 tests). The running server must be restarted before this change is active; no benchmark restart was performed automatically.

## Post-restart server probe

Restarted the translation server from the updated Python source (model version reports the current v84 pipeline) and probed the known 1,161-character statistical list unit directly. It still returned `partial_unit_fallback`, so the remaining failure is not solely the generic phrase-repetition gate; further attribution must inspect the unit-level reason (protected scientific spans, decode output, or another invariant) before weakening additional server checks.

## Unit-level fallback attribution

Saved `test-data/real-papers/reports/server-stat-unit-diagnostic-v1.json` from a single post-restart request for `dont-mind-me:b-4c16bae3`. The server reports `unit_1` and `unit_3` as `translation_quality_rejected:degenerate translation output`; both are complete comparative-statistics sentences, not extraction fragments. The other five units return Japanese. Their preserved source units and partial outputs show that the model can produce malformed comparative lists (including altered p-values) before the fallback gate, so simply permitting repetition would be unsafe. The next fix should target a structured comparative-list rescue or alternate model, with numeric verification, rather than weakening the gate.

## Comparative-statistics rescue

Added a bounded server rescue for comparative-result sentences that fail quality: when three or more comparative predicates are present, retry once with only compact inline statistic literals visible to MADLAD. The normal scientific invariant gate still rejects altered or missing values; this does not globally expose placeholders. Python tests pass (246). This requires a translation-server restart before runtime validation.

## Three-item comparative-list attribution

The server log from the diagnostic request showed the failing units each had three repeated comparative predicates (`less natural`, `less normal`, `less cool`), so the previous four-item threshold never applied. Lowered the source-structure threshold to three in both gates and in the bounded inline-statistics rescue. Tests remain green (267 TypeScript quality tests; 246 Python translation-server tests). Runtime revalidation is pending a clean server restart because the prior process was handling queued requests when interrupted.

## Comparative rescue safety correction

Runtime validation after the three-item threshold showed the rescue could return a no-fallback response while its partial unit text omitted parenthesized p-values. Added an explicit multiset check for all numeric values in the comparative-statistics retry; a rescue candidate is now rejected if any value is missing or changed. This preserves the original safe fallback behavior until a candidate keeps every statistic. Python tests remain green (246).

Added unit tests covering the comparative-statistics rescue integrity contract: all source numeric values must be present and unchanged; missing or altered values are rejected. The focused MADLAD quality test file now passes 74 tests.

Added `scripts/diagnose-comparative-rescue.py` to replay the known statistical unit against a running server and persist the complete response. It is diagnostic-only and does not alter production settings; use it after restarting the server to verify fallback reason, unit indices, and elapsed time consistently.

## Runtime replay safety finding

The replay script exposed an unsafe case: the server returned `fallback_stage=null` while a partial comparative-list output changed several p-values (for example source `0.0/0.001` becoming `0.1/0.2`). Added a global server-side statistical numeric-drift guard so any missing/changed parenthesized statistic or p-value rejects the candidate. This is a safety correction; it may increase fallback until a semantically valid alternate candidate exists. Quality tests now include 75 MADLAD cases; full Python suite should be rerun after the next server restart.

Full translation-server test suite after the global statistical numeric-drift guard: **248 tests passed**. Candidate selection, microbatch, citation protection, and segmenter regressions remain green.

Added one bounded beam-search retry after an inline-statistics greedy rescue fails. The beam candidate is accepted only when every source statistic/p-value is preserved exactly; otherwise the original fallback remains. MADLAD quality tests pass (75).

- Borderless table recovery (2026-10-06): `buildTableRegionEvidence` now searches a bounded window above and below each caption and can promote a compact set of aligned, non-sentence rows when vector rules are absent. This fixes captions placed below borderless tables (e.g. OzCHI Table 3) without promoting sentence-shaped prose. OzCHI table-region recall improved 0.8→1.0; the full 113-paper extraction run retained titleExact 105/113 (92.92%) and all 4 papers with table-region ground truth at 1.0. Focused extraction tests (111) and typecheck pass. Commit: `684f087`.

- Body-sized numbered subsection recovery (2026-10-06): generic candidate generation now treats short hierarchical labels such as `4.3 Battery` as headings when followed by prose, even when their font matches body text. Numeric matrix rows are explicitly excluded from this rule. Thermal Earring heading recall improved 0.973→1.0; focused extraction/reading-order tests (110) and typecheck pass. Commit: `51e5915`.

- Masthead/title geometry pass (2026-10-06): adjacent same-baseline title spans are joined by the title resolver, and page-one email-only / affiliation-marker-only native rows are excluded from canonical author/affiliation metadata before inherited role hints are applied. This is intentionally conservative: combined author+institution lines (common in ACM/IEEE mastheads) still need a dedicated geometry-aware splitter; no paper-specific rule was added. Typecheck and focused extraction/reading-order tests (104) pass. Commit: `c4aa807`.

- Flattened masthead recovery (2026-10-06): the Paper projection now recognizes a conservative all-caps `AUTHOR, institution...` pattern when a PDF has flattened every author into an affiliation block, recovering separate author names and cleaned affiliation tails. It requires at least two matching author/institution pairs and leaves canonical evidence unchanged. The extraction benchmark now also uses verified catalog authors when a fixture has no richer hand-authored labels. Typecheck and pipeline tests (29) pass. Commit: `584252c`.

- Masthead manual-review corpus (2026-10-06): added `scripts/build-masthead-review-sample.ts`, which generated `test-data/real-papers/reports/masthead-manual-sample-v1.json` for all 113 available PDFs. Each row contains page-one native title/author/affiliation candidates with bounding boxes, catalog title/authors where available, and pending manual labels. 27 rows have verified catalog author metadata; this artifact is for visual/semantic review and is not an automatic accuracy claim.

- Author-list extraction pass (2026-10-06): page-one author rows with superscript markers or comma/`and`-separated title-case names now override stale paragraph hints; projection expands them into individual names. This fixed the observed OSWORLD author list (17/17, F1 1.0), marketing platform list (4/4, F1 1.0), and recovered 4/5 visible HFE names (F1 0.8; the fifth catalog name is not present in the visible masthead). The benchmark now measures the Paper projection rather than raw layout blocks. Typecheck passed. Commit: `ff0efda`.

- Publisher masthead recovery (2026-10-06): added middle-dot author separators and a post-grouping author-list recheck for stale paragraph hints; filtered publisher labels such as `ORIGINAL ARTICLE` and copyright lines from projected authors. Quantified Factory Worker author F1 improved 0→1.0. Focused tests and typecheck pass. Commit: `f504291`.

- Duplicate title collapse (2026-10-06): title resolution now removes an exact repeated title caused by duplicated native masthead lines, while preserving legitimate subtitles and distinct title spans. HFE scoping-study title now resolves to one copy. Pipeline tests (29) and typecheck pass.

- Weak native title fallback (2026-10-06): when a PDF promotes a short section label (for example a localized “Abstract” heading) as the only title candidate, a substantially longer verified metadata title can now repair the identity. The rule requires a short native title and a large length gap; it does not replace normal native titles.

- Truncated title prefix repair (2026-10-06): title resolution now recognizes a native title sharing its first three normalized words with a longer metadata title when only a few words are missing (for example `Human Factors “Ergonomics” Facilities`). Quotes and punctuation are normalized for comparison; the native text remains the source evidence.

- Author projection normalization (2026-10-06): author lists now preserve comma/middle-dot boundaries, split PDF producer camel-case joins such as `ZhongyuHu`, remove standalone superscript numbers, and filter publisher labels/title-like nodes from projected authors. This targets the remaining catalog-author F1 failures without changing canonical source evidence. Typecheck passed. Commit: `9770eec`.

### 2026-10-06: long marker-separated author masthead regression fixed

The author projection filter had a 220-character cutoff. This excluded valid long author rows such as the 17-author OSWORLD masthead before `expandAuthorLine` could split marker-separated names, yielding an empty public author list despite the canonical node being correctly classified. The cutoff is now 500 characters; ordinary prose remains excluded by the existing punctuation/role/separator checks. OSWORLD now projects all 17 authors again. Typecheck and the focused PDF extraction/reading-order suite pass (104 tests).

The 113-paper extraction percentages remain automated ground-truth comparisons, not visual inspection. The masthead sample artifact is a manual-review queue; it must not be described as completed visual QA.

### 2026-10-06: flattened uppercase affiliation rows

A second author extraction failure was reproduced in `modeling-human-behavior-cognitive-uncertainty`: the PDF flattened `ANDREW FUCHS, institution` and `ANDREA PASSARELLA and MARCO CONTI, institution` into affiliation-role nodes, so the public author list was empty. A generic institution-tail/name-prefix recovery now handles uppercase publisher rows and conjunction-separated names, without changing canonical roles. The fixture now recovers all three names; typecheck and the 29-case PDF pipeline suite pass. This is a targeted generic recovery, not a claim that all masthead formats are solved.

### 2026-10-06: publisher location/email contamination in author projection

A conference PDF (`how-content-volume-landing-pages`) exposed a generic masthead split where author lines included an email or a city/country continuation (`Ruti Gafni* email`, `Tel Aviv, Israel Nim Dvir`, `Albany, NY, USA`). Projection now removes email tokens before author expansion, strips recognized location prefixes only when they precede a name, and rejects sentence-shaped/location-only author candidates. The public author list is now `Ruti Gafni`, `Nim Dvir`; typecheck and the 29-case PDF pipeline suite pass. This remains an extraction projection repair; affiliation cleanup is still incomplete for some publisher layouts.

### 2026-10-06: affiliation projection normalization

Affiliation projection now removes email tokens and footnote-only labels (`corresponding author`, equal-contribution notes), normalizes marker punctuation, and applies the same cleanup to recovered masthead affiliations. This prevents contact metadata from appearing as an institution in the public Paper object. Typecheck and the 29-case PDF pipeline suite pass.

### 2026-10-06: full 113-paper extraction rerun

The explicit `--all` extraction benchmark completed after the author/affiliation projection fixes. Title exact match is 108/113 (95.6%), with all 113 having a known title comparison. The five misses are primarily native non-English titles compared with English catalog metadata (Russian/Serbian/Indonesian cases) plus one English spelling/wording variant; they require language-aware ground truth handling rather than blindly replacing healthy native titles. Author metrics are available for 27 catalog-author papers: mean F1 0.693, 12 perfect; remaining failures are publisher-specific masthead layouts and remain under investigation. The generated report was copied to `/tmp/extraction-113-latest.json` for diagnostics and the ignored working report was restored. No visual review is implied by these automated figures.

### 2026-10-06: split masthead continuation guard

A generic continuation candidate was added for publisher layouts that place a middle-dot-prefixed author continuation in a paragraph-role node on the same baseline as the first author row. The candidate is restricted to short name-shaped text with multiple capitalized name pairs; it does not relabel canonical nodes. Initial author extraction remains stable for `ergonomics-flight-deck-applications`; the remaining continuation inclusion needs a dedicated fixture assertion before claiming full recovery. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: initialed continuation names recovered

The split masthead guard initially missed continuation rows containing middle initials (`Katherine L. Plant`, `Neville A. Stanton`). The name-shape evidence now allows an optional initial, and `ergonomics-flight-deck-applications` projects all six authors instead of only the first three. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: author benchmark after split-row repair

The 27-paper author benchmark was rerun after the initialed continuation fix. Mean author F1 improved from 0.693 to 0.786; perfect papers increased from 12/27 to 16/27. The remaining 11 failures are concentrated in social-influence, cognitive dual-task, several marketing mastheads, and one clinical review; their layouts need separate generic diagnostics. The benchmark artifact is `/tmp/author-27-after-cont.json`; the tracked working report was restored.

### 2026-10-06: institution-labelled author rows

`social-influence-social-advertising` used affiliation-role rows for `EYTAN BAKSHY, Facebook` and `DEAN ECKLES, Stanford University & Facebook`, while another author block concatenated `RONG YAN` and `ITAMAR ROSENN`. A strict uppercase name-prefix parser now recovers institution-labelled author rows and separates adjacent all-caps names without treating organization names as authors. The fixture now projects all four authors. Typecheck and the 29-case pipeline suite pass; the 27-paper aggregate will be rerun after this change.

### 2026-10-06: citation-style author noise filtered

The cognitive dual-task fixture revealed that the PDF resolver marked bibliography-style short forms (`Castaño LAA`, `Arai H`, etc.) as author nodes alongside the real masthead. Projection now removes mixed-case names ending in citation initials, organization-like tokens, and duplicate names, while retaining full names with legitimate middle initials. The fixture now returns the full masthead names without the citation list noise. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: masthead location row excluded

`conversation-analysis-user-experience` had `Palo Alto, CA 94304-1314 USA` classified as an author row. The projection now excludes location-only masthead candidates while retaining the two real authors. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: author benchmark after location/citation cleanup

Reran the 27-paper author benchmark after the masthead location and citation-noise fixes. Mean author F1 is now 0.864 (previous 0.812), with 19/27 perfect papers. Remaining failures are eight layouts: two clinical reviews, four cognitive/marketing mastheads, and two marketing publisher formats. The temporary report was restored after measurement.

### 2026-10-06: clinical masthead boundary diagnosis

The clinical scoping fixture now recovers its four native title-page authors cleanly. Two catalog names (`Margaret Codd`, `Mary Browne`) are not present in the recovered title-page text; they appear only in a citation-style `et al.` line, so adding them from metadata would be unsafe extraction overreach. This is recorded as a native-text/fixture limitation for later PDF geometry investigation, not silently patched.

### 2026-10-06: benchmark ground-truth mismatch corrected

`hfe-healthcare-patient-safety-review` was not an extraction failure: its catalog incorrectly listed `Hassan Hignett / others`, which belongs to a different paper. The PDF-native masthead contains six authors (`Xuanyue Mao`, `Pengli Jia`, `Longhao Zhang`, `Pujing Zhao`, `Ying Chen`, `Mingming Zhang`), and the catalog ground truth was corrected after title/PDF verification. The single-paper benchmark now reports author F1 1.0. This prevents a metadata error from driving extraction changes.

### 2026-10-06: corrected 27-paper author benchmark

After correcting the mislabeled patient-safety catalog entry, the 27-paper author benchmark is 0.901 mean F1 with 20/27 perfect papers. Seven remaining cases are either genuine missing native author rows or publisher-specific formatting; no further broad heuristic was added from aggregate scores alone. The temporary report was restored after measurement.

### 2026-10-06: marked author names and keyword contamination

The Frontiers marketing fixture had dagger-marked authors (`Maria Pilar Martinez-Ruiz1*† and Karin S. Moser2†`) projected with markers/digits, while the keyword paragraph was misread as an author continuation. Marker-part cleanup now removes footnote digits/symbols and leading conjunctions, and continuation candidates exclude keyword rows. The fixture now projects exactly the two authors. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: post-marker 27-paper check

The post-marker 27-paper run is 0.896 mean author F1 with 18/27 perfect papers. This is slightly below the previous 0.901 run because marker cleanup changes exposed additional catalog/layout mismatches in clinical and marketing fixtures; no aggregate-only heuristic relaxation was made. The temporary benchmark report was restored. Next work should compare the affected rows by source content before changing projection rules.

### 2026-10-06: author projection bounded by masthead region

`marketing-unavailable-choice` contained later reviewer/editor names as author-role nodes. Projection now derives the first page body/abstract y-boundary and only projects author nodes above that masthead boundary. The fixture now returns exactly Jing Tian, Rong Chen, and Feng He; the cognitive dual-task masthead remains intact. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: author benchmark after masthead boundary

The 27-paper benchmark after the masthead y-boundary repair reached mean author F1 0.918, with 19/27 perfect papers. `marketing-unavailable-choice` left the failing set. Remaining failures are eight layouts, including two catalog/PDF metadata cases and several publisher-specific mastheads. The temporary report was restored after measurement.

### 2026-10-06: sidebar editor/reviewer exclusion

`marketing-neurophysiology-consumer-motivation` mixed editor/reviewer sidebar names with the article masthead. A minimum masthead width guard excludes narrow sidebar author-role nodes while retaining the full-width article row. The PDF confirms five article authors (`Sanchit Pawar`, `Asle Fagerstrøm`, `Valdimar Sigurdsson`, `Aurelija Burinskiene`, `Erik Arntzen`); the catalog ground truth was corrected to include Aurelija. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: narrow author-row regression avoided

A global minimum-width filter intended to remove Frontiers sidebar reviewers caused regressions across valid narrow-column publisher mastheads (27-paper mean F1 fell to 0.837). It was removed; the masthead-boundary and label/keyword safeguards remain. The corrected 27-paper benchmark returned to mean author F1 0.921 with 19/27 perfect papers. Sidebar reviewer handling remains a targeted follow-up rather than a global width rule.

### 2026-10-06: name-only affiliation masthead rows

`marketing-health-goals-nudging` stored `Jeroen S. Benjamins` and `Femke de Boer` in an affiliation-role row because the publisher separated the name list from its numbered institution block. A strict name-only affiliation recovery now handles short comma/and-separated rows without accepting institution-shaped text. The fixture now projects all five catalog authors. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: author benchmark after name-only affiliation recovery

The 27-paper benchmark after the name-only affiliation change is 0.915 mean author F1 with 18/27 perfect papers. The targeted health-goals fixture is corrected, while social-influence and several publisher formats still need source-level review; aggregate score alone is not used to add another heuristic. The temporary report was restored after measurement.

### 2026-10-06: linguistics masthead email noise

`syntax-prosody-correlation` had a continuation author row beginning with a comma and a separate brace-wrapped email row classified as author. Author expansion now trims leading punctuation and rejects brace/email candidates. The fixture projects Arne Köhn, Timo Baumann, and Oskar Dörfler only. Typecheck and the 29-case pipeline suite pass.

- Masthead contact-row cleanup (2026-10-06): affiliation-derived author recovery could reintroduce brace-wrapped email rows after the primary author filter. The projection now excludes contact-only rows in both recovery and affiliation outputs. `syntax-prosody-correlation` projects Arne Köhn, Timo Baumann, and Oskar Dörfler only. Typecheck and the 29-case extraction pipeline suite pass; automated metrics remain distinct from visual QA.

- Masthead label-aware filtering (2026-10-06): author projection now uses nearby heading labels and column geometry to suppress editor/reviewer/correspondence metadata, while retaining adjacent real author rows; affiliation-derived recovery also rejects taxonomy/category rows. On the 27-paper catalog-author subset, automated author F1 improved 0.926→0.939 (21→22 perfect papers). Remaining failures are publisher-specific layouts and require visual review; this metric is not a claim of complete extraction quality.

- Ground-truth and reviewer-label cleanup (2026-10-06): corrected two catalog entries after comparing their native title pages: the Frontiers dual-task paper now lists its nine article authors (editor/reviewer names were previously included), and the online-context paper now lists Maria Pilar Martinez-Ruiz and Karin S. Moser instead of a placeholder. Projection also recognizes label rows emitted as affiliation/paragraph roles, suppressing nearby editor/reviewer names without removing adjacent author clusters. Remaining cases include split multi-part names and native reading-order loss; they need further geometry-level work and visual review.

- Author-list continuation probe (2026-10-06): added a conservative marker-and-comma signature for paragraph-role author continuations (numeric affiliation markers, short pre-abstract line, no sentence punctuation). It passes typecheck and the 29-case extraction suite. The dual-task Frontiers PDF still exposes a split `Camila Vieira` / `Ligo Teixeira` name through canonical reading order, so this remains an unresolved geometry/line-grouping case rather than a catalog problem.

- Visual masthead inspection (2026-10-06): rendered the Frontiers dual-task page and confirmed the source PDF visually contains the full `Camila Vieira Ligo Teixeira` line; the canonical pipeline currently separates it across two roles/lines and also exposes sidebar editor/reviewer content. Added a conservative marked-author paragraph recovery hook, but the split name remains unresolved, so further work must target canonical line grouping rather than catalog matching. Typecheck and 29 extraction tests pass.

- Sidebar-aware masthead projection (2026-10-06): Frontiers-style pages with repeated `Edited by`, `Reviewed by`, `Correspondence`, `Specialty section`, or citation labels now identify the narrow left metadata band only when a wide right body band is also present. Author/affiliation candidates in that band are excluded without changing canonical nodes. This removed reviewer/editor contamination from the dual-task and neurophysiology cases and prevented keyword paragraphs from becoming authors. The 27-paper author benchmark improved mean F1 0.939→0.983 and perfect papers 22→24. Remaining failures are hfe healthcare scoping, the split multi-part Camila/Ligo name, and a cognitive motor masthead; all require further visual/geometry work.

- Cross-column author recovery (2026-10-06): BMJ HFE masthead lines `Margaret Codd` / `Mary Browne` were classified as a heading because the author list crossed columns. Projection now accepts a tightly constrained, short, numbered name-list heading as an author continuation. The sidebar-aware filter remains active. On the 27-paper author subset, mean F1 improved 0.983→0.990 and perfect papers 24→25; the HFE scoping paper now projects all six authors. Remaining imperfect cases are two complex Frontiers mastheads with split/duplicated names. Typecheck and 29 extraction tests pass.

- Frontiers sidebar/author gutter recovery (2026-10-06): native lines can combine a left sidebar name with a right-column author on one baseline. Projection now uses the node's x/width geometry to remove only the sidebar prefix, and merges a numbered paragraph-role prefix with a following author line when both share the masthead baseline. This recovered the full nine-author list for the dual-task paper and removed the reviewer Melissa Meade from the motor-memory paper. The 27-paper author subset now reaches mean F1 0.996 with 26/27 perfect. One remaining case (`marketing-neurophysiology-consumer-motivation`) has an actual author (`Aurelija Burinskiene`) sharing a mixed sidebar/body line and needs item-level provenance to distinguish the prefix safely.

- Final masthead mixed-line fix (2026-10-06): when a line spans the sidebar/body gutter, the projection now strips the left segment only when it is immediately below a sidebar label; a farther mixed line is retained as a genuine article-author candidate. This recovers `Aurelija Burinskiene` while still excluding reviewer `Melissa Meade`. The 27-paper catalog-author benchmark is now 27/27 perfect, mean F1 1.0. Typecheck and the 29-case extraction suite pass. This is still an author-metadata benchmark; full visual QA of all PDF content remains a separate task.
### Extraction corpus isolation benchmark (2026-10-06)

Added `npm run bench:pdf-extraction:isolated -- --all`, which evaluates each
catalog PDF in a child process. Native PDF.js/Poppler failures can therefore be
reported per paper instead of aborting the complete corpus. The first full run
processed 113 of 114 catalog entries; one entry (`precious-materials`) is
missing its PDF and was recorded as an acquisition failure. Among processed
papers, the automated title exact rate was 95.58% (108/113). The five misses
include catalog/native-title disagreements (language, transliteration,
truncation, or `behaviour` spelling), so this is not a visual accuracy score.
The run also exposed three small source-integrity losses (0.993–0.997), which
remain queued for visual review. This benchmark does not replace manual
comparison of body blocks, tables, figures, or affiliations.

### Provenance repair (2026-10-06)

Fixed a generic column-continuation path where a detached inline citation band
was appended to `LayoutBlock.text` but its native `lines` were left on the
separate block. That made the canonical text look lossy to integrity checks and
could also discard source bounding-box provenance downstream. The merge now
updates text and lines together. Focused extraction tests remain 29/29 passing;
the four affected-paper replay reduced two integrity failures to 1. The
remaining Russian-language and long rotated-page cases are native-layout cases
queued for visual review rather than being hidden by a looser metric.

### Rotated table containment (2026-10-06)

Visual review of `wear-scale` page 14 found a rotated inter-item correlation
matrix emitted as paragraph blocks, with its caption title projected as a
figure. Generic page-level rotated/numeric evidence now promotes the matrix
rows to skipped table blocks, and `rotation-aware-table-caption` evidence
projects the caption as a table block. This keeps the matrix and explanatory
footnote out of normal paragraph translation without relying on the paper ID.

The post-change corpus replay completed 113/114 catalog entries again (the same
missing `precious-materials` PDF), with table-region recall remaining 1.0 and
the minimum source-integrity rate improving to 0.99698. The rotated-table
change did not regress the title or structural metrics.

### Masthead and cross-column boundaries (2026-10-06)

Two generic reading-order issues found by the corpus suite were fixed: a large
first-page title containing the word `and` could be misclassified as an author
list, and continuation repair could absorb a body line into a heading or leave
an accepted same-page cross-column join unmarked. Title geometry now wins over
name-list heuristics, headings are hard boundaries, and verified overlapping
column joins carry explicit provenance. Focused regressions for the two title
cases and PPG Earring reading order pass.

### Full extraction regression suite (2026-10-06)

After these fixes, `npm run test:extraction-corpus -- --reporter=dot` completed
successfully: 2 test files, 232 tests passed, 0 failed (386.55s). This verifies
the automated extraction and reading-order corpus; it does not replace visual
review of every page or semantic review of affiliations and body text.

### Masthead projection repair (2026-10-06)

A real-paper replay of the Wear Scale PDF exposed two generic metadata errors:
correspondence/academic-rank labels were being returned as authors, and wrapped
institution lines emitted as paragraph roles were omitted from affiliations. The
projection now filters metadata labels, admits institution-shaped page-one
continuations before the body, and restores spaces lost at native font-run
boundaries. The regression asserts the two expected authors, excludes the labels,
and retains Iowa State University. Focused baseline tests (2/2) and typecheck pass.

The full extraction corpus was rerun after this projection change: 2 test files,
232 tests passed, 0 failed (380.77s), confirming no regression in the existing
reading-order and structural extraction checks.

### Caption-anchored table fallback (2026-10-06)

Visual inspection of education-learning-analytics page 20 found three ruled
tables whose native rule geometry was incomplete. The table-region builder now
uses a caption-anchored text-region fallback only when at least three nearby
table-scored, non-sentence rows exist; a caption alone cannot promote prose.
Typecheck and the focused education/Wear Scale/rotated-table tests pass.
The first full replay exposed and fixed a null-signature reference in this
fallback; the focused suite now passes 5/5 and typecheck is clean. A complete
232-test replay after that null fix remains pending before this change can be
called corpus-wide green.

The pending replay is now complete: 2 test files, 232 tests passed, 0 failed
(386.86s) after the null-signature fix.

### Title fragment fusion (2026-10-06)

Title diagnostics found a genuine two-line title split in the Indonesian
ergonomics paper and a two-column title split in the green-marketing paper.
The line grouper now fuses adjacent title columns and a preceding same-style
title prefix that was misclassified as an author. Diagnostics now recover the
full Indonesian title and `IMPACT OF GREEN MARKETING ON CONSUMER BEHAVIOUR`.
Focused reading-order regressions and typecheck pass; the full corpus replay
should be rerun after this title change.

The title-change replay completed successfully: 2 test files, 232 tests passed,
0 failed (431.54s). Title fusion did not regress reading order, tables, or other
structural extraction checks.

### Vector figure label containment (2026-10-06)

Visual review of the GPT-3 cognitive-psychology paper showed a vector-only
diagram whose labels shared the native text stream with the Linda vignette.
The generic vector-label evidence now also uses a dense graphics page plus a
nearby Figure caption to suppress short, punctuation-free labels above the
caption. It does not suppress sentence-shaped prose. The regression confirms
that `Decision-making Information search` is not sent as a pending translation
block; focused test and typecheck pass. A full corpus replay is still required
after this change.

The vector-label change replay completed successfully: 2 test files, 232 tests
passed, 0 failed (406.96s). Existing structural and reading-order checks remain
green after the new graphics/caption evidence.

## 2026-10-06 title extraction audit follow-up

- The 113-paper extraction report's `titleExact` metric compares the canonical title after metadata fallback; it therefore can hide a wrong native title candidate. The report shows many cases where `fusedTitle` is DOI/journal/event furniture while `canonicalTitle` is correct only because catalog metadata was supplied.
- Added generic masthead filtering in `src/services/pdfExtraction/resolver/titleResolver.ts`. When the first title candidate is an obvious DOI/URL/volume/event/journal masthead, a later article-title candidate on page 1 is preferred before metadata fallback. No publisher- or paper-specific rule was added.
- Added resolver regression tests in `src/test/pdfExtraction/titleResolver.test.ts`.
- `npm run typecheck -- --pretty false` and the PDF extraction test suite (64 tests) pass after this change.
- Remaining unresolved extraction case: malformed embedded-font PDFs (notably the Russian-title sample) still need macOS Vision OCR runtime validation; catalog metadata must not be treated as proof of native extraction quality.
- Added benchmark diagnostics `nativeTitleCandidate`, `nativeTitleExact`, and `titleUsedMetadataFallback`; this prevents the corpus score from confusing metadata repair with successful native extraction.
- A selected no-metadata replay found generic journal masthead candidates (e.g. volume/date lines) and malformed embedded-font title text; metadata-backed production now repairs tiny page-one mastheads, while native extraction remains explicitly reported as a failure.
- Full isolated rerun (113 available PDFs; one missing `precious-materials.pdf`) reports canonical title exact 107/113 (94.69%), but native title exact only 53/113 (46.90%) and metadata fallback on 56/113. This exposes the remaining extraction gap rather than hiding it.
- Added structural recovery for article title candidates misclassified as paragraph/title fragments after a publisher masthead; typecheck and 31 PDF extraction tests remain green. The medical Elsevier sample still requires further candidate-level tuning because its title is split (`Medical deep` + `learning—...`) beside journal furniture.
- Generic candidate fusion now reattaches a short affiliation-role prefix immediately left of a same-baseline title candidate, preserving geometry and adding evidence. This fixed the Elsevier sample without paper-specific text: `Medical deep` + `learning—A systematic meta-review` now resolves correctly with no metadata.
- Focused resolver/pipeline tests remain 31/31 green. The full corpus needs a fresh rerun after this candidate-layer change before updating aggregate native-title metrics.
- Post-change 113-paper rerun completed (113 available, one missing fixture). The aggregate canonical score is currently 103/113 and native evidence score 53/113; several remaining mismatches are language variants, malformed embedded fonts, or catalog-title disagreements. The new same-baseline repair is confirmed on the Elsevier split-title sample via no-metadata replay, but the corpus aggregate still needs per-case review before claiming improvement.
- Added generic year/volume/issue masthead signals to title resolver; focused tests and typecheck pass. Remaining corpus mismatches were reviewed as language/metadata disagreement, embedded font corruption, or unresolved publisher layout rather than patched with paper-specific rules.
- Full extraction/reading-order regression after title candidate changes: 232/232 passed (373s). Existing pdf.js canvas/TT/ColorSpace warnings remain non-fatal.
- OCR diagnostic on the malformed Russian-title PDF detects pages 1 and 10 via `brokenTokenHits=2` (page 1 has 2 symbol-joined broken tokens), so the macOS Vision OCR path will replace those pages rather than trusting corrupted pdf.js text. Actual Vision OCR output still requires a macOS runtime/app check.
- No-metadata replay of six remaining title cases: neuroscience, Elsevier meta-review, two medical imaging reviews, and ergonomics review resolve to plausible article titles; the medical imaging outputs include legitimate subtitles absent from catalog ground truth. The only clearly unrecoverable native case remains the malformed Russian embedded-font title, for which OCR is selected on pages 1 and 10.
- macOS Rust OCR path compiles successfully with `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml ocr`; the repository currently has no OCR unit tests (0 tests matched), so actual Vision recognition output remains a runtime validation task rather than a compile/test failure.
- Direct Vision OCR CLI attempt is blocked by the installed CommandLineTools/Swift SDK mismatch: Swift compiler 6.2.0.19.9 vs SDK modules 6.2.0.16.14, plus duplicate SwiftBridging module definitions. The Rust Tauri OCR path still compiles; validating actual OCR output requires the matching Xcode toolchain or launching the app on the user's existing environment.
- Vision OCR runtime validation succeeded using `/Applications/Xcode-beta.app` toolchain on the malformed Russian-title PDF page 1. It recovered the Russian article title `Взаимосвязь прикладной лингвистики и лингводискурсивного анализа с практикой преподавания английского языка`, three author names, and institution lines from the page image. This confirms the production OCR strategy can repair the pdf.js embedded-font corruption; full app-level invocation still needs a user launch because the standalone check uses the same Apple Vision framework but not Tauri IPC.
- 2026-10-06: Native PDF診断で `Transla T ion` / `The r ole` のような語中単一glyph分割がページ分類をすり抜けるケースを確認。`splitWordHits` を追加し、同種の分割が2件以上あるページをgarbledとしてVision OCR対象にする汎用修正を実装。pageClass回帰を含む重点PDF抽出テスト **38/38**、typecheck pass。これによりOCR対象ページの検出精度を上げたが、Vision OCRの実機出力品質はmacOSアプリで追加確認が必要。
- 2026-10-06: 著者行の `First Last Second van den Surname` 形式を汎用分割し、同一native blockに結合された複数著者を分離。`interactive-jewellery` の `Maarten Versteeg` / `Elise van den Hoven` / `Caroline Hummels` を正しく投影する回帰を追加。author projection **2/2 pass**。所属列の混線は別の未解決課題として残る。
- 2026-10-06: 所属投影の列境界で生じた `Department of` やglyph間隔だけの罫線を公開affiliationへ出さない汎用品質フィルタを追加。短い未完接続句・罫線・単一glyph連結を除外し、著者/本文抽出を保全。author/pipeline **31 tests pass**、typecheck pass。複数行・複数列の所属再結合は引き続き課題。
- 2026-10-06: `interactive-jewellery` の所属座標を再診断。各行のx列自体は安定しているが、単純なページ内x帯結合は別機関（Duncan/University等）を誤結合するため採用せず破棄。所属再構築は著者マーカー・番号・列の縦連続性を同時に使う必要がある。保守的な現行出力を維持し、回帰 **31/31** pass。
- 2026-10-06: 所属番号が先頭行にだけ現れる複数行mastheadで、番号を同一x帯の後続行へ伝播してから投影する処理を追加。`interactive-jewellery` の所属断片数を12→4へ減らし、列の縦継続を保った。著者/pipeline **31/31 pass**、typecheck pass。機関名の意味的な分割（同一列に複数機関が並ぶ形式）はなお手動確認対象。
- 2026-10-06: ACM系の重なったmastheadで、native text内の `ACM Reference Format:` 著者列を汎用的な二次構造証拠として利用。PPG Earringで壊れた座標投影を6著者へ復元し、地名・所属・メールの著者混入を除去。author projection **3/3 pass**、typecheck pass。所属機関の列再構築は別課題。
- 2026-10-06: ACM `Reference Format` fallbackにより、座標が重なったmastheadの著者投影を修正。PDF extraction全体 **13 files / 70 tests pass**、typecheck pass。113本全体の再計測は大きな抽出変更時の方針に従い未実施。
- 2026-10-06: 番号付き所属が1つのnative blockへ潰れる形式（`1Institute... 2Center...`）を番号境界で分割。`neuroscience-rule-following` の5所属を個別投影できることを確認。author/pipeline **32/32 pass**、typecheck pass。番号なし・列混在の所属は引き続き要診断。
- 2026-10-06: affiliation公開フィルタを強化し、`Contents`/`Article history`、単一文字マーカーが多数混ざる列断片、短い非機関語を除外。既存著者・パイプライン回帰は維持。複数列の機関名自体を完全再構築する代わりに、確信のない文字列を公開しない方針を継続。
- 2026-10-07: 著者・所属変更後の代表4本（interactive-jewellery / power-over-skin / ppg-earring / neuroscience-rule-following）をisolated benchmark。4/4でcanonical titleExact、source integrity 1.0、figure/table relation 1.0。著者投影はACM重複mastheadと番号付き所属の回帰を維持。全113本のレポートはこの局所計測で上書きされるため、113本の旧集計値とは混同しない。
- 2026-10-07: 文字付き所属マーカー（`a Institute... b Department...`）を番号付き所属と同じ構造証拠として分割。medical-deep-learning-meta-reviewの混在1 blockを6所属へ復元し、ScienceDirect chromeを除外。author projection **4/4 pass**、typecheck pass。
- 2026-10-07: 文字付き所属マーカー修正後のPDF extraction回帰 **13 files / 71 tests pass**。既存の表・図・読み順・著者投影への副作用なし。typecheck pass。
- 2026-10-07: 著者・所属投影の修正（ACM参照形式の著者復元、番号/文字マーカー付き所属の分割、chrome/markerノイズ除去）後に、113本のisolated extraction benchmarkを再実行。取得済み113/114（`precious-materials`はPDF未取得）。canonical title exact **105/113 (92.92%)**、native title exact **53/113**、metadata fallback **56/113**。既存Ground Truth対象では heading recall/precision、figure/table caption、table region、reading-order がすべて1.0、source integrity平均 **0.99997**。これはタイトル・本文の全件目視検査ではなく、自動指標の回帰確認である。focused author/affiliation tests 4/4、pdfExtraction 13 files/71 tests、typecheck pass。未解決の所属投影例（interactive-jewellery/PPG）は、列重なりを含むため次のgeometry診断対象として残す。
- 2026-10-07: interactive-jewelleryの所属診断で、行ごとのx座標を独立クラスタ化すると短い折返し語（Sydney等）が別列へ混入することを確認。最初の複数項目行を列アンカーにし、後続語を最近傍列へ割り当てる投影へ変更。国名の列移動は次項目が国名でない場合だけ適用し、`Faculty of Design...Sydney Australia`、`Industrial Design...The Netherlands`、`Australian Research...Macquarie University` を保持する回帰を追加。pdfExtraction **13 files / 72 tests**、typecheck、diff check pass。所属の完全な意味復元（PDF側で列順自体が崩れたケース）は引き続き未解決。
- 2026-10-07: ロシア語タイトルPDFのnative textが `АПФАПФ&ПЛ&ПЛ` のようにPDF item境界をまたいで壊れるため、page-class signalの連結を空白区切りへ変更。item単位の `brokenTokenHits` を検出して `garbled` 判定し、Vision OCR対象へ送るようにした。実PDF page 1で `brokenTokenHits=4`、`garbled`、OCR対象を確認。`pageClass` **7 tests**、typecheck pass。OCR実行後のタイトル品質はmacOS Vision runtimeで別途確認が必要。
- 2026-10-07: 113本のtitle mismatch 8件を内訳確認。3件はPDFの可視タイトルがロシア語/セルビア語でcatalogの英訳と一致しないもの、1件はBehaviour/Behaviorの綴り差、1件はGround Truth側のAND/TND差。実抽出失敗として残るロシア語タイトルはToUnicode破損（`АПФАПФ&ПЛ&ПЛ`）で、前項のOCR routing修正対象。自動title exactをそのまま意味的正解率と解釈しない。
- 2026-10-07: 実PDF page 1をVision OCR相当で直接検証しようとしたが、ローカルSwift compilerとmacOS SDKのバージョン不一致（SDK swiftlang 6.2.0.16.14 / compiler 6.2.0.19.9）で一時Swift harnessが起動できなかった。アプリ側Rust Vision実装のコンパイル確認とは別の環境問題であり、OCR routing判定（実PDFをgarbled→OCR対象）は既にテスト済み。次回macOSアプリ実行時に実OCR出力を確認する。
- 2026-10-07: アプリが使用するRust/objc2 Vision OCR実装を `cargo check --manifest-path src-tauri/Cargo.toml` で検証し成功。`ru-RU` を含むVision呼び出しと座標変換コードはコンパイル可能。Swift単体ハーネスのSDK不一致とは切り分けられた。実OCR出力の目視確認には、現行Tauriアプリを起動して対象PDFを再抽出する必要がある。
- 2026-10-07: title resolverにも、PDF ToUnicode破損で生じる短い大文字glyphの重複＋記号（例 `АПФАПФ&ПЛ&ПЛ`）をdecoder garbageとして除外するEvidenceを追加。source言語がロシア語等でも正当なタイトルを一律除外しないよう、翻訳品質の`isGarbageTitle`全体ではなく専用geometry/text patternだけを使用。title resolver + quality **279 tests**、typecheck pass。
- 2026-10-07: `cognitive-dual-task.pdf` の所属ブロックに査読者（`Reviewed by:`, `Yi Sun, NIH...`）と本文断片が混入するケースをgeometry診断。所属正規化で明示ラベル境界、ラベル省略時の人名＋機関テール、lowercase本文断片を除外。結果から査読者情報が消え、author projection regression **6/6**、typecheck pass。残る `University of ... United States Campinas` の列混在は別のmarker/column再構成課題として記録。
- 2026-10-07: `cognitive-dual-task` のFrontiers型サイドバーが所属native blockへ混ざるケースで、superscript文字列分割を避け、body側x帯だけを列復元へ渡す補正を追加。`University of Massachusetts`（編集者所属）と査読者をaffiliation projectionから除外する回帰を確認。author projection **6/6**、typecheck pass。残る2列の所属同士の境界（University of Campinas / NIH等）はPDF native順序が交差しており、marker-aware groupingの追加診断対象。
- 2026-10-07: サイドバー混在所属のsuperscript分割でも、native itemからサイドバー除去後のmarkerSourceを作るよう変更。`cognitive-dual-task` で編集者/査読者混入は除去済みだが、同一本文列内の機関1〜4はまだ2ブロックへ連結されるため、修正を部分適用として記録。author projection **6/6**、typecheck pass。次はmarker位置と行順を使った機関境界復元を優先する。
- 2026-10-07: markerSource変更後のpdfExtraction全回帰を実行し、**13 files / 75 tests pass**。既存のheading、table、list、OCR classification、author/affiliation regressionに失敗なし。所属1〜4の完全分離は未達のため、全件benchmark値は更新せずfocused regressionとして扱う。
- 2026-10-07: marker順序を行内x順ではなくPDF native item順で読むようにし、`cognitive-dual-task` の機関1〜4を4所属へ分離。確認結果: Applied Kinesiology、Electromyography Studies、National Center、NIH Biomedical Centerが各別ブロックになり、編集者/査読者所属は除外。author projection **6/6**、typecheck pass。サイドバー混在専用経路として実装し、通常2段組への影響を回帰で確認する。
- 2026-10-07: numbered-affiliation順序復元後の全pdfExtraction回帰を再実行し、**13 files / 75 tests pass**、typecheck pass。サイドバー混在経路の追加でも既存の段組・表・見出し・OCR分類へ回帰なし。
# 2026-10-07: extraction manual-review sample generation

Generated `test-data/real-papers/reports/extraction-manual-sample-v1.json` with
1,719 candidates across all 113 available PDFs. The review sampler now records
short papers as `underSampled` instead of aborting; three papers had 9–11
candidates because they contain fewer extractable structural/body blocks. This
is a sampling-tool fix only and does not change production extraction.

# 2026-10-07: repeated top-margin URL contamination

The 113-paper review sample exposed a generic reading-order defect in
proceedings PDFs: a repeated URL at the top margin was being appended to the
preceding body paragraph across a page boundary (and sometimes became a
standalone paragraph). URL-only top-margin lines are now classified as header
chrome before continuation stitching. A real-paper regression for the CPCIG
conference PDF passes; inline body URLs are intentionally not changed.

# 2026-10-07: displaced table-header boundary

The manual-review sample also found a page-boundary merge in which a short
statistics header (`Variable N Mean Std. Min Max`) from a displaced table
column was appended to the preceding prose paragraph. A conservative geometry
plus header-token boundary now prevents that merge while leaving ordinary
sentences containing statistical terms unchanged. The marketing-platform real
PDF regression passes.

# 2026-10-07: repeated ISSN/header stream contamination

An Indonesian journal PDF exposed the same failure with a richer masthead:
`p-ISSN / e-ISSN / journal URL` lines at the top of each page were being
reclassified as paragraph candidates after layout reconstruction. The generic
candidate layer now preserves `header`, `footer`, `copyright`, and `chrome`
layout roles instead of allowing paragraph heuristics to override them. A
real-paper regression confirms the repeated journal URL no longer appears in
body paragraphs; legitimate ISSN text inside a bibliography entry remains
unchanged.

# 2026-10-07: affiliation author contamination guard

The production projection now rejects affiliation-derived author candidates
that contain generic institution/role phrases (for example `Research
Director`, `Industrial Design`, or `Interactive Computing`). This prevents
malformed column-interleaved affiliation text from being exposed as people.
The change is intentionally conservative: when no reliable author remains,
the projection keeps the author list empty rather than publishing an
institution as a person. Focused author projection tests and TypeScript
typecheck remain green; representative PDFs still require geometry-specific
follow-up for heavily interleaved publisher mastheads.
# 2026-10-07: interleaved multi-column masthead recovery

Added a conservative column-anchor recovery path in the canonical projection.
It uses author-sized text anchors and native item x positions to reconstruct
publisher mastheads whose same-baseline columns were flattened together. The
path is only used when the inferred result has multiple author and affiliation
groups; otherwise the existing resolver projection remains authoritative. The
PPG Earring regression now recovers all six authors and removes figure-caption
text from affiliations. PDF extraction tests: 27 suites / 75 tests passed.
# 2026-10-07: numbered institution spans in flattened mastheads

For publisher mastheads where a single affiliation node contains author names
followed by numbered institution phrases, projection now extracts distinct
capitalized `... Design` / `... Computing` institution spans and removes brace
contact aliases from the final affiliation label. This is gated on multiple
numbered spans and does not change normal single-affiliation rows. The
`dont-mind-me.pdf` regression now exposes Department of Computer Science,
University of Colorado, Industrial Design, Interactive Computing, and Georgia
Institute of Technology without author/contact contamination. PDF extraction
tests: 27 suites / 76 tests passed.
# 2026-10-07: flattened single-author report masthead

The generic author projection now recovers a single person when a report/book
template flattens `author -> role -> institution` into one affiliation node.
The pattern requires a person-shaped prefix, an academic role marker, and an
institution-shaped tail, so it does not relabel ordinary body prose. The
`ergonomics-human-factors-and-ergonomics` fixture now projects **Murali Krishna
Pasupuleti** and **National Education Services**. Author projection tests:
8 passed; TypeScript check passed.
# 2026-10-07: adjacent author names in flattened mastheads

Author projection now splits a comma-bounded four-token title-case run when a
publisher loses the delimiter between two adjacent two-token names. The
`dont-mind-me` masthead now exposes `James Clawson` and `Thad Starner`
separately while preserving the other authors. The rule is limited to
comma-bounded name-shaped runs and does not apply to institution prose.
# 2026-10-07: affiliation marker cleanup

Affiliation normalization now removes duplicated flattened superscript
markers (for example `1 1New Delhi`) and rejects isolated initial runs such as
`M N` unless an explicit institution term is present. The single-author report
fixture now yields `National Education Services, New Delhi, India` without the
spurious `M N` affiliation. Author projection tests remain 8/8 and TypeScript
passes.
# 2026-10-07: reject repeated-glyph title candidates

Projection now treats repeated short Unicode glyph runs (for example
`АПФАПФ`) as corrupted ToUnicode output before calling `pickPaperTitle`.
Trusted metadata or OCR can then supply the title instead of exposing the
garbled native candidate. Existing title-resolver and author-projection tests
remain green.
# 2026-10-07: repeated-glyph title regression coverage

Added a real-PDF regression asserting that the linguistics fixture's broken
`АПФАПФ...` title stream is never projected when a trusted metadata title is
available. Author/title projection tests now pass 9/9.
# 2026-10-07: flattened-author title guard

Extended the repeated-glyph title guard to long title candidates that contain
numeric markers and comma-separated author-like tails. When detected, the
candidate is rejected so metadata/OCR can supply the title. The guard is
projection-only and does not alter ordinary title candidates.
# 2026-10-07: full extraction regression completed

Ran `npm run test:extraction-corpus -- --reporter=dot` in a foreground PTY and
collected the terminal result: **2 test files / 232 tests passed**, exit code 0,
including the cached real-paper baseline and reading-order corpus. PDF.js
canvas/font/ColorSpace warnings appeared but produced no test failures.
# 2026-10-07: citation-line title recovery without metadata

When a corrupt title candidate is present and PDF metadata is empty, the
projection now uses a same-line `For citation:` paragraph with a DOI as a
structured fallback. It selects the title sentence while excluding authors,
journal metadata, and the DOI. The linguistics fixture now recovers
`The role of applied linguistics and language discourse analysis in English
language teaching` without metadata. PDF extraction tests: 13 suites / 78
tests passed.
# 2026-10-07: detached figure panel labels at page boundaries

The refreshed extraction sample found a paragraph ending in `... The model`
followed by a compact `A B` figure-panel label at the top of the next page.
These labels are now treated as header boundaries when they are short uppercase
runs in the top margin, preventing them from being stitched into prose. The
real GPT-3 multi-part figure regression passes; ordinary paragraph extraction
is unchanged.

Environment setup: rebuilt the native `canvas.node` binding after installing
Homebrew `pkg-config`, Pixman/Cairo/Pango and image dependencies. The PDF.js
DOMMatrix/Path2D warnings no longer occur in the extraction test process.
# 2026-10-07: asymmetric article-info rail detection

A real Elsevier first page exposed a reading-order defect: the narrow
`Article history`/`Keywords` rail was treated as one stream with the wide
abstract, producing fragments such as `pa` + `tient`. Geometry now detects
this asymmetric rail only when article-info labels and persistent x/y bands
are present, while ordinary ACM-style abstracts remain unchanged. The rail is
kept separate from the masthead and the abstract starts at the correct word.
A false positive on the PPG Earring first page was found during the full
regression and constrained by requiring the article-info labels; the affected
PPG and cognitive reading-order regressions now pass.
# 2026-10-07: vector figure labels separated from prose

The cognitive-psychology GPT-3 fixture contained vector labels such as `Linda
Cab Hospital` and `Toma Test Wason` on the same native stream as body prose.
A figure-caption-anchored, geometry/style-gated split now isolates compact
right-side labels before continuation merging. It is limited to figure
captions and smaller-font label lines so floated tables and ordinary two-column
prose are unchanged. Full extraction corpus regression: **232/232 passed**.

# 2026-10-07: Elsevier venue masthead vs article title

Some Elsevier first pages expose the centered venue banner as the strongest
native title candidate, before the actual article title. The title resolver now
uses the structural sequence (centered candidate, then a substantially lower
left-aligned title candidate) as evidence to prefer the article title without
publisher-specific vocabulary. Regression coverage was added for
`medical-deep-learning-meta-review`; the focused extraction tests and
TypeScript check pass.

# 2026-10-07: mixed-column author metadata

Two real papers exposed author rows split across email, affiliation, and
location columns. A standalone email-containing author row was being rejected
as chrome, and a same-line `and Author` continuation was left as paragraph
text. Projection now retains name-shaped email rows, promotes strict
top-of-page author continuations, and normalizes `authorsStructured` through
the same author expansion used for display names. Regression coverage was
added for the landing-page and GPT-3 fixtures.

# 2026-10-07: lettered affiliation reconstruction

Elsevier mastheads with two interleaved columns could produce fragmented or
duplicated affiliations because the native order separated the `a`–`f`
markers from their institution lines. The projection now reconstructs the
bounded masthead band at marker boundaries and retains only institution-shaped
segments. The medical meta-review affiliation regression passes; the separate
editor/reviewer chrome case remains under investigation.

# 2026-10-07: reviewer metadata separated from author affiliations

Frontiers-style first pages can place `Edited by`/`Reviewed by` metadata and
its affiliations in the outer columns of the author masthead. The projection
now detects the review-label boundary, keeps central author-affiliation rows,
retains the post-label author institution column, and shares a wrapped
university continuation across the relevant author rows. It also uses existing
laboratory evidence to avoid losing the left-column institution. The complete
author projection suite now passes **20/20**.

# 2026-10-07: Frontiers author continuation ending in `and`

The marketing neuroconsumer PDF placed the first three authors in a central
row ending with `and`; the generic masthead filter treated that row as prose
and dropped them. Name-pair evidence now retains such a short author row while
the existing author expansion removes the conjunction. Added a real-paper
regression; author projection now passes **21/21**.
# 2026-10-07: publication metadata emitted as adjacent title candidate

The 113-paper benchmark exposed a generic title-resolution failure where a
publication line immediately below the article title was classified as a
second `title` candidate and concatenated into the article title (for example,
`www... IJRMMS 2021; 3(1): 63-65`). The resolver now treats an adjacent
document/journal masthead candidate as a boundary and keeps it out of the
article title. A direct suffix regression and the real rural-consumer PDF now
pass; title-resolver tests pass 7/7 and TypeScript passes.

# 2026-10-07: explicit research-book title anchor

Report/book PDFs can label the title as `Research Book Title:` while the
generic role classifier assigns that line to the masthead and promotes the
following `Abstract:` line as the title. The resolver now recognizes explicit
title labels as document-level title evidence and keeps them ahead of nearby
abstract text. The human-factors report fixture now resolves to
`Human Factors and Ergonomics`; title-resolver tests pass 8/8.

The refreshed 113-paper benchmark after the title-boundary fixes is
**104/113 title-exact (92.04%)**, up from 101/113. The remaining nine cases
are isolated for triage; several are source-PDF/catalog mismatches or
legitimate language/spelling variants rather than native extraction loss.

# 2026-10-07: inline journal rail between wrapped title fragments

Some PDFs place a journal/year/page rail between two native title fragments,
for example `... role` followed by `IJLE 2026; 6(1): 05-09 language ...`.
The title resolver now removes the bounded publication token while retaining
the surrounding title text. The real eco-linguistics PDF now resolves exactly;
title-resolver tests pass 9/9.

# 2026-10-07: uppercase title split across author-scored lines

Some conference PDFs score an all-uppercase article title as `author` because
the title sits inside the author masthead. When two nearby title-scored lines
form a contiguous uppercase cluster, the resolver now joins them as the title
before applying masthead fallback. The advertising-incentives PDF now resolves
its full title; title-resolver tests pass 10/10.

# 2026-10-07: title benchmark residual triage

The remaining title mismatches were checked against page-one native text.
Several fixtures contain only a Russian/Serbian original title while the
catalog stores an English translation; one differs only by British/American
spelling (`behaviour`/`behavior`), one catalog entry has a likely `TND`/`AND`
typo, and the morphology fixture contains a different medical paper. These
are acquisition/ground-truth issues, not evidence that the title resolver
should invent an English title. Remaining implementation work focuses on
author/affiliation, reading order, tables, and genuine native-text loss.

# 2026-10-07: numbered procedure steps absorbed into figure caption

Manual layout review found a genuine paragraph-boundary error in the
language-model/physics PDF: `Figure 3` caption text was joined with a following
numbered procedure (`2. For each layer...`). Caption continuation now rejects
multi-step numbered procedure blocks, preserving the caption and paragraph as
separate canonical nodes. The regression is covered in the pipeline suite;
PDF extraction pipeline tests pass 38/38.

# 2026-10-07: captionless method/goal table detection

The education-learning-analytics PDF contained a two-column `Method /
Goal/description` table without a caption. Its rows were otherwise emitted as
ordinary paragraphs and would be sent to translation. The generic candidate
layer now requires explicit column-heading evidence plus repeated x-origins,
and excludes pages with figure captions. The rows are projected as skipped
table blocks; the pipeline suite passes 39/39. A first broader heuristic was
reverted after the full corpus caught a Wear Scale author regression. The
strict version preserves the full extraction corpus: **232/232 passed**.
# 2026-10-07: CJK comparison table rows and caption recovery

The ergonomics/HF regression PDF contains a CJK comparison matrix whose rows
use repeated x positions and checkmarks (`√`, `✓`, `☑`, `☒`). The generic
candidate layer now promotes only geometry-matched checkmark rows to table
evidence and promotes a nearby `表 N` line to caption evidence only when at
least three such rows and two repeated column origins are present. A regression
verifies the rows are tables, `表 3` is a canonical caption, and nearby `其次`
prose remains a paragraph. Targeted pipeline tests pass 40/40; the full
extraction corpus remains 232/232 after this change.
# 2026-10-08: mixed masthead title separation regression fix

The Russian `marketing-digital-marketing-consumer-behavior.pdf` exposed a generic late-stage reconstruction bug: page-one affiliation lines from the left column were merged back into the larger right-column article title during masthead processing. `reconstructDocument` now applies a conservative final geometry/style split for a page-one two-column masthead when the right run is materially larger and predominantly uppercase. The rule is document-format based and does not match paper-specific text. The target benchmark now reports `titleExact: 1` and canonical title `DIGITAL MARKETING: CONSUMER BEHAVIOR`; a regression test asserts that the title block contains no affiliation text. Typecheck, the focused title/pipeline suite (59/59), and the focused regression pass. The full extraction suite reached 121/124 assertions, but three existing heavy author-projection cases exceeded Vitest's 60-second task timeout; no assertion failure was reported for those cases. Re-run those heavy tests with an extended timeout before treating the full suite as clean.
# 2026-10-08: numbered masthead author preservation

Frontiers-style numbered author continuations were being resolved as affiliation blocks when they appeared in an adjacent column. The resolver now promotes only short page-one marker-bearing lines with multiple person-shaped tokens and no institution vocabulary; location-only author leakage is filtered for the same projection. The `cognitive-dual-task` targeted benchmark author F1 improved from **0.2353 to 0.5714**; title/source integrity stayed 1.0. Author projection tests **24/24** and typecheck pass. The result is an incremental improvement: several authors remain split across the PDF's interleaved columns and require further geometry-aware stitching.
# 2026-10-08: Frontiers masthead column stitching

The projection layer now performs a guarded final stitching pass for page-one mastheads containing `Edited by`/`Reviewed by` chrome. It joins adjacent same-column native lines before extracting full person-shaped runs, then replaces shorter fragments only within that format signal. The `cognitive-dual-task` author F1 improved from **0.5714 to 0.7000**; title exactness and source integrity remain 1.0. Author projection tests **24/24** and typecheck pass. The remaining misses are genuinely ambiguous author/editor fragments and require stronger numbered-marker relation evidence.
# 2026-10-09: interactive jewellery masthead/caption boundary fix

`interactive-jewellery.pdf` exposed two extraction problems. `mergeFigureCaptionContinuations` could absorb a long sentence-like body paragraph after an unpunctuated Figure caption; the resolver now merges only short/panel-like continuations and a regression verifies Figures 1, 2, and 5 remain separate from body prose. The ACM masthead also flattened adjacent affiliation columns. Projection now uses native span x geometry (excluding superscript markers from the column anchor) and bbox overlap when propagating affiliation markers. The four primary affiliation records are separated; focused pipeline coverage and typecheck pass. Commits: `d839aa8`, `4be7206`.

The broad 232-case extraction corpus was run after the change: 230/232 passed. The two failures are existing/independent cases (`ppg-earring` abstract stitching and `cognitive-memory-cue-interest` layout-chrome paragraph stitching); they remain follow-up extraction work. No `.app` rebuild has been made for these commits.

The two 230/232 failures were then reproduced and fixed generically: long statistical prose with scattered numeric spans was being promoted to `table` by the compact mixed-stream fallback. A sentence-boundary and word-count guard now leaves prose as paragraph while retaining compact borderless table streams. The targeted PPG, cognitive-memory, interactive-jewellery baseline/reading-order checks now pass (6/6); the full corpus should be rerun after the final masthead continuation tweak.

Final rerun after the masthead continuation tweak completed **232/232** (118 baseline real-paper checks + 114 reading-order checks, 395s). This validates the extraction changes across the cached corpus. The remaining PDF.js `TT`/ColorSpace warnings are parser warnings, not failed assertions. The `.app` bundle has not been rebuilt since these extraction commits.

After adding the generic same-column affiliation stitch (comma-terminated row + nearby continuation), the full author projection suite passed **24/24**, and the final cached extraction corpus again passed **232/232**. The interactive-jewellery masthead now keeps the main institution continuations separate without affecting existing masthead cases. The packaged `.app` still needs a rebuild to include these commits.

`npm run tauri:build:fast` was then completed successfully at **2026-10-09 00:47:42**. The generated app is `src-tauri/target/release/bundle/macos/Paper Reader.app`; this is an unsigned fast build with DMG/signing skipped.

The Reader header now renders extracted `paper.affiliations` below the author list when available, with a compact secondary style and no output when the list is empty. Reader tests **12/12** and typecheck pass. The UI change was packaged in a new unsigned fast `.app` at **2026-10-09 00:59:09**.

# 2026-10-09: Apple Translation selective backend

Added a macOS-native `AppleTranslationEngine` and conservative `SelectiveAppleTranslationEngine`. Only extracted paragraph blocks with complete prose-like text (40–700 chars, sufficient words, no contact/URL/reference/caption/list markers) are registered for Apple; titles, headings, figures, tables, references, and uncertain blocks remain on MADLAD. Unavailable language packs, native errors, and existing quality-gate failures fall back to MADLAD. Apple and route identities are distinct for translation cache keys. The helper is compiled from `src-tauri/apple_translation.swift` during both fast and clean builds and bundled as `apple-translation`. Routing tests and typecheck pass; the unsigned `.app` was rebuilt at 10:29:26. The current machine reports `TranslationError.Cause.notInstalled` for the Apple language pack, so runtime safely uses MADLAD until the pack is installed. Evaluation artifacts and the migration decision are in `test-data/real-papers/reports/apple-translation-evaluation-v1.md`.

# 2026-10-09: Apple routing gate status

The guarded selective backend is production-ready as code but remains **conditional No-Go for default replacement**: the current machine reports the Apple language pack as not installed, so no real Apple accepted/rejected/fallback counts have been observed inside the app. Static policy analysis identifies 102/239 unique non-fallback ordinary-body audit rows as eligible. The 20-pair manual review still contains severity >=2 cases, so unsafe false-accept = 0 is not proven. Keep MADLAD as the safe fallback and rerun the held-out cohort after installing the language pack before enabling Apple as the default first choice.

- 2026-10-09: Apple language pack became available and native helper held-out routing was measured on 102 eligible ordinary-body rows: Apple accepted 96/102, MADLAD rescued 5/6 Apple quality rejections, and final reader-visible fallback was 1/102 (0.98%) for this cohort. This is below 5% operationally, but the source set is from the existing audit corpus and the 20-pair manual review still contains severity >=2 cases; full default-replacement Go is not claimed. Summary: `apple-routing-quality-summary.json`.

- 2026-10-09: Moved numbered affiliation + body contamination into PDF extraction. A generic multi-institution masthead band is now classified as an `affiliation` block before projection, so it cannot enter the following paragraph translation unit. Regression on `linguistics-register.pdf` passes; the three institutions are projected as affiliations and no block contains both the affiliation band and article prose. Latest unsigned `.app` rebuilt at 10:45.

- 2026-10-09: Full PDF extraction suite after the affiliation-band boundary fix passed **129/129 tests across 13 files** in a single worker. Parallel Vitest mode still has the known `onTaskUpdate` timeout despite all assertions passing; single-worker is the authoritative result.
### 2026-10-11: latest packaged build and typography evidence

- `npm run tauri:build:fast` completed successfully. The latest bundle is `src-tauri/target/release/bundle/macos/Paper Reader.app`, built at `2026-10-11 22:57:00 +0900`.
- The bundled `translation-server/engines/segmenter.py` and `madlad_mps.py` hashes match the working tree. Native line provenance keeps `fontName`, `fontSize`, x/y, width/height, and rotation through layout diagnostics and package layout. Heading/table/masthead resolvers use font family/size and geometry as evidence, so typography is now an explicit block-boundary clue rather than a display-only field.
- A packaged acceptance run with `/Users/harada/Desktop/2686612.2686699.pdf` started the bundled server successfully (`/health` ready), but remained at `import_started` for the 120-second harness window. The run was stopped and retained at `/tmp/paper-reader-ozchi-acceptance.Mrk2R0`; no extraction result was claimed from this incomplete run. Direct Canonical extraction and the full regression suite remain the valid evidence until the packaged import can complete in a longer/interactive run.
- The old unrelated PID 54697 server on port 8765 was stopped before the acceptance run, so the bundle spawned its own sidecar; this avoids testing against a stale server.
- The package checkpoint fix is now bundled at `2026-10-11 23:22:03 +0900`. The latest app was fully restarted from that bundle; its bundled translation server reached `/health` `phase=ready`, `model_loaded=true`. A fresh Tauri run reached `import_dispatched` without the earlier immediate package error during the first 20 seconds (`/tmp/paper-reader-ozchi-acceptance-final2.qk3PcZ`); the full translated import still requires a longer interactive run because this harness was intentionally stopped before completion.
- After adding the post-source-hash flush and live-package read retry, the full JavaScript regression suite passes: **80 files, 758 tests**. Typecheck, focused package tests, and `git diff --check` also pass. The latest app remains running from the 23:16 build for manual Tauri verification.
- The Golden PDF's same-baseline masthead authors were found to be reversed by sub-pixel y-coordinate noise (`Jonna Häkkilä, Ashley Colley` despite Ashley being left). The generic author-source sort now treats y differences ≤1pt as one visual row and orders by x, yielding `Ashley Colley, Jonna Häkkilä`; a baseline regression asserts this order. Author projection focused tests pass **25/25**. The latest `.app` containing this fix was rebuilt at `2026-10-11 23:27:43 +0900`, restarted, and its bundled translation server reached `phase=ready`.

- The 113-paper reading-order rerun exposed one generic regression in `medical-imaging-deep-learning-review`: a short first line beginning `Abstract—Since ...` inherited title typography and was omitted from the paragraph stream. The layout classifier now treats inline abstract labels followed by multi-word prose as paragraph evidence; this is punctuation/typography based and applies to IEEE/arXiv-style layouts generally. The full reading-order corpus now passes **114/114**.
- The final unsigned fast `.app` was rebuilt at `2026-10-11 23:51:15 +0900` from the working tree, restarted, and its bundled server reports `/health` `phase=ready`, `model_loaded=true`. Bundle hashes match the source for `segmenter.py` (`e6e2ad06…`) and `madlad_mps.py` (`c5c7dc12…`).

- A clean isolated packaged integration acceptance run finally completed for the Golden OzCHI PDF (`/Users/harada/Desktop/2686612.2686699.pdf`): import, Paper Package persistence, Reader body lookup, annotation creation, library search, English Markdown export (`46,022` bytes), quit/relaunch, and persisted annotation verification all returned `ok=true`. The result is retained at `scripts/packaged-e2e/artifacts/integration/result.json`. The persisted package has the expected title, ordered authors Ashley Colley / Jonna Häkkilä with both affiliations, no ACM permission-text paragraph, 21 reference blocks, and captioned Table 1–5 blocks. This validates the real bundled Tauri path through CanonicalDocument/PaperBlock and Markdown export; interactive visual inspection and Notion ZIP inspection remain separate follow-up checks.

- Docling was evaluated in an isolated `tmp/docling-eval-venv` (`docling==2.137.0`) on the same Golden PDF. It produced useful Markdown grids for some tables, but introduced title-to-abstract reading-order contamination, emitted the full ACM permission notice as article prose, flattened affiliation/email metadata, and corrupted diacritics/statistical glyphs (`Jonna HŠkkilŠ`, `usersÕ`, `�2`). The full evidence and decision are in `test-data/real-papers/reports/docling-ozchi-finger-specific-touch-v1.md`; Docling is not a native-parser replacement, only a possible future low-confidence table-evidence enricher.

- Packaged acceptance now also creates and structurally validates the real Notion import archive, rather than only exercising plain Markdown export. The Golden PDF passed a second clean run with `notionBytes=1,137,805`; its ZIP has one Markdown file plus 15 figure/table image files at the archive root, so Notion will not create an empty `assets` page. The final result preserves the Notion byte count after relaunch. Typecheck and focused Markdown/package tests pass. Latest fast unsigned `.app` was rebuilt at `2026-10-12 00:04:52 +0900`, then started; bundled translation `/health` reports `phase=ready`, `model_loaded=true`.

- GROBID `0.9.1` was then built and run locally with Java 21 for the same Golden PDF; no Docker, Podman, or cloud service was used. `processHeaderDocument` exactly recovered the title, both author names, emails, DOI, and useful affiliation structure. `processFulltextDocument` excluded the ACM permission chrome, but returned only 20 references versus native 21, 10 figures versus native 12, and logged seven incomplete/malformed tables whose cells are interleaved with prose. The comparison is recorded in `test-data/real-papers/reports/grobid-ozchi-finger-specific-touch-v1.md`. GROBID remains optional local **header evidence** only; it must not replace the native Canonical extraction path. The TEI parser now retains sibling department/institution/country tags within an affiliation link; its focused tests pass 3/3 and typecheck passes. Typography continues to be retained as resolver evidence (`fontName`, size, weight, baseline, indent and spacing) together with geometry, never as a standalone role rule.

- The fast unsigned `.app` was rebuilt after the GROBID TEI parser and comparison-report changes at `2026-10-12 00:19:40 +0900`: `src-tauri/target/release/bundle/macos/Paper Reader.app`. The focused GROBID TEI test passes **3/3**, typecheck and `git diff --check` pass. This rebuild includes all current extraction/UI worktree changes; start this bundle afresh to use it.

- A fresh packaged Tauri acceptance run against `/Users/harada/Desktop/2686612.2686699.pdf` passed again after that build: isolated import, Canonical/Paper Package persistence, Reader body lookup, annotation, library search, English Markdown export (`46,022` bytes), root-level Notion archive (`1,137,805` bytes), quit/relaunch, and persisted annotation verification all returned `ok=true`. Result: `scripts/packaged-e2e/artifacts/integration/result.json`. The full cached extraction corpus was then rerun against the current worktree: **232/232** pass (118 real-paper baseline + 114 reading-order checks, 417.62s). Parser font/ColorSpace warnings are non-failing PDF.js diagnostics only.

- Latest-bundle visual verification: the normal `Paper Reader.app` process creates a real native window and its library surface was captured from the current bundle at `scripts/packaged-e2e/artifacts/integration/latest-app-window.png`. The dedicated Accessibility UI E2E was strengthened after two harness-only failures: its isolated HOME now reuses the host Hugging Face model cache, and Open-panel paths are pasted rather than typed so a Japanese IME cannot convert path punctuation. The panel now reaches and selects the Golden PDF. The remaining UI-driver issue is the final NSOpenPanel confirmation: the native panel closes but WKWebView does not deliver a file-input change event under System Events automation, so no package is materialized. This does not contradict the separately successful packaged acceptance import, which reads the same PDF through Tauri's `read_dropped_pdf` command. Reader visual interaction still needs either a stable macOS picker driver or a short manual import/open check; do not treat the failed UI harness as an extraction regression.

- The fast unsigned `.app` was rebuilt again at **2026-10-12 00:58:24 +0900** after the packaged UI harness changes. The bundle path is `src-tauri/target/release/bundle/macos/Paper Reader.app`; the build completed successfully. The translation server was started separately for UI verification and stopped cleanly afterward.
- The UI harness now explicitly uses the Tauri `read_dropped_pdf` + `startBackgroundImport` path when `PAPER_READER_UI_E2E=1` and `PAPER_READER_UI_E2E_DIRECT_IMPORT=1`, avoiding the flaky native picker/IME path. A subsequent run with the bundled app and a ready translation server still exited before producing a UI watcher marker, so no new visual UI pass is claimed. The earlier packaged integration acceptance remains the authoritative end-to-end pass; no production direct-import behavior is enabled.
- Follow-up process audit found four orphaned `Paper Reader.app/Contents/MacOS/app` processes left by earlier UI/manual attempts (including isolated `PAPER_READER_UI_E2E` homes). They were not a current production instance and were terminated. This explains why screen captures showed unrelated/stale window content and why Accessibility enumeration was ambiguous; future UI checks must launch one fresh bundle instance and clean it in a `finally`/trap.
- Re-inspected the retained latest-bundle screenshot `scripts/packaged-e2e/artifacts/integration/latest-app-window.png`: it is a real Paper Reader library window from the packaged app (Japanese library title and paper card), not a mock or browser capture. It verifies native window rendering and the imported paper card; the deeper Reader-pane visual remains covered by the successful Reader body lookup in packaged integration, but lacks a stable screenshot artifact.
- After the display was turned back on, CGWindowList inspection identified the Paper Reader native window directly (owner `Paper Reader`, PID 36251, window ID 128250, bounds `1280×832` at `Y=-1018` on another Space/display). Capturing that window with `screencapture -l 128250` succeeded and produced `/tmp/paper-reader-window-direct.png`, confirming the app window was present; the earlier full-screen captures had shown Cursor because they captured the active Space rather than this off-screen window.
- Keyboard navigation through that same off-screen native window reached the Reader pane. Direct capture `/tmp/paper-reader-keyclick.png` shows the actual Reader layout, TOC, title, abstract and translation-failure banner. This is a real visual verification of the packaged Reader surface. The displayed object is an older persisted user paper (it shows only `Jonna Häkkilä` and six failed blocks), so it is not used as a regression result; the clean packaged acceptance artifact remains authoritative for the Golden PDF's current extraction (Ashley + Jonna, 232/232 corpus).

# 2026-10-12: borderless matrix row-label resolution

The Golden OzCHI PDF exposed a generic role conflict in the borderless p-value
matrix on page 5. Bold axis labels such as `Comfortable` received a perfect
heading-style score even though the geometry evidence identified a repeated
numeric neighbourhood and a high table score. The resolver now lets that
specific geometry/table evidence win for short punctuation-free labels, so
matrix headers and rows remain table members and are not emitted as translated
headings. A fresh diagnostic reduced the report from 132 to 131 blocks and
resolves `Comfortable` as `table`; the valid page-6 Table 3 grid remains a
table (`Finger / Thumb / Finger1…` and its function rows), not body prose.
The source-only table fallback is intentional: uncertain/borderless cells are
shown verbatim and are not sent to MADLAD, which explains why these blocks do
not receive a translation status. Typecheck and lint pass; the focused PDF
test process was stopped after PDF.js fixture work exceeded the local timeout,
so the full extraction corpus should be rerun before packaging this change.

The cached extraction baseline was rerun in a single fork: **118/118 tests
passed**. Vitest then reported its known `onTaskUpdate` worker timeout while
the second reading-order file was still running; no extraction assertion
failure was reported. The focused Golden diagnostic and new table assertions
confirm the role change. `npm run tauri:build:fast` completed successfully at
**2026-10-12 09:58:17 +0900** and produced the unsigned app at
`src-tauri/target/release/bundle/macos/Paper Reader.app`; the bundle contains
the updated extraction code and bundled translation server. A full packaged
import/visual check of the new table rendering remains the next manual step.

# 2026-10-12: image-backed ruled-table projection

The remaining Golden PDF Reader failure was not role classification: Table 3
was correctly identified as a ruled table, but its two native-text columns
were projected as separate source-only blocks because the table-caption crop
used ordinary figure bounds and clipped the table rows themselves. `figureImageRect`
now recognizes compact multi-line rows directly above a `table_caption` and
uses their top edge as the raster crop bound. After a numbered caption receives
a real crop, projection removes only its caption-owned `table-region-*`
fragments; if crop extraction fails, those source cells remain visible rather
than being discarded. Focused crop and fragment-suppression tests pass, as do
typecheck, lint, and diff validation.

The freshly rebuilt app was exercised through the actual packaged Tauri import
path with the Golden OzCHI PDF in an isolated app-data directory. Import,
annotation, search, Markdown/Notion export, quit, and relaunch all succeeded.
The persisted structure contains image-backed Table 1–5, including Tables 3
and 4, and no separate `Finger/Thumb` or `Function` table-column fragments.
Artifact: `scripts/packaged-e2e/artifacts/integration/result.json`; isolated
package: `app-data-68774`. The current app bundle was rebuilt at
**2026-10-12 12:14:25 +0900**. Existing user imports retain their old stored
extraction and need a fresh import to receive this structural repair.

# 2026-10-12: extraction usability goal and corpus table baseline

An active extraction-usability goal now treats the real-paper corpus and the
Tauri Reader as the product regression surface, rather than treating role
classification alone as success. The first table-region cohort pass completed
with **0 extraction errors**, **41 PDFs containing 204 table regions**. This
is an inventory, not a precision claim: the next phase samples/inspects these
regions by publisher and format, verifies caption-to-crop attachment, and
records whether the Reader shows one readable table rather than detached
columns. Artifact: `test-data/real-papers/reports/table-region-cohort-v1.json`.

# 2026-10-12: caption-above table projection follow-up

The Golden OzCHI `Finger/Thumb…`, `Function…`, and `Error dist.…` Reader
cards were a projection defect, not prose translation: the native table regions
were detected, but a numbered table crop and its raw cell fallback could both
be displayed. The import path now suppresses a fallback only after its
numbered caption has a rendered image, and recognizes both new
`table-region-*` fragments and legacy `tableSourceFallback` / table-region
evidence. Source text remains visible if rasterization fails.

`figureImageRect` now supports caption-below and caption-above tables. The
caption-above path needs a contiguous sequence of compact cell rows, so one
ordinary prose line cannot become a crop. Focused crop/projection tests pass
**4/4**, plus typecheck and lint. A full **114-PDF** Reader-readiness pass
completed with 0 extraction errors: among 47 PDFs with 366 numbered table
captions, crop-ready captions increased from **178 to 232**. Golden OzCHI is
now 5/5 crop-ready and all five raw table fragments are crop-owned. The report
records 1,830 unowned table-like fragments for the next precision-focused
iteration; they are not globally hidden because many are charts, appendices,
or tables lacking a trustworthy caption/crop. Artifact:
`test-data/real-papers/reports/table-reader-readiness-v1.json`.

The Resolver change was included in a further fast unsigned build at
**2026-10-13 13:25:25 +0900**. The packaged OzCHI acceptance run against that
bundle passed again; its persisted structure has 161 blocks, 5 tables, and 12
figures, with no raw `Finger Thumb Finger1`, `Function Call tapped`, or
`Phonebook Finger` streams.

# 2026-10-13: real Tauri import completion and OCR fallback safety

The isolated packaged-app acceptance test now completes with the current
bundle: native PDF import, atomic Paper Package persistence, Reader block
loading, annotation, library search, Markdown export, Notion ZIP export, quit,
and relaunch persistence all passed. This run exposed that the initial import
still assembled its package through mutable cache checkpoints before reading it
back to attach layout/source data. A document with no projected body block
could therefore reach that read before any package existed, yielding `Paper
Package が不完全です` and an empty Reader. Initial import now creates the complete
package directly from the extracted projection, native layout, and `source.pdf`
in one atomic package swap; the visible library index receives its final source
hash only afterwards.

Vision OCR is now bounded to 15 seconds per selected page. Timeout or Vision
failure produces an empty OCR result for that page and retains PDF.js native
text, so an auxiliary macOS OCR request cannot indefinitely block an otherwise
readable import. The OCR-stall regression, typecheck, lint (existing warnings
only), and the packaged acceptance test pass. The latest fast unsigned bundle
is `src-tauri/target/release/bundle/macos/Paper Reader.app`, rebuilt at
**2026-10-13 03:05:27 JST**.
For the OzCHI finger-specific-touch regression itself, all **5/5** numbered
tables are crop-ready; all 9 raw table fragments are caption-owned and the
Reader simulation leaves **0** raw table fragments. Existing user exports are
still historical until **PDFを再抽出** is run from the paper menu.

The next generic correction prevents later same-baseline matrix propagation
from overwriting stronger graphic-label evidence. It affects chart/diagram
labels only when their `other` evidence is already at least 0.82; captioned
and ordinary native table rows keep their table evidence. The real
`linguistics-language-model-physics` fixture now verifies that repeated plot
labels (`lay9 … lay10`) are not emitted as a Reader table, while OzCHI Table
3/4 checks still pass. A second 114-PDF audit retains **0 extraction errors**,
345 numbered captions, and 255 crop-ready captions; raw table fragments fall
from 1,811 to **1,808**, Reader-visible fragments from 1,151 to **1,148**.

`reextractPaper` now has a real saved-package integration regression using the
OzCHI PDF: it seeds a Paper Package with `source.pdf`, runs the stored-source
re-extraction path, then confirms the same paper ID and source are retained
and Table 4's native `Finger | Phonebook` cells persist in `structure.json`.
The Node test deliberately observes zero raster crops because its PDF runtime
has no Canvas backend; this validates the source-only fallback, not Tauri
image rendering. The packaged Tauri import acceptance remains the authoritative
check for actual raster table crops.

# 2026-10-12: image-backed package persistence verified on the actual OzCHI route

The prior large-PDF packaged acceptance failure was not an extraction failure:
`list_app_files` resolved the requested directory in the isolated acceptance
home but built its returned relative paths from the normal macOS app-data
directory. Consequently `loadPaperPackage(..., includeAssets: true)` saw no
freshly written `assets/figure-*.png` or `assets/table-*.jpg` and rejected the
temporary package as incomplete. The filesystem command now uses the same
environment-aware root for both resolution and recursive listing.

The actual bundled Tauri app imported
`/Users/harada/Desktop/2686612.2686699.pdf` in an isolated acceptance home and
reached `ready_for_relaunch`, including annotation, search, Markdown export,
and Notion ZIP export. The persisted package contains **17 assets**. Its
original document keeps the `p=0.007` statistical prose as text and represents
Table 3 as `assets/table-003.jpg` plus its caption; the former `Finger Thumb …`
and `Function Call …` raw table-cell streams are absent. The isolated test app
and its translation server were stopped after verification.

Typecheck and lint pass (existing warnings only). The Rust release bundle was
rebuilt after clearing stale DMG files and debug cache when the development
volume ran out of space. Current bundle:
`src-tauri/target/release/bundle/macos/Paper Reader.app`, built at
**2026-10-12 21:54:19 +0900**. The debug cache was intentionally removed; a
future `cargo test` will rebuild it.

# 2026-10-12: vertical-bar journal captions and full-column numeric table crops

The real `cognitive-dual-task.pdf` Tauri import exposed a second generic table
failure: `TABLE 2 | Baseline characteristics` was stored as a caption but was
not eligible for an image crop, leaving the table rows in Markdown. The
vertical bar is now recognized as a caption delimiter alongside colon, period,
and dash. The crop detector now also accepts a near-full-column row only when
it has repeated same-line cell geometry and numeric cell content; this recovers
wide ruled result tables without admitting short prose.

Direct native-PDF geometry diagnostics now produce crop rectangles for Tables
1, 2, and 4 in that paper. Focused crop regressions, caption recognition, and
typecheck pass. The complete `pipeline.test.ts` presently has four pre-existing
failures (mixed thesis caption, captionless method table, Elsevier title, and
synthetic column classification) plus Vitest's reporter timeout; these need
separate attribution before claiming a green full suite. The new unsigned
bundle was built at **2026-10-12 22:14:30 +0900**. An isolated reimport of this
second PDF could not complete because that fresh bundle's translation server
entered first-download state; it was stopped rather than leaving a background
process. This does not affect the direct PDF extraction evidence or the earlier
complete OzCHI packaged acceptance.

# 2026-10-12: title-masthead and two-column regression repair

Single-worker execution of the 66 pipeline regressions separated real failures
from the PDF.js/Vitest reporter timeout: 65 assertions passed, with one real
Elsevier title failure. The resolver had combined a journal masthead with its
shorter repeated venue-name variant as if they were article-title lines. A
normalized prefix check now removes that repeated publisher rail after the
first candidate is established as masthead furniture; the real article title
is retained. The targeted title regression passes.

The earlier single-column safeguard also initially treated a genuine two-column
row as a midpoint-crossing span. It now preserves two-column layout when the
same baseline has independently long left and right spans. Both the genuine
two-column and midpoint-spanning single-column regressions pass. The mixed
thesis caption test was corrected to select the body caption rather than its
correctly-suppressed table-of-contents entry. Latest unsigned bundle:
`src-tauri/target/release/bundle/macos/Paper Reader.app`, built at
**2026-10-12 22:26:32 +0900**.

# 2026-10-12: non-table grid false-positive follow-up

The next orphan-fragment review showed that raw-table counts also included
table-of-contents dotted leaders and symbolic assignment displays. These are
not data tables and should never be rendered as table cards. The generic layer
now marks a dotted leader as non-body only when at least three matching
leader-plus-page-number peers occur on the same page. It marks a dense
mathematical display as an equation only when it has multiple assignment/math
operators, dense numeric rows, and little prose, while preserving
caption-anchored data tables. Real-PDF regressions cover the ergonomics thesis
contents page and the language-model-physics display. Focused tests, typecheck,
lint, and diff validation pass. The fast unsigned bundle was rebuilt at
**2026-10-12 21:26:40 +0900**:
`src-tauri/target/release/bundle/macos/Paper Reader.app`.

# 2026-10-12: packaged import / persistence acceptance

With the stale orphan sidecar stopped, an isolated launch of the current
packaged app using `open -n` completed the real Tauri acceptance flow. It
created all required package files (`paper.json`, `original.md`, `ja.md`,
`structure.json`, `layout.json.gz`, `source.pdf`, and `translation.json`), then
completed annotation, search, Markdown export, and Notion ZIP export. A second
isolated launch recorded `relaunch_ok`, verifying that the imported paper and
annotation persisted. This is the package-level proof that the provisional
index visibility fix prevents the earlier incomplete-package Reader state for
the exercised fixture. Test data lived only under
`/tmp/paper-reader-package-open.TvjJ4P` and both test app and sidecar were
stopped afterwards.

The fast unsigned bundle was rebuilt after this change at **2026-10-12
12:46:37 +0900**: `src-tauri/target/release/bundle/macos/Paper Reader.app`.

# 2026-10-12: orphan table-candidate precision pass

The Reader-readiness report showed that many unowned `tableSourceFallback`
blocks were not tables at all. Real-PDF inspection identified two generic
causes: math-rich prose was fragmented into many native spans and inherited a
grid score, while numeric label matrices near a figure caption entered the
captionless-table fallback. The resolver/generic evidence now keeps prose with
ordinary lexical and punctuation structure as a paragraph, treats a strongly
symbolic low-prose display as an equation, and gives figure-adjacent vector
labels `other` priority over captionless table recovery. Caption-anchored
tables retain their dedicated evidence.

Focused real-PDF regressions pass for the economics `Regularized DeepIV`
math-prose case and the language-model-physics figure-label/formula cases,
along with the existing captionless-grid fixture; typecheck, lint, and diff
validation pass. Before the formula follow-up, the 114-PDF report reduced raw
table fragments from **1,951 to 1,643** and orphan fragments from **1,830 to
1,524**, with all 232 crop-ready numbered captions retained. Current targeted
diagnostics further reduce the language-model-physics source-only table count
to 109 and project its `|S| …` display as an equation. A full corpus rerun is
required after the final equation refinement before the next bundle build.

# 2026-10-12: bidirectional caption ownership and borderless matrix follow-up

The next full corpus pass found three complementary table layouts that had to
be handled together rather than by a paper-specific exception: captions below
their cells (common in ACM proceedings), captions whose left-aligned text
introduces a table extending into the right column, and borderless p-value
matrices where every cell is a separate native block. Generic candidate
evidence now recognises a nearby numbered table caption in either vertical
direction, multi-cell text bands adjacent to it, and a short axis label sharing
a baseline with an already strongly evidenced matrix cell. Typography cannot
revive those labels as headings after the matrix geometry has won.

Projection also no longer suppresses every short table node on a page merely
because that page has one caption relation. Suppression is confined to the
caption target's local geometry; an independently located matrix remains a
source-only table until the actual import path replaces it with a successful
image crop. The Golden OzCHI `Comfortable`/`Finger` p-value matrix, the
caption-below Table 3 `Finger/Thumb` and `Function` columns, and the Springer
wide-table cells in `marketing-consumer-production-journey` all remain table
blocks (`skipped` for translation), while figure labels and symbolic equations
retain their non-table roles.

Validation: focused Golden/marketing/captionless-grid checks pass **3/3**;
focused prose/figure-label/equation checks pass **3/3**; typecheck, lint and
`git diff --check` pass. The complete cached real-paper baseline now passes
**118/118** in `test-data/real-papers/reports/extraction-baseline-v4.log`
(304s). Vitest emits a non-failing `onTaskUpdate` reporter timeout after this
single-fork long run, but reports no failed assertion.

The refreshed 114-PDF table-reader inventory completed with **0 extraction
errors**: 47 papers contain 366 numbered table captions; 232 captions have
a usable image-crop geometry. It records 2,061 source-level table fragments,
117 of which are crop-backed. The remaining 1,922 are deliberately retained
for precision review: they include genuinely uncaptioned tables, charts, and
appendices, so they must not be globally hidden. This inventory is geometry
triage, not an assertion of visual correctness. Artifact:
`test-data/real-papers/reports/table-reader-readiness-v1.json`.

The unsigned Tauri bundle was rebuilt after this final geometry change at
**2026-10-12 16:35:27 +0900**:
`src-tauri/target/release/bundle/macos/Paper Reader.app`. The next action is
an isolated packaged import/reload confirmation, then a clean re-import of the
Golden PDF for Reader visual confirmation.

# 2026-10-12: narrative prose beside a table follow-up

Visual inspection of OzCHI page 5 established that the `p=0.007` / `H2`
statistical result is a normal right-column paragraph beneath Table 2, not a
table cell. A caption-adjacent matrix signal had incorrectly overridden its
multiple complete sentences because it shared a page with the left-column
table. Strong table promotion now yields to a substantial multi-sentence
narrative block; short matrix cells remain table candidates. A Golden
regression asserts this paragraph remains `pending` for translation and keeps
`p=0.007`.

The wear-scale correlation matrix regression now permits its numbered-caption
region to be represented by a consolidated skipped table target rather than
requiring every native cell to be projected separately. It still verifies that
the table data is retained and never translated. Full pipeline assertions pass
**59/59**, and the cached real-paper baseline passes **118/118** in
`test-data/real-papers/reports/extraction-baseline-v5.log` (281s). As above,
Vitest's long single-fork reporter emits a non-assertion `onTaskUpdate`
timeout after successful tests. Typecheck, lint, and diff validation pass.

The unsigned bundle was rebuilt at **2026-10-12 17:01:15 +0900**:
`src-tauri/target/release/bundle/macos/Paper Reader.app`. The next action is
to re-import the Golden PDF through the packaged app. Existing package/export
folders are historical extraction outputs and must be deleted/re-imported to
reflect this pipeline version.

The refreshed 114-PDF table diagnostic has **0 extraction errors**. It finds
366 numbered captions in 47 papers, with 232 crop-ready regions. Raw
table-like fragments fell from 2,061 to **1,997** and unowned fragments from
1,922 to **1,863** after restoring the OzCHI body paragraph. These counts are
triage indicators, not quality scores: remaining unowned entries include real
captionless tables, charts, and appendices that need separate high-precision
region work.

# 2026-10-12: single-column midpoint and generous-leading repair

A long single-column marketing thesis was falsely classified as two columns:
native spans crossing the page midpoint were excluded from both column bands,
leaving artificial left/right starts. `detectPageColumns` now falls back to a
single column when a majority of wide body rows have midpoint-crossing spans.
Paragraph merging also accepts generous leading only when text continuity,
alignment, and font style all agree. The affected source now reconstructs a
seven-line paragraph, remains `pending` for translation, and no longer becomes
a table fallback. Real-PDF regressions cover this case and retain a genuine
two-column OzCHI page. The full cached corpus passes **118/118** in
`test-data/real-papers/reports/extraction-baseline-v6.log` (324s); the known
Vitest reporter timeout remains non-assertion-only. Rebuild the bundle before
manual package reimport.

# 2026-10-12: incomplete Paper Package publication race

The packaged Tauri acceptance path reproduced a separate Reader failure behind
the visible `コンテンツがありません` state and markdown-export error `Paper Package が
不完全です`: the SQLite paper index was published with its final source hash
before the atomically persisted `paper.json`, `original.md`, `ja.md`, and
`structure.json` package existed. The Reader could select that card during this
window.

Imports now retain their `importing-<uuid>` provisional hash until the complete
Paper Package has been written. The library query hides only those provisional
records, then exposes the card after the final hash is saved. If package
persistence fails, import reports a retryable error rather than creating an
empty Reader card. `sqlitePersistSafety.test.ts` covers the visibility boundary;
the focused test, typecheck, lint, and diff validation pass.

The fast unsigned bundle was rebuilt at **2026-10-12 17:49:10 +0900**:
`src-tauri/target/release/bundle/macos/Paper Reader.app`.

An isolated packaged acceptance run with the large OzCHI PDF no longer reached
the previous immediate incomplete-package error, but it did not complete before
the three-minute test timeout. A follow-up isolated run using the small fixture
was prevented by macOS application-instance behaviour while the normal bundled
app is open. Do not kill the user’s app or its translation server automatically.
After the user fully quits it, rerun `scripts/packaged-e2e/run-integration.sh`
or an equivalent isolated acceptance launch to obtain the complete
import/annotation/export/relaunch marker.

# 2026-10-12: Golden Table 3 reader-visibility regression

Direct native-PDF diagnosis of OzCHI page 6 confirms that the two strings that
previously appeared as unreadable Reader cards — `Finger Thumb Finger1 …` and
`Function Call tapped contact …` — resolve as `table` nodes with `skipped`
translation status. The nearby `p=0.007` result remains a normal `paragraph`
with `pending` translation status. A real-PDF regression now injects the
reader's successful Table 3 image-crop artifact and asserts both raw cell
streams are removed while the caption/image table remains. This proves the
intended reader projection boundary rather than merely testing a synthetic
grid. The new crop-visibility test, statistical-prose regression, SQLite
visibility test, typecheck, lint, and diff validation pass.

The table-fragment ownership rule now covers both publisher conventions:
numbered captions above their table and below their table. It still requires a
same-page, same-column raw table-region fragment with horizontal overlap and a
bounded local vertical distance, so ordinary nearby prose cannot be hidden.
The focused above-caption and real OzCHI Table 3 regressions pass. The fast
unsigned bundle including this change was rebuilt at **2026-10-12 21:14:26
+0900**: `src-tauri/target/release/bundle/macos/Paper Reader.app`.

The refreshed 114-PDF table-reader diagnostic completed with **0 extraction
errors**. It now finds 372 numbered captions, 240 crop-ready captions, and
588 raw table fragments that are locally owned by an image-backed caption and
will therefore be suppressed in the actual import path. The prior inventory
found 115 crop-backed fragments; the increase primarily comes from accepting
caption-above layouts. Unowned raw fragments fell from 1,863 to **1,106**.
These remain a review queue for genuinely uncaptioned tables, charts, and
appendices rather than a signal to hide all table-like content. Artifact:
`test-data/real-papers/reports/table-reader-readiness-v1.json`.

The diagnostic was rerun against the current extraction code on 2026-10-12:
**0 extraction errors / 114 PDFs**, 337 numbered captions, 233 crop-ready
captions, 1,772 raw table-region fragments, 587 crop-backed fragments, and
1,078 remaining unowned fragments. The remaining count is deliberately a
triage queue, not an error count: it mixes captionless data tables with plots,
equations, references, and other high-precision false-positive exclusions.

# 2026-10-13: source-only table reader fallback and package freshness finding

The user-visible `exploring-finger-specific-touch-screen-interacti` export is
an older immutable package: it contains only `table-001.jpg` through
`table-003.jpg`. Current geometry diagnostics find valid crop rectangles for
OzCHI Tables 3, 4, and 5, so it must be re-imported (or explicitly
re-extracted) to receive the newer table image path. Paper Packages currently
have no extraction-pipeline version, which explains why rebuilding the app
alone never rewrites a prior import. The library and workspace three-dot menu
now provides **PDFを再抽出**. It rebuilds the package from stored `source.pdf`
while retaining the paper ID, memberships, annotations, reading position, and
only translations whose normalized source is unchanged. Changed blocks remain
pending rather than inheriting an unrelated translation, and stale table/figure
assets are replaced atomically.

For tables where a raster crop is unavailable, import now persists native PDF
same-baseline cells as `TableMetadata.tableRows`; the Reader renders that data
as rows/cells instead of one concatenated prose string. This is deliberately a
fallback: an image-backed numbered caption still suppresses its local raw cell
fragments, preserving a visual source of truth. The focused metadata test and
re-extraction translation-carry-forward test, typecheck, lint, and real OzCHI
baseline pass. OzCHI Table 4 confirms cells are retained; Table 3
is represented by two independent vertical native columns and is therefore
covered by the crop path rather than falsely claimed as a reconstructed grid.

The packaged acceptance helper no longer overrides `HOME`: it isolates app
data with `PAPER_READER_ACCEPTANCE_HOME` while reusing the local MADLAD cache.
The prior override downloaded a second multi-GB model cache and exhausted the
disk before extraction could be assessed. An isolated large-PDF acceptance
run still did not reach its package marker within its 180-second timeout and
left no package files, so it remains a separate real-Tauri import performance
diagnostic; it is not evidence that the current extraction completed.

The refreshed table-reader diagnostic completed over all **114 locally
available real PDFs** with **0 extraction errors**. It found 345 numbered table
captions; 255 have a geometry-valid crop. Of 1,811 raw table-region fragments,
662 are hidden by the actual Reader rule once their caption crop is present.
After that Reader simulation, 1,151 raw table regions remain; **663** retain
same-baseline cells and will render as the structured source-only grid rather
than a concatenated sentence. The rest is a focused triage queue containing
equations, charts, captions, references, and genuinely ambiguous/one-column
table material; it must not be blanket-classified as a table. Report:
`test-data/real-papers/reports/table-reader-readiness-v1.json`.

The real Tauri packaged import was then run against the Golden OzCHI PDF.
It completed import, export, quit, and relaunch persistence successfully.
The resulting package contains `table-001.jpg` through `table-005.jpg`; all
five Table captions are image-backed and no raw `Finger Thumb Finger1 …`,
`Function Call tapped …`, or `Phonebook / Finger` cell stream remains in its
Reader structure. The `t(36)=-2.84, p=0.007` result remains a paragraph in
`original.md`, rather than a display equation or table. This validates the
current app route, not the old Desktop export.

# 2026-10-13: vector figure-label triage and latest packaged build

The 114-PDF table-reader audit was rerun after adding an image-proximity
evidence rule for short, same-baseline native labels. Labels emitted just above
or over an image (for example `truth GPT GPT_rel ...` and `cut0 cut50 ...` in
the linguistics paper) no longer receive table evidence merely from repeated
numeric columns. The rule is limited to paragraph-shaped blocks with multiple
short native spans and an image geometry match; image-backed table blocks are
not routed through it. The linguistics real-paper baseline passed with explicit
regressions for those labels. Audit result: 0 extraction errors; numeric-grid
triage fell from 123 to **112**, while structured-grid increased from 661 to
**676** as the remaining native rows were classified more accurately. The
audit-only report is `test-data/real-papers/reports/table-reader-readiness-v1.json`.

Typecheck, lint (existing warnings only), diff check, and the focused
linguistics extraction regression pass. A new fast unsigned `.app` was built at
**2026-10-13 11:44:18 +0900**:
`src-tauri/target/release/bundle/macos/Paper Reader.app`.
The real Tauri OzCHI acceptance run passed import, annotation/search/export,
quit, and relaunch persistence using that bundle. A separate linguistics
packaged run reached OCR processing on page 7/8 but exceeded the fixed 180
second acceptance window; this is an OCR/import-duration issue to measure
separately, not a successful extraction result.

# 2026-10-13: mixed-document OCR routing and figure extraction timing

`pagesNeedingOcr` no longer treats a low document-wide text-item average as
proof that every page is scanned. The document-wide fallback now applies only
when every page is independently `scanned` or `garbled`; mixed papers use
page-local classification. This preserves OCR for scanned pages while keeping
native text on readable figure-heavy pages. A regression test covers a native
page plus a scanned page whose average would otherwise trigger both. Page/OCR
focused tests pass (17/17), typecheck and diff check pass.

On the language-model-physics PDF this reduced the OCR set from the whole
document to **8 of 46 pages**. The latest `.app` was rebuilt after this change
and the Golden OzCHI Tauri acceptance still passed. The language-model-physics
acceptance then advanced beyond OCR but remained in figure extraction at
`6/32` captions within the fixed 180-second harness window. This identifies a
separate performance bottleneck in image/vector figure extraction; it is not
evidence that the PDF has no content. The lazy page-render optimization is in
place, but the large vector-heavy case still needs profiling/optimization
before claiming broad packaged-import completion.

The packaged acceptance harness now accepts `PAPER_READER_E2E_TIMEOUT_S` for
large real-paper runs while retaining the 180-second default. With
`caffeinate` and a 600-second timeout, the latest `.app` completed the full
language-model-physics import, annotation/search/export, quit, and relaunch
checks. Marker: `/tmp/paper-reader-acceptance-ling-v4/_acceptance/result.json`
(`ok: true`, export 130260 bytes, Notion ZIP 81127 bytes). Its persisted
structure contains 842 blocks (628 paragraphs, 136 tables, 32 figures), so the
earlier 180-second result was a harness timeout rather than an import failure.
The latest bundle timestamp is **2026-10-13 13:07:00 +0900**.

# 2026-10-13: cross-column caption promotion guard

The 114-PDF audit exposed a reusable false positive in the COVID review: a
right-column statistical explanation was promoted into the left-column Table 2
region because page-wide caption evidence and numeric plot labels overlapped.
The candidate now requires matching column context for nearby table captions,
and the resolver refuses to promote nodes carrying explicit image/vector-label
evidence into a table region. The real-paper regression confirms that
`Prediction of epidemic results of` remains a paragraph.

After the fix, the full audit still has **0 extraction errors** and improved:
raw table fragments **1,736**, Reader raw fragments **1,119**, source-only
cell fallbacks **649**, numeric-grid triage **106**, prose-like **50**, and
ambiguous **113**. This is a reduction from 1,814 / 1,154 / 676 / 112 / 51 /
115 in the previous run. The focused COVID baseline, typecheck, lint (existing
warnings only), and diff check pass. The latest audit artifact remains
`test-data/real-papers/reports/table-reader-readiness-v1.json`.
# 2026-10-13: final table-candidate guard and full corpus verification

The table candidate guard now rejects only long/multi-line caption-adjacent
prose (`wordCount > 24` or more than four native lines). Short table cells
that end in punctuation remain eligible, which preserves marketing table rows
without allowing ordinary long prose to become a table. The temporary
single-item narrative cap was removed after it caused a false negative in the
marketing-consumer-production-journey regression.

The real-paper extraction baseline now uses a 600-second corpus timeout (test
infrastructure only; product behavior is unchanged). The full cached corpus
passed **118/118** tests in 753.92s. The post-change table readiness audit over
114 PDFs completed with `extractionErrors=0`, `tableCaptions=345`,
`cropReadyCaptions=255`, `rawTableFragments=1723`, `cropBackedFragments=610`,
`readerRawFragments=1115`, `readerCellFallbacks=900`, and reader fragment
kinds `structured-grid=900`, `short-label=158`, `prose-like=17`,
`ambiguous=38`, `numeric-grid=2`; these are diagnostics, not claims that all
tables have perfect semantic schemas.

`npm run lint` and `git diff --check` pass (only existing lint warnings). The
latest fast Tauri bundle was built successfully at
`2026-10-13 14:26:36 +0900` at
`src-tauri/target/release/bundle/macos/Paper Reader.app`. The previous isolated
OzCHI packaged acceptance remains green; rerun it after any further source
changes that affect package persistence or reader projection.
# 2026-10-13: parallel table-column reconstruction and captioned-grid rescue

Two generic table failures were repaired without paper-specific terms. First,
some borderless PDFs emit each visual column as an independent multi-line
block; projection now merges adjacent, same-page/same-column blocks only when
their vertical spans, line count, baseline positions, and horizontal gap prove
they are parallel columns. It preserves every cell as `metadata.tableRows`, so
the Reader grid displays one table rather than separate flattened cards.
OzCHI Table 3 now has six rows such as `Finger | Function` and
`Thumb | Call tapped contact`.

Second, a Table caption plus repeated multi-cell native rows was being
overridden by the vector-label guard. The generic layer now produces strong
table evidence only when three compact baselines repeat at least two x-bands
next to an explicit table caption; ordinary nearby prose and uncaptioned figure
labels still retain the safer paragraph/other fallback. This restores the
mixed thesis Table 4.1 relation without linking it to Figure 4.1.

Validation: focused OzCHI and thesis regressions pass; the extraction pipeline
passes **67/67**; typecheck, lint (existing warnings only), and diff checks
pass. The corpus run exercised all **118** tests; the sole initial red case was
the OzCHI assertion for its intentionally changed row-major string and passes
after updating that regression expectation. The fresh 114-PDF table audit has
`extractionErrors=0`, `structured-grid=956`, `short-label=164`,
`prose-like=18`, `ambiguous=38`, and `numeric-grid=2`. The growth in structured
grid rows reflects retaining captioned native grids as source-only tables, not
translation input. The fast `.app` was rebuilt at `2026-10-13 15:34:24 +0900`.
The fresh OzCHI packaged acceptance passed import, annotation/search,
Markdown/Notion export, quit, relaunch, and persistence (`ok=true`,
`searchHits=1`, export 45,498 bytes, Notion package 1,115,780 bytes). The
figure extraction stage took longer than the marker's first update but did
complete; no bundled process remains.
