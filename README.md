# Paper Reader

英語論文 PDF を、日本語の Web 記事を読む感覚で読める、**ローカル動作の macOS デスクトップアプリ**（Tauri 2）です。

誌面レイアウトをそのまま複製するのではなく、タイトル・見出し・段落・図表・参考文献などの**意味構造を保ったまま**読書向けに再構成します。翻訳エンジンは端末内の **MADLAD-400 3B**（MPS / bfloat16）です。外部 API は必須にしません。

詳細な起動手順は [QUICKSTART.md](./QUICKSTART.md)。今後の方針と未達は [ROADMAP.md](./ROADMAP.md)。UI の置き方は [UI_INTERACTION_PRINCIPLES.md](./UI_INTERACTION_PRINCIPLES.md)。

---

## 画面構成

| 場所 | 内容 |
| --- | --- |
| **ワークスペース** | 階層フォルダ。開くと直下の子フォルダと、その配下の論文一覧 |
| **ライブラリ** | すべての論文 / インボックス / お気に入り / 最近読んだ論文 |
| **リーダー** | 目次 \| 本文 \| メモ一覧／用語集 |
| **設定** | 読書 / 翻訳 / データ / 詳細設定 |

サイドバー下部から設定を開きます。⌘K はライブラリ検索、⌘F はこの論文内検索です。

---

## いまできること

### ライブラリとワークスペース

- PDF をウィンドウへドロップするか「論文を追加」で取り込む。専用の Import 画面に留まらない
- カード／行に準備状態（準備中・読めます・日本語化中・要確認）を表示する
- ワークスペースは任意深さの単一ツリー。論文は多対多で所属。所属なしはインボックス
- フォルダの三点メニュー: サブフォルダー追加・名称変更・論文ファイル追加・削除（削除は所属のみ外し、論文本体は残す）
- ヘッダにルートからのパス（`親 / 子 / 今いる場所`）。祖先は薄いリンクで辿れる（論文画面でも同様）
- サイドバーは「自動開閉 / 常に開く / 常に閉じる」。折りたたみ時は既定で最上位フォルダだけ表示。開いた状態では右端をドラッグして幅を変えられ、ダブルクリックで既定幅に戻る

### 読書

- 日本語 1 カラム本文。原文は段落ごとに展開
- 目次の表示／非表示、読書位置の復元、表示設定（リーダーと設定画面で共有）
- 訳文選択で本文上のメモ（Popover）。右の「メモ一覧」は一覧専用（本文操作では自動で開かない）
- 用語集の閲覧・修正と訳後置換（Ollama による生成は任意）
- 図・表の本文内表示と拡大。拡大はインライン位置から連続して伸びる（Shared Element）
- 低信頼箇所の警告と「要確認 N箇所」
- 書き出し: 訳文 Markdown / Notion 用 ZIP / 検証用パッケージ
- 「元 PDF を開く」（いま読んでいる付近のページを狙う。配布 `.app` での最終確認は ROADMAP 参照）

### 取り込みと翻訳

- PDF 追加・途中から読める。タイトル → Abstract → 本文の文バッチ翻訳（既定 24）
- 日本語論文は翻訳せずレイアウトのみ。スキャンは Apple Vision OCR（Tauri のみ）
- 品質不足の訳は保存せず原文へ戻す
- 起動時は論文メタだけ読み、本文は Reader で lazy load。⌘K は SQLite FTS（本文をメモリに載せない）
- ライブラリはモデル準備中も使える。process 起動と download/load/warmup を分離し、バナーに phase を表示（固定 90 秒 timeout なし）
- リリース Python は `requirements.lock` から clean venv（開発者 `.venv` コピーなし）
- 本番 CSP・localhost 限定 API・Tauri 共有トークンで POST 保護

詳細と残課題は [P0_HARDENING.md](./P0_HARDENING.md)。

---

## 起動（要約）

```bash
# 推奨: Tauri 開発アプリ（翻訳サーバーはアプリが起動）
npm run tauri:dev

# ブラウザ UI のみ（OCR なし）
./restart-translation-server.sh   # 別ターミナル
npm run dev                       # http://localhost:5173

# リリース .app（clean Python runtime を lock から生成してからビルド）
npm run tauri:build
open "src-tauri/target/release/bundle/macos/Paper Reader.app"
```

初回の Python 3.12 venv（`uv`）とトラブルシュートは [QUICKSTART.md](./QUICKSTART.md)。翻訳サーバーは `http://127.0.0.1:8765/health`（`phase` / `model_loaded`）。

---

## データの置き場

- **論文本文の正本**: Paper Package（`<AppData>/papers/<paperId>/`）。`source.pdf`、`paper.json`、`original.md`、`ja.md`、`translation.json`、`structure.json`、任意で `layout.json.gz` と `assets/`
- **索引・所属・メモ・読書位置・用語集・翻訳キャッシュ**: SQLite（`library.sqlite`）
- 翻訳中は Paper Package の全文書き換えをせず、必要な Markdown / JSON だけを更新する

詳細は [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md)。

---

## 開発・検証

```bash
npm test
npm run lint
npm run verify:browser          # Playwright。dev server 起動後
npm run fetch:real-papers       # 実論文 PDF は gitignore の test-data/ へ
npm run bench:pdf-extraction
npm run bench:real-paper-translation -- --paper <id> --limit 8
```

実論文の翻訳監査手順は [TRANSLATION_CORPUS_AUDIT.md](./TRANSLATION_CORPUS_AUDIT.md)。エージェント向けの制約は [AGENTS.md](./AGENTS.md)。

---

## 対象外（いまはやらない）

Windows、クラウド同期、常設 AI チャット、元レイアウト維持型の PDF 書き出し、図中文字の翻訳などは [ROADMAP.md](./ROADMAP.md) の「今はやらないこと」を参照。
