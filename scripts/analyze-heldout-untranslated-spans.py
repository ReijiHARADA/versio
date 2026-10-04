#!/usr/bin/env python3
"""Diagnose English spans left inside Japanese held-out translations.

Audit-only: it never changes translations or production policy. The report
classifies long Latin spans by surrounding delimiters so rescue work can be
based on structure rather than a vocabulary blacklist.
"""
import json, re

src = "test-data/real-papers/reports/pending-heldout-madlad-v1-quality.json"
out = "test-data/real-papers/reports/pending-heldout-untranslated-spans-v1.json"
data = json.load(open(src, encoding="utf-8"))
rows = []
latin = re.compile(r"(?:[A-Za-z][A-Za-z0-9'’(),.;:/+\-–—% ]{10,})")
for row in data["results"]:
    translation = row.get("translation", "")
    spans = []
    for match in latin.finditer(translation):
        text = re.sub(r"\s+", " ", match.group(0)).strip(" ,.;")
        if len(text.split()) < 3:
            continue
        start, end = match.span()
        before, after = translation[:start], translation[end:]
        if before.rstrip().endswith(("(", "（", "「", "『")):
            kind = "delimited-opening"
        elif after.lstrip().startswith((")", "）", "」", "』")):
            kind = "delimited-closing"
        elif re.search(r"(?:Figure|Table|Section|Appendix)\s*\d", text, re.I):
            kind = "structural-reference"
        elif re.search(r"\b(?:and|or|the|of|to|in|for|with|which|that)\b", text, re.I):
            kind = "prose-span"
        else:
            kind = "identifier-like"
        spans.append({"text": text, "charStart": start, "charEnd": end, "kind": kind})
    if spans:
        rows.append({"key": row["key"], "source": row["source"], "translation": translation, "spans": spans, "qualityReasons": row["quality"]["reasons"]})
report = {"version": "pending-heldout-untranslated-spans-v1", "source": src, "rowCount": len(rows), "rows": rows}
json.dump(report, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(json.dumps({"rows": len(rows), "spans": sum(len(r["spans"]) for r in rows), "output": out}, ensure_ascii=False))
