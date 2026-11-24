---
type: Report
title: 参考文献の文字列から論文を探す（DOI / arXiv ID なし）
description: Reader の「題名で探す…」の検索方式と、field-gold 参考文献での的中率。
tags: [reader, references, crossref, openalex]
status: stable
generated: 2026-11-24
---

# 参考文献の文字列から論文を探す

DOI も arXiv ID も書かれていない参考文献で、Reader の「題名で探す…」が使う方式と測定結果。

## 方式

1. Crossref `query.bibliographic` に参考文献の文字列をそのまま渡す（上位 5 件）。
2. 合格する候補が無ければ、文字列から題名を推定して（`guessReferenceTitle`）OpenAlex の `title.search` で探す（上位 5 件）。arXiv にしか無い論文はここで見つかる。
3. 候補の判定（`pickReferenceMatch`）: 題名の 90% 以上が参考文献に含まれ、年が ±1 年以内、筆頭著者の名前が参考文献にある。複数が合格したら、参考文献にある誌名と一致するものを優先し、次に出版版をプレプリントの DOI（medRxiv・PsyArXiv など）より優先する。
4. 合格した候補はユーザーの確認（「この論文ですか？」）を経てから DOI の取り込みに渡す。

OpenAlex の `search=` に参考文献の文字列をまるごと渡す方式は、150 件中 3 件（2%）しか当たらず遅いので使わない。

## 結果（2026-11-24、`npx tsx scripts/reference-search/eval.ts --limit=150 --source=both`）

| セット | 件数 | 候補を出した | 正しい | 誤り |
| --- | --- | --- | --- | --- |
| A: Europe PMC（正解 DOI あり） | 150 | 134（89%） | 131 | 3（正解側の DOI の誤り 2、同じ論文の別 DOI 1） |
| B: arXiv の参考文献（arXiv ID を消して検索） | 75 | 63（84%） | 36 は元の arXiv ID と一致、27 は出版版（目視で正しい） | 0 |
| C: arXiv の参考文献（ID なし） | 75 | 52（69%） | 目視で 30 件確認、すべて正しい | 0 |

Crossref だけだと B が 36%、C が 61%。OpenAlex の題名検索で B と C が伸びる。

## 注意

- 送るのは参考文献の文字列だけで、ボタンを押したときに限る。
- 日本語の参考文献は測っていない（Crossref・OpenAlex にあまり載っていない）。
- 見つかっても PDF がオープンアクセスでなければ取り込めない。
