---
type: Spec
title: ページ領域分割による読み順の改善（第 1 段: 表/図領域）
description: 段組の読み順を組む前に表・図の領域をページから切り出し、本文の分断と正解外警告を減らす設計
tags: [extraction, layout, reading-order]
status: stable
---

# ページ領域分割による読み順の改善

## 意図
段落抽出の目標は intact 98% 以上、警告 500 以下、誤警告 50 以下（評価用 split）。段落ごとのヒューリスティック追加は 1 件 +0.05pt 程度で頭打ちになった。残る失敗の大半は「読み順に本文以外（表/図の中の文字・脇欄・メタ欄）が混ざる」ことが原因なので、**読み順を組む前にページを領域に分ける**。

ユーザー決定の順序: 1. 表/図領域 → 2. 段組・脇欄 → 3. 前付けメタ欄。本書は 1 を詳細化し、2・3 が同じ枠組みに乗ることだけ定める。

## 目標 / 非目標 / 反目標
- 目標（第 1 段）: 表/図の中の文字を本文の流れから外す。dev 部分集合で正解外警告（`outside`、sub-c1 で 1059）を減らし、表の行で分断された段落を減らす。
- 非目標: 表の構造化（セル分割）、図のクロップ精度改善、段組判定の変更（第 2 段）。
- 反目標: ゲートを緩めて警告を消すこと。本文段落を表/図領域に飲み込むこと（intact 低下）。`pdfLayout.ts` の「段組は左→右」を書き換えること。

## 制約
- AGENTS.md: pdfjs-dist 3.11 のまま。`pdfLayout.ts` は汎用ヒューリスティックエンジンとして残し、段組の左→右を書き換えない。Format Profile 閾値は変えない。GROBID/Docling は必須にしない。block ID は再抽出で再利用。
- 有料不可。dev/test を混ぜない（調整は dev 部分集合のみ、評価用 405 本は最後に 1 回測る）。
- 取り込み時間を目に見えて増やさない（ページあたりの追加処理は線形程度）。

## 案
- **A（採用）: レイアウト前の領域判定。** ページごとに表/図の矩形を決め、その中の行を段組の読み順から外してキャプション隣の 1 ブロックとして出す。第 2・3 段も「領域」を足すだけで乗る。
- B: 読み順はそのまま、後段でブロックの種類を付け替える。小さいが分断は直らず、第 2 段の土台にならない。
- C: 機械学習レイアウトモデル。必須依存にできないため不採用。

## 設計（案 A）

### 領域の型
```ts
type PageRegion = { kind: "table" | "figure"; rect: LayoutRect; evidence: "ruled-grid" | "image" | "vector"; captionLineY?: number };
```
新モジュール `src/services/pdfExtraction/layout/pageRegions.ts`（`pdfLayout.ts` に足さない。6,200 行を増やさないため）。純関数 `detectPageRegions(page: ExtractedPage, lines: LayoutLine[]): PageRegion[]`。

### 判定の手がかり（強い順、第 1 段はこの 3 つだけ）
1. **罫線グリッド**: `page.graphicsPrimitives` の細い矩形/線の連結成分（`tableRegions.ts` の `captionAnchoredGraphicsGrids` と同じ条件）。キャプション（`isTableCaption`）が上下近くにあるものだけ。共通部分は関数を export して共有し、複製しない。
2. **画像**: `page.imagePlacements` の矩形。ページ面積の 2% 未満（ロゴ・アイコン）とページ全面（スキャン/背景）は除外。
3. **ベクター図**: 罫線以外の graphics primitive が密集した矩形で、`isFigureCaption` のキャプションが近くにあるもの。

罫線のない表（揃った複数列の行だけ）は第 1 段では領域にしない（誤判定リスク）。既存の `isGridRow` による保護はそのまま。

### 行の割り当て
- 行の bbox 中心が領域内 → その領域に属する。キャプション行自体は領域外（今まで通りキャプションブロック）。
- 領域内の行が本文らしい（本文フォント・長さ 40 字超・3 行以上の連続）場合は、その領域を**捨てる**（矩形が本文にかぶった誤検出とみなす）。本文を飲み込まない安全弁。

### 読み順への組み込み
- `buildPageLines` の中、`orderPageLines` を呼ぶ直前に領域判定を行う。領域内の行は `orderPageLines` に渡さず、外の行だけで今の左→右の順序を組む（`pdfLayout.ts` の順序ロジックは不変）。
- 領域内の行は、そのキャプションの直後（キャプションが無ければ領域の上端に最も近い外側の行の直後）に、表は `roleHint = "table"` を付けて差し込む。図の中の文字は `LayoutRole` に図の種類が無く、Reader では図のクロップ画像に写っているので、`"chrome"` として本文から外す（Claude の判断。新しい役割は足さない）。`groupLinesIntoBlocks` は roleHint で 1 ブロックにまとめ、本文段落と結合しない。
- 表/図ブロックは既存の `toPaper.ts` の表/図処理に流れる。既知の潜在バグ（covid-ml-review p5 で表領域ブロックの文字が projection で消える）は第 1 段で再現テストを作り、消えるなら同時に直す。

### 第 2・3 段への拡張点
`PageRegion.kind` に `"sidebar"` / `"frontmatter"` を足し、同じ「領域内の行を外して別ブロックで出す」経路を使う。第 2 段では段組判定（`detectPageColumns`）を領域外の行だけで行う変更を検討する（左→右ロジック自体は変えない）。

## 検証
- 単体: `pageRegions.test.ts` に合成ページ（罫線表+キャプション、画像+キャプション、本文にかぶる誤検出矩形）。
- 回帰: `npx vitest run` 全緑。`npm run test:extraction-corpus` は main の既存 15 件失敗から増えない（diff で確認）。
- 指標: `test-data/extraction-audit/tools/run.sh <out> dev300.txt` を sub-c1 と比較。合格 = intact が下がらない かつ `outside` 警告が減る。`docdiff.ts` で悪化論文を確認し、悪化は理由を説明できること。
- 最後に評価用 405 本を 1 回だけ再計測し、`docs/EXTRACTION_INTEGRITY_AUDIT.md` に記録。`.app` で 1 本取り込んで Reader 表示を確認。

## 分担
- Claude: 本書、判定ルールの調整判断、悪化論文の原因調査、レビュー、git/PR。
- Codex（Orca、`gpt-5.6-terra`）: `pageRegions.ts` と単体テストの実装（medium）、回帰 run と評価用再計測（high）。

## 実装者に任せること
- 「本文らしい」判定の正確な閾値（dev 部分集合で調整）。
- ベクター図の密集判定の具体的な方法。
- 差し込み位置が決められない場合のフォールバック（領域を捨てて従来どおりでよい）。
