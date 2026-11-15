# 抽出の出版社・誌名別ルール 棚卸し

ROADMAP B1「壊れた PDF ごとに heuristic if を増やさない」の運用文書。

## 方針

- 出版社・誌名・機関名に依存する判定は `src/services/pdfExtraction/formats/`（Format Profile）に置く。generic / resolver / projection / `pdfLayout.ts` には置かない。
- `src/test/policy/publisherSpecialCases.test.ts` が `formats/` 外のコード行（コメント除く）を数え、ファイルごとの基準値を超えたら fail する（ラチェット）。減らしたら同じコミットで基準値を下げる。
- 新しい崩れ方は、まず汎用シグナル（幾何・フォント・繰り返し chrome・位置）で直せないか検討する。どうしても誌名依存なら Format Profile に追加する。

## 現状（2026-11-15 基準値）

| ファイル | 行数 | 主な内容 |
| --- | ---: | --- |
| `resolver/documentResolver.ts` | 14 | 呼び出しのみ。出版社・誌名別 predicate は `formats/publisherChrome.ts` に移動済み（無条件適用） |
| `projection/toPaper.ts` | 17 | 著者欄に入る誌名・機関名（`Jurnal`、`SENOPATI`、`NSTDA`、consortium / biobank）、出版社 chrome の除外 |
| `pdfLayout.ts` | 10 | 呼び出しのみ。running chrome / preprint 識別子の predicate は移動済み（無条件適用） |
| `resolver/titleResolver.ts` | 2 | 呼び出しのみ。誌名 masthead の predicate は移動済み（無条件適用） |
| `generic/candidates.ts` | 0 | 出版社 chrome predicate は移動済み（無条件適用） |
| `types.ts` / `index.ts` | 各 1 | 型・ラベル |

計測対象語: BMJ, PLOS, Frontiers, Elsevier, Springer, IEEE, ACM, Nature, arXiv, bioRxiv, BMC, Jurnal, SENOPATI, NSTDA, Biobank, Consortium, MDPI, Lancet, JAMA, Wiley（語頭一致・大小無視）。

## 移行の順序

1. 出版社 chrome predicate は `formats/publisherChrome.ts` へ移動済みで、Format Profile の検出スコアには gate されず無条件に適用する。
2. 次は単一論文由来のもの（`SENOPATI`、`NSTDA` など）を汎用シグナルへ一般化する（本タスクの対象外）。置き換え前後で characterization（実 PDF の投影出力ハッシュ）と `test:extraction-corpus` を比較する。
