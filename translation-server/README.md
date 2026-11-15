# MADLAD Translation Server

Versio 用のローカル翻訳サーバーです。**MADLAD-400 3B** を Apple Silicon の **MPS + bfloat16** で動かし、英語→日本語を返します。

速度の実測と、MLX INT8 を不採用にした理由は [SPEED_BENCH.md](./SPEED_BENCH.md) にあります。公式 3B の MLX **bf16**（量子化なし）比較は [MLX_BF16_BENCH_REPORT.md](./MLX_BF16_BENCH_REPORT.md)（本番未切替、判定は No-Go）。

## 要件

- Python 3.12（`uv` が入れる公式ビルドを推奨。Homebrew `python@3.12` は macOS 26 で venv が壊れやすい）
- Apple Silicon Mac（推奨 24GB 以上）
- ディスク: 依存関係 + 初回モデルでおおよそ 12GB

## セットアップ

```bash
cd translation-server
uv python install 3.12
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

仮想環境ディレクトリは **`.venv`** です。ルートの `./restart-translation-server.sh` もここを見ます。

## 起動

リポジトリルートから:

```bash
./restart-translation-server.sh
```

または:

```bash
cd translation-server
source .venv/bin/activate
export PYTORCH_ENABLE_MPS_FALLBACK=1
python server.py
```

待ち受けは `http://127.0.0.1:8765` です。ポートは `MADLAD_SERVER_PORT` または `UVICORN_PORT` で変えられます。

Tauri アプリから起動する場合も同じポートです。

## 本番設定

- デバイス: MPS。未対応演算だけ `PYTORCH_ENABLE_MPS_FALLBACK=1` で CPU へ
- dtype: bfloat16
- 文バッチ: `MADLAD_BATCH_SIZE`（既定 24）。`1` で文ごとの逐次 `generate()`
- 複数段落: `MicroBatchScheduler`（既定 25ms）。`MADLAD_MICROBATCH=0` でオフ
- コミュニティ MLX INT8 には切り替えない（長い段落で訳が途中切れする）。MLX bf16 も本番より遅い（`MLX_BF16_BENCH_REPORT.md`）
- バッチ最適化の実測: [MPS_BATCH_OPTIMIZATION_REPORT.md](./MPS_BATCH_OPTIMIZATION_REPORT.md)

## API

### ヘルスチェック

```bash
curl http://127.0.0.1:8765/health
```

### 単一翻訳

```bash
curl -X POST http://127.0.0.1:8765/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, world!", "source_language": "en", "target_language": "ja"}'
```

### バッチ翻訳

```bash
curl -X POST http://127.0.0.1:8765/translate/batch \
  -H "Content-Type: application/json" \
  -d '{"texts": ["Hello", "World"], "source_language": "en", "target_language": "ja"}'
```

### モデル管理

```bash
curl -X POST http://127.0.0.1:8765/load
curl -X POST http://127.0.0.1:8765/unload
curl http://127.0.0.1:8765/status
```

## レスポンス例

```json
{
  "text": "こんにちは、世界！",
  "source_language": "en",
  "target_language": "ja",
  "model": "google/madlad400-3b-mt",
  "model_version": "3b-mt",
  "input_chars": 13,
  "output_chars": 9,
  "input_tokens": 7,
  "output_tokens": 5,
  "translation_time_ms": 245.5,
  "chars_per_sec": 52.9,
  "tokens_per_sec": 28.5
}
```

## 注意

- 初回翻訳で Hugging Face からモデルを取得します（約 6GB）
- ロードに数十秒かかることがあります
- 実行中のメモリはおおよそ 8–10GB です

## ローカル候補モデル監査

候補モデル比較は production server とは分離した `scripts/compare_fallback_model.py` で実行します。

```bash
python scripts/compare_fallback_model.py \
  --model facebook/m2m100_1.2B \
  --input ../test-data/real-papers/reports/model-quality-unsafe-v8.json \
  --num-beams 4 --max-new-tokens 512 \
  --output ../test-data/real-papers/reports/model-candidate.json
```

`--input` は `rows` 配列（`paperId`、`blockId`、`source`）を持つJSON fixtureを受け取り、`--num-beams` と `--max-new-tokens` で生成条件を明示します。出力は監査用であり、意味レビューと保守的な品質評価を通過するまでproduction cascadeへ自動採用しません。

## Claim alignment selector (audit only)

既存候補とsemantic coverageを突き合わせる場合は、次のselectorを使えます。

```bash
PYTHONPATH=translation-server translation-server/.venv/bin/python \
  translation-server/scripts/score_candidate_selection.py \
  --baseline test-data/real-papers/audit-manual-review.json \
  --candidate test-data/real-papers/reports/model-quality-qwen2.5-14b-v1.json \
  --semantic-coverage test-data/real-papers/reports/semantic-coverage-qwen14-v1.json \
  --min-semantic-sim 0.65 \
  --output /tmp/candidate-selection-audit.json
```

`--semantic-coverage` と `--min-semantic-sim` は候補を監査上除外するだけで、アプリの翻訳routingやfallback policyを変更しません。`audit-manual-review.json` は `reviews` envelopeにも対応しています。

### Stable audit keys and isolated review queues

`benchmark-real-paper-translation.ts` の各監査行には、候補比較用の安定キー
`key: "paperId:blockId"` が含まれます。レビューキュー生成時もこのキーが引き継がれ、旧形式のキーは互換参照されます。

本番キューを変更せずに検証する場合:

```bash
TRANSLATION_AUDIT_REPORT=translation-audit-<paper>.json \
TRANSLATION_REVIEW_OUTPUT=/tmp/review.json \
TRANSLATION_PROGRESS_OUTPUT=/tmp/progress.json \
npm run audit:prepare-review
```

生成済みレポートでキーが欠落している候補は、selectorの
`unmatchedCandidateRows` / `unmatchedCandidateKeys` に記録されます。本文の近似一致で補完しないでください。
