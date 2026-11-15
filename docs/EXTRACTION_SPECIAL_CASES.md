# 抽出の出版社・誌名別ルール 棚卸し

ROADMAP B1「壊れた PDF ごとに heuristic if を増やさない」の運用文書。

## 方針

- 出版社・誌名・機関名に依存する判定は `src/services/pdfExtraction/formats/`（Format Profile）に置く。generic / resolver / projection / `pdfLayout.ts` には置かない。
- `src/test/policy/publisherSpecialCases.test.ts` が `formats/` 外のコード行（コメント除く）を数え、ファイルごとの基準値を超えたら fail する（ラチェット）。減らしたら同じコミットで基準値を下げる。
- 新しい崩れ方は、まず汎用シグナル（幾何・フォント・繰り返し chrome・位置）で直せないか検討する。どうしても誌名依存なら Format Profile に追加する。

## 現状（2026-11-15 基準値）

| ファイル | 行数 | 主な内容 |
| --- | ---: | --- |
| `resolver/documentResolver.ts` | 26 | Frontiers の masthead / cite-head、BMC・BMJ の構造化 abstract、Nature の early-access / check-for-updates 降格、IEEE ACCESS の見出し誤役割 |
| `projection/toPaper.ts` | 17 | 著者欄に入る誌名・機関名（`Jurnal`、`SENOPATI`、`NSTDA`、consortium / biobank）、出版社 chrome の除外 |
| `pdfLayout.ts` | 11 | BMJ の running chrome、arXiv 識別子行 |
| `resolver/titleResolver.ts` | 7 | 誌名 masthead をタイトル候補から除外 |
| `generic/candidates.ts` | 3 | 出版社 chrome 候補 |
| `types.ts` / `index.ts` | 各 1 | 型・ラベル |

計測対象語: BMJ, PLOS, Frontiers, Elsevier, Springer, IEEE, ACM, Nature, arXiv, bioRxiv, BMC, Jurnal, SENOPATI, NSTDA, Biobank, Consortium, MDPI, Lancet, JAMA, Wiley（語頭一致・大小無視）。

## 移行の順序

1. `projectCanonicalToPaper` の分割（挙動不変）が終わってから着手する。同じファイルを同時に触らない。
2. 単一論文由来のもの（`SENOPATI`、`NSTDA` など）から、汎用シグナルへの置き換えを試す。置き換え前後で characterization（実 PDF の投影出力ハッシュ）と `test:extraction-corpus` を比較する。
3. 出版社 chrome（Frontiers / BMJ / Nature など）は Format Profile へ移す。profile の適用閾値は APPLY_MIN=0.75 / APPLY_MARGIN=0.12 のまま。
4. 移したらラチェットの基準値を下げる。
