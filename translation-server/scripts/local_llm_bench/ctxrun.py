"""PLaMo variants on the 40-paragraph fixture: form=plain, and form=plain + previous paragraph as context."""
import json, sys, time, urllib.request
from pathlib import Path
HERE = Path(__file__).parent
DOCS = Path("/Users/harada/Desktop/MyProjects/projects/versio/app/test-data/extraction-audit/baseline-fieldgold/docs")
variant, port = sys.argv[1], sys.argv[2]
rows = json.loads((HERE / "fixture.json").read_text())["rows"]
docs = {}
def prev_text(r):
    pid, bid = r["key"].split(":", 1)
    d = docs.setdefault(pid, json.loads((DOCS / f"{pid}.json").read_text()))
    blocks = [b for b in d["blocks"] if b["translatable"]]
    i = next(i for i, b in enumerate(blocks) if b["id"] == bid)
    return blocks[i - 1]["text"] if i > 0 else ""
out = []
for r in rows:
    kw = {"source_lang": "en", "target_lang": "ja", "form": "plain"}
    if variant == "ctx":
        c = prev_text(r)
        if c: kw["context"] = c
    body = {"messages": [{"role": "user", "content": r["source"]}], "temperature": 0, "max_tokens": 4096,
            "chat_template_kwargs": kw, "stop": ["<|plamo:tag|>", "<|plamo:bos|>"]}
    t0 = time.time()
    req = urllib.request.Request(f"http://127.0.0.1:{port}/v1/chat/completions", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as resp:
        o = json.loads(resp.read())["choices"][0]["message"]["content"].strip()
    out.append({**r, "output": o, "sec": round(time.time() - t0, 2)})
secs = sorted(x["sec"] for x in out)
name = f"plamo3-2b-{variant}"
(HERE / f"out-{name}.json").write_text(json.dumps({"summary": {"name": name, "mean_sec": round(sum(secs)/len(secs), 2)}, "rows": out}, ensure_ascii=False, indent=1))
print(name, "done", round(sum(secs)/len(secs), 2))
