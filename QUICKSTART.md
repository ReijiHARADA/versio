---
type: Playbook
title: Versio 起動手順
description: 開発環境のセットアップと日常の起動手順。
tags: [setup, development]
---

# Versio 起動手順

リポジトリのルート（`package.json` がある場所）で実行してください。

## 初回だけ

### 0. 翻訳サイドカー（PLaMo）

```bash
npm run build:llama-server   # llama.cpp b12110 を静的ビルドして src-tauri/binaries/ に置く（数分、初回のみ）
```

モデル（約 1.8 GB）はアプリの 設定 → 翻訳 →「モデルをダウンロード」、または最初の取り込み時に自動で取得されます。


### 1. フロントエンド

```bash
npm install
```

---

## 日常の起動

### 推奨: Tauri 開発アプリ

翻訳用の `llama-server` はアプリが必要になった時点で起動し、ウィンドウを閉じると停止します。

```bash
npm run tauri:dev
```

Xcode が `/Applications/Xcode-beta.app` の場合:

```bash
export DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer
npm run tauri:dev
```

### ブラウザ UI だけ（OCR・翻訳なし）

```bash
npm run dev
```

http://localhost:5173 を開きます。エージェントから画面を確認するときは、dev server を上げたあと:

```bash
npm run verify:browser
```

スクリーンショットは `test-results/browser-verify/` に出ます（gitignore）。

### 一括起動（ブラウザ開発）

```bash
./start.sh
```

`npm run dev` を起動します。ブラウザでは翻訳は動きません（PLaMo は `.app` / `tauri:dev` のみ）。

### リリース用 `.app`

```bash
# 日常確認: .app のみ
npm run tauri:build:fast

# リリース / CI: clean rebuild、.app + .dmg
npm run tauri:build:clean
# または npm run tauri:build（clean エイリアス）

open "src-tauri/target/release/bundle/macos/Versio.app"
```

`beforeBuildCommand`（`scripts/before-build.sh`）は frontend build。`llama-server` は `tauri-build.sh` が `npm run build:llama-server` で用意し、モデルは同梱しません。phase 時間は [docs/BUILD_TIMINGS.md](./docs/BUILD_TIMINGS.md)。

### テストと実論文 PDF

```bash
npm test
npm run lint
npm run bench:pdf-extraction
```

実論文の読み順テスト用 PDF はリポジトリに入れません。カタログは `test-fixtures/real-papers/catalog.json`、キャッシュは gitignore の `test-data/real-papers/` です。catalog の formatFamily は評価用 Ground Truth です。

```bash
npm run fetch:real-papers
```

jewelry-first-computing 側のディレクトリやデータは変更しません。

---

## トラブルシューティング

### 翻訳が始まらない・進まない

`~/Library/Logs/com.harada.versio/plamo-server.log`（前回分は `plamo-server.prev.log`）を最初に見てください。モデル未取得なら 設定 → 翻訳 →「モデルをダウンロード」。

### PDF を開いた瞬間に落ちる

pdf.js 6 は Tauri の WKWebView で動きません。依存は **pdfjs-dist 3.11** のままにしてください。

### OCR が動かない

Apple Vision は `.app` または `npm run tauri:dev` だけです。ブラウザの `npm run dev` では動きません。


---

## メモリの目安

| プロセス | 目安 |
|---|---|
| PLaMo llama-server（2B Q4_K_M） | 2–3GB |
| UI | 0.5–1GB |

推奨: Apple Silicon / 24GB 以上。

## 速度

論文全体の翻訳時間の計測は [docs/research/local-llm-translation-bench-2026-11.md](./docs/research/local-llm-translation-bench-2026-11.md) です。
