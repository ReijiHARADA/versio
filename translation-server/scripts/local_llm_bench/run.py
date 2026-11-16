"""Translate fixture rows with one model; write outputs + timings.

  python3 run.py --name X --kind llama --prompt plamo|gemma|cat|hunyuan
  python3 run.py --name madlad --kind madlad --token T
"""
import argparse, json, subprocess, time, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
PROMPTS = {
    "gemma": "You are a professional English (en) to Japanese (ja) translator. Your goal is to accurately convey the meaning and nuances of the original English text while adhering to Japanese grammar, vocabulary, and cultural sensitivities.\nProduce only the Japanese translation, without any additional explanations or commentary. Please translate the following English text into Japanese:\n\n\n{t}",
    "cat": "Translate the following English text into Japanese.\n\n{t}",
    "hunyuan": "Translate the following segment into Japanese, without additional explanation.\n\n{t}",
    "plamo": "{t}",
}


def post(url, body, headers=None, timeout=600):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def rss_mb(pid):
    try:
        return int(subprocess.check_output(["ps", "-o", "rss=", "-p", str(pid)]).strip()) // 1024
    except Exception:
        return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--kind", choices=["llama", "madlad"], required=True)
    ap.add_argument("--prompt", default="plamo")
    ap.add_argument("--port", default="8090")
    ap.add_argument("--token", default="")
    ap.add_argument("--pid", type=int, default=0)
    a = ap.parse_args()
    rows = json.loads((HERE / "fixture.json").read_text())["rows"]
    out, peak = [], 0
    for i, r in enumerate(rows):
        t0 = time.time()
        if a.kind == "madlad":
            res = post("http://127.0.0.1:8765/translate", {"text": r["source"]}, {"X-Versio-Token": a.token})
            text, otok = res["text"], res.get("output_tokens")
        elif a.prompt == "gemma":
            prompt = "<start_of_turn>user\n" + PROMPTS["gemma"].format(t=r["source"]) + "<end_of_turn>\n<start_of_turn>model\n"
            res = post(f"http://127.0.0.1:{a.port}/completion", {"prompt": prompt, "temperature": 0, "n_predict": 1200, "stop": ["<end_of_turn>"]})
            text, otok = res["content"].strip(), res.get("tokens_predicted")
        else:
            body = {"messages": [{"role": "user", "content": PROMPTS[a.prompt].format(t=r["source"])}],
                    "temperature": 0, "max_tokens": 1200}
            if a.prompt == "plamo":
                body["chat_template_kwargs"] = {"target_lang": "ja", "source_lang": "en"}
                body["stop"] = ["<|plamo:tag|>", "<|plamo:bos|>"]
            res = post(f"http://127.0.0.1:{a.port}/v1/chat/completions", body)
            text = res["choices"][0]["message"]["content"].strip()
            otok = res.get("usage", {}).get("completion_tokens")
        dt = time.time() - t0
        if a.pid:
            peak = max(peak, rss_mb(a.pid))
        out.append({"key": r["key"], "source": r["source"], "output": text, "sec": round(dt, 2), "out_tokens": otok})
        print(f"{a.name} {i+1}/{len(rows)} {dt:.1f}s", flush=True)
    secs = [o["sec"] for o in out]
    toks = sum(o["out_tokens"] or 0 for o in out)
    summary = {"name": a.name, "rows": len(out), "mean_sec": round(sum(secs) / len(secs), 2),
               "median_sec": sorted(secs)[len(secs) // 2], "total_sec": round(sum(secs), 1),
               "tok_per_sec": round(toks / sum(secs), 1) if toks else None, "peak_rss_mb": peak}
    (HERE / f"out-{a.name}.json").write_text(json.dumps({"summary": summary, "rows": out}, ensure_ascii=False, indent=1))
    print(json.dumps(summary))


main()
