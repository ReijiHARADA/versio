# Current State

最終更新: 2026-09-13

## ユーザー向けの挙動

### P0 後続（セキュリティ / 再現性）

- **翻訳サーバー認証**: 起動ごとの API token は OS の暗号学的乱数（`/dev/urandom`）で生成。ディスクへは保存しない。
- **書き出し**: Markdown / Notion ZIP / 検証用パッケージは、保存ダイアログ〜書き込みまでをアプリ側（Rust）で完結。フロントから任意の絶対パスへ直接書けない。
- **モデル準備バナー**: ダウンロード中は可能なとき実バイト進捗を表示。取得できない段階では「進捗取得中」と明示。読み込み / ウォームアップはダウンロード進捗と混同しない。
- **元PDF**: Reader から渡したページ番号を使って Preview で該当ページ付近を開く（失敗時は通常の open にフォールバック）。将来の bbox ハイライト用に highlight 引数を予約。
- **同梱 Python**: release 用 runtime は `translation-server/.python-version` の patch まで固定（現在 `3.12.14`）。

### P1（Reader / UX / Accessibility）

- **長論文 Reader**: section 単位で本文ボディを遅延マウント。`block-*` / `section-*` のプレースホルダは常時残し、outline / search / annotation / reading position / citation jump を維持。短い論文は全マウントのまま。
- **Import 失敗**: 原因を分類し、再試行 / 続きから再開 / 既存を開く / 閉じる を提示。重複 PDF は既存論文を開く導線を表示。
- **Citation preview**: 解決可能な `[n]` は Popover で参考文献の要約を表示し、ジャンプや DOI/URL を選べる。解決不能な引用は装飾のみ。
- **用語 Popover**: 本文中の glossary 用語を軽量に確認できる（Inspector は一覧・編集のまま）。
- **Keyboard / a11y**: 目次の矢印キー移動、`aria-current`、主要 icon ボタンの accessible name、Popover の Escape / focus 復帰。

## 残課題（別チケット想定）

- Preview ページジャンプは Accessibility 許可に依存する best-effort（失敗時は通常 open）。
- Citation / 用語 Popover の authors・title は参考文献テキストのヒューリスティック解析。構造化抽出の強化は PDF extraction 側の別課題。
- Import 実行中ジョブの真の abort（プロセス中断）は未実装。失敗・重複カードの dismiss と、保存済み論文の翻訳再開が主経路。
- 50–100 ページ実 PDF のブラウザ実測メトリクス（memory）は fixture 不在のため、仮想化ユニット指標と短いブラウザ検証で代替。実機計測は `test-data/real-papers` 入手後。
- 翻訳品質・CanonicalDocument / Evidence / Resolver は本 P1 では未変更。問題発見時は別課題。
