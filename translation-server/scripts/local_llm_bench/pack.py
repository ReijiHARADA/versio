"""Blind MQM packets: per row, all systems shuffled under letters. Writes judge/batch-NN.json + judge/key.json."""
import json, random
from pathlib import Path

HERE = Path(__file__).parent
J = HERE / "judge"; J.mkdir(exist_ok=True)
systems = {p.stem[4:]: json.loads(p.read_text())["rows"] for p in sorted(HERE.glob("out-*.json"))}
fixture = json.loads((HERE / "fixture.json").read_text())["rows"]
rng = random.Random(2026)
key, items = {}, []
for i, row in enumerate(fixture):
    names = list(systems); rng.shuffle(names)
    letters = "ABCDEFGH"[: len(names)]
    key[row["key"]] = dict(zip(letters, names))
    items.append({"id": row["key"], "source": row["source"],
                  "translations": {l: systems[n][i]["output"] for l, n in zip(letters, names)}})
for b in range(0, len(items), 5):
    (J / f"batch-{b // 5:02d}.json").write_text(json.dumps(items[b:b + 5], ensure_ascii=False, indent=1))
(J / "key.json").write_text(json.dumps(key, indent=1))
print(len(items), "rows,", len(systems), "systems,", (len(items) + 4) // 5, "batches")
