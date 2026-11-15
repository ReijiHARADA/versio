# 抽出の細部項目評価と方式比較 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 出版社・著者が作った構造化データを正解として、タイトル・著者・所属・メール・キャプション・参考文献を自動採点する基盤を作り、現行（A）/ GROBID（B）/ macOS 標準（C）を同じ約 100 本で比較して、項目別の勝者を提案するレポートを出す。

**Architecture:** 正解（FieldGold）と各方式の出力（FieldPrediction）を同じ `FieldRecord` 型に揃え、純粋関数の採点器で比べる。取得・実行はローカルスクリプト、論文データは gitignored の `test-data/field-gold/`、コミットするのは manifest とレポートだけ。設計書の段階 1（Task 1–6）と段階 2（Task 7–9）が範囲で、段階 3（本番統合）は Task 9 の結果をユーザーが確認してから別計画にする。

**Tech Stack:** TypeScript（vite-node スクリプト、Vitest）、pdfjs-dist 3.11（既存 `extractPdfPages`）、GROBID（ローカル JVM）、Swift CLI（Vision / FoundationModels）

**Spec:** `docs/superpowers/specs/2026-11-15-extraction-quality-design.md`

## Global Constraints

- 有料 API・課金が必要な要素を使わない。論文 PDF を外部サービスへ送らない（GROBID は `127.0.0.1` のみ。既存 `grobidBaseUrl()` のクラウド URL 拒否を維持）。
- 正解データの取得元は Europe PMC（`isOpenAccess=Y` + CC ライセンス）、arXiv、J-STAGE の無料公開データのみ。
- 外部取得の User-Agent は汎用名 `VersioCorpusFetcher/1.0`。個人名・メールを入れない。arXiv へは 3 秒に 1 リクエスト以下。
- PDF・XML・LaTeX ソースはコミットしない（`test-data/field-gold/` を gitignore）。コミットするのは `test-fixtures/field-gold/manifest.json`、スクリプト、レポート Markdown。
- **権利（ユーザー指示）**: ライセンスが CC 系（CC BY / BY-SA / BY-NC / BY-NC-SA / BY-ND / CC0）と確認できた論文だけを取得・保存する。確認できないものは取得しない（Europe PMC は `license` 欄、arXiv は OAI-PMH `metadataPrefix=arXiv` の `<license>`、J-STAGE は記事のライセンス表示）。manifest に文書ごとの `license` と取得元 URL を記録。用途はローカル評価のみで、再配布しない。
- コミットするレポート（`docs/EXTRACTION_FIELD_EVAL.md`）には集計値と文書 id・ライセンスのみ載せ、本文・キャプション・参考文献の引用は載せない。ワースト事例の抜粋（各 120 文字以内）は gitignored の `test-data/field-gold/runs/` にだけ出す。
- 本番抽出コード（`src/services/pdfExtraction/**`）の挙動は変えない。この計画で触るのは評価コード・スクリプト・GROBID TEI パーサの追加関数だけ。
- 取得元ごとに `trustedFields` にある項目だけを採点する。arXiv は `affiliations` / `authorAffiliation` / `emails` を採点しない。
- JATS と PDF の対は、正規化後タイトル一致かつ第一著者一致のときだけ採用し、除外数を manifest に記録する。
- 日本語ゴールドは 15〜20 本。勝者提案では「英語で勝っても日本語で現行より悪化する項目には採用しない」。
- 文書更新は AGENTS.md の規則に従う（現状値は CURRENT_STATE.md、詳細は専門文書。README / ROADMAP は触らない）。

## Review Focus

1. 日本語の著者名（姓名間スペースの有無、全角）が英語と同じ正規化で比較され、正しいのに不一致になる → 日本語名はスペース除去・NFKC で一致する（Task 1 のテスト）。
2. 著者名の脚注記号・上付き数字（`Smith*†1`）が残って不一致になる → 記号除去後に一致する（Task 1）。
3. JATS の所属が `<label>` 付き・`<institution>` 分割・国名が別要素で入る → 所属文字列に label を含めず、要素を連結する（Task 2）。
4. ある方式がその項目を何も返さない（GROBID 停止、FM 不可）→ スコア 0 ではなく「未実行」として集計から外し、レポートに明記（Task 6 / Task 9）。
5. 参考文献が 0 件の論文や、キャプションの無い論文 → 0 除算せず、正解 0 件・予測 0 件は「該当なし」として除外（Task 1）。

---

### Task 1: 共通型・正規化・採点器

**Files:**
- Create: `src/evaluation/fieldGold/types.ts`, `src/evaluation/fieldGold/normalize.ts`, `src/evaluation/fieldGold/score.ts`
- Test: `src/test/evaluation/fieldGoldScore.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type FieldName = "title" | "authors" | "authorAffiliation" | "emails" | "captions" | "references";
  export type FieldRecord = {
    title: string | null;
    authors: Array<{ name: string; affiliationKeys: string[] }>;
    affiliations: Array<{ key: string; text: string }>;
    emails: string[];
    captions: Array<{ kind: "figure" | "table"; label: string | null; text: string }>;
    references: Array<{ raw: string; title?: string; year?: string; doi?: string }>;
  };
  export type GoldSource = "europepmc" | "arxiv" | "jstage" | "manual";
  export type FieldGold = { id: string; source: GoldSource; language: "en" | "ja"; discipline: string;
    pdfPath: string; pdfSha256: string; trustedFields: FieldName[]; fields: FieldRecord };
  export type ParserId = "versio" | "grobid" | "apple";
  export type FieldPrediction = { id: string; parser: ParserId; parserVersion: string; elapsedMs: number;
    unavailableFields: FieldName[]; fields: FieldRecord };
  export type PRF = { precision: number; recall: number; f1: number; gold: number; predicted: number };
  export type FieldScores = {
    title?: { exact: 0 | 1; similarity: number };
    authors?: PRF; authorAffiliation?: PRF; emails?: PRF;
    captions?: PRF & { labelAccuracy: number };
    references?: PRF & { countRatio: number; titleAccuracy: number; yearAccuracy: number; doiAccuracy: number };
  };
  // normalize.ts
  export function normalizeText(s: string): string;      // NFKC, 小文字, ハイフン改行結合, 空白圧縮, 前後の句読点除去
  export function normalizeName(s: string, language: "en" | "ja"): string;
  export function similarity(a: string, b: string): number; // 1 - levenshtein / max(len), normalizeText 後
  // score.ts
  export function scoreFields(gold: FieldGold, pred: FieldPrediction): FieldScores;
  ```

閾値（Claude の判断、設計書 §6 で委任済み）: キャプション一致は先頭 200 文字の `similarity ≥ 0.8`、参考文献の対応付けは `raw` または `title` の `similarity ≥ 0.6` で貪欲マッチ、参考文献 title 正解は `≥ 0.9`、所属一致は正規化トークンの Jaccard `≥ 0.5`。

- [ ] **Step 1: Write the failing tests** — `fieldGoldScore.test.ts`:
  - `normalizeName("Smith*†1", "en") === normalizeName("smith", "en")`
  - `normalizeName("山田 太郎", "ja") === normalizeName("山田太郎", "ja")`
  - `normalizeName("José Müller", "en") === normalizeName("Jose Muller", "en")`
  - `normalizeText("deep learn-\ning") === "deep learning"`
  - title: 完全一致で `{ exact: 1, similarity: 1 }`、1 文字違いで `exact: 0` かつ `similarity > 0.9`
  - authors: 正解 3 名・予測 2 名（うち 2 名一致）で `precision 1, recall 0.667`（toBeCloseTo 3 桁）
  - authorAffiliation: 著者は一致・所属が入れ替わった予測で `f1 === 0`
  - captions: 本文一致だがラベル `Figure 2` / 正解 `Figure 3` で `f1 1, labelAccuracy 0`
  - references: 正解 0 件・予測 0 件で `scores.references === undefined`
  - `trustedFields` に `emails` が無い gold では `scores.emails === undefined`
  - `pred.unavailableFields` に `references` があれば `scores.references === undefined`
- [ ] **Step 2: Run** `npx vitest run src/test/evaluation/fieldGoldScore.test.ts` — Expected: FAIL（モジュール無し）
- [ ] **Step 3: Implement** 3 ファイル。著者の正規化キーは `en` では「姓 + 名の頭文字」、`ja` ではスペース除去後の全体。PRF の対応付けは正規化キーの多重集合一致。
- [ ] **Step 4: Run** 同コマンド — Expected: PASS
- [ ] **Step 5: Commit** `feat(eval): field-level gold types and scorer`

### Task 2: JATS（Europe PMC）パーサ

**Files:**
- Create: `src/evaluation/fieldGold/jats.ts`
- Test: `src/test/evaluation/fieldGoldJats.test.ts`（テスト内に最小 JATS 文字列を直書き）

**Interfaces:**
- Consumes: `FieldRecord`（Task 1）
- Produces: `export function parseJatsFields(xml: string): FieldRecord` — `DOMParser`（jsdom、既存テスト環境）で解析。

- [ ] **Step 1: Write the failing tests**:
  - `<article-title>` 内の `<italic>` を含むタイトルがテキスト連結される
  - `<contrib contrib-type="author"><name><surname>Smith</surname><given-names>Jane</given-names></name><xref ref-type="aff" rid="aff1"/></contrib>` → `{ name: "Jane Smith", affiliationKeys: ["aff1"] }`
  - `<aff id="aff1"><label>1</label><institution>Univ A</institution>, <country>Japan</country></aff>` → `{ key: "aff1", text: "Univ A, Japan" }`（label を含まない）
  - `<corresp>` 内と `<email>` の両方からメールを重複なく収集
  - `<fig><label>Figure 1</label><caption><p>Text</p></caption></fig>` → `{ kind: "figure", label: "Figure 1", text: "Text" }`、`table-wrap` は `kind: "table"`
  - `<ref>` の `<mixed-citation>` / `<element-citation>` から `raw` / `title`（`article-title`）/ `year` / `doi`（`pub-id pub-id-type="doi"`）
  - `<sub-article>` / `<back><app>` 内の fig は含めない
- [ ] **Step 2: Run** `npx vitest run src/test/evaluation/fieldGoldJats.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** `parseJatsFields`
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** `feat(eval): JATS field gold parser`

### Task 3: arXiv LaTeX パーサ

**Files:**
- Create: `src/evaluation/fieldGold/latex.ts`
- Test: `src/test/evaluation/fieldGoldLatex.test.ts`

**Interfaces:**
- Produces: `export function parseLatexFields(input: { mainTex: string; bbl: string | null }): FieldRecord` — `affiliations` は常に `[]`、`emails` は `[]`（arXiv の trustedFields は `title, authors, captions, references`）。

- [ ] **Step 1: Write the failing tests**:
  - `\title[short]{Long \emph{Title}}` → `"Long Title"`（optional 引数・書式命令を除去、`\\` は空白）
  - ACM 形式 `\author{A}` が複数回 / 一般形式 `\author{A \and B}` の両方で著者 2 名
  - `\author{A\thanks{x}}` の `\thanks` を除去
  - `\begin{figure}...\caption{Cap}\label{fig:x}` → `{ kind: "figure", label: null, text: "Cap" }`、`table` 環境は `kind: "table"`、`figure*` も対象
  - `.bbl` の `\bibitem` 単位で参考文献を分割、`\newblock` を空白に、`raw` に入る
  - `%` コメント行と `\iffalse...\fi` を除去
- [ ] **Step 2: Run** `npx vitest run src/test/evaluation/fieldGoldLatex.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement**（`\input{}` / `\include{}` の展開は Task 5 の取得側で済ませ、この関数は展開済みテキストを受ける）
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** `feat(eval): arXiv LaTeX field gold parser`

### Task 4: J-STAGE パーサ

**Files:**
- Create: `src/evaluation/fieldGold/jstage.ts`
- Test: `src/test/evaluation/fieldGoldJstage.test.ts`

**Interfaces:**
- Produces: `export function parseJstageFields(input: { searchApiXml: string; fullTextJats: string | null }): { fields: FieldRecord; trustedFields: FieldName[] }` — WebAPI の書誌（日本語タイトル・著者・所属）を使い、全文 JATS があれば `parseJatsFields`（Task 2）で captions / references を補い trustedFields に加える。

- [ ] **Step 1: Write the failing tests**:
  - WebAPI 応答（Atom、`article_title/ja`, `author/ja/name`）から日本語タイトルと著者を取る
  - 全文 JATS 無し → `trustedFields` は `["title", "authors"]`（所属が WebAPI に無い誌では含めない）
  - 全文 JATS 有り → `captions`, `references`, `authorAffiliation` が加わる
- [ ] **Step 2: Run** `npx vitest run src/test/evaluation/fieldGoldJstage.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement**（WebAPI のフィールド名は実応答 1 件を取得して確認し、テストの固定文字列をそれに合わせる）
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** `feat(eval): J-STAGE field gold parser`

### Task 5: 正解データ取得と層化サンプル

**Files:**
- Create: `scripts/fetch-field-gold.mjs`, `src/evaluation/fieldGold/sample.ts`, `test-fixtures/field-gold/manifest.json`（生成物、コミット）
- Modify: `.gitignore`（`test-data/field-gold/` を追加）
- Test: `src/test/evaluation/fieldGoldSample.test.ts`

**Interfaces:**
- Consumes: Task 2–4 のパーサ、Task 1 の `normalizeText` / `normalizeName`
- Produces:
  - `export function acceptPair(gold: FieldRecord, pdfFirstPageText: string, language: "en" | "ja"): boolean` — 正規化タイトルが PDF 先頭 2 ページのテキストに含まれ、かつ第一著者の正規化キーも含まれる
  - `export function stratifiedSample<T extends { source: GoldSource; discipline: string; language: "en" | "ja" }>(items: T[], quota: Record<string, number>, seed: number): T[]`
  - ディスク配置: `test-data/field-gold/<id>/{source.pdf, gold.json}`（gold.json は `FieldGold`）
  - manifest: `{ schemaVersion: 1, createdAt, quotas, excluded: { versionMismatch: number, noLicense: number, fetchFailed: number }, documents: Array<{ id, source, language, discipline, pdfSha256, license, sourceUrl }> }`

クォータ（Claude の判断）: Europe PMC 40（医学・生命 25 / 社会・心理 15）、arXiv 45（cs.HC 25 / その他 cs・stat・physics 20）、J-STAGE 18（日本語）＝計 103。乱数 seed 固定 `20261115`。

- [ ] **Step 1: Write the failing tests** — `acceptPair` が「タイトル一致・著者不一致」で false、「両方一致（PDF 側ハイフン改行あり）」で true。`stratifiedSample` が同 seed で同じ結果、クォータ超過分を返さない、該当不足のクォータは取れる分だけ返す。
- [ ] **Step 2: Run** `npx vitest run src/test/evaluation/fieldGoldSample.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** `sample.ts`
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Implement `scripts/fetch-field-gold.mjs`** — 取得元別の候補探索（Europe PMC REST search で `OPEN_ACCESS:Y AND HAS_FT:Y`、PDF と `/{PMCID}/fullTextXML`／arXiv API の category 検索、`/e-print/{id}` の tar.gz を展開し `\input` 展開済み main tex と `.bbl` を得る、`.bbl` 無しは除外／J-STAGE WebAPI で無料公開記事）→ PDF 先頭 2 ページを既存 `src/test/readingOrder/extractPdf.ts` 相当で読み `acceptPair` → 合格分から `stratifiedSample` → 配置と manifest 書き出し。`--dry-run` で件数だけ表示。
- [ ] **Step 5b: 既存の手作り正解 15 本を取り込む** — `sample.ts` に `export function goldFromManual(gt: PartialGroundTruth, pdfPath: string, pdfSha256: string): FieldGold`（`source: "manual"`、記載済み項目だけを `trustedFields` に。`completeAnnotations` に関係なく title のみの場合は `["title"]`）。PDF は既存の gitignored `test-data/real-papers/` を参照し、無ければスキップ。テスト: title だけの gt で `trustedFields` が `["title"]`。
- [ ] **Step 6: Run** `node scripts/fetch-field-gold.mjs` — Expected: 末尾に `documents: 95+`、取得元別内訳、除外内訳が出る。日本語 15 件以上。不足なら quota を変えず不足として manifest に残し、ユーザーに報告する。
- [ ] **Step 7: Commit** `.gitignore`、スクリプト、`sample.ts`、テスト、manifest — `feat(eval): fetch stratified field gold corpus`

### Task 6: 現行抽出（A）のアダプタ・評価実行・レポートと人手確認

**Files:**
- Create: `src/evaluation/fieldGold/adapters/versio.ts`, `src/evaluation/fieldGold/report.ts`, `scripts/run-field-eval.ts`
- Modify: `package.json`（`"eval:fields": "vite-node --script scripts/run-field-eval.ts"`）
- Test: `src/test/evaluation/fieldGoldReport.test.ts`, `src/test/evaluation/fieldGoldVersioAdapter.test.ts`

**Interfaces:**
- Consumes: `extractFromPages`（`src/services/pdfExtraction/pipeline/extractAcademicPdf.ts`）の戻り値 `{ paper, blocks, canonical }`、Task 1 の型
- Produces:
  - `export function predictionFromVersio(result: ReturnType<typeof extractFromPages>, elapsedMs: number): FieldPrediction` — `paper.titleOriginal`、`paper.authorsStructured`（無ければ `paper.authors`）、`paper.affiliations`、`type === "reference"` のブロック、figure/table ブロックの `captionOriginal` と `figureNumber` / `tableNumber`。メールは 1 ページ目の canonical node テキストから正規表現で収集（Paper にメール欄が無いため）。
  - `export function buildReport(input: { golds: FieldGold[]; predictions: FieldPrediction[] }): { markdown: string; json: ReportJson }` — 項目 × 方式 × 取得元 × 言語 の平均表、各項目のワースト 5 件（id、正解、予測の抜粋）、未実行件数。
  - CLI: `npm run eval:fields -- --parser versio [--ids a,b] [--out test-data/field-gold/runs/<parser>]` → `predictions/*.json`, `scores.json`, `report.md`

- [ ] **Step 1: Write the failing tests** — adapter: 合成 `extractFromPages` 結果（既存 `src/test/pdfExtraction` の合成ページヘルパで作るか最小オブジェクト）からタイトル・著者所属・キャプションラベルが写る。report: 2 文書・2 方式の入力で表に両方式が並び、`unavailableFields` は平均に入らず「未実行 n」と出る、ワーストは f1 昇順。
- [ ] **Step 2: Run** `npx vitest run src/test/evaluation/fieldGoldReport.test.ts src/test/evaluation/fieldGoldVersioAdapter.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** adapter、report、CLI
- [ ] **Step 4: Run** 同コマンド — Expected: PASS
- [ ] **Step 5: Run** `npm run eval:fields -- --parser versio` — Expected: `report.md` が生成され、全 manifest 文書が採点済み（失敗件数は表示）
- [ ] **Step 6: 人手確認（ユーザー）** — Europe PMC 4・arXiv 4・J-STAGE 2 の計 10 本について、`report.md` の各項目スコアとワースト事例を Versio Reader の実表示と並べ、ユーザーに「実感と合っているか」を聞く。ずれがあれば閾値・正規化を直して Step 5 をやり直す（この確認が済むまで Task 7 以降に進まない）。
- [ ] **Step 7: Commit** — `feat(eval): versio field adapter, report, baseline run`。基準線の要約を `docs/EXTRACTION_FIELD_EVAL.md`（新規）に記録。

### Task 7: GROBID（B）

**Files:**
- Create: `scripts/grobid-local.sh`, `src/evaluation/fieldGold/adapters/grobid.ts`
- Modify: `src/services/pdfExtraction/grobid/tei.ts`（`parseGrobidFulltextTei` を追加。既存 `parseGrobidHeaderTei` は不変）、`src/services/pdfExtraction/grobid/client.ts`（`processFulltextDocument` を追加、`grobidBaseUrl()` のローカル限定を流用）、`scripts/run-field-eval.ts`（`--parser grobid`）
- Test: `src/test/evaluation/fieldGoldGrobidAdapter.test.ts`

**Interfaces:**
- Produces:
  - `export function parseGrobidFulltextTei(xml: string): FieldRecord`（tei.ts）— `teiHeader` の title/author/affiliation/email、`<figure>` / `<figure type="table">` の `head`・`label`・`figDesc`、`listBibl/biblStruct` の title・`date@when` 年・`idno type="DOI"`
  - `export async function processFulltextDocument(pdf: Blob, opts?: { signal?: AbortSignal }): Promise<string>`（client.ts、`consolidateHeader=0`, `consolidateCitations=0` で外部照会させない）
  - `scripts/grobid-local.sh start|stop|status` — `brew install openjdk@17`（未導入時のみ案内して終了）、GROBID 最新安定版のリリースを `~/.cache/versio-grobid/` に置き `./gradlew run` 相当で `127.0.0.1:8070` 起動。CRF モデル（DL なし）。

- [ ] **Step 1: Write the failing test** — 最小 TEI 文字列で著者 2 名・所属 1・メール 1・figure 1・table 1・biblStruct 2 が `FieldRecord` に写る。`persName` の `forename`+`surname` 連結、`affiliation@key` を affiliationKeys に。
- [ ] **Step 2: Run** `npx vitest run src/test/evaluation/fieldGoldGrobidAdapter.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** パーサ・client 追加・adapter・CLI 分岐（GROBID 不達なら全項目 `unavailableFields`）
- [ ] **Step 4: Run** 同テスト — Expected: PASS
- [ ] **Step 5: Run** `scripts/grobid-local.sh start && GROBID_URL=http://127.0.0.1:8070 npm run eval:fields -- --parser grobid` — Expected: 全文書の予測と report。1 本あたり秒数と GROBID プロセスの最大 RSS（`ps -o rss`）を report に記録。
- [ ] **Step 6: Commit** `feat(eval): GROBID fulltext adapter and local runner`

### Task 8: macOS 標準（C）

**Files:**
- Create: `tools/doc-structure-probe/Package.swift`, `tools/doc-structure-probe/Sources/main.swift`, `src/evaluation/fieldGold/adapters/apple.ts`
- Modify: `scripts/run-field-eval.ts`（`--parser apple`）、`.gitignore`（`tools/doc-structure-probe/.build/`）
- Test: `src/test/evaluation/fieldGoldAppleAdapter.test.ts`

**Interfaces:**
- Produces:
  - CLI `doc-structure-probe <pdf> [--pages 1-2] [--no-llm]` → stdout JSON `{ fmAvailable: boolean, pages: [{ page, paragraphs: [{ text, bbox }], tables: [...], lists: [...] }], fields: FieldRecord | null }`。PDF を 2x でラスタライズし Vision `RecognizeDocumentsRequest`。`fmAvailable` は `SystemLanguageModel.default.availability == .available`。可能なら 1–2 ページ目の段落テキスト（位置付き）を FoundationModels の `@Generable` 構造体（FieldRecord と同形）で振り分け、全ページの段落からキャプション（`Figure|Fig.|Table|図|表` で始まる段落）と参考文献節を抽出。
  - `export function predictionFromApple(json: ProbeOutput, elapsedMs: number): FieldPrediction` — `fmAvailable === false` なら `title/authors/authorAffiliation/emails` を `unavailableFields` に入れる
- [ ] **Step 1: 可用性確認** — `swift build -c release` 後、任意の PDF 1 本で `fmAvailable` を確認し、結果をユーザーに一行報告（不可なら C は Vision のみで続行）
- [ ] **Step 2: Write the failing test** — 合成 ProbeOutput（fmAvailable true / false の 2 通り）から `FieldPrediction` が作られ、false のとき `unavailableFields` に 4 項目
- [ ] **Step 3: Run** `npx vitest run src/test/evaluation/fieldGoldAppleAdapter.test.ts` — Expected: FAIL
- [ ] **Step 4: Implement** Swift CLI と adapter、CLI 分岐
- [ ] **Step 5: Run** テスト — Expected: PASS。続けて `npm run eval:fields -- --parser apple` — Expected: 全文書の予測と report、1 本あたり秒数を記録
- [ ] **Step 6: Commit** `feat(eval): macOS Vision/FoundationModels probe adapter`

### Task 9: 比較レポートと勝者提案

**Files:**
- Create: `src/evaluation/fieldGold/winners.ts`
- Modify: `scripts/run-field-eval.ts`（`--compare versio,grobid,apple`）、`docs/EXTRACTION_FIELD_EVAL.md`、`CURRENT_STATE.md`（「品質の現状値」に項目別基準線と比較結果への 1 行リンク）
- Test: `src/test/evaluation/fieldGoldWinners.test.ts`

**Interfaces:**
- Produces: `export function proposeWinners(report: ReportJson, opts: { minMargin: number }): Array<{ field: FieldName; language: "en" | "ja"; winner: ParserId; margin: number; reason: string }>` — 言語ごとに主指標（title: exact、captions/references/authors/authorAffiliation/emails: f1）の平均が最大の方式。現行（versio）との差が `minMargin`（既定 0.05）未満なら `winner: "versio"`。英語で勝った方式が日本語で versio を下回る場合、日本語の勝者は versio（またはより良い方式）にし、reason に明記。

- [ ] **Step 1: Write the failing tests** — (a) grobid が en で +0.2・ja で −0.1 → en は grobid、ja は versio。(b) 差 0.03 → versio。(c) apple が全件 unavailable の項目では候補にならない。
- [ ] **Step 2: Run** `npx vitest run src/test/evaluation/fieldGoldWinners.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** `winners.ts` と `--compare`
- [ ] **Step 4: Run** テスト — Expected: PASS。続けて `npm run eval:fields -- --compare versio,grobid,apple` — Expected: 比較表と勝者提案
- [ ] **Step 5: 目視** — 勝者が変わる各項目について、ワースト 5 件を Reader 表示または出力 JSON で確認し、指標ずれの兆候を `docs/EXTRACTION_FIELD_EVAL.md` に記録
- [ ] **Step 6: Write** `docs/EXTRACTION_FIELD_EVAL.md` に比較表（項目 × 方式 × 取得元 × 言語）、勝者提案、速度・RAM・配布サイズ増の見積り、段階 3 への推奨。`CURRENT_STATE.md` に 1 行。
- [ ] **Step 7: Run** `npx tsc --noEmit -p . 2>&1 | tail -3` と `npx vitest run src/test/evaluation 2>&1 | tail -5` — Expected: エラー 0、全 pass
- [ ] **Step 8: Commit** `docs(eval): field-level extractor comparison and winner proposal` → ユーザーに勝者提案を提示し、段階 3 の計画に進むか確認
