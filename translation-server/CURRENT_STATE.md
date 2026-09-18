
## 2026-09-23T00:30: atomic restore harness fix

- v79診断ハーネスのatomic restore hookがMADLADの全角placeholderを扱えず、`ZZREF1ZZ`残留を誤って記録していた。
- 全角 `ＺＺＲＥＦ１ＺＺ` も復元する処理を追加し、atomic条件を同一process・同一modelで再実行。引用グループが原文どおり復元され、errorなし。
- これは診断ハーネスのみの修正でproduction protectionは変更していない。

## 2026-09-23T01:30: fixed-fixture four-condition final

- 修正済み診断ハーネスで4条件を同一process・同一modelで再実行。
- whole_unprotected: input 64 / output 86 tokens、正常。ただし引用・数値が全角化。
- whole_current_protection: 32 / 44、正常。引用グループ保持。
- whole_atomic_author_year: 32 / 44、正常。引用グループが原文どおり復元。
- unit_0_current_protection: 32 / 44、正常。
- 全条件 errorなし、今回の固定英文ではhallucinationなし。semicolon segmentationが主要原因である証拠は得られず、atomic protectionは復元品質の補助策として有効。
