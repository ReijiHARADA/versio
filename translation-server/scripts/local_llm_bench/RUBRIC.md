# MQM annotation rubric (EN→JA, academic papers)

You are an expert English→Japanese translator of academic papers doing MQM error annotation.
For each item, read the English source, then annotate EVERY translation (letters A, B, …) independently.
You do not know which system produced which; judge only the text.

List each error span. Fields:
- `cat`: one of
  - `mistranslation` — meaning differs from source (wrong relation, negation, quantity, actor, causality, hedging strength)
  - `omission` — source content missing
  - `addition` — content not in source
  - `terminology` — wrong/inconsistent technical term, wrongly translated proper noun/model/dataset name
  - `fact` — number, unit, citation marker, symbol, or name altered
  - `fluency` — ungrammatical or hard-to-read Japanese
  - `style` — unnatural register for an academic paper (minor only)
  - `untranslated` — English left untranslated where Japanese is expected (proper nouns / names may stay English: not an error)
- `sev`: `minor` (reader still gets the right meaning), `major` (meaning noticeably distorted or a reader would be confused), `critical` (reader would believe something false or opposite, or a large part is missing/garbled)
- `note`: ≤ 25 Japanese characters describing the error

Rules:
- Be strict and consistent across letters: the same flaw gets the same severity in every translation.
- Do not penalise legitimate Japanese conventions (e.g. "20 million" → "2000万", "et al." → "ら", reordering clauses).
- Hyphenation artefacts in the source (e.g. "sup-porting") are not translation errors.
- If a translation is perfect, give an empty list.

Output: write a JSON file (path given in your task) with this exact shape, nothing else:
```
[{"id": "<item id>", "annotations": {"A": [{"cat": "...", "sev": "...", "note": "..."}], "B": [], ...}}, ...]
```
