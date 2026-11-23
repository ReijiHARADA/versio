---
type: Spec
title: UI Interaction Principles
description: Versio の Surface（Popover / Sheet / Inspector / Modal / Route）の使い分けと、読書の流れを止めないための原則
tags: [ui, interaction, reader]
status: stable
---

# UI Interaction Principles

Versio の UI は、読書の流れを止めないことを最優先する。

> 読書中のコンテキストを維持したまま、必要な情報や操作だけをその場に一時的に表示する。

新しい UI を足す前に、必ず「この操作のために別画面へ移動する必要があるか？」を確認する。必要がなければ現在位置を維持する。

## Surface の使い分け

| Surface | 使うとき | 例 |
|---|---|---|
| **Popover** | 今触っている対象に紐づく局所操作 | メモ作成・確認・編集、引用 preview、用語、Workspace 追加先 |
| **Sheet / Overlay** | 少し大きい一時作業 | Export、図の拡大、詳細 preview |
| **Inspector** | 論文に付随する情報（本文ではない）の一覧・管理 | 論文情報、Notes 一覧、用語集一覧、検索中の結果一覧 |
| **Modal** | 作業を止めないと進めない重大判断 | 取り消せない破壊操作 |
| **Route** | ユーザーが明確に場所を移るとき | Library / Reader / Workspace / Settings |

局所操作のために新 route を増やさない。通常の追加・編集・確認に modal を多用しない。本文上の操作で Inspector を勝手に開かない。

## 閉じたら元通り

Popover / Sheet / Overlay を閉じたあと、次を極力保持する。

- Reader の scroll 位置と現在の段落
- Outline の開閉、右 Inspector の開閉
- 検索状態、開いている論文
- 可能なら選択と入力途中の内容

一時 UI を使ったことで読書位置を失わない。

## Shared Element Transition

同一の対象が場所や大きさを変えるとき、別レイヤーへ瞬時に切り替えてビューを切らない。元の位置・サイズから連続して拡大／縮小し、閉じるときも元の位置へ戻す。

- 例: 図・表のインライン表示 → 拡大 overlay（`MediaLightbox`）
- フェードインだけの置き換えや、突然フルスクリーンが現れる遷移は避ける
- 新しい「同じものが動く」体験を足すときも、この連続性を優先する

## 開閉のモーション

一時 UI は現れるときも消えるときも動かし、瞬時に消さない。

- 条件付きで出す surface は `<Presence>{open && <X />}</Presence>`（`src/components/ui/Presence.tsx`）で包み、閉じたあとも退場の間だけ残す
- surface 側は `data-motion={useMotionState()}`（または `MotionDiv` など）を付け、`src/styles/motion.module.css` の `overlay` / `sheet` / `popover` / `drop` / `slideLeft` / `reveal` を使う
- 表示中にすでに開いていたもの（スクロールで現れる原文展開など）は `initial={false}` で入場を省く
- `prefers-reduced-motion: reduce` では止める

## 判断順

1. 局所的な操作か → Popover
2. 一時的だが少し大きいか → Sheet / Overlay
3. 論文全体の一覧か → Inspector
4. 作業を止める必要があるか → Modal
5. 本当に別の場所へ行くか → Route

実装が簡単だからという理由で、別 route・大きな modal・右 sidebar の強制 open・外部アプリ起動を選ばない。

## 既にある体験は壊さない

原則を満たしている UI は作り直さない。

- Library 上の background import
- Import 中の一時行から論文行への移行
- Export Dialog、図・表の lightbox（Shared Element で拡大／縮小）、⌘F / ⌘K のスコープ分離
- Workspace 追加のメニュー picker

## Reader の右 Inspector

左の Outline は「本文の構造」、右の Inspector は「本文に付随する、論文単位の情報」を置く場所。本文そのものは置かない（例外: 概要は論文管理アプリの慣例どおり情報タブに折りたたんで出す）。

- タブは **情報 / メモ / 用語** の 3 つで、同時に開くのは 1 つ。今後の付随情報（引用文献一覧など）もここへタブとして足し、別の右パネルを作らない
- **情報** が既定のタブ。Zotero / Mendeley の詳細パネルに倣い、見出し（種別・訳題・原題・著者と所属番号）→ 概要 → 書誌情報（掲載誌・巻号・ページ・年・出版社・DOI / arXiv / URL・キーワード、BibTeX コピー）→ ライブラリ（読書状態・お気に入り・タグ・フォルダ・追加日・最後に開いた日）→ この論文（翻訳の進み具合・ページ数・図表・参考文献・メモ・用語の数・元ファイル）の順。空の項目は出さない
- 情報タブは表示が主。編集は既存の `PaperMetadataSheet` を開く（編集 UI を二重に作らない）
- 開閉と最後のタブは保持する。初回は広い窓（地に置ける幅）で情報タブを開いた状態、狭い窓（オーバーレイになる幅）では閉じた状態で始める
- 論文内検索の入力・件数・前後移動はツールバーの検索バーに置く（⌘F → Esc の軽さを保つ）。2 文字以上の検索中だけ Inspector に一時的な「検索」タブが現れて結果一覧を出し、他のタブと行き来できる。検索を閉じると消え、元のタブ／開閉状態に戻る（保存しない）。狭い窓では自動で開かない
- 本文上の操作（メモ作成、用語クリックなど）でタブを切り替えたり Inspector を開いたりしない。インスペクタのタブ、ツールバー右端の開閉ボタン、明示的な「一覧で見る」だけが切り替える。メモ・用語集専用のツールバーボタンや「閉じる」は置かない（開閉は右端のボタン 1 つ）

## メモ

作成・その場の確認・編集は本文上の Popover。Notes Inspector は論文全体のメモ一覧と、一覧から本文位置への移動だけに使う。

## 実装状況

- **済み（Phase 1）**: インラインメモ（作成 / 確認 / 編集 / 削除+Undo）。Notes は一覧専用
- **未達（Phase 2）**: 引用 preview、用語 popover
- **原則どおりのため変更しない**: Export、図の拡大、⌘F / ⌘K、Workspace 追加 picker、Library 上の PDF background import

詳細と優先順は [ROADMAP.md](./ROADMAP.md) の「3.0a UI 統一の残り」を見る。
