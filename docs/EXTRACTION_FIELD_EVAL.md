# 抽出の項目別評価（field eval）

設計: [specs/2026-11-15-extraction-quality-design.md](./superpowers/specs/2026-11-15-extraction-quality-design.md) / 計画: [plans/2026-11-15-extraction-field-eval.md](./superpowers/plans/2026-11-15-extraction-field-eval.md)

出版社が公開している構造化データ（JATS / LaTeX）を正解にして、タイトル・著者・著者↔所属・メール・図表キャプション・参考文献を人手判定なしで採点する。
このファイルには集計値と文書 id・ライセンスだけを載せる。本文・キャプション・参考文献の引用は載せない（抜粋は gitignored の `test-data/field-gold/runs/` のみ）。

## 使い方

```bash
npx vite-node --script scripts/fetch-field-gold.ts      # 正解データ取得（CC ライセンス確認済みのみ・robots.txt 遵守）
npm run eval:fields -- --parser versio                   # 採点 → test-data/field-gold/runs/versio/report.md
```

PDF をアプリで確認するときは `open -a Versio.app test-data/field-gold/human-check/*.pdf` で取り込める。

## 正解データ（manifest: `test-fixtures/field-gold/manifest.json`）

- 106 本: Europe PMC 49（医学・生命 25 / 社会・心理 15 / 日本語 9）、arXiv 45（cs.HC 25 / その他 20）、既存の手作り正解 12。
- ライセンス: CC BY 85、CC BY-NC-ND 7、CC BY-SA 1、CC BY-NC-SA 1、既存ローカル資料 12（タイトル等の記載項目のみ採点）。
- 除外: 版の不一致 8、ライセンス不明 1302、取得失敗 15、arXiv の `.bbl` 無し 3。
- 日本語は 9 本（目標 15〜20 に未達）。J-STAGE は robots.txt が PDF の自動取得を禁止しており、CC 表示を確認できた記事も 2 本のみ。日本語の正解は Europe PMC の日本語全文（F1000Research）で、全項目の正解がある。
- arXiv は所属・メールを採点しない（LaTeX の書式がばらばらで正解として信頼できない）。著者欄に機関名・地名・メールが混じる 12 本は著者も採点しない。
- JATS で著者と所属のリンクが無い論文は著者↔所属を採点しない（所属が 1 つだけなら全著者に付ける）。

## 採点

- タイトル: 正規化後の文字類似度（表の値）。完全一致率も `scores.json` にある。
- 著者・著者↔所属・メール・キャプション・参考文献: F1。キャプションは本文の先頭 200 字で類似度 0.8 以上、参考文献は類似度 0.6 以上か正解の題名を含むときに一致とする。
- 方式が返せなかった項目は 0 点にせず「未実行」として平均から外す。正解側が空の参考文献は採点しない。

## 基準線: 現行抽出（2026-11-16、main `c0c7045` 時点）

最新値は下の比較表の `versio` 行（正解データの改善後に再採点した値）。初回の値は英語で title 0.95 / authors 0.24 / references 0.24 だった。

- emails は Versio にメール欄が無いため、先頭 2 ページの canonical テキストを正規表現で拾った参考値。
- 主な失敗の型（ワースト事例を実データで確認済み）:
  - 著者: 複数の著者が 1 つの名前にまとまる（`A, B, C`）。日本語論文で所属が著者として取られる。
  - 日本語タイトル: 和文タイトル・版の注記・英文タイトルが 1 つにつながる。
  - 参考文献: 複数の文献が 1 ブロックに詰まる（230 件中 27 件など）。

## 人手確認（設計 §5.3）

- 2026-11-16: Europe PMC 4・arXiv 4・日本語 2 の計 10 本を Reader で目視し、スコアは実感と合っているとユーザーが確認した。
- 以後、採用判断のたびにワースト 5 件を目視する。

## 比較: 現行（versio）/ GROBID 0.9.1（grobid）/ macOS Vision（apple）（2026-11-16）

同じ 106 本で採点。title は類似度、他は F1。「未実行」はその方式が項目を返せない（平均に含めない）。

| 項目 | 方式 | 英語 | 日本語 | Europe PMC | arXiv |
|---|---|---|---|---|---|
| title | versio | 0.95 (n=97) | 0.20 (n=9) | 0.83 (n=49) | 0.96 (n=45) |
| title | grobid | 0.95 (n=97) | 0.01 (n=9) | 0.80 (n=49) | 0.96 (n=45) |
| title | apple | 0.14 (n=97) | 0.01 (n=9) | 0.09 (n=49) | 0.11 (n=45) |
| authors | versio | 0.24 (n=74) | 0.48 (n=9) | 0.20 (n=49) | 0.34 (n=33) |
| authors | grobid | 0.85 (n=74) | 0.52 (n=9) | 0.81 (n=49) | 0.81 (n=33) |
| authors | apple | 未実行 | 未実行 | 未実行 | 未実行 |
| authorAffiliation | versio | 0.05 (n=28) | 0.00 (n=9) | 0.04 (n=37) | - |
| authorAffiliation | grobid | 0.75 (n=28) | 0.30 (n=9) | 0.64 (n=37) | - |
| authorAffiliation | apple | 未実行 | 未実行 | 未実行 | - |
| emails | versio | 0.85 (n=39) | 0.78 (n=9) | 0.83 (n=48) | - |
| emails | grobid | 0.53 (n=40) | 0.82 (n=9) | 0.58 (n=49) | - |
| emails | apple | 未実行 | 未実行 | 未実行 | - |
| captions | versio | 0.72 (n=85) | 0.68 (n=5) | 0.70 (n=44) | 0.76 (n=44) |
| captions | grobid | 0.61 (n=85) | 0.00 (n=9) | 0.45 (n=48) | 0.68 (n=44) |
| captions | apple | 0.68 (n=85) | 0.66 (n=5) | 0.68 (n=44) | 0.70 (n=44) |
| references | versio | 0.24 (n=85) | 0.04 (n=6) | 0.29 (n=46) | 0.17 (n=45) |
| references | grobid | 0.95 (n=85) | 0.37 (n=6) | 0.89 (n=46) | 0.95 (n=45) |
| references | apple | 0.40 (n=85) | 0.07 (n=6) | 0.39 (n=46) | 0.37 (n=45) |

- apple は Vision の `RecognizeDocumentsRequest` のみ。Foundation Models（OS 内蔵 LLM）は、開発機の macOS 26.0 のシステムフレームワークに現行 SDK が出力するシンボル（`respond(to:)` など）が無く、読み込み時に落ちるため使えなかった。そのため著者・所属・メールは未実行。
- GROBID は `127.0.0.1` のみで起動し、外部照会（consolidation）を切って実行した。

### 勝者提案（主指標: title=完全一致、他=F1。両方式が採点できた同じ論文での差の平均。差 0.05 未満は現行のまま）

| 項目 | 英語 | 日本語 |
|---|---|---|
| title | 現行（GROBID は −0.05） | 現行（どの方式も同等に低い） |
| authors | **GROBID（+0.61、74 本）** | 現行（GROBID +0.04 で閾値未満） |
| authorAffiliation | **GROBID（+0.70、28 本）** | GROBID（+0.30、9 本）※ |
| emails | 現行の正規表現（GROBID は −0.30） | 現行（GROBID +0.04 で閾値未満） |
| captions | 現行（apple −0.04、GROBID は更に低い） | 現行 |
| references | **GROBID（+0.71、85 本）** | GROBID（+0.33、6 本）※ |

※ 日本語は本数が少ない（6〜9 本）。GROBID は日本語のタイトル（0.01）と著者分割が弱く、所属・参考文献の改善も小標本の値。日本語へ採用するなら追加の日本語正解で確かめてからにする。

### 目視（設計 §5.3、勝者が変わる項目のワースト 5）

- GROBID authors: 0 点は、著者を 1 人しか取れない（多著者の医学論文）、引用符付きの愛称（`Jiaying "Lizzy" Liu`）の分割崩れ、著者欄が空のケース。指標ずれではなく実際の失敗。
- GROBID authorAffiliation: 初回は正解側に ROR ID が混入、JATS にリンクが無い論文で正解が空、という正解側の問題があり修正した。修正後の 0 点は GROBID が査読者名などを著者に取ったケース。
- GROBID references: 0 点は日本語論文（参考文献を 1 件も取れない）と、44 件中 6 件など大幅な取りこぼし。英語では 0.95 で、実感とも合う。

### 速度・メモリ・配布サイズ

| 方式 | 中央値 秒/本 | 平均 秒/本 | 備考 |
|---|---|---|---|
| versio | 0.8 | 2.3 | 現行 |
| grobid | 1.8 | 1.9 | 全文処理。GROBID プロセスの最大 RSS 約 2.8 GB |
| apple | 9.6 | 10.8 | 全ページを 2 倍でラスタライズして Vision |

- GROBID を同梱する場合の増分（概算）: grobid-home 719 MB（うちモデル 470 MB）、Java 21 ランタイム 330 MB（jlink で縮小可）、サーバ依存ライブラリ。未圧縮で 0.5〜1 GB 規模。CRF のみに絞る・不要な pdfalto バイナリを外すなどの縮小は段階 3 で設計する。

### 段階 3 への推奨

1. 英語の **著者・著者↔所属・参考文献** に GROBID を採用する（Evidence として CanonicalDocument に入れ、Resolver が採否を決める。GROBID が使えない環境では現行ルールにフォールバック）。
2. **タイトル・メール・キャプション** は現行を維持する。
3. 日本語は、著者は現行を維持。所属・参考文献の GROBID 採用は、日本語正解を増やして確かめてから決める。
4. 同梱方式（常駐サイドカー、初回ダウンロード、オプトインなど）は RAM 2.8 GB・数百 MB の配布増を踏まえて段階 3 で設計する。

## CRF port（GROBID 0.9.1、評価専用、2026-11-16）

| parser | references en F1 (85) | references ja F1 (6) | median 秒/本 |
|---|---:|---:|---:|
| versio | 0.243 | 0.042 | 0.8 |
| grobid | 0.954 | 0.367 | 1.8 |
| crfport | 0.417 | unavailable | 0.8 |

- gzip assets: citation model 274.9 KiB、reference-segmenter model 18.6 KiB、lexicons 4.62 MiB、合計 4.80 MiB。
- `location` (4.02 MiB gzip / 620,618 entries) is dropped at inference: expanding it to a JavaScript `Set` exceeded the runtime-memory budget; no measured F1 improvement is retained in this evaluation configuration.
- Citation/reference-segmenter REST parity could not be measured as token labels: GROBID's public REST endpoints return TEI, not the CRF token-label stream, and field-gold lacks the PDFALTO layout-token input required by the segmenter. The current port therefore does not meet the ≥95% token-label parity or ≥0.85 English-reference F1 target; the main cause is reference boundaries coalesced by the existing PDF projection, compounded by incomplete feature/layout parity.
