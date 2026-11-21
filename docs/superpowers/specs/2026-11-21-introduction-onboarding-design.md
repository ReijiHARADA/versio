---
type: Spec
title: Introduction 論文によるオンボーディング
description: 配布前に、初回起動で使い方を一通り覚えてもらうための同梱論文「Introduction」と PLaMo 導入案内の設計
tags: [onboarding, intro, plamo, library]
status: stable
---

# Introduction 論文によるオンボーディング

## 意図
配布前の準備。初めて使う人が Versio の使い方を一通り知る。説明画面ではなく、Versio 自身の使い方を書いた「論文」を Reader で読みながら操作してもらう。翻訳モデル PLaMo の導入も最初の導線で済ませる。

## ゴール / 非ゴール / 失敗条件
- ゴール: 初回起動でライブラリに Introduction が 1 本ある。それを読めば主要操作（取り込み・原文/訳文切り替え・メモ・用語集・⌘K/⌘F・Workspace へのドラッグ・書き出し）を知れる。動画の後で PLaMo のダウンロードを始められる。
- 非ゴール: コーチマーク型の画面ツアー、操作の達成判定、多言語 UI。
- 失敗条件: 削除した Introduction が毎回の起動で戻ってくる。Introduction を読むのに PLaMo が必要になる。既存ユーザーのライブラリに勝手に増える。

## アプローチ（決定済み）
- 本文: **英語本文＋日本語訳を同梱**（選択肢 1）。PLaMo なしで「英語論文を日本語で読む」体験ができる。日本語のみの案は翻訳を見せられないので不採用。PLaMo で実際に訳す案は、ダウンロード待ちと訳文のぶれがあるので不採用。
- 保存形式: **TS データファイル**（A1）。既存 `src/data/samplePaper.ts` と同じ `Paper` / `Section` / `PaperBlock`（original + translated）を使う。英日 2 本の Markdown から生成する案は、対応付けの処理とテストが要るので不採用。
- PLaMo 案内: **ホチキス動画の CTA 直後、同じオーバーレイ内**に出す（B1）。ライブラリ上部のバナー案は、画面が常に混むので不採用。

## 設計
1. `src/data/samplePaper.ts`（Attention 論文）を Introduction 論文のデータに置き換える。id は新しく `versio-introduction` とする。Abstract と章立てのある論文の体裁で書く。章案: Abstract / 1 Introduction / 2 Importing Papers / 3 Reading and Translation / 4 Notes and Glossary / 5 Search / 6 Organizing with Workspaces / 7 Exporting / 8 Translation Model (PLaMo) / References。各章で「いまこの段落で試してみて」と実際の操作を促す。図・数式・参照も少し入れて、Reader の各要素を見せる。
2. 初回に入れる処理: `addSamplePaper` を `seedIntroductionPaper` に改める。起動時に「この端末でまだ一度も入れておらず、かつライブラリが空」のときだけ追加し、入れたことを記録する（localStorage ではなく SQLite の settings 系に保存して確実に残す。保存先の具体はビルダーに任せる）。削除後や既存ユーザーには入れない。
3. 設定画面の「サンプル論文を追加」ボタンと、関連する state / メッセージを削除する。Diagnostics 側に参照があれば合わせて整理する。
4. PLaMo 案内: `IntroOverlay` の CTA を押した後、`usePlamoModel().state` が `absent` なら「翻訳モデルをダウンロード（約 1.8 GB）／あとで」のステップを同じオーバーレイ内に表示する。「ダウンロード」を押したら `download()` を呼んでオーバーレイを閉じる。ダウンロードは裏で続き、進み具合は既存の設定画面で見られる。`present` / `unavailable`（ブラウザ）なら、このステップは出さずにそのまま閉じる。
5. `scripts/verify-browser.mjs` は設定のボタンを押して sample を作っている。これを、自動で入る Introduction を使う形に直す。`scripts/bench-translation-ui.ts` の参照も追従させる。
6. 文書: CURRENT_STATE.md の機能一覧を更新する。

## 制約
- UI_INTERACTION_PRINCIPLES: 新しい route は作らない。Introduction は通常の Reader で読む。
- Paper Package が正本であることは既存の `savePaper` / `saveBlocks` 経路で満たす。
- 動画は今は毎回の起動で出る（PR #142 の一時仕様）。PLaMo ステップは毎回出ても、導入済みならスキップされる。

## ビルダーに任せること
- 本文の文面（英日とも）。章の細かい構成。
- 「入れたこと」の記録をどこに置くか。
- PLaMo ステップの見た目。既存 CTA のトーンに合わせる。
