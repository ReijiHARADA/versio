# 参考文献抽出への GROBID CRF 移植 — 設計（段階 3a）

日付: 2026-11-16 / 前提: [抽出品質の根本改善 設計](./2026-11-15-extraction-quality-design.md)、比較結果 [EXTRACTION_FIELD_EVAL.md](../../EXTRACTION_FIELD_EVAL.md)

## 1. なぜやるか

比較で GROBID は英語の参考文献 F1 を 0.24 → 0.95 に上げた。ただし GROBID 本体の同梱は Java 330 MB＋GROBID 719 MB、常駐 RAM 約 2.8 GB で、「できるだけ軽いアプリ」（ユーザー方針）に合わない。
GROBID の精度の源は学習済み CRF モデルと特徴量計算であり、Java サーバではない。必要なモデルだけを TypeScript に移植して本番パイプラインに組み込む（ユーザー承認済み）。

## 2. ゴール / 非ゴール / アンチゴール

**ゴール**

1. 参考文献を GROBID の `reference-segmenter`（節を 1 件ずつに分割）と `citation`（各件を著者・題名・年・誌名などにラベル付け）の CRF で処理する純 TypeScript 実装。
2. 項目別評価（`npm run eval:fields`）で、英語の references F1 が **0.85 以上**（本家 0.95、現行 0.24）。日本語は現行（0.04）より悪化しない。
3. 追加の配布サイズは **圧縮後 5 MB 以下**、追加 RAM は使用時のみ **100 MB 以下**、処理時間の増分は中央値 **1 秒/本以下**。

**非ゴール**

- 著者・所属（`header` / `name` / `affiliation-address` モデル）。参考文献で手法が成立したら同じやり方で次段階に広げる。
- 日本語参考文献の改善（学習データが英語中心のため。日本語論文では移植 CRF を使わない）。
- モデルの再学習（必要になった場合のみ別計画）。

**アンチゴール**

- Java・GROBID サーバ・外部サービスへの依存を本番に持ち込む。
- 本文テキストを置き換える（ネイティブ pdf.js テキストが正。CRF はラベルと境界だけを出す）。
- `formats/` 外に出版社別の判定を増やす。

## 3. 制約

- GROBID は Apache-2.0。コード・モデル・辞書の移植と同梱は可。`LICENSE` と NOTICE 相当の帰属表示を設定画面のライセンス一覧（`npm run generate:licenses` の対象外なら `THIRD_PARTY_NOTICES.md` に手動追記）に入れ、改変した旨を明記する。モデル・辞書ファイルは取り込む前にファイルごとにライセンスを確認する。
- Wapiti（CRF ライブラリ、BSD）のコードは移植しない。モデルファイル形式を読む実装を自前で書く。
- 既存制約（AGENTS.md）を維持: CanonicalDocument が正、pdfjs-dist 3.11 固定、GROBID/Docling は任意 enricher、block ID 再利用、Format Profile 閾値不変。

## 4. 方式

| 部品 | 内容 |
|---|---|
| CRF 推論 | Wapiti モデル（パターン `%x[行,列]`・`/` 連結・`u`/`b` 素性）を読み、Viterbi で最尤ラベル列を出す |
| モデル刈り込み | 重みが 0 でない観測文字列だけを残した独自の小形式に変換（例: citation は 21 MB 中、実効重み 25,992 個） |
| 特徴量 | GROBID の `FeaturesVectorCitation` / `FeaturesVectorReferenceSegmenter` とトークナイザを移植。citation はほぼ文字列特徴＋辞書。reference-segmenter は行頭・字下げ・行長・ブロックなど行単位のレイアウト特徴を Versio の行情報から作る |
| 辞書 | 誌名・略誌名・会議名・出版社・地名・共同研究名・姓名。地名 9.8 MB は除去したときの精度低下を測って要否を決める |

**移植の正しさの確認**: 本家 GROBID（開発機で `127.0.0.1` 起動）に同じ入力を通し、ラベル一致率を測る。目標は citation・reference-segmenter とも **トークン単位で 95% 以上一致**。差の主因が特徴量の再現ずれ（pdfalto と pdf.js の違い）なら、そこを直す。

## 5. 段階

1. **段階 3a-1（本計画）**: 推論・刈り込み・特徴量・辞書を `src/services/pdfExtraction/crf/` に実装し、評価用アダプタ（`--parser crfport`）で本家との一致率と項目別スコアを測る。本番パイプラインは触らない。
2. **段階 3a-2（3a-1 の数値を見てから別計画）**: 本番統合。CRF の結果を Evidence として CanonicalDocument に入れ、Resolver が既存の参考文献ブロックと比べて採否を決める。英語のみ。モデルは使うときに読み込む。

## 6. 決まっていること

- 対象言語の判定: 論文の言語が日本語なら移植 CRF を使わない（既存判定を流用）。
- 参考文献節の位置は既存の section 判定で決める（GROBID の `segmentation` モデル 59 MB は移植しない）。
- 出力形式は評価用 `FieldRecord.references`（`raw` / `title` / `year` / `doi`）と同じ形で、のちの本番統合でもそのまま使える。

## 7. ビルダーに任せること

- 刈り込み後のモデル形式（JSON か独自バイナリか）、gzip するか。
- 辞書の照合方法（トライ、ハッシュなど）。
- トークナイザの細部（GROBID と同じ区切り文字集合にすること自体は必須）。
