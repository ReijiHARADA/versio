# Translation failure triage

This note is generated from the persisted v69 fallback attribution and is the starting queue for the next quality iteration.

| Cause | Count | Evidence | Next experiment |
|---|---:|---|---|
| A: complete source, model inadequacy | 9 | canonical prose matched layout; no structural warning | compare whole-unit, safe clause units, and an independent local/free model while preserving invariant checks |
| D: structure mixing | 2 | prose block contains list/structure boundaries | repair block boundaries before translation; measure source reconstruction |
| E: scientific/layout contamination | 3 | missing/unexpected scientific invariants or orphaned identifiers | isolate scientific spans and table/equation regions before model input |

Seven failures are at least 1,000 characters and three are under 500 characters. Therefore a single max-length or retry change cannot explain the full tail. The current production fallback remains 14/48 ordinary-body rows (29.17%) in the last complete corpus run; the v75 run was intentionally partial (1 paper, 8 rows) and is not a new corpus metric.

The next change must record source, model input, output, and quality reasons per unit, then compare A/D/E cohorts separately. Acceptance must remain invariant- and semantics-gated; increasing fallback by rejecting valid prose is not an improvement.

The current attribution inventory contains 13 `sourceIntegrity=provisional-pass`
rows and one `sourceIntegrity=review` row (the latter is the list-mixing
candidate). All 14 rows are canonical `paragraph` nodes on a single page; this
is evidence about the sampled failures, not proof that the complete corpus has
clean extraction.

The v79 thermal clean-source comparison adds a stronger A-cohort observation:
whole-source and semantic-units-joined inputs both fail on the same first
253-character unit after greedy, beam, and rescue attempts. This rules out a
simple whole-paragraph join as the sole fix for that fixture; the remaining
candidate is model adequacy or a better semantic split that preserves the full
claim.

The v79 rescue-units-joined condition also failed on the same unit, so the
existing rescue splitter does not recover this case. This is a reproducible
model-side failure under three input layouts, not evidence that the quality gate
alone should be relaxed.

The linguistics fixture reproduced the pattern independently: both whole-source
and semantic-units-joined variants failed on the first unit containing BERT, with
the same `implausibly_short` rejection. Its rescue-unit list was empty and is
now correctly omitted rather than submitted as an empty model input.

The E-cohort raw-decode capture adds a concrete restoration finding. In the
`power-over-skin` unit, `RF` and `TQP3M9009` are both protected before decode,
but the model emits neither placeholder. The legacy restore path appended both
missing values at the end, yielding `RFTQP3M9009`. The production path now uses
strict restoration and rejects a dropped placeholder before that malformed text
can be returned. The raw evidence is preserved in
`translation-server/benchmarks/translation-scientific-placeholder-debug-v72.json`.

A cached free alternative (`Helsinki-NLP/opus-mt-en-jap`) was evaluated on the
seven current source-fallback rows. Every output was truncated or nonsensical,
so it is not safe as a cascade candidate; the raw comparison is saved in
`translation-server/benchmarks/model-cascade-opus-v72.json`.

The cached free `facebook/m2m100_1.2B` model was also run over the same seven
rows. It produced longer text than opus-mt but still had semantic drift,
technical-term corruption, repetition, and generation-cap truncation. It is
not safe as an automatic cascade without a semantic validator; results are in
`translation-server/benchmarks/model-cascade-m2m100-1.2b-v72.json`.

The cognitive fixture is the complementary failure: whole and semantic inputs
both pass the current gate (180 input / 230 output tokens), but both omit the
source's final A/B-versus-C/D condition. This is a concrete unsafe semantic
omission that length and degeneracy checks do not catch; it should feed the
content-coverage calibration set before any gate relaxation.

The persisted A-cohort unit inventory gives the next experiment a bounded
scope. Current production segmentation yields the following unit lengths
(characters) for the affected blocks: thermal-earring `253, 209, 191, 206,
200`; cognitive `59, 147, 101, 138` and `269, 50, 100, 137, 187`; linguistics
`211, 163, 342, 224, 236` and `152, 250, 208, 168, 203, 248, 261`;
neuroscience `67, 188, 165, 162, 187, 131, 143, 86, 260` and `343, 174,
310, 282, 91`. This shows that the A failures are not explained by one fixed
length threshold. The next implementation should instrument per-unit decode
outcomes and test a generic, conservative semantic rescue for the 300+ character
units, while retaining the source fallback for any unit that remains unsafe.

### 2026-09-15: relation-loss signal refreshed

全manual review完了後にcoverage evaluatorを再実行し、translated ordinary-body 75 rowsで invariant loss 7、negation loss 4、contrast loss 4、ordinal-claim loss 6を検出した。sentence/length coverageの低値は今回0件だったが、これは意味保持を保証しない。relation signalsはaudit-onlyのまま維持し、production routing変更の前にmanual truthとのprecision/recallを測定する。

### 2026-09-15: relation signal calibration

`reports/relation-calibration-v1.json` に、invariant・negation・contrast・ordinal・統合loss signalとseverity>=2誤訳のTP/FP/FN/TNを保存した。手動レビュー済みのaccepted rowsに限定したauditであり、reader-visible fallbackを含む全体品質の代替ではない。precision優先でthresholdを決めるまでproduction gateへ接続しない。

### 2026-09-15: three-model cascade simulation

MADLAD baselineにM2M100 1.2BとCAT-Translate 1.4Bを加えた34候補/17 sourceのaudit-only選択を実施し、`test-data/real-papers/reports/selective-cascade-three-model-v1.json` に保存。relation gateを有効にすると16 rowsが選択、1 rowは安全信号不足でreject、hard signal passは13 rows。候補を選べても意味正解とは限らないため、本番cascadeは未導入。

### 2026-09-15: semantic review prioritization

severity>=2のaccepted rowsに対し、coverage relation lossとscientific invariant lossを結合した再現可能な優先順位付けを追加した。`semantic-review-priority-v1.json` に保存し、次のcandidate比較・手動再確認の入力にする。単純なrelation lossだけではprecision不足だったため、自動rejectには使わない。

### 2026-09-15: held-out candidate semantic review

Baseline fallback 3件に対するM2M100 1.2B / CAT-Translate 1.4B候補6件を原文比較した。hard signalを通過していても、6件すべてsemantic shift・omission・terminology errorを含み、自動cascade採用可能な候補は0件だった。MiniLMのfull similarityは0.633〜0.871、source sentence最低値は0.324〜0.789だったが、`step-to-charge`の専門用語変質を高スコアで見逃した。したがってembedding値単独のcandidate gateは不十分で、claim/terminology保持を含むaudit評価が必要である。詳細は`reports/cascade-candidate-review-v1.json`と`reports/cascade-candidate-semantic-v1.json`。

### 2026-09-16: flattened table extraction finding

Publisher横断の境界診断で見つかった`wear-scale` p.14を再現確認した。相関行列は各行が単一native itemとして抽出されるため、既存の`tableLike`（同一line内の複数item）を通らず、paragraph列として残る。末尾では表ヘッダ、脚注、通常本文まで同一blockに連結される。numeric-rowをgeneric candidateで個別にtable化する試作は実canonicalで有効性を確認できず、precisionを証明できないため撤回した。次の実装対象は、page/column/y近接と反復numeric形状からrow clusterを作り、caption・本文境界を含むregionとしてresolverへ渡すこと。

### 2026-09-19: 300-block manual audit checkpoint

The expanded corpus review is now complete at 300/300 blocks. The authoritative aggregate reports **45.33% extraction-induced errors**, **34.33% semantic errors**, **44.37% unsafe false accepts**, and **19.62% false rejects**. This confirms that the next work must reduce both extraction damage and over-fallback; tightening the gate alone would fail the UX requirement.

Prioritized general fixes supported by the audit:

1. Repair logical paragraphs across page/column boundaries before translation-unit validation, using punctuation, continuation morphology, and geometry while excluding headings, figures, tables, and chrome.
2. Split figure/table/affiliation/license chrome at line grouping boundaries and expose table regions as a structured fallback rather than empty prose.
3. Calibrate the quality gate on complete coherent paragraphs (including abstracts and methods) so they are not rejected solely because they are long or contain scientific notation.
4. Preserve scientific tokens and citations while adding content-coverage signals for omissions; use them for selective retry/fallback only after measuring precision on the frozen reviewed set.

No paper-specific rule or hallucinated-term blacklist is justified by the audit. The next implementation checkpoint must record before/after metrics against this 300-block baseline and keep the baseline immutable.

### v312 pre-model fallback attribution (2026-09-23)

The v309 fresh 52-paper run has 244 ordinary-body rows, of which 67 are
reader-visible fallbacks. Only three are pre-model fallbacks (1.23%). Their
sources are respectively a continuation fragment beginning with `(b)`, a
hyphenated extraction with visibly malformed wording, and an incomplete
continuation/title-like fragment. They share structural warnings and should
not be sent to MADLAD merely to lower the fallback percentage. The remaining
64 post-model fallbacks are the current optimization target; repeated groups
include strict server source fallback, protected-token restore failures, and
semantic/invariant gate failures. No paper-specific rule is justified.

### Vector-figure diagnostic checkpoint (2026-09-19)

`PDF_LAYOUT_DEBUG=1` now emits both the reconstructed block inventory and per-candidate geometry. Running the compact-label regression still produces 23/24 passing tests, with no candidate diagnostic for the failing vector-figure evidence. This establishes that the failing input is separated or discarded before `vectorFigureLabelEvidence()` is evaluated. The next change should instrument native line grouping immediately after `reconstructDocument()` and compare the retained lines/items against the source fixture. Do not lower the vector-label threshold until that evidence is available.

### 2026-10-05: 114-paper fresh audit baseline

The resumed fresh audit evaluated 113 cached PDFs (one selected catalog item, `precious-materials`, was unavailable), 954 units total. Reader-visible fallback was 624/954 (65.4% overall) and 111/360 (30.8%) for ordinary-body prose. Ordinary-body fallback attribution was: pre-model 4; post-model 107, including 55 server/model failures, 32 quality-gate failures, 17 extraction/structure cases, and 7 other cases. This is a baseline, not a semantic acceptance proof: automatic acceptance still requires manual review.

The largest actionable production-side cluster is server/model or restoration failure (55 ordinary-body rows), followed by quality-gate rejection (32). The 17 extraction/structure cases should be repaired upstream rather than admitted by relaxing translation checks. The 4-unit benchmark resume avoided the earlier long-request hang and preserved stable checkpoints.

### 2026-10-05 protection fixture evidence

既存の v1010 protection fixture 3件を再集計し、production変更なしで保護の影響を固定した。raw/current の同一source・同一generation条件で、current armの失敗は `protected citation placeholder dropped by model`（`SI Appendix`、`Section 6.1`、`CFG` など）として記録されている。これは「引用を保護すべきでない」という結論ではなく、opaque placeholderをモデルが保持しない失敗層が存在する証拠である。詳細は `test-data/real-papers/reports/protection-fixture-analysis-v1.json`。

### 2026-10-05 segmented protection trade-off

既存のheld-out segmented 18-block risk summaryも確認した。raw armは numeric omission 7/18、citation omission 8/18、minimal armはそれぞれ5/18、5/18、current protectionは0/18、0/18だった。一方、3 armとも decode error は1/18で、current protectionは事実保持を改善する代わりにplaceholder復元失敗という別のfallback経路を持つ。したがって、保護を一括解除する変更は採用せず、opaque structural referenceだけを対象に段階的なrescueを比較する。

### 2026-10-05 rescue-stage evidence

`protection-rescue-diagnostic-v1.json` の3ケースを再確認した。placeholder drop 2件（`SI Appendix`を含む引用、`VR`）は `unprotected_retry` で2/2成功し、rawと同じ出力になった。一方、placeholderなしの長文は current / unprotected retry / raw の全条件で退化出力になった。これは「保護解除を常時行う」より、placeholder drop時だけ、失われたspanを限定的に可視化して再試行する現行方針が安全であることを示す。`atomic_first_span` は一部で別の退化を起こすため、既定経路には採用しない。

### 2026-10-05 Qwen2.5 14B cascade probe

ローカルOllamaを同一shellで一時起動し、既存held-outの3 post-model rowsを `qwen2.5:14b` で監査した。受理は1/3。1件は `inconsistent repeated lexeme`、1件は未翻訳英語・foreign-script混入・科学的invariant欠落で拒否された。受理1件は引用・数値を保持したが、3件のみで本番統合の根拠にはならない。Ollamaはベンチマーク終了後に停止済み。

### 2026-10-05 Qwen2.5 14B held-out 5-row result

同一held-out cohortの残り2 rowsも同条件で実行し、合計5 rowsに拡張した。Qwen2.5 14Bは **1/5 accepted**。4 rowsはquality gateで拒否され、内訳は反復語、未翻訳英語/foreign-script、科学的invariant欠落など。受理1件は引用・数値保持を確認したが、現時点でMADLADを置換できる品質証拠ではない。結合report: `test-data/real-papers/reports/selective-cascade-qwen25-14b-v1-combined.json`。

### 2026-10-05 long-unit segmentation diagnostic

server/protection fallback 55 rowsをproduction `segment_for_translation()`で再分割した。300文字以上47 rowsのうち、単一unitのまま残ったのは2 rowsだけ（図表由来のflattened numeric row 1件、抽出品質が疑われる本文1件）。残り45 rowsは3〜22 unitsへ分割されていた。したがって、ordinary fallbackの大部分は「長文を1回で送った」だけでは説明できず、分割後unitのdecode・placeholder・quality gateが主な次の調査対象になる。詳細: `test-data/real-papers/reports/long-unit-segmentation-diagnostic-v1.json`。
## 2026-10-05 — figure-label projection follow-up

The remaining long single-unit diagnostic row was not ordinary prose: it was a
flattened vector figure label stream (`1×1 Conv`, `Rate`, `Channel`). The
resolver already emitted `vector-figure-label-cluster` evidence, but projection
still exposed `other` nodes to translation. Projection now omits `other` nodes
with vector/chart/image-label evidence while retaining other native `other`
text. The medical-image fixture no longer produces that flattened row as a
translation block; the existing pipeline and 28 projection tests remain green.

## 2026-10-05 — direct model check for Figure-reference fallback

The `speechin` ordinary-body fallback was reproduced against the ready local
server without PDF extraction. The complete source produced `予備実験の結果に基づき…
首に銀の鎖を巻き付ける。 (Figure 1(a))`; the second sentence alone produced
the same omission of `The necklace case`. This is therefore a MADLAD decode
failure, not a source-unit join or figure-placeholder restore failure. A
semantically equivalent normalized input (`The necklace case hangs around the
neck ...`) preserved the subject, but introducing such rewrites globally would
be unsafe; it remains a candidate for a separately evaluated English
normalization layer rather than a production patch.

The medical-paper re-audit after the simplified-CJK server rescue reduced its
ordinary-body fallback from 2/2 to 1/2 (same paper, new report
`post-simplified-cjk-medical-v1`). The remaining ordinary-body failure is a
separate mixed-script decoder case; this is a one-paper effect, not a corpus
fallback-rate claim.
## 2026-10-05: quoted ordinary labels caused false fallback

The 12-paper fresh cohort isolated the only ordinary-body fallback in the
sample (`dont-mind-me`) to quoted-label protection. `“Normal”` and `“Awkward”`
were treated as coined technical names, so the model's valid Japanese labels
were rejected as missing-name output and the unit fell back after beam rescue.
The generic policy now protects quoted spans only when they have identifier-like
spelling or a naming frame (`dubbed`, `called`, `named`, `prototype`,
`interface`, `system`). Direct same-server replay changed all four affected
units from partial fallback to accepted Japanese output. The server/cache
identity is `quality-v36-...-quoted-label-policy`.
# Partial-unit projection policy (2026-10-05)

When the translation server returns `translation_units` and `partial_unit_texts`
with a one-to-one mapping, the client may persist translated units while
keeping failed units as their exact English source. This is recorded as
`translationOutcome: partial_source_preserved` with
`partialFailedUnitIndices`. The projection is rejected when the mapping is
missing, malformed, or all units fail; titles and section headings remain
all-or-nothing. This policy preserves source facts and avoids replacing a
failed unit with a fluent guess. Partial results must be counted separately
from fully translated blocks in future audit reports.
