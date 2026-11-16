---
type: Spec
title: PLaMo 3 Translate 翻訳エンジン統合設計
description: 本番翻訳を MADLAD-400 3B から PLaMo 3 Translate 2B（llama-server サイドカー）へ移す設計。
tags: [translation, plamo, llama-cpp, tauri, design]
status: draft
sources: [/docs/research/local-llm-translation-bench-2026-11.md]
---

# PLaMo 3 Translate 翻訳エンジン統合設計

## 目的

[ベンチ](/docs/research/local-llm-translation-bench-2026-11.md)の結果は次のとおりでした。

| 項目 | MADLAD-400 3B | PLaMo 3 Translate 2B |
|---|---|---|
| MQM/100語 | 10.46 | 0.62 |
| critical エラー | 5 | 0 |
| 事実保持率 | 0.976 | 1.000 |
| 論文1本の所要時間 | 820〜1487 s | 56〜97 s |

この結果を受けて、本番の既定エンジンを PLaMo 3 Translate 2B に替えます。

## 方式の比較

| 案 | 内容 | 判断 |
|---|---|---|
| **B. llama-server サイドカー** | llama.cpp の `llama-server` を Tauri の `externalBin` として同梱し、Rust から起動する。OpenAI 互換 API を使う | **採用**。翻訳に Python が要らなくなる。プロセスが分かれるので、落ちてもアプリ本体は無事。バイナリは数 MB |
| A. 既存 Python サーバーに llama-cpp-python | `server.py` に新エンジンを足す | 不採用。venv 同梱と wheel ビルドの負担が残り、得るものがない |
| C. Rust に llama.cpp を組み込む（`llama-cpp-2` など） | アプリと同じプロセスで推論する | 不採用。推論のクラッシュがアプリごと落とす。ビルドも重い |

## 構成

```
Frontend PlamoEngine ──HTTP(Bearer token)──▶ llama-server (sidecar, 127.0.0.1:8766)
        ▲                                         │ GGUF: <AppData>/models/plamo-3-translate-2b-q4_k_m.gguf
        └─ invoke: translation_engine_status / ensure_model (Rust: download + spawn + stop)
```

### Rust（`src-tauri`）

- `llama-server` を arm64 で pin したビルドとして `externalBin` に入れ、署名と公証の対象にする。
- 起動引数: `-m <gguf> --port 8766 --host 127.0.0.1 --api-key <random> --jinja -c 65536 -np 8 -ngl 99`
  - トークンは今の `get_translation_server_token` と同じ方式で、起動のたびに生成する。
- アプリ終了時に停止する。ログは `~/Library/Logs/com.harada.versio/plamo-server.log` に出す。
- モデル配布: **初回にダウンロード**します。MADLAD も今 `snapshot_download` で初回取得しているので、体験は同じです。
  - 取得元は Hugging Face。版（revision）と SHA-256 を固定し、`-C -` 相当の再開に対応させる。
  - 保存先は `<AppData>/models/`。
  - 進捗はイベントでフロントに通知する。
  - `.app` には同梱しない（dmg が約 1.5 GB 増えるため）。

### Frontend（`src/services/translation`）

- `PlamoEngine implements TranslationEngine` を新設する。
  - `/v1/chat/completions` に `chat_template_kwargs {source_lang:"en", target_lang:"ja"}`、stop `<|plamo:tag|>` / `<|plamo:bos|>`、temperature 0 を渡す。
  - 並列数は 8（サーバー側の `-np 8` とそろえる）。
- `createTranslationEngine` の既定を PLaMo にする。
  - MADLAD は設定の「旧エンジン」として **1 リリースだけ** 残す。
  - Apple Translation の振り分けと Ollama カスケードは、PLaMo を基底エンジンにして見直す。今の振り分けは MADLAD の弱点を補うためのもので、不要になる見込み。
- `translation_cache` は `model` / `model_version` が変わるので、自然に別のエントリになる。移行処理は不要。

### 品質ゲート

- PLaMo の経路では旧 `quality.ts` のゲート（約 2550 行）を **通さない**。これらは MADLAD の壊れ方に合わせた経験則です。
- 代わりに、ベンチで使った決定的チェックを TS に移植する。
  - 対象: 破綻（空出力・日本語でない・前置き文・長さ比）と事実保持（数値・`[n]`・URL/DOI）。
  - 不合格なら 1 回だけ再試行し、それでも駄目なら `needs_attention` にする。

### 将来（別タスク）

- **用語集**: PLaMo は用語集を受け取れる。Versio の用語集機能につなぐ。
- **文脈**: PLaMo は前後の文脈も受け取れる。直前の段落を渡して用語の一貫性を上げる。
  - どちらも形式を確かめ、ベンチで効果を測ってから入れる。
- **8B**: 設定で「高品質（遅い）」として選べるようにするかは、要望が出てから決める。
- **抽出側**: "neuroim-aging" のような行末ハイフン分割の結合。全モデルで誤訳の原因になっていた。

## 撤去（次のリリースで、問題が出ていなければ）

- `translation-server/` の MADLAD 関連（segmenter、citation_protect、identifier_retry、madlad_mps、micro_batcher など約 5200 行）
- Python venv の同梱（`bundle-python.sh`、`inject-translation-venv.sh`）
  - ただし、Python サーバーが翻訳以外の役割を持っていないか、撤去の前に確認する。
- 旧 `quality.ts` のゲートと、MADLAD 専用の文書・ベンチ報告（`docs/history` へ移す）

## ライセンス表示

- PLaMo Community License の本文を同梱し、Settings → ライセンスと `THIRD_PARTY_NOTICES.md` に「Built with PLaMo」とモデル名を載せる。
  - モデルの重みは npm や crate の依存ではないので、`generate:licenses` には手で追加する。
- llama.cpp（MIT）の表記を追加する。
- 商用で配布する場合は、PLaMo への登録と年間売上 10 億円以下という条件を `docs/MACOS_RELEASE.md` に書いておく。

## 文書の更新

- `AGENTS.md` の Translation 節: 「本番は MADLAD MPS bf16、ほかに替えない」を、PLaMo サイドカーを前提とした制約に書き換える（起動方法、ポート、モデルの場所、ログ、使わないゲート）。
- `CURRENT_STATE.md`（翻訳エンジンの変更）と `QUICKSTART.md`（開発時に `llama-server` とモデルを用意する手順）。

## 検証

- 単体テスト: `PlamoEngine`（fetch をモック。stop・kwargs・エラーと再試行を確認）、決定的チェックの移植分（ベンチのケースを使う）。
- Rust: サイドカーの起動・停止、トークン、モデルがないときのダウンロード経路。
- `.app` 実機: 新規インストールから初回ダウンロード、取り込み、論文1本の翻訳、終了時にプロセスが残らないこと。
- 回帰: `local_llm_bench` を本番経路（Tauri 経由）で再実行し、MQM と論文1本の所要時間がベンチと同程度であることを確かめる。
