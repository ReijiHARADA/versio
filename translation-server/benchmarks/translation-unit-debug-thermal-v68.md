# Thermal fixture unit-failure diagnosis (v68)

The server was run with `TRANSLATION_UNIT_DEBUG=1` and the fixed thermal-earring
source was sent through `/translate`.

- Production units: 3
- Failing unit: index `0`
- Source length: 253 chars / 38 words
- Failure: `degenerate translation output`
- First rejected decode: `耳の温度から体温を直接推定するには,さらに研究が必要である。`
- Beam retry: `耳の温度から体温を直接推定するには,さらなる研究が必要である。`
- Rescue retry: first rescue unit was rejected as `implausibly_short`

The server emitted `[TRANSLATION_UNIT_FAILURE] index=0 chars=253 words=38`.
This confirms that one unit failure escalates to the paragraph-level source
fallback in the current production path. The server was stopped after capture.
