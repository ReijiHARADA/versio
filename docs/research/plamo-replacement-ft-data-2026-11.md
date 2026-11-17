---
type: Report
title: PLaMo 置き換え用 FT のベースモデルと学習データ調査（2026-11）
description: PLaMo 3 Translate 2B をオープンライセンスのモデルに置き換えるために、ベースモデル候補と、商用で使える EN→JA 学習データを調べた結果。
tags: [translation, fine-tuning, license, dataset, plamo]
status: draft
generated: 2026-11-17
sources:
  - https://huggingface.co/papers/2606.21413
  - https://huggingface.co/cyberagent/CAT-Translate-7b
  - https://huggingface.co/datasets/cyberagent/CAT-Translate-Dataset
  - https://www.rd.ntt/cs/team_project/icl/lirg/jparacrawl/
  - https://jipsti.jst.go.jp/aspec/terms_en.html
  - https://opus.nlpl.eu/KFTT/corpus/version/KFTT
---

# PLaMo 置き換え用 FT のベースモデルと学習データ調査（2026-11）

## 結論

- **最初の一手は学習ではなく、CAT-Translate 1.4B / 3.3B（MIT）を既存ベンチで測ることです。** 翻訳特化済みで、2B 前後の大きさです。7B は前回ベンチで PLaMo 2B に次ぐ 2 位グループでした（MQM 2.92 対 0.62）。
- FT が必要な場合、ベースモデルは CAT-Translate（MIT）または、その土台の Sarashina 2.2（MIT）にします。
- 学習データは **「CC-BY 系の英語論文本文」を「出力の学習利用を禁じていない教師モデル」で訳した合成データ** を主にします。教師モデルは gpt-oss-120b（Apache 2.0）が第一候補です。
- 既存の大型対訳コーパスは、ほとんどが商用不可です。

## 使えないもの

| データ | 理由 |
|---|---|
| PLaMo の出力 | PLaMo Community License で、出力を学習に使ったモデルは派生モデルになる |
| Claude / GPT などの API 出力 | 各社の利用規約が、競合モデルの開発に出力を使うことを禁じている |
| JParaCrawl v3 | NTT の条件が研究用のみ（「翻訳器の販売を含め商用不可」）。商用は個別に相談が必要 |
| ASPEC（JST 論文抄録） | 申請した目的の範囲でしか使えず、商用は例として除外されている |

## ベースモデル候補

| モデル | ライセンス | 大きさ | メモ |
|---|---|---|---|
| CAT-Translate 0.8B / 1.4B / 3.3B | MIT | 0.8〜3.3B | JA⇄EN 翻訳特化。Sarashina 2.2 から SFT と RL（MO-GRPO）で作られている |
| Sarashina 2.2（SB Intuitions） | MIT | 0.5〜3B | CAT-Translate 小型版の土台 |
| Qwen3 Swallow | Apache 2.0 | 8B〜 | 2B 枠には大きすぎる |

## 学習データ候補

1. **CAT-Translate-Dataset**（ODC-BY、HF gated・自動承認、約 2,000 万件）
   - サブセットは `abstracts`（200 万件）、`corpus`（1,737 万件）、`fineweb`（40 万件）、`noisy`（109 万件）です。形式は prompt / completion です。
   - 論文によると、合成訳の教師は主に gpt-oss-20b で、難しい領域（PubMed 抄録）には gpt-oss-120b を使っています。英語側の出典には arXiv、PubMed、J-STAGE、FineWeb があります。
   - **未確認**: 20 KB ある `LICENSE` 本文と各サブセットの出典ライセンスは、HF でログインして承認しないと読めません。使う前に確認が必要です。
2. **自前の合成データ（主力にする候補）**
   - 英語側には、商用可の CC ライセンスの論文本文を使います。Europe PMC の OA 論文はすでに `scripts/fetch-oa-europepmc.mjs` で取得しています。arXiv は CC-BY の論文に絞ります。
   - 訳は gpt-oss-120b（Apache 2.0）で作ります。DeepSeek（MIT）も候補ですが、使う前に出力条件を確認します。
   - 段落単位で作り、Versio の実データに合わせて、数式・引用・図表参照・抽出由来のノイズを含めます。
   - フィルタには `translationCheck.ts`（数値・引用・URL の保持）と QE スコアを使います。
3. **小規模な対訳コーパス（補助）**
   - KFTT（CC-BY-SA 3.0、京都関連の Wikipedia）は分野が合いません。また SA 条件がモデルにどう及ぶかは整理されていません。
   - JESC は字幕で、ライセンスの記載が出典ごとに食い違うため使いません。

## CAT-Translate ベンチ結果（2026-11-17）

PLaMo 2B の本番と同じ条件（Q4_K_M、llama-server、`form: plain`）で、40 段落を訳しました。採点は、どのモデルの訳かを伏せた状態で Claude Sonnet が 1 回だけ行いました（`RUBRIC.md`）。4 モデルとも同じ採点で比べています。

| モデル | MQM/100語 | 大きな誤りのある段落 | 致命的な誤り | 事実保持 | 秒/段落 | RSS |
|---|---|---|---|---|---|---|
| PLaMo 3 Translate 2B | **0.59** | 2 | 0 | 1.000 | 3.4 | 2.9 GB |
| CAT-Translate 7B | 2.82 | 6 | 2 | 0.976 | 18.0 | 5.4 GB |
| CAT-Translate 3.3B ※ | 3.89 | 10 | 1 | 1.000 | 5.6 | 4.1 GB |
| CAT-Translate 1.4B | 11.52 | 28 | 4 | 0.976 | 2.2 | 2.7 GB |

※ 3.3B は第三者が量子化したファイル（`Sundowner123/cat-translate-3.3b-gguf`）です。

- 前回のベンチ（PLaMo 0.62、7B 2.92）とほぼ同じ値が出ました。採点がぶれていないと見ています。
- **FT なしで置き換えられる CAT-Translate はありません。** 3.3B は PLaMo の約 6.6 倍の誤りがあり、遅くて重いです。1.4B は速いものの、誤訳と用語の誤りが多いです。
- そのため、置き換えるなら下の手順 3（論文段落の合成データで SFT）が必要です。FT の土台には、品質と速度の釣り合いから 3.3B が有力です。

## 進め方の案

1. CAT-Translate 1.4B / 3.3B の GGUF を `translation-server/scripts/local_llm_bench/` で測ります。40 段落の MQM、事実保持、秒/段落を見ます。
2. PLaMo 2B との差が小さければ、そのまま置き換えます（FT なし）。
3. 差が大きければ、論文段落の合成データ（数万〜数十万件）で SFT します。評価用の 40 段落は学習データから除外します。

## 未確認

- CAT-Translate-Dataset の `LICENSE` 本文。
- gpt-oss と DeepSeek の利用ポリシーにある、出力利用の細かい条件。
- KFTT の SA 条件をモデルの重みに適用するかどうか。
