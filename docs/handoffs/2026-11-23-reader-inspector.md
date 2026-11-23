---
type: Handoff
title: 引き継ぎ：Reader の右 Inspector を「論文に付随する情報」の場所にまとめる（2026-11-23〜）
description: 情報 / メモ / 用語 / 検索の 4 タブ化。定義は UI_INTERACTION_PRINCIPLES.md、ここは調査結果と実装の段取り
tags: [reader, ui, inspector, handoff]
status: draft
---

# 引き継ぎ：Reader の右 Inspector を 4 タブにまとめる

最終更新 2026-11-23。定義（何を置くか・既定・開閉）は [UI_INTERACTION_PRINCIPLES.md](/UI_INTERACTION_PRINCIPLES.md) の「Reader の右 Inspector」。

## 今の状態

- 定義だけ済み。コードは未着手。main 基準、作業ブランチなし。

## 調査で分かったこと（現行コード）

- 右パネルの状態は `ReaderScreen.tsx` のローカル `useState<ReaderRightPanel>`（`src/utils/readerRightPanel.ts` = `"none" | "notes" | "glossary"`、テスト `src/test/readerRightPanel.test.ts`）。永続化されていない。
- 地に置く仕組みは完成済み: `placeInspector()` が広い窓（`INSPECTOR_ON_GROUND_QUERY` = 1101px 以上）では AppShell の `#inspector-slot` へ portal、狭い窓ではカード内オーバーレイ。共通の外枠は `reader/SidePanel.module.css`（`.panel/.header/.title/.close`、入場アニメは transform のみ）。
- Notes / Glossary はそれぞれ `<aside className={panelStyles.panel}>` と独自ヘッダー（タイトル＋「閉じる」）を持つ。タブ化するならヘッダーを 1 つの共通シェルに上げ、各パネルは中身だけにする。
- 検索: `useReaderSearch` が ⌘F / Esc / ↑↓ / Enter を握る。`showSearch = searchQuery.length > 0`。`SearchPanel` は入力・件数・▲▼ と結果一覧を 1 つの `position: fixed` 400px パネルに持つ（`SearchPanel.module.css`）。→ 検索バー部分と結果一覧に分ける必要あり。結果の算出（`results` の useMemo）は一覧側へ移す。
- メタデータ: Reader の `paper` は `useLibraryCache` の索引（SQLite）由来で、DOI / bibliography / 構造化著者・所属は入っていない。`getPaperWithPackageMetadata(paperId)`（`services/database.ts`）で取れる。Reader では本体が既に読まれていて `loadDocument` のキャッシュに当たるので軽い。
- 編集: `library/PaperMetadataSheet`（`{ paper, onClose }`）は今 `PaperMenu` からだけ開く。情報タブの「編集」からそのまま開ける。保存後は `useLibraryCache.updatePaper` で索引が更新される（情報タブは再取得が必要）。
- `reader/InfoPopover` は本文上の汎用 popover（`Paragraph.tsx` が使う）で、論文メタデータとは無関係。かぶりはない。
- 所属 Workspace は `useProjectStore` の `workspaceNodes` / `memberships`（ReaderScreen が既に購読中）から引ける。
- 永続化先の候補: `useAppStore.displaySettings`（`partialize` で persist 済み、`sidebarMode` / `sidebarWidth` と同じ扱い）。`inspectorOpen: boolean` と `inspectorTab` を足す。

## 実装の段取り（PR を分ける）

1. **型と状態**: `ReaderRightPanel` を `"none" | "info" | "notes" | "glossary" | "search"` に。開閉とタブを `displaySettings` へ移す（初回既定 = 広い窓なら info、狭い窓なら none）。既存テストを更新。
2. **共通シェル**: タブ付きヘッダーの `ReaderInspector` を作り、Notes / Glossary のヘッダーを外して中身だけにする。ツールバーの用語集・メモボタンは「そのタブで開く／同じなら閉じる」のまま。
3. **情報タブ**: `PaperInfoPanel`（表示のみ＋「編集」で `PaperMetadataSheet`）。
4. **検索分離**: `SearchPanel` を検索バー（ツールバー下の小さなバー）と `SearchResultsPanel`（検索タブ）に分ける。⌘F は検索バーだけを出し、Inspector のタブは変えない。
5. 各 PR で `npm run verify:browser`、広い窓・狭い窓のスクリーンショット比較、最後に `.app` で確認。見た目の変更は before/after を見せて OK を取ってからマージ。

## 判断待ち・未確認

- 情報タブの「読書状態・タグ」をその場で変えられるようにするか（今は表示のみの定義）。
- 地に置いた Inspector が既定で開くと、広い窓でも本文カードがその分狭くなる。読書幅（`displaySettings` の本文幅）との兼ね合いは実画面で確認する。
- 検索タブを開いたまま検索バーを Esc で閉じたとき、結果タブを残すか閉じるか（案: 結果は空表示にしてタブは残す）。
