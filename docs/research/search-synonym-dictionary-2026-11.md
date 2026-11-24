---
type: Report
title: 検索の類義語辞書（調査と実装方針, 2026-11）
description: 類義語・日英横断・略語展開・表記ゆれ吸収をライブラリ検索に入れるための辞書ソース調査と、段階的な実装方針。
tags: [search, synonyms, wordnet, sudachi, dictionary]
status: stable
generated: 2026-11-24
sources:
  - https://github.com/WorksApplications/SudachiDict/blob/develop/docs/synonyms.md
  - https://en-word.net/downloads
  - https://bond-lab.github.io/wnja/eng/index.html
  - https://aclanthology.org/2023.gwc-1.22
  - https://conceptnet.io
---

# 検索の類義語辞書（調査と実装方針）

## 1. 今の検索

- ライブラリ検索（⌘K）は `src/domain/libraryFtsSearch.ts` → `src/data/sqlite/fts.ts`。
- **本番の sql.js 1.14（SQLite 3.49.1）には FTS5 が入っていない**（node で `CREATE VIRTUAL TABLE … USING fts5` が `no such module` になるのを確認）。そのため実際は `papers_fts` の通常テーブルに対する `LIKE '%q%'`（title / authors / original / translation / annotation）だけで動いている。
- 正規化は `trim().toLowerCase()` だけ。NFKC・長音・中黒・全角半角は揃えていない。
- 英語論文でも訳文 `ja.md` が `translation` 列に入るので、「日本語で英語論文を探す」は訳語が一致すればもう当たる。外れるのは、訳語のゆれ（認知負荷／認知的負荷）、英語で検索して日本語論文を探す場合、略語の場合。

→ 部分一致 LIKE が前提なので、類義語は **「クエリを展開して OR でつなぐ」** だけで入る。分かち書きや FTS5 は要らない。

## 2. 辞書ソース

| ソース | 版 / サイズ | ライセンス | 使い道 | 判断 |
| --- | --- | --- | --- | --- |
| Sudachi 同義語辞書 | `synonyms.txt` 約 3 MB | Apache-2.0 | 日本語の表記ゆれ・略語・言い換え。グループには英字表記もある（例: インターフェース / インタフェース / interface）。展開制御フラグ付き | **採用（日本語の中心）** |
| Open English WordNet 2025 | JSON 約 9.5 MB（2025-12-31） | CC BY 4.0 | 英語の synset、語形変化、ILI（言語をまたぐ synset ID） | **採用（英語の中心）**。高信頼の synset だけに絞る |
| Princeton WordNet 3.1 | 約 10 MB | WordNet License | OEWN と重なる。保守終了 | 不採用（OEWN で置き換える） |
| 日本語 WordNet 1.1 / 2.0 | 1.1 は SQLite 約 58 MB | 独自の寛容ライセンス（同じライセンスでの再配布とライセンス同梱が条件） | 日本語の語と PWN synset の対応 → OEWN の ILI を通して日英の橋渡し | **採用（日英の橋）**。使うのは語と synset の対応表だけ（数 MB）。2.0 は GWC 2023 で発表済み。**2.1 は存在を確認できず** |
| ConceptNet 5.7 | 約 500 MB | CC BY-SA 4.0（主張ごとに異なる） | 多言語の関係。ノイズが多い | **同梱しない**。ShareAlike なので、使うならビルド時の候補出しだけ |
| （追加）Wikidata のラベル / 別名 | 必要な項目だけ抜く | CC0 | 略語 ↔ 正式名称、専門用語の日英ラベル（HCI ↔ Human–computer interaction ↔ ヒューマンコンピュータインタラクション） | **採用候補（略語・専門用語）** |
| （追加）JMdict | 約 10 MB | CC BY-SA 4.0 | 一般語の日英 | 保留（SA なので派生 DB 全体が SA になる） |
| （追加）自分のライブラリ | — | 制約なし | 原文と `ja.md` の対訳ブロック、PLaMo の訳語から「このライブラリでの訳語」を取る | **採用（P2 以降）** |

ライセンスの注意:
- 同梱するソースはすべて Settings → ライセンスに表示が要る（Sudachi: Apache NOTICE、OEWN: CC BY の帰属表示、日本語 WordNet: ライセンス全文）。`npm run generate:licenses` の対象に「データ」の区分を足す。
- ShareAlike のソース（ConceptNet・JMdict）は、混ぜると辞書 DB 全体が SA になる。混ぜない。

## 3. 一般辞書だけでは足りないところ

- WordNet の synset は語義が広い（`load` には「荷」「仕事量」など多くの語義がある）。そのまま展開すると検索結果がノイズだらけになる。
- 論文検索で効くのは **専門用語・略語・訳語のゆれ**。一般辞書にはあまり載っていない（認知負荷、ユーザビリティ評価、SUS など）。
- だから、一般辞書を **骨組み** にし、専門語は **自分のライブラリの語彙と LLM による拡張** で埋めて、独自の DB に統合する、というユーザーの構想は筋が良い。

## 4. 独自の類義語 DB

ライブラリとは別の、読み取り専用のバンドル資産 `synonyms.sqlite` にする（バージョン付き）。`library.sqlite` には入れない。

```text
source(id, name, version, license, url, attribution)
concept(id, ili, pos, domain, gloss)
term(id, surface, norm, lang, pos)
concept_term(concept_id, term_id, relation, weight, source_id, confidence, reviewed)
  relation: variant(表記ゆれ) | abbr(略語) | expansion(正式名称) | translation(日英) | synonym(類義) | broader | narrower
```

- `norm` は検索時と同じ正規化をかけた形（下の P0）。引くときは `norm` で引く。
- `weight` は展開の強さ。目安: variant 1.0 / abbr・expansion 0.9 / translation 0.85 / synonym 0.6。
- 出典ごとの `confidence` と、人が確認したかを示す `reviewed` を持つ。LLM 由来の候補は `reviewed=1` になるまで既定では展開しない。
- ユーザーごとの追加（自分のライブラリの訳語、手で足した語）は `library.sqlite` 側の別テーブル（番号付きマイグレーション）に置き、検索時にバンドル辞書と合わせる。

### 構築パイプライン（`scripts/synonyms/`、ビルド時だけ動く）

1. **取得**: Sudachi `synonyms.txt`、OEWN 2025 JSON、日本語 WordNet、Wikidata の抜粋をハッシュ付きで固定する。生データは gitignore し、生成した DB だけをコミットするか、ビルド時に作る。
2. **統合・正規化**: Sudachi のグループと OEWN / 日本語 WordNet の synset を、ILI と英字表記の一致でつなぐ。品詞をそろえ、正規化した形で重複を落とす。展開制御フラグ「展開しない」は守る。
3. **専門語を絞る**: 学術 OA コーパス（Europe PMC など）の原文から語を抜き、出てくる語の concept だけを残す。辞書のサイズとノイズの両方を抑えられる。ユーザーごとにライブラリが違うので、配布する辞書をユーザーのライブラリで絞ることはしない（ライブラリ由来の語はユーザー辞書へ）。
4. **LLM で拡張**: 足りない語・新語・言い換え・訳語の候補を出す（オフライン、教師モデル）。実行時にクラウド LLM は使わない。
5. **文脈での置換テスト**: コーパスの文 N 個で語を候補に置き換え、意味が保たれるかを LLM で判定する。一致率がしきい値未満なら落とす。
6. **評価と人手確認**: 頻度が高い語・略語は人が確認して `reviewed=1` にする。
7. **出力**: `synonyms.sqlite` と出典・ライセンス一覧（ライセンス画面用）。

## 5. 検索時の流れ

1. **正規化**（クエリと索引の両方）: NFKC、小文字化、全角半角、中黒・ハイフン・空白の統一、カタカナ語末の長音のゆれ（インターフェース／インタフェース）、ヴ／バ行などの軽い規則。索引側は `papers_fts` に正規化した影の列を足す（作り直せるキャッシュなので、マイグレーションで列を足して再構築する）。
2. **分割**: 空白で AND のトークンに分ける。日本語の連続した文字列は、まず辞書で最長一致する語を探し、見つからなければそのまま 1 語として扱う。
3. **展開**: トークンごとに concept を引き、同じ concept の語を `weight` 順に最大 8〜12 個まで取る。トークンの中は OR、トークン同士は AND。
4. **照合**: 今の LIKE で照合する。英字の短い略語（AR、UI など）は語の境界をチェックして、部分一致の誤ヒット（BUILD に UI が当たる、など）を防ぐ。
5. **並べ方**: 原語の一致 > 表記ゆれ > 略語・正式名称 > 日英 > 類義。どのフィールドで当たったか（タイトル > 本文）も重みに入れる。
6. **UI**: 検索欄の下に「『操作性』『usability』も含めて検索」のチップを出し、Popover で語ごとにオン／オフできる（UI_INTERACTION_PRINCIPLES に沿う）。結果には「類義語で一致」の印をつける。
7. **日英のフォールバック**: 辞書で見つからないクエリ語は、PLaMo で訳して展開に足す（`translation_cache` に入れる。サイドカーが起動していなければ使わない）。

⌘F（論文の中の検索）にも同じ展開器をあとで使える。最初はライブラリ検索だけにする。

## 6. 段階計画

| 段階 | 内容 | データ | 確かめること |
| --- | --- | --- | --- |
| **P0 土台** | 正規化（表記ゆれの規則）、展開できるクエリ構造（AND/OR）、順位付け、英字の境界チェック。辞書はまだ空 | なし | 単体テスト、今の検索結果が後退しないこと |
| **P1 日本語** | Sudachi を取り込む → 表記ゆれ・略語・類義。手で選んだ HCI / 学術略語のシード（約 200 語）。UI チップ | Sudachi + シード | 評価クエリ集で recall@10 と誤ヒット率 |
| **P2 日英** | 日本語 WordNet × OEWN（ILI）、Wikidata の専門用語ラベル、PLaMo の訳語フォールバック、ライブラリの対訳から取る訳語 | + OEWN、日本語 WordNet、Wikidata | 日本語で英語論文を、英語で日本語論文を引けるか |
| **P3 独自 DB** | LLM 拡張、置換テスト、人手確認、ユーザー辞書 | + LLM 候補 | 確認済みの語の精度、サイズ（目標は gzip 後 5 MB 以下） |

評価: 自分のライブラリから 80〜100 個のクエリと正解論文の組を作る（類義・日英・略語・表記ゆれを各 20 個ほど）。展開なしと展開ありで recall@10 と precision@10 を比べる。誤ヒットが増えた語は weight を下げるか、展開から外す。

## 7. 実装状況

- P0（2026-11-24）: `src/domain/search/`（`normalizeSearchText` と `buildSearchQuery`。展開器 `SearchExpander` はまだ空）、`papers_fts` を正規化した文字列で保存（schema v10）、順位付けと短い英字の単語境界。
- 速度（P0、node）: 300 本・本文約 40 MB で 1 語 35〜50 ms、短い英字 1 語 150 ms、2 語 190 ms。LIKE の回数は展開した語の数に比例するので、P1 で 1 語あたり 12 個まで展開すると重くなる。本文で照合する語を重みの高いものに限るか、語ごとの索引を作るかを P1 で決める。
- P1（2026-11-24）: 同梱辞書 `src/generated/synonyms.json`（4.55 MB、gzip 1.27 MB、遅延読み込みの別チャンク。56,348 概念 = Sudachi 18,278 / WordNet 37,851 / 独自 219）。`npm run build:synonyms` で再生成。
  - Sudachi は語彙素番号・語形種別・略語・表記揺れのフラグを関係に写す。企業名・人名・料理など論文と無関係な分野は除外。別語彙素どうし（学習 / 研究、学習 / study）は 0.6 で既定オフ。
  - WordNet は語義が 1 つの語だけ（`load` は 14 語義、認知は 13 語義なので使わない）。日本語 WordNet 2.0（2026-10 公開、WN-LMF）と OEWN 2025 を ILI でつなぐ。訳語 0.7（オン）、英語どうし 0.5（オフ）。
  - 専門語は一般辞書にほぼ無い（認知負荷・HCI・視線追跡・cognitive load はどちらの WordNet にも無い）ので `scripts/synonyms/curated.txt`（LLM 下書き）で補う。
  - 重み 0.65 以上を既定オン、それ未満は検索欄の「+N」Popover で候補として出す。2 文字の略語（AR・MR・SD）は長い形からの展開先にしない（`Mr.` などに当たるため）。展開で足した英単語は語頭一致（`load` が download に当たらない）。
  - 速度: 1 語ごとに SQL の `LIKE` / `instr` を並べると本文を語の数だけ読み直し、13 語で 0.6〜0.9 s。採点を SQL 関数 `versio_search_score`（JS）にまとめて本文を 1 行 1 回だけ読むようにし、語数に関係なく 150〜200 ms（300 本・約 40 MB、node）。
- P2（2026-11-24、#398 / #400）: ライブラリ辞書と PLaMo の訳語。
  - 取り込んだ論文の本文から `Long Form (ABBR)`（Schwartz & Hearst 2003）と `日本語（English）` の組を `extractAbbreviations` で抜き、SQLite `library_terms`（schema v11、論文ごとに最大 200 組）に置く。既存の論文は起動時の同期で `original.md` / `ja.md` から埋める。抽出規則を変えたら `LIBRARY_TERMS_VERSION` を上げると一度だけ抽出し直す。実データで、引用をまたぐ組（`; ` `et al`）と、数字の入った括弧（H1-H3）が誤りになったので除外した。
  - 同梱辞書にもライブラリ辞書にも無い語は、PLaMo のサイドカーが既に起動していれば日英どちらかに訳して 0.7 で足す（`plamo_server_if_running`。検索のためにモデルを読み込まない）。英語へ訳すときに `form: "plain"` を渡すと chat template が失敗する。
  - Wikidata のラベルは見送った。専門語の略語と訳語はライブラリ辞書と PLaMo で拾える。
- P3（2026-11-24、#399）: 検証と評価。
  - `scripts/synonyms/validate-curated.ts`: 独自用語（英日の組がある 214 概念）を PLaMo で、単体・定型文・手元の論文の文の 3 通りに訳して確かめる。185 概念が双方向で確認、10 概念が英→日だけ、19 概念が未確認（レビュー: `scripts/synonyms/review/curated-validation.tsv`）。PLaMo が使う正しい訳語 35 語を足し、誤訳（個人捏造・XR → 拡張現実・実施形態・紙）は足さない。
  - `scripts/synonyms/eval-search.ts` + `eval-queries.tsv`（40 クエリ、正解語は辞書とは別に書いた）、本番の `scoreFields` で照合:

    | コーパス | 正規化のみ R / P | 辞書あり R / P |
    | --- | --- | --- |
    | `test-data/real-papers` 113 本（英語のみ） | 0.24 / 0.97 | 0.97 / 0.98 |
    | 手元のライブラリ 9 本（原文と訳文） | 0.75 / 1.00 | 1.00 / 1.00 |

  - 初回は英語のみで適合率 0.76。上位語を `~` で類義語に並べていた（没入感 ~ presence、半構造化インタビュー ~ interview、文献レビュー ~ survey、参加者 ~ subject）のが原因で、行を分けて 0.98 に戻した。評価クエリは独自用語の分野と重なるので、ほかの分野の再現率はこれより低い。
- 1 文字語（2026-11-25、#442 / #448）: 蚊・数・め のような 1 文字の日本語は、部分一致だと 関数・ため などほぼ全文に当たる。`Intl.Segmenter("ja", { granularity: "word" })`（WKWebView と Node にある辞書ベースの単語分割。「関数|の|数|が」と分ける）で、索引時に 1 文字の単語だけを集めて `paper_words`（schema v12）に置く。1 文字の検索語は、そこで当たれば重み 1。熟語の中にだけ出てくる場合（目鼻の 目、木の実の 実）も取りこぼさないよう 0.2 倍で当て、単語として使う論文の下に並べる（題名で当たっても 4 × 0.2 = 0.8 で、単語の一致 1 を超えない）。分割は 10 万字で約 20 ms。
