"""Run a bounded, reproducible probe against a locally cached causal model.

This is evaluation-only. It deliberately does not alter the production
MADLAD server or its model selection. Inputs are a JSON array of strings or
objects with ``source``/``id`` fields.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

# Allow both `python scripts/bench_alternate_model.py` and module-style
# invocation to use the shared production segmenter/quality helpers.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bench_common import quality_flags
from engines.segmenter import split_for_translation


def has_instruction_contamination(text: str) -> bool:
    """Flag a prompt/instruction marker appended after translated content."""
    marker = re.compile(
        r"(?:次の(?:英語|英文)(?:の学術テキスト)?を日本語に翻訳してください|"
        r"英語(?:の)?学術テキストを日本語に翻訳|"
        r"translate the following (?:english )?(?:academic )?text|"
        r"output only the japanese translation)",
        re.IGNORECASE,
    )
    match = marker.search(text)
    return match is not None and match.start() > 0


def rss_bytes() -> int | None:
    try:
        import psutil

        return int(psutil.Process().memory_info().rss)
    except Exception:
        return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Local path or HF model id")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--device", default="mps", choices=("mps", "cpu"))
    parser.add_argument("--max-new-tokens", type=int, default=256)
    parser.add_argument("--source-language", default="English")
    parser.add_argument(
        "--segment",
        action="store_true",
        help="Split each input with the production segmenter and verify source round-trip.",
    )
    args = parser.parse_args()

    device = args.device if args.device != "mps" or torch.backends.mps.is_available() else "cpu"
    dtype = torch.bfloat16 if device in {"mps", "cpu"} else torch.float32
    records = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise ValueError("input must be a JSON array")

    tokenizer = AutoTokenizer.from_pretrained(args.model, local_files_only=True)
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        local_files_only=True,
        torch_dtype=dtype,
    ).to(device)
    model.eval()
    model_loaded_rss = rss_bytes()

    expanded: list[tuple[str, str, str, int, int, bool]] = []
    for index, record in enumerate(records):
        source = record if isinstance(record, str) else record["source"]
        identifier = str(index) if isinstance(record, str) else str(record.get("id", str(index)))
        units = split_for_translation(source) if args.segment else [source]
        reconstructed = " ".join(units).split()
        original_tokens = source.split()
        roundtrip_ok = reconstructed == original_tokens
        for unit_index, unit in enumerate(units):
            expanded.append((identifier, unit, identifier, unit_index, len(units), roundtrip_ok))

    results: list[dict[str, object]] = []
    for identifier, source, parent_id, unit_index, unit_count, roundtrip_ok in expanded:
        prompt = (
            f"Translate the following {args.source_language} academic text into Japanese. "
            "Output only the Japanese translation; do not repeat the instruction or add commentary.\n\n"
            f"{source}"
        )
        inputs = tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}],
            add_generation_prompt=True,
            return_tensors="pt",
        ).to(device)
        started = time.monotonic()
        with torch.inference_mode():
            output = model.generate(
                inputs,
                max_new_tokens=args.max_new_tokens,
                do_sample=False,
                num_beams=1,
            )
        decoded = tokenizer.decode(output[0, inputs.shape[1] :], skip_special_tokens=True).strip()
        quality = quality_flags(source, decoded, int(output.shape[1] - inputs.shape[1]), args.max_new_tokens)
        quality["instruction_contamination"] = has_instruction_contamination(decoded)
        results.append(
            {
                "id": identifier,
                "parent_id": parent_id,
                "segment_index": unit_index,
                "segment_count": unit_count,
                "source_roundtrip_ok": roundtrip_ok,
                "source": source,
                "prompt": prompt,
                "translation": decoded,
                "input_tokens": int(inputs.shape[1]),
                "output_tokens": int(output.shape[1] - inputs.shape[1]),
                "seconds": round(time.monotonic() - started, 3),
                "prompt_echo": prompt[:80] in decoded,
                "quality": quality,
                "rss_bytes": rss_bytes(),
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {
                "model": args.model,
                "device": device,
                "dtype": str(dtype),
                "max_new_tokens": args.max_new_tokens,
                "results": results,
                "model_loaded_rss_bytes": model_loaded_rss,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
