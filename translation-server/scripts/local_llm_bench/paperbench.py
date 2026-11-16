"""Whole-paper wall time: translate every translatable block of one audit-dump paper
with N concurrent requests (Versio's frontend default is 8).

  python3 paperbench.py --doc <audit doc json> --name X --kind madlad|plamo [--conc 8] [--port 8766 --token T]
"""
import argparse, json, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).parent


TOKEN = None


def post(url, body):
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=1800) as r:
        return json.loads(r.read())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc", required=True); ap.add_argument("--name", required=True)
    ap.add_argument("--kind", choices=["madlad", "plamo"], required=True)
    ap.add_argument("--conc", type=int, default=8); ap.add_argument("--port", default="8090"); ap.add_argument("--token")
    a = ap.parse_args()
    global TOKEN
    TOKEN = a.token
    d = json.loads(Path(a.doc).read_text())
    blocks = [b for b in d["blocks"] if b["translatable"]]

    def one(b):
        t0 = time.time()
        if a.kind == "madlad":
            out = post("http://127.0.0.1:8765/translate", {"text": b["text"]})["text"]
        else:
            out = post(f"http://127.0.0.1:{a.port}/v1/chat/completions", {
                "messages": [{"role": "user", "content": b["text"]}], "temperature": 0, "max_tokens": 4096,
                "chat_template_kwargs": {"target_lang": "ja", "source_lang": "en"},
                "stop": ["<|plamo:tag|>", "<|plamo:bos|>"]})["choices"][0]["message"]["content"].strip()
        return {"id": b["id"], "sec": round(time.time() - t0, 2), "chars": len(b["text"]), "output": out}

    t0 = time.time()
    with ThreadPoolExecutor(a.conc) as ex:
        rows = list(ex.map(one, blocks))
    wall = time.time() - t0
    s = {"name": a.name, "doc": d["id"], "pages": d["pages"], "blocks": len(rows), "source_chars": sum(r["chars"] for r in rows),
         "wall_sec": round(wall, 1), "conc": a.conc, "first_block_sec": rows[0]["sec"]}
    (HERE / f"paper-{a.name}-{d['id']}.json").write_text(json.dumps({"summary": s, "rows": rows}, ensure_ascii=False, indent=1))
    print(json.dumps(s))


main()
