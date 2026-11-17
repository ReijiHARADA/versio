---
type: Plan
title: 論文翻訳特化モデル 開発方針（2026-11）
description: CC 論文の合成対訳で CAT-Translate 3.3B を QLoRA し、PLaMo 3 Translate 2B を超えられるかを、打ち切り条件つきで段階的に確かめる方針。
tags:
  - translation
  - fine-tuning
  - synthetic-data
  - qlora
  - plan
status: draft
generated:
  by: chatgpt/gpt-6 (draft), claude-opus-5-5 (review and rewrite)
  at: '2026-11-17'
sources:
  - id: cat
    resource: https://huggingface.co/cyberagent/CAT-Translate-3.3b
    title: CAT-Translate 3.3B model card
  - id: pmc
    resource: https://pmc.ncbi.nlm.nih.gov/tools/openftlist/
    title: PMC Open Access Subset
  - id: arxiv
    resource: https://info.arxiv.org/help/license/index.html
    title: arXiv license guide
  - id: ccby
    resource: https://creativecommons.org/licenses/by/4.0/
    title: CC BY 4.0
---

# 論文翻訳特化モデル 開発方針（2026-11）

> 状態：方針案です。学習はまだしておらず、精度も確かめていません。前提となる調査は [PLaMo 置き換え用 FT データ調査](/docs/research/plamo-replacement-ft-data-2026-11.md) と [ローカル LLM 翻訳ベンチ](/docs/research/local-llm-translation-bench-2026-11.md) です。

## 要約

- **目的：** 英語論文を日本語に訳すモデルを作ることです。数値、引用、否定、条件、因果、専門用語、段落構造を正確に保つことを重視します。
- **現行と基準値：** 本番は PLaMo 3 Translate 2B Q4_K_M（llama.cpp b12110）です。40 段落の MQM は 0.59 です。
- **土台の候補：** CAT-Translate 3.3B（MIT）。学習なしの MQM は 3.89 で、PLaMo の約 6.6 倍の誤りがあります。
- **教師モデル：** gpt-oss-120b / 20b（Apache 2.0）です。**PLaMo を上回ることを先に確かめます。**
- **学習：** クラウド GPU で QLoRA を回します。打ち切り条件を先に決めておきます。
- **多言語：** 今は扱いません。データの形式に言語の欄を持たせておくだけにします。

## 決まっていること

| 項目 | 方針 |
|---|---|
| 比較の基準 | PLaMo 3 Translate 2B Q4_K_M。`form: plain` は本番と同じにします |
| 評価 | `translation-server/scripts/local_llm_bench/` を使います。Q4_K_M に量子化した後のモデルで測ります |
| 採点 | 訳したモデルを伏せて、Claude が MQM で採点します。比べるモデルは同じ回で採点します |
| 原文 | PMC の OA Subset のうち、CC0 / CC BY 4.0 の論文だけを使います。本文は PDF ではなく JATS XML から取ります |
| 学習データの機械チェック | `src/services/translation/translationCheck.ts` と同じ判定（訳の崩れ、数値・引用・URL の保持）を使います |
| 実行環境 | 手元は M4 / 24GB です。120b の推論と QLoRA の学習はクラウドで行います |

## 使わないもの

- **PLaMo の訳：** PLaMo Community License で、派生モデル扱いになります。
- **Claude / GPT / Gemini などの API の訳と判定：** 規約で、競合するモデルの開発に使えません。**評価の採点に使うのは問題ありません。** 学習データを作ることにも、選ぶことにも使いません。
- **JParaCrawl、ASPEC など、商用不可のコーパス**
- **MADLAD-400：** #33 で外しました。品質が足りず、Python の翻訳ランタイムも戻しません。
- **CC 以外のライセンスの arXiv 論文：** 大半は arXiv 独自のライセンスで、再利用を許していません。arXiv は、その版に CC BY / CC0 が付いているものだけを使います。

## 段階と出口条件

| 段階 | やること | 次へ進む条件 | だめなとき |
|---|---|---|---|
| 1. 教師を測る | 同じ 40 段落で gpt-oss-20b（手元）と gpt-oss-120b（クラウドまたはホスト型 API）を測ります | 教師の MQM が PLaMo と同じかそれより良いこと | FT 計画は止めて、PLaMo を使い続けます |
| 2. 小さく作る | CC BY の PMC 論文から 200 段落を教師で訳し、`translationCheck` にかけます | 不合格率と、1 件あたりの GPU 時間・費用がわかること | プロンプトか教師を見直します |
| 3. 評価セットを広げる | ベンチを 40 段落から 200 段落にします。学習に使う論文とは論文単位で分けます。重大な誤りだけ人が確かめます | 200 段落で PLaMo と学習なしの CAT 3.3B の基準値があること | — |
| 4. QLoRA を試す | 約 1,000 件、24GB 級の GPU で学習します。マージして Q4_K_M にしてから測ります | **PLaMo との差が半分以上縮まること**（3.89 から 2.2 以下が目安） | 件数を 5,000 件に増やして 1 回だけやり直します。それでもだめなら止めます |
| 5. 広げる | 約 5,000 件に増やし、難しい例（否定、統計、長い段落）を足します | PLaMo と同等以上で、数値などの保持が悪くならないこと | 段階 4 の設定に戻ります |
| 6. アプリで確かめる | llama-server サイドカーで動かし、論文 1 本の処理時間、メモリ、`translationCheck` の不合格率を見ます | PLaMo より遅くも重くもなく、不合格率が悪くならないこと | 採用しません |

1,000 / 5,000 / 200 は実験の計画値で、性能を約束する数字ではありません。サンプルが少ないうちは、重大な誤りが 0 件でも「誤りゼロ」とは言いません。

## データの作り方

1. Europe PMC / PMC OA から、CC0 / CC BY 4.0 の論文を取ります。一般の閲覧ページはスクレイピングしません。`scripts/fetch-oa-europepmc.mjs` の流れを使います。
2. JATS XML を段落に分けます。`src/evaluation/fieldGold/jats.ts` を使います。表、図のキャプション、参考文献、他所から転載された部分は外します。
3. 評価用の論文（ベンチの fixture に使った論文）は、学習データから論文単位で外します。
4. 教師で訳します。プロンプトは 1 つに固定し、数式と引用は変えないように指示します。
5. 機械チェックに落ちたものは捨てます。直して使うことはしません。
6. 段落ごとに 1 行の jsonl で持ちます。

```json
{"segment_id": "PMC123:p-8", "paper_id": "PMC123", "license": "CC-BY-4.0",
 "source_language": "en", "target_language": "ja",
 "source_text": "...", "target_text": "...",
 "generator": "gpt-oss-120b@<revision>", "prompt_sha256": "...",
 "qa": "auto_checked", "split": "train"}
```

- 権利の台帳は、論文ごとに 1 行の jsonl にします。中身は ID、版、URL、ライセンス、取得日時、XML の SHA-256 です。判定者や判定日を記録する運用はしません。
- 対訳データそのものは公開しません。配布するのは学習済みの重みだけです。
- `qa` には `auto_checked` / `human_reviewed` を区別して入れます。モデルが生成しただけのデータを「正解」とは呼びません。

## 注意点

- **CAT-Translate は、すでに gpt-oss の訳で約 2,000 万件学習しています。** 同じ教師の訳を足しても、伸びは小さいかもしれません。段階 4 の打ち切り条件はこのために置きます。
- **失敗の原因を分けて見ます。** 抽出の誤り、翻訳の誤り、表示の誤りは別々に数えます。抽出を直した効果を、翻訳モデルの成果と取り違えないようにします。
- **抽出で欠けた原文は学習データに入れません。** 欠けた部分をモデルに補わせることもしません。
- **GPU は、その時点の料金と実際の tokens/s で計算し直してから借ります。** 初期の目安は約 1 万円です。ただし教師での大量生成は含みません。

## 未決事項

- **置き換える理由：** ライセンスの事情なのか、品質を上げたいのか。これによって、段階 6 でどこまで求めるかが変わります。
- 120b を動かす場所（クラウド GPU か、ホスト型 API か）と費用。
- CAT-Translate-Dataset の `LICENSE` 本文。読むには HF へのログインが必要です。
- 英語以外の言語を扱うか、扱うならいつか。段階 6 を通ってから考えます。
