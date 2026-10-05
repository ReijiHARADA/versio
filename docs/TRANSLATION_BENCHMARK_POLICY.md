# Translation benchmark policy

Paper Reader の翻訳評価は、変更の大きさに応じて段階化する。113本規模の全件計測は高コストなので、通常の修正では実行しない。

## 通常の変更

次の変更では、全件計測を行わない。

- テスト追加、診断ログ、レポート整理
- 既存の挙動を変えないリファクタリング
- 1つの抽出境界・品質ルールの局所修正
- ドキュメントやベンチマーク補助スクリプトの変更

代わりに、以下を実行する。

1. 関連する単体・回帰テスト
2. 代表論文の小規模ベンチマーク（通常4〜12論文、各12ブロック程度）
3. 変更対象のfailure cohortまたはheld-out fixture
4. typecheck / lint

## 全件計測を行う条件

次のいずれかに該当する場合だけ、113本（現行catalogではPDF取得済み113本、catalog 114件）の全件計測を行う。

- 抽出・段落再構成・reading orderのアルゴリズムを横断的に変更した
- segmenter、translation unit構築、placeholder protectionを大きく変更した
- MADLAD / CAT / 代替モデル、Transformers、decode設定を変更した
- quality gate、fallback policy、selective cascadeの判定を変更した
- 前回の全件計測から、複数分野・複数layoutに影響する変更が累積した
- リリース候補の受け入れ判定を行う

全件計測を行う場合も、`--resume` と stable key / source hash を使い、途中停止してもチェックポイントを保持する。未完了レポートは全体指標として扱わない。

## 判断の優先順位

全件計測の前に、代表セットで変更方向を確認する。代表セットで改善が見られない場合は、全件計測を開始せず原因分析へ戻る。全件結果は自動accept率だけでなく、reader-visible fallback、partial source fallback、manual semantic review、unsafe false acceptを分けて記録する。

最後に完了した全件計測を「基準版」として記録し、局所ベンチマークの結果で113本全体の率を推定しない。

## 現在の基準

- 最新の完了済み全件基準: `translation-audit-auth-v1`（113 PDF / 1,155 units）
- ordinary-body reader-visible fallback: 118/404 (29.2%)
- 目標: ordinary-body fallback <= 5%、unsafe semantic error ≈ 0
- 次の全件計測は、モデル、抽出、segmenter、protection、quality gate、cascadeのいずれかに大きな変更を入れた後に実施する

## 最新の重点コホート

2026-10-05 に `speechin`, `dont-mind-me`, `interactive-jewellery`, `thermal-earring` の4本・48ユニットを `focused-cohort-current-v3` として再計測した。通常本文22件のうち、7件がpost-model fallback、19件が構造由来のpre-model fallbackだった。これは全113本の推定値ではなく、MADLADの品質拒否と抽出境界を追跡するための診断値として扱う。成果物は `test-data/real-papers/reports/focused-cohort-current-v3.{json,md}`。
