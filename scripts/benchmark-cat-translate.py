"""Audit-only CAT-Translate comparison for the existing ordinary-body cohort."""
import json
import os
import re
import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / os.environ.get("CAT_INPUT_REPORT", "test-data/real-papers/reports/manual-reviews-quality-v3-recheck-input.json")
OUT = ROOT / os.environ.get("CAT_OUTPUT_REPORT", "test-data/real-papers/reports/cat-translate-3.3b-multipaper-v1.json")
MODEL_ID = os.environ.get("CAT_MODEL", "cyberagent/CAT-Translate-3.3b")
MAX_ROWS = int(os.environ.get("CAT_MAX_ROWS", "5"))
MAX_NEW_TOKENS = int(os.environ.get("CAT_MAX_NEW_TOKENS", "1200"))
PROTECT_ACRONYMS = os.environ.get("CAT_PROTECT_ACRONYMS", "0") == "1"
PROMPT_SUFFIX = os.environ.get("CAT_PROMPT_SUFFIX", "").strip()
SYSTEM_PROMPT = os.environ.get("CAT_SYSTEM_PROMPT", "").strip()


def protect_acronyms(text: str) -> tuple[str, dict[str, str]]:
    """Audit-only protection for standalone uppercase acronyms.

    Keep the experiment generic: protect the token shape, never a paper term.
    The restored output is evaluated against the original source afterward.
    """
    replacements: dict[str, str] = {}
    index = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal index
        token = match.group(0)
        placeholder = f"ZZACR{index}ZZ"
        replacements[placeholder] = token
        index += 1
        return placeholder

    return re.sub(r"\b[A-Z][A-Z0-9-]{2,7}\b", replace, text), replacements


def restore_acronyms(text: str, replacements: dict[str, str]) -> str:
    for placeholder, token in replacements.items():
        text = text.replace(placeholder, token)
    return text


def source_integrity_flags(source: str) -> list[str]:
    """Audit-only flags matching high-confidence incomplete-source evidence.

    CAT is evaluated independently of the production TypeScript pipeline, so
    record these flags rather than silently treating a fluent completion as a
    model success. The rows remain in the raw report for reproducibility.
    """
    text = " ".join(source.split()).strip()
    flags: list[str] = []
    if len(text) >= 80 and (text.endswith("…") or text.endswith("...")):
        flags.append("source_ends_with_ellipsis")
    if len(text) >= 48 and any(text.lower().endswith(f" {label}") for label in ("section", "chapter", "appendix")):
        if any(f" {prefix} " in text.lower() for prefix in ("in", "see", "as", "from", "to", "of")):
            flags.append("source_ends_at_document_reference")
    return flags

def main() -> None:
    report = json.loads(REPORT.read_text())
    if "results" in report:
        rows = report["results"][:MAX_ROWS]
    elif "rows" in report:
        # Fresh held-out cohorts are stored as a flat `rows` array. Keep this
        # path explicit so an audit cannot silently run zero cases when the
        # report schema differs from the older benchmark reports.
        rows = report["rows"][:MAX_ROWS]
    else:
        groups = []
        for paper in report.get("papers", []):
            eligible = [r for r in paper.get("rows", []) if r.get("sourceCategory") == "ordinary-body-prose"]
            if eligible:
                groups.append((paper.get("paper", {}).get("id"), eligible))
        rows = []
        for index in range(max((len(items) for _, items in groups), default=0)):
            for paper_id, items in groups:
                if index < len(items) and len(rows) < MAX_ROWS:
                    rows.append({**items[index], "paperId": paper_id})
    dtype = torch.bfloat16 if torch.backends.mps.is_available() else torch.float32
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"[CAT] loading {MODEL_ID} on {device} dtype={dtype}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(MODEL_ID, torch_dtype=dtype)
    model.to(device)
    model.eval()
    results = []
    for row in rows:
        source = row["source"]
        integrity_flags = source_integrity_flags(source)
        model_source, acronym_map = protect_acronyms(source) if PROTECT_ACRONYMS else (source, {})
        prompt = "Translate the following English text into Japanese."
        if PROMPT_SUFFIX:
            prompt += f"\n{PROMPT_SUFFIX}"
        prompt += f"\n\n{model_source}"
        messages = []
        if SYSTEM_PROMPT:
            messages.append({"role": "system", "content": SYSTEM_PROMPT})
        messages.append({"role": "user", "content": prompt})
        inputs = tokenizer.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt")
        inputs = inputs.to(device)
        started = time.time()
        with torch.inference_mode():
            output = model.generate(inputs, max_new_tokens=MAX_NEW_TOKENS, do_sample=False)
        generated = output[0, inputs.shape[-1]:]
        text = tokenizer.decode(generated, skip_special_tokens=True).strip()
        if acronym_map:
            text = restore_acronyms(text, acronym_map)
        result = {
            "paperId": row.get("paperId"),
            "key": row["key"],
            "source": source,
            "translation": text,
            "inputTokens": int(inputs.shape[-1]),
            "outputTokens": int(generated.shape[-1]),
            "elapsedMs": int((time.time() - started) * 1000),
            "model": MODEL_ID,
            "sourceIntegrityFlags": integrity_flags,
        }
        results.append(result)
        report_payload = {
            "version": "cat-translate-audit-v1",
            "model": MODEL_ID,
            "results": results,
            "summary": {
                "total": len(results),
                "sourceIntegrityFlagged": sum(bool(item["sourceIntegrityFlags"]) for item in results),
                "cleanSourceRows": sum(not item["sourceIntegrityFlags"] for item in results),
            },
        }
        OUT.write_text(json.dumps(report_payload, ensure_ascii=False, indent=2))
        print(f"[CAT] {row['key']} tokens={result['inputTokens']}->{result['outputTokens']} elapsedMs={result['elapsedMs']}")
    print(f"[CAT] wrote {OUT}")

if __name__ == "__main__":
    main()
