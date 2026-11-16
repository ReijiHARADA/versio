"""Deterministic, verifiable checks only (no legacy Versio gate).

1. breakdown: output is not a usable Japanese translation
   - empty / mostly non-Japanese (echo or untranslated) / meta preamble /
     length ratio outside a wide band (truncation or runaway generation)
2. preservation: facts a reader must be able to trust, checked exactly
   - numbers (incl. decimals, %), bracket citations [n], years, URLs/DOIs
"""
import json, re, sys, unicodedata
from pathlib import Path

HERE = Path(__file__).parent
JA = re.compile(r"[぀-ヿ一-鿿]")
META = re.compile(r"^(?:here is|translation|翻訳[:：]|以下(?:は|に).*翻訳|日本語訳[:：])", re.I)


def norm(s):
    return unicodedata.normalize("NFKC", s)


def facts(src):
    s = norm(src)
    out = set()
    out |= {m for m in re.findall(r"https?://\S+|10\.\d{4,9}/\S+", s)}
    s2 = re.sub(r"https?://\S+|10\.\d{4,9}/\S+", " ", s)
    for m in re.findall(r"\[(\d+(?:\s*[,–-]\s*\d+)*)\]", s2):
        out |= {f"cite:{n}" for n in re.findall(r"\d+", m)}
    s2 = re.sub(r"\[\d+(?:\s*[,–-]\s*\d+)*\]", " ", s2)
    for n, unit in re.findall(r"(?<![\w.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![\w])(?:\s+(million|billion|thousand))?", s2):
        out.add(f"num:{n.replace(',', '')}" + (f":{unit}" if unit else ""))
    return out


def kept(fact, out):
    o = norm(out)
    if fact.startswith("cite:"):
        return re.search(rf"(?<!\d){fact[5:]}(?!\d)", o) is not None
    if fact.startswith("num:"):
        o = re.sub(r"(?<=\d),(?=\d{3}(?!\d))", "", o)
        n, _, unit = fact[4:].partition(":")
        alts = [n]
        if unit:
            v = float(n) * {"thousand": 1e3, "million": 1e6, "billion": 1e9}[unit]
            f = lambda x: str(int(x)) if x == int(x) else repr(round(x, 4))
            alts += [f(v), f(v / 1e4) + "万", f(v / 1e8) + "億", f(v / 1e3) + "千"]
        return any(re.search(rf"(?<![\d.]){re.escape(x)}(?![\d])", o) for x in alts)
    return fact in o


def check(src, out):
    o = out.strip()
    ja = len(JA.findall(o))
    letters = len(re.findall(r"[A-Za-z]", o))
    reasons = []
    if not o:
        reasons.append("empty")
    elif ja < 0.5 * (ja + letters / 2):
        reasons.append("not_japanese")
    if META.search(o):
        reasons.append("meta_preamble")
    ratio = len(o) / max(1, len(src))
    if o and not (0.2 <= ratio <= 1.0):
        reasons.append(f"length_ratio:{ratio:.2f}")
    f = facts(src)
    lost = sorted(x for x in f if not kept(x, o))
    return reasons, f, lost


def main():
    rows_out = []
    for p in sorted(HERE.glob("out-*.json")):
        d = json.loads(p.read_text())
        broken, total_f, lost_f, rows_lost = 0, 0, 0, 0
        for r in d["rows"]:
            reasons, f, lost = check(r["source"], r["output"])
            r["breakdown"], r["lost_facts"] = reasons, lost
            broken += bool(reasons)
            total_f += len(f); lost_f += len(lost); rows_lost += bool(lost)
        s = d["summary"]
        s.update(breakdown=f"{broken}/{len(d['rows'])}", fact_retention=round(1 - lost_f / max(1, total_f), 3),
                 rows_with_lost_fact=rows_lost)
        p.write_text(json.dumps(d, ensure_ascii=False, indent=1))
        rows_out.append(s)
    for s in rows_out:
        print(json.dumps({k: s[k] for k in ("name", "breakdown", "fact_retention", "rows_with_lost_fact", "mean_sec", "tok_per_sec", "peak_rss_mb") if k in s}))


main()
