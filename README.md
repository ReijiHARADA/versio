# Paper Reader

英語論文 PDF を、日本語の Web 記事を読む感覚で読める、**ローカル動作の macOS デスクトップアプリ**（Tauri 2）です。

誌面レイアウトをそのまま複製するのではなく、タイトル・見出し・段落・図表・参考文献などの**意味構造を保ったまま**読書向けに再構成します。翻訳は端末内の **MADLAD-400 3B**（MPS / bfloat16）で行い、外部 API は必須にしません。

---

## 主要機能

- **ライブラリ / ワークスペース** — PDF の取り込み、階層フォルダ、インボックス / お気に入り / 最近読んだ論文
- **リーダー** — 日本語 1 カラム本文、目次、原文の段落展開、読書位置、論文内検索（⌘F）
- **メモと用語** — 訳文上のインラインメモ、用語集の参照・編集、本文からの用語確認
- **図表** — 本文内表示と拡大（Shared Element）
- **書き出し** — 論文単位の訳文 Markdown / Notion 用 ZIP / 検証用パッケージ / EPUB（ライブラリの「スマホで読む」で同期先へ送信可）、およびフォルダ配下の一括 ZIP
- **元 PDF** — いま読んでいる付近のページを開く（環境により best-effort）

ライブラリ検索は ⌘K。サイドバー下部から設定を開けます。

---

## 対応環境

- macOS（Apple Silicon 向け。MPS 翻訳を前提）
- Tauri 2 デスクトップアプリ（推奨）。ブラウザ UI のみの開発モードも可（OCR なし）
- Windows / クラウド同期 / 常設 AI チャットは対象外（[ROADMAP.md](./ROADMAP.md)）

---

## 開発の始め方

```bash
# 推奨: Tauri 開発アプリ（翻訳サーバーはアプリが起動）
npm run tauri:dev

# ブラウザ UI のみ
./restart-translation-server.sh   # 別ターミナル
npm run dev                       # http://localhost:5173

# 日常確認用 .app（cached Python、dmg なし）
npm run tauri:build:fast

# リリース確認（clean Python + .app + .dmg）
npm run tauri:build:clean
open "src-tauri/target/release/bundle/macos/Paper Reader.app"
```

手順・venv・トラブルシュートは [QUICKSTART.md](./QUICKSTART.md)。ビルド時間は [docs/BUILD_TIMINGS.md](./docs/BUILD_TIMINGS.md)。

```bash
npm test
npm run lint
npm run verify:browser   # Playwright（dev / preview 起動後）
```

---

## ドキュメント

| 文書 | 内容 |
| --- | --- |
| [CURRENT_STATE.md](./CURRENT_STATE.md) | **いまの実装の正**（機能状態・制限・検証） |
| [ROADMAP.md](./ROADMAP.md) | **これから達成する**プロダクト目標 |
| [QUICKSTART.md](./QUICKSTART.md) | 起動・環境・トラブルシュート |
| [UI_INTERACTION_PRINCIPLES.md](./UI_INTERACTION_PRINCIPLES.md) | UI の置き方 |
| [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md) | Paper Package / SQLite |
| [P0_HARDENING.md](./P0_HARDENING.md) | セキュリティ・起動・再現ビルドの詳細 |
| [AGENTS.md](./AGENTS.md) | エージェント向け実装制約と文書更新ルール |

抽出・翻訳の詳細は [ACADEMIC_PDF_EXTRACTION_ARCHITECTURE.md](./ACADEMIC_PDF_EXTRACTION_ARCHITECTURE.md) と [TRANSLATION_CORPUS_AUDIT.md](./TRANSLATION_CORPUS_AUDIT.md) を参照してください。
