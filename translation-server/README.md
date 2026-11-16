---
type: Note
title: translation-server
description: 旧 MADLAD Python サーバーの跡地。残っているのはローカル LLM 翻訳ベンチだけ。
tags: [translation, bench]
---

# translation-server

MADLAD-400 の Python 翻訳サーバーは 2026-11-17 に削除しました。本番の翻訳は PLaMo 3 Translate 2B（`src-tauri/src/plamo.rs`）です。

ここに残しているのは、翻訳モデルを切り替える前に再実行するローカル LLM ベンチ `scripts/local_llm_bench/` です。根拠と結果は [docs/research/local-llm-translation-bench-2026-11.md](../docs/research/local-llm-translation-bench-2026-11.md) にあります。
