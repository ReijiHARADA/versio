# CAT-Translate evaluation checkpoint

Models: CyberAgent CAT-Translate 0.8B and 1.4B (MIT license). We used the
official chat-template and the documented English-to-Japanese instruction.
These are audit-only experiments; neither model is bundled or routed.

## Results

| model | input | output | verdict |
| --- | --- | --- | --- |
| 0.8B | `This is a small test sentence.` | English paraphrase (`This is a small test statement.`) | reject as deterministic EN→JA candidate |
| 0.8B | `The result was significant (p < 0.001).` | `結果は統計的に有意であった（p < 0.001）。` | one positive smoke only |
| 1.4B | `This is a small test sentence.` | prompt/instruction echo in Japanese, no source translation | reject pending template investigation |

The 0.8B full-fixture attempt was stopped after the first row because the
model was slow on CPU and produced non-translation output. The 1.4B smoke was
also stopped after the first row for the same reason. No quality or fallback
rate claim is made from these partial runs.

Next evaluation, if resumed, must first establish deterministic language
control on several short ordinary and scientific sentences, then use the same
12-row model-quality fixture and manual source-claim review.
