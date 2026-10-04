# Paper Reader 現在状態

最終更新: 2026-10-05

## 現在の実装状態

- 翻訳モデル: MADLAD-400 3B、Transformers 4.57.6 runtime。
- 翻訳品質ガード、科学的 invariant、引用保護、partial fallback、選択的 cascade の監査実装が存在する。
- CAT-Translate は監査・比較用で、本番ルーティングには未統合。
- PDF抽出は Native text / geometry / canonical resolver / projection の既存パイプラインを使用。
- macOS `.app` の再ビルドは、コード変更を配布版へ反映する必要がある段階で実施する。

## 主要指標

### 抽出コーパス

- OAカタログ: **114件**
- PDF取得済み: **113本**
- source integrity 平均: **0.99987**（最小 0.99363）
- canonical provenance: **1.000**
- heading recall 平均: **0.99324**（最小 0.97297）
- table-region recall: **0.950**
- table-caption relation precision 平均: **0.99468**（最小 0.75）
- title exactness: **0.867**。OpenAlex由来タイトルをPDFの正解として未検証のため、品質回帰の指標としては保留。

### 翻訳評価

- MADLAD既存held-out: 30 rows。受理 20/30。
- CAT比較: 30 rows。自動受理 27/30、手動レビューで severity 2 以上 0件。ただし本番未統合。
- 選択的 cascade の監査投影: reader-visible fallback 1/30（3.3%）。同一held-out上の監査値であり、本番保証ではない。
- 新規OAサンプル: 16 papers / 16 blocks、10受理・6 fallback。1論文1ブロックの診断値で、製品fallback率ではない。
- 追加fresh sample: 4 papers / 8 blocks、3受理・5 fallback。4件は抽出構造由来、1件は長い本文のpost-model品質拒否。

## 直近の変更

### v1543 — 保守性リファクタリング第一段階（2026-10-05）

- `quality.ts` の退化出力検出を `src/services/translation/quality/degeneration.ts` に分離。
- `quality.ts` は既存のexport名・import pathをfacadeとして維持。品質閾値、fallback条件、モデル設定は変更していない。
- 対象テスト 258/258、全体テスト 624/624、typecheck、`git diff --check` を通過。
- 分割計画と残りの候補は [`docs/MAINTENANCE_REFACTOR_PLAN.md`](docs/MAINTENANCE_REFACTOR_PLAN.md) に記録。


- リスト導入文（コロン終端）を、直後の箇条書き・番号付き項目とは別の安全な翻訳単位として扱うよう改善。
- 実PDFで従来pre-model fallbackだった導入文がMADLADへ送られ、既存ゲートで受理されることを確認。
- 全Vitest **624/624 across 69 files**、抽出pipeline **26/26**、quality tests **250/250**、typecheck pass。
- 詳細な実験ログは [`docs/history/CURRENT_STATE-2026-10-05.md`](history/CURRENT_STATE-2026-10-05.md) を参照。

## 未解決課題

1. 100本規模コーパスの section-stratified translation sampling と manual semantic review が不足。
2. ページ境界・未閉鎖 delimiter・参考文献混入による source reconstruction failure。
3. 長い完全本文の translation-unit / model quality failure。
4. borderless table と flattened numeric rows の汎用抽出。
5. `quality.ts` の責務集中と、品質判定・翻訳ポリシーの依存関係整理。
6. CAT / alternate model の本番統合可否は未決定。

## 次の作業

- `docs/MAINTENANCE_REFACTOR_PLAN.md` の順に、挙動固定テストを維持しながら品質モジュールを段階分割する。
- 抽出変更は113本ベンチマークと既存回帰を毎回実行する。
- 翻訳変更はfresh cohort・manual review・semantic false acceptを確認してから採用する。
