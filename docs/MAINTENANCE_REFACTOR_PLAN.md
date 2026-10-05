# 保守性リファクタリング計画

## 調査結果

### 優先度の高いホットスポット

- `src/services/translation/quality.ts`（2,525行）
  - source integrity / extraction policy
  - scientific invariant / citation integrity
  - degeneration / language contamination
  - semantic relation checks
  - translation quality scoring / cascade quality
  - title・heading・bibliography policy
  - public APIが広く、単純な一括移動はimport依存を壊す。
- `src/services/pdfLayout.ts`（3,664行）
  - layout reconstructionとcontinuation repairが集中している。
  - 既存挙動への影響が大きいため、今回の第一段階では分割対象にしない。
- `src/services/pdfExtraction/generic/candidates.ts`（1,096行）
  - candidate生成の責務がまとまっているが、resolverとの境界は比較的明確。
  - quality.tsの分割後に依存関係を再評価する。
- `CURRENT_STATE.md`（17,574行）
  - 実験履歴が現在状態と混在していたため、履歴を `docs/history/` へ移した。

## 分割方針

1. `quality.ts` を当面public facadeとして維持する。
2. 依存の少ない `degeneration` と出版メタデータ判定を内部モジュールへ移す（完了）。`sourceIntegrity` の caption/title policy を分離済み。paragraph structure policy は依存が広いため、挙動固定テストを先に追加してから検討する。
3. facadeは旧export名を再exportし、既存importを変更しない。
4. 各段階で `npm test`、typecheck、git diff --checkを実行する。
5. quality threshold、fallback判定、translation model versionは変更しない。
6. 循環importを避けるため、共有型・純粋な正規化関数は小さな共通モジュールへ置く。

## 予定モジュール

- `src/services/translation/quality/sourceIntegrity.ts`
  - `shouldTranslateCaption`
  - `shouldTranslateTitle`
  - `diagnoseIncompleteSource` / `unsafeParagraphStructureReason` / `shouldTranslateParagraph`（依存関係を整理してから次段階）
- `src/services/translation/quality/degeneration.ts`（第一段階完了）
  - `restoreUtf8ByteEscapes`
  - `explainDegenerateTranslation`
  - `isDegenerateTranslation`
  - script contamination / placeholder residue helpers
- `src/services/translation/quality/documentPolicy.ts`（第二段階完了：タイトル、見出し、参考文献、出版メタデータ判定）
- `src/services/translation/quality/scientificInvariants.ts`
  - `ScientificInvariant`
  - invariant extraction and missing technical-name checks
- `src/services/translation/quality/relations.ts`
  - semantic relation and claim-scope checks
- `src/services/translation/quality/scoring.ts`
  - `TranslationQuality`
  - `evaluateJaTranslation`
  - partial/cascade quality helpers
- `src/services/translation/quality/documentPolicy.ts`
  - title / heading / bibliography / display-name policy

実際の依存関係を確認しながら、独立性が低い責務は分割せず facade 内に残す。

## 完了条件

- public import pathとexport名が維持される。
- 既存テストの件数・結果が変わらない。
- source hash、translation cache、model version、quality thresholdに変更がない。
- 分割前後で代表fixtureの判定結果がdeep-equalになる。
- `CURRENT_STATE.md` は現在状態・未解決課題・主要指標のみを保持する。
