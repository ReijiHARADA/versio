"""Unblind MQM results. Penalty: minor 1, major 5, critical 10 (MQM standard weights),
reported per 100 source words. Also counts rows with any major/critical error."""
import json, re
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
J = HERE / "judge"
W = {"minor": 1, "major": 5, "critical": 10}
key = json.loads((J / "key.json").read_text())
src = {r["key"]: r["source"] for r in json.loads((HERE / "fixture.json").read_text())["rows"]}
pen, words, bad_rows, crit, cats, done = defaultdict(float), defaultdict(int), defaultdict(int), defaultdict(int), defaultdict(lambda: defaultdict(float)), set()
for p in sorted(J.glob("result-*.json")):
    for item in json.loads(p.read_text()):
        done.add(item["id"])
        nw = len(re.findall(r"\S+", src[item["id"]]))
        for letter, errs in item["annotations"].items():
            sysname = key[item["id"]][letter]
            words[sysname] += nw
            sevs = [e.get("sev") for e in errs]
            for e in errs:
                w = W.get(e.get("sev"), 0); pen[sysname] += w; cats[sysname][e.get("cat")] += w
            bad_rows[sysname] += any(s in ("major", "critical") for s in sevs)
            crit[sysname] += sevs.count("critical")
print(f"items judged: {len(done)}/40")
summ = {json.loads(p.read_text())["summary"]["name"]: json.loads(p.read_text())["summary"] for p in HERE.glob("out-*.json")}
rows = sorted(pen, key=lambda s: pen[s] / words[s])
print(f"{'system':15} {'MQM/100w':>8} {'major+rows':>10} {'critical':>8} {'facts':>6} {'sec':>6} {'RSS':>6}  top error cats")
for s in rows:
    top = ", ".join(f"{c}:{v:.0f}" for c, v in sorted(cats[s].items(), key=lambda x: -x[1])[:3])
    m = summ.get(s, {})
    print(f"{s:15} {100 * pen[s] / words[s]:8.2f} {bad_rows[s]:10d} {crit[s]:8d} {m.get('fact_retention', 0):6.3f} {m.get('mean_sec', 0):6.1f} {m.get('peak_rss_mb', 0):6d}  {top}")
