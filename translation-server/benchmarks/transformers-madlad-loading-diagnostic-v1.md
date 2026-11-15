# MADLAD Transformers loading diagnostic v1

Generated 2026-09-22. Same local checkpoint, tokenizer, dtype (`torch.bfloat16`), device (`mps`), generation settings, and five fixed Versio fixtures.

## Runtime conclusion

- **Transformers 5.17.0 is affected by the loading bug.** `encoder.embed_tokens` matches `lm_head.weight` (absmax 2.140625), while decoder matches `decoder.embed_tokens.weight` (absmax 253). All five fixtures show degenerate output, repetition, non-Japanese text, or missing EOS.
- **Transformers 4.57.6 loads the input embedding correctly.** Encoder and decoder both match `decoder.embed_tokens.weight` (absmax 253), `lm_head` remains separate (absmax 2.14), and all five fixtures produce Japanese output with EOS.
- Production remains pinned to 4.57.6; no 5.x change was made.

## Checkpoint mapping

| Runtime | tie_word_embeddings | encoder == decoder | encoder matches decoder checkpoint | encoder matches lm_head |
|---|---:|---:|---:|---:|
| 5.17.0 | True | False | False | True |
| 4.57.6 | False | True | True | False |

## Fixture comparison

| Fixture | 5.17 input→output | 5.17 EOS | 4.57 input→output | 4.57 EOS |
|---|---:|:---:|---:|:---:|
| group_cardinality_known_false_accept | 70→156 `ะะะะ ะะ ั้ ะ ะ ั ะ ๊ ๊ ะ ้ ้ ๊ ้ ะะ้ ้้ ้ะ ้ะะ ้้ะ ๊ะ ๊า ๊าะ ้่ ้ ่ ้้้ ๊าาาา ้ะ้ ๊ะะ ๊้้้้ง ้้ง้้้ย ้ะ๊ะะ้้้ะ้้ ง้้งง้้ ่้้้ว้้้่้้วววว ้้ว ้วว ววว้วว้้วp=0.124(MCQ: U=727.0, z=−1` | True | 70→50 `両群の中学校卒業試験成績は有意差がなく,ルール集合AとBは各々の記憶作業に関して同等の記憶成績を示した(MCQ: U=727.0, z=−1.04, p=0.30; CT: U=801.0, z=−0.31, p=0.741; FR: U=811.5, z=−0.23, p=0.841)。p=0.124` | True |
| participant_total_scope_known_fallback | 38→73 `ě ě ĕ ě ă ă ě ę ě ė ě ê ě ế ě ẹ ě ẽ ě ề ě ể ě ệ ě ẻ ě ů ě ű ě ŭ ě ỹ ě.` | True | 38→53 `各分野の８８名の参加者をオスナブリュック大学から招聘し，参加者に対して部分的な授業クレジットまたは５ユーロを与えた。` | True |
| parallel_clause_phrase_repetition | 32→39 `ü ü ü ü Ü ü ü ü ű ü ü üü ü ü ü ə ü ü ü ä ü ü ü ı ü ü ü u ü ü ü e ü ü ü.` | True | 32→57 `実験の設計と実施の方法，実験の結果を評価する方法，実際の実験を行う方法，実証可能な研究問題の提起法，観察の作成と測定法を教える。` | True |
| dense_statistical_results | 28→108 `ęęęęėęęęêęęęăęęęəęęęěęęęĕęęęįęęęąęęęőęęę ęęėėęęėįęęėąęęėăęęėêęęėəęęėĕęęėőęęėěęęė ęęăėęęăəęęăêęęăăęęăěęęăĕęę(MCQ: H(2) = 6.06, p = 0.048; CT: H(2) = 17.01, p < 0.001; FR: H(2) = 9.5` | False | 28→39 `記憶性能に関しては,3群間で記憶タスク(MCQ: H(2) = 6.06, p = 0.048; CT: H(2) = 17.01, p < 0.001; FR: H(2) = 9.52, p = 0.009)において有意差が認められた。` | True |
| ordinary_body_historical_post_model_fallback | 103→258 `은 은 는 은 을 을 은 에 은 으 은 え 은 이 은 에서 을 에 을 에서 에 에 에서 에서 은. 2019.01.15.-0001:0000 2020.01:59:00 ςηηηηεεεε ςηεηεε εεεε ε εεε ε ςη εεεηε εε εεηεη εεηηε ε εηεεη ε εεη εηεηη εε εηε εη εη εε` | False | 103→94 `前節で，モデル性能の分析から，文法の判別的重要性はレジスタ間で異なることが示唆された。 また，このモデルを定性的に解析した。 また，語彙文法情報のみが高い性能を示した旅行ブログと討論フォーラムの３つのレジスタからの例を示した。` | True |

Raw artifacts:

- `transformers-5.17.0-diagnosis.json`
- `transformers-4.57.6-diagnosis.json`

The 5.17.0 output is already broken at decode time; this is not a PDF extraction, microbatch join, or postprocess artifact.
