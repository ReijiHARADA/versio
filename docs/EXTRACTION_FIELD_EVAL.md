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
- arXiv は所属・メールを採点しない（LaTeX の書式がばらばらで正解として信頼できない）。

## 採点

- タイトル: 正規化後の文字類似度（表の値）。完全一致率も `scores.json` にある。
- 著者・著者↔所属・メール・キャプション・参考文献: F1。キャプションは本文の先頭 200 字で類似度 0.8 以上、参考文献は類似度 0.6 以上か正解の題名を含むときに一致とする。
- 方式が返せなかった項目は 0 点にせず「未実行」として平均から外す。正解側が空の参考文献は採点しない。

## 基準線: 現行抽出（2026-11-16、main `c0c7045` 時点）

| 項目 | 英語 | 日本語 | Europe PMC | arXiv | 手作り |
|---|---|---|---|---|---|
| title | 0.95 (n=97) | 0.20 (n=9) | 0.83 (n=49) | 0.96 (n=45) | 0.79 (n=12) |
| authors | 0.24 (n=86) | 0.48 (n=9) | 0.20 (n=49) | 0.31 (n=45) | 1.00 (n=1) |
| authorAffiliation | 0.16 (n=34) | 0.00 (n=8) | 0.13 (n=42) | - | - |
| emails | 0.85 (n=39) | 0.78 (n=9) | 0.83 (n=48) | - | - |
| captions | 0.72 (n=85) | 0.68 (n=5) | 0.70 (n=44) | 0.76 (n=44) | 0.00 (n=2) |
| references | 0.24 (n=85) | 0.04 (n=6) | 0.29 (n=46) | 0.17 (n=45) | - |

- emails は Versio にメール欄が無いため、先頭 2 ページの canonical テキストを正規表現で拾った参考値。
- 主な失敗の型（ワースト事例を実データで確認済み）:
  - 著者: 複数の著者が 1 つの名前にまとまる（`A, B, C`）。日本語論文で所属が著者として取られる。
  - 日本語タイトル: 和文タイトル・版の注記・英文タイトルが 1 つにつながる。
  - 参考文献: 複数の文献が 1 ブロックに詰まる（230 件中 27 件など）。

## 人手確認（設計 §5.3）

- 2026-11-16: Europe PMC 4・arXiv 4・日本語 2 の計 10 本を Reader で目視し、スコアは実感と合っているとユーザーが確認した。
- 以後、採用判断のたびにワースト 5 件を目視する。
