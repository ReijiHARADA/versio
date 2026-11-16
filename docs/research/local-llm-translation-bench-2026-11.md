---
type: Report
title: ローカル LLM 翻訳ベンチ（EN→JA, 2026-11）
description: MADLAD-400 3B と6つのローカル翻訳モデルを、新しい MQM 評価と決定的チェックで比べた結果。PLaMo 3 Translate 2B を推奨。
tags: [translation, benchmark, plamo, madlad, mqm]
status: stable
generated: 2026-11-16
---

# ローカル LLM 翻訳ベンチ（EN→JA, 2026-11）

## 結論

- **PLaMo 3 Translate 2B（Q4_K_M）を本番候補として推奨します。** 品質は 8B とほぼ同じで（MQM 0.62 対 0.50）、速さは 8B の約 2.7〜3.6 倍です。数値・引用の保持率は 100% でした。
- MADLAD-400 3B は品質（MQM 10.46）でも速さでも最下位でした。論文1本を訳すのにかかる時間は、PLaMo 2B の **約 15 倍** です。
- 2位グループ（CAT 7B、TranslateGemma 12B、Hunyuan-MT 7B）は MADLAD より明らかに良い結果でしたが、PLaMo との差は大きく開いています。

## 対象

| system | 形式 | 実行方法 |
|---|---|---|
| madlad-3b | 現行本番（MPS bf16, batch 24, microbatch） | `translation-server` `/translate` |
| plamo3-2b / plamo3-8b | PLaMo 3 Translate GGUF Q4_K_M | `llama-server`（Metal, `--jinja`） |
| tgemma-4b / tgemma-12b | TranslateGemma GGUF Q4_K_M | `llama-server` raw `/completion`（公式プロンプト） |
| cat-7b | CAT-Translate 7B GGUF Q4_K_M | `llama-server` |
| hunyuan-mt-7b | Hunyuan-MT 7B GGUF Q4_K_M | `llama-server` |

- 実行環境: Apple Silicon Mac（他プロセスと共有）、llama.cpp build 12110、temperature 0。
- TranslateGemma の注意: GGUF に埋め込まれた chat template に指示文を入れると二重に包まれ、プロンプト自体を訳してしまいました。そのため、公式プロンプトを raw completion で渡す方法に切り替えて計測し直しています。

## フィクスチャ

`test-data/extraction-audit/baseline-fieldgold/docs/*.json` の抽出済み本文から 40 段落を選びました。
- 一般段落 30（英語、300〜1100 字、seed 7）
- 引用の多い段落 10（seed 11）

キーとタグだけを `translation-server/benchmarks/local-llm-2026-11/fixture-keys.json` に置いています。論文本文と訳文はリポジトリに入れていません。

## 評価指標（旧ゲートは使わない）

旧 `quality.ts` のゲートは、MADLAD 特有の壊れ方に合わせて作った経験則の集まりです。正しく訳されたかどうかを直接測ってはいないため、今回は採用しませんでした。代わりに次の2つを使います。

1. **MQM（人手評価基準のエラー注釈）**
   - 判定方法: 全 system の訳文を段落ごとに A〜G の文字で匿名化し、順序をシャッフルしてから、評価者（Claude Sonnet サブエージェント）が [RUBRIC](/translation-server/scripts/local_llm_bench/RUBRIC.md) に従ってエラーを列挙します。
   - 重み: minor 1、major 5、critical 10。結果は原文 100 語あたりで報告します。
2. **決定的チェック**（`checks.py`）
   - 破綻: 空出力、日本語でない出力、前置き文、長さ比が 0.2〜1.0 の外。
   - 事実保持: 数値（million→万/億 の換算、桁区切りを考慮）、`[n]` 引用、URL/DOI。

## 結果（40 段落）

| system | MQM/100語 ↓ | major 以上を含む段落 | critical | 事実保持 | 秒/段落 | peak RSS MB |
|---|---|---|---|---|---|---|
| **plamo3-8b** | **0.50** | 2 | 0 | 1.000 | 9.5 | 3738 |
| **plamo3-2b** | **0.62** | 2 | 0 | 1.000 | 3.5 | 2273 |
| cat-7b | 2.92 | 8 | 2 | 0.976 | 14.4 | 5842 |
| tgemma-12b | 3.72 | 12 | 1 | 0.984 | 21.7 | 4508 |
| hunyuan-mt-7b | 4.14 | 14 | 1 | 0.984 | 22.2 | 4800 |
| tgemma-4b | 5.95 | 21 | 1 | 0.976 | 8.4 | 3346 |
| madlad-3b | 10.46 | 32 | 5 | 0.976 | 26.0 | — |

- 破綻した出力: MADLAD 1/40、その他はすべて 0/40。
- PLaMo の major エラー:
  - 抽出時のハイフン分割が原因の誤訳 "neuroim-aging"→神経加齢（2B・8B の両方）
  - 8B: "two 超"→3名超
  - 2B: RR→安静時心拍数
- MADLAD の critical エラー: 意味の反転（「4倍少ない」→「4倍使用」）、長い区間の未翻訳、存在しない内容の付け足し。

## 論文1本の所要時間（並列 8、全翻訳対象ブロック）

| system | PMC13476272（17p, 43 blocks, 31k 字） | PMC13592641（20p, 46 blocks, 46k 字） |
|---|---|---|
| madlad-3b | 820 s | 1487 s |
| plamo3-2b | **56 s** | **97 s** |
| plamo3-8b | 201 s | 262 s |

- PLaMo は `llama-server -c 65536 -np 8` で計測しました（8 スロットで連続バッチ処理）。
- 8B を本番の既定にすると、1本あたり 3〜4 分待つことになります。2B なら 1〜1.5 分で、品質の差は小さいと判断しました。

## 注意点

- 評価者は 1 モデル、対象は 40 段落です。上位2つ（PLaMo）と3位以下の差は大きいので結論は揺らぎにくいと考えますが、2B と 8B の差は誤差の範囲です。
- マシンは別エージェントのプロセスと共有していたため、時間の数値にはノイズがあります。
- MADLAD の RSS は誤った PID を測っていたため無効です。論文計測の PLaMo RSS（2B 3007 MB、8B 2388 MB）は mmap した重みの数え方の影響を受けており、参考値にとどめます。
- 原文のハイフン分割（抽出側の問題）は、すべてのモデルの誤訳の原因になっていました。

## ライセンス

- **PLaMo Community License**（HF リポジトリの `LICENSE/en` を確認済み）
  - 商用利用には登録が必要で、年間売上 10 億円以下という条件があります。
  - 再配布するときはライセンス本文を添付し、「Built with PLaMo」と表示します。
  - 出力を長い著作物として公開する場合は、PLaMo を使ったことを明記します。
  - 出力を学習に使ったモデルは派生モデルとして扱われます。
- Gemma / Hunyuan の条項は今回は確認していません（採用しないため）。

## 再現手順

スクリプトは `translation-server/scripts/local_llm_bench/` にあります。

1. `all.sh`: モデルごとに 40 段落を翻訳
2. `checks.py`: 決定的チェック
3. `pack.py`: 匿名化した評価用パケットを作成
4. 評価者が `judge/result-NN.json` を書く
5. `score.py`: 匿名化を解除して集計
6. `paper.sh`: 論文1本の所要時間を計測

集計結果は `translation-server/benchmarks/local-llm-2026-11/` にあります。

## 追試: PLaMo 2B のリクエストオプション（2026-11-17）

同じ 40 段落で PLaMo 3 Translate 2B に3通りのオプションを与え、3 system だけの盲検 MQM（`mqm-options/`）で比べた。

| 設定 | MQM/100語 ↓ | major 以上を含む段落 | です・ます調の段落 | 事実保持 |
|---|---|---|---|---|
| 既定（form 指定なし） | 0.84 | 3 | 2/40 | 1.000 |
| **`form: "plain"`（だ・である調）** | **0.67** | 3 | 0/40 | 1.000 |
| plain ＋ 直前段落を `context` に渡す | 0.89 | 3 | 0/40 | 1.000 |

- 段落ごとの比較: plain は既定より良い 7 / 悪い 1 / 同じ 32。context ありは plain より良い 5 / 悪い 9 で、原文にない語が増えた（addition）。
  - **採用:** `form: "plain"`。**不採用:** 直前段落の context。
  - 今回の評価者は初回と別のエージェントで、既定設定の MQM は初回の 0.62 から 0.84 に動いた。同じ回の中での比較だけを根拠にする。
- **用語集（`glossary`）:** MQM の減点は terminology が最大（例: RR→安静時心拍数、sensitive bits→感度の高い、neuroim-aging→神経加齢）。この3件に正しい訳語を `glossary` で渡すと、3件とも指定どおりに訳された。
  - 論文の用語集のうち、その段落に現れる語だけを、原文での表記のまま渡す（行末ハイフンで分かれた語も含む。`glossaryForText`）。

再現: `translation-server/scripts/local_llm_bench/ctxrun.py plain|ctx <port>`。そのあと `pack.py` と同じ方式で3 system の判定パケットを作る。
