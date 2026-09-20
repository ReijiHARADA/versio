"""Isolated full-checkpoint A/B for the MADLAD-400 3B T5 embedding issue.

Run once per Transformers version in a fresh process. The source fixtures are
looked up by stable ID in the existing local real-paper audit reports, so no
PDF extraction or production server code is involved. Use --repair on 5.x to
measure the exact encoder/shared reassignment currently used by Paper Reader.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / "translation-server"
sys.path.insert(0, str(SERVER))

import torch
import transformers
from safetensors import safe_open
from transformers import AutoTokenizer, T5ForConditionalGeneration

from engines.citation_protect import protect_citations, restore_citations
from engines.segmenter import segment_for_translation

MODEL_DIR = Path.home() / ".cache/huggingface/hub/models--google--madlad400-3b-mt/snapshots/fa184c675da0b5c9e1c8694fccd4e12e2d422094"
REPORT_V44 = ROOT / "test-data/real-papers/reports/translation-audit-v44-post-protection.json"
REPORT_V33 = ROOT / "test-data/real-papers/reports/translation-audit-v33-cross-field-heldout.json"
COURSE_REPORT = ROOT / "test-data/real-papers/reports/semantic-coverage-v80.json"


def rows(path: Path):
    doc = json.loads(path.read_text(encoding="utf-8"))
    for paper in doc.get("papers", []):
        for row in paper.get("rows", []):
            yield paper.get("paper", {}).get("id", ""), row


def fixture_sources() -> list[dict[str, str]]:
    cognitive = list(rows(REPORT_V44))
    group_row = next(row for paper, row in cognitive if paper == "cognitive-vr-mnemonic-processing" and (row.get("source") or "").startswith("None of the groups differed"))
    participant_row = next(row for paper, row in cognitive if paper == "cognitive-vr-mnemonic-processing" and (row.get("source") or "").startswith("Eighty-eight participants from various fields"))
    group_source = group_row["source"]
    # Preserve the original multi-clause null-result claim while keeping this
    # fixture distinct from the separate dense statistical-results sentence.
    group_scope = group_source.split(" Consequently", 1)[0].strip()
    stat_match = re.search(r"Regarding memory performance, the three groups performed significantly different.*?(?= In detail,)", group_source)
    if not stat_match:
        raise RuntimeError("Could not resolve statistical fixture from v44 report")
    participant_scope = participant_row["source"].split(" They were screened", 1)[0].strip()

    course_doc = json.loads(COURSE_REPORT.read_text(encoding="utf-8"))
    course_texts: list[str] = []
    def walk(value):
        if isinstance(value, dict):
            for v in value.values():
                walk(v)
        elif isinstance(value, list):
            for v in value:
                walk(v)
        elif isinstance(value, str) and "This course will teach how to pose testable research questions" in value:
            course_texts.append(value)
    walk(course_doc)
    if not course_texts:
        raise RuntimeError("Could not resolve repetition fixture from semantic-coverage-v80")
    repeat_match = re.search(r"This course will teach.*?conduct an experiment\.", course_texts[0])
    if not repeat_match:
        raise RuntimeError("Could not isolate repetition sentence")

    fallback_paper, fallback_row = next(
        (paper, row) for paper, row in rows(REPORT_V33)
        if paper == "linguistics-register-web-corpus" and row.get("blockId") == "b-4f4e757b"
    )
    return [
        {"id": "group_cardinality_known_false_accept", "paper": "cognitive-vr-mnemonic-processing", "block_id": group_row["blockId"], "source": group_scope},
        {"id": "participant_total_scope_known_fallback", "paper": "cognitive-vr-mnemonic-processing", "block_id": participant_row["blockId"], "source": participant_scope},
        {"id": "parallel_clause_phrase_repetition", "paper": "hci-empirical-methods", "block_id": "b-f82706b9", "source": repeat_match.group(0)},
        {"id": "dense_statistical_results", "paper": "cognitive-vr-mnemonic-processing", "block_id": group_row["blockId"], "source": stat_match.group(0).strip()},
        {"id": "ordinary_body_historical_post_model_fallback", "paper": fallback_paper, "block_id": fallback_row["blockId"], "historical_fallback_reason": fallback_row.get("fallbackReason"), "source": fallback_row["source"]},
    ]


def compare_param_to_checkpoint(model_param: torch.Tensor, f, key: str) -> bool:
    """Strict equality after the checkpoint's F32 values are cast to model dtype."""
    if key not in f.keys():
        return False
    rows = model_param.shape[0]
    step = 4096
    for start in range(0, rows, step):
        end = min(rows, start + step)
        checkpoint = f.get_slice(key)[start:end].to(dtype=model_param.dtype)
        loaded = model_param.detach()[start:end].cpu()
        if not torch.equal(checkpoint, loaded):
            return False
    return True


def tensor_mapping(model) -> dict[str, object]:
    weight_file = MODEL_DIR / "model.safetensors"
    names = ["encoder.embed_tokens", "decoder.embed_tokens", "lm_head"]
    out: dict[str, object] = {
        "config_tie_word_embeddings": model.config.tie_word_embeddings,
        "checkpoint_keys": {},
        "loaded": {},
    }
    with safe_open(str(weight_file), framework="pt", device="cpu") as f:
        keys = set(f.keys())
        for key in ("shared.weight", "encoder.embed_tokens.weight", "decoder.embed_tokens.weight", "lm_head.weight"):
            out["checkpoint_keys"][key] = {"present": key in keys, "shape": list(f.get_slice(key).get_shape()) if key in keys else None}
        refs = [key for key in ("decoder.embed_tokens.weight", "lm_head.weight") if key in keys]
        params = {
            "encoder.embed_tokens": model.encoder.embed_tokens.weight,
            "decoder.embed_tokens": model.decoder.embed_tokens.weight,
            "lm_head": model.lm_head.weight,
        }
        for name, param in params.items():
            out["loaded"][name] = {
                "dtype": str(param.dtype),
                "device": str(param.device),
                "absmax": float(param.detach().float().abs().max().item()),
                "checkpoint_equal_after_cast": {key: compare_param_to_checkpoint(param, f, key) for key in refs},
            }
        out["loaded"]["encoder_equals_decoder"] = torch.equal(
            model.encoder.embed_tokens.weight.detach().cpu(), model.decoder.embed_tokens.weight.detach().cpu()
        )
    return out


def gen_one(model, tokenizer, text: str) -> dict[str, object]:
    protected, citation_map, nonce = protect_citations(text)
    units = segment_for_translation(text)
    decoded_units = []
    total_in = 0
    total_out = 0
    for unit in units:
        unit_input, citations, unit_nonce = protect_citations(unit.model_input)
        if not citations and unit.protected != unit.model_input:
            unit_input = unit.protected
        encoded = tokenizer(
            f"<2ja> {unit_input}", return_tensors="pt", truncation=True,
            max_length=512, add_special_tokens=True,
        )
        encoded = {k: v.to(model.device) for k, v in encoded.items()}
        in_count = int(encoded["attention_mask"].sum().item())
        max_new = min(max(in_count * 3 + 24, 48), 384)
        with torch.inference_mode():
            generated = model.generate(
                **encoded, max_new_tokens=max_new, num_beams=1, do_sample=False,
                decoder_start_token_id=model.config.decoder_start_token_id,
                pad_token_id=tokenizer.pad_token_id, eos_token_id=tokenizer.eos_token_id,
                no_repeat_ngram_size=4,
            )
        seq = generated[0]
        raw = tokenizer.decode(seq, skip_special_tokens=True).strip()
        if citations:
            restored = restore_citations(raw, citations, unit_nonce)
        else:
            restored = raw
        nonpad = int((seq != tokenizer.pad_token_id).sum().item()) if tokenizer.pad_token_id is not None else int(seq.shape[0])
        new_count = max(0, nonpad - 1)
        eos = bool((seq == tokenizer.eos_token_id).any().item())
        total_in += in_count
        total_out += new_count
        decoded_units.append({
            "source": unit.text,
            "model_input": unit_input,
            "input_token_ids_sha256": hashlib.sha256(encoded["input_ids"].detach().cpu().numpy().tobytes()).hexdigest(),
            "input_tokens": in_count,
            "raw_output": raw,
            "restored_output": restored,
            "output_tokens": new_count,
            "reached_eos": eos,
            "hit_generation_cap": new_count >= max_new,
            "max_new_tokens": max_new,
        })
    result = " ".join(str(row["restored_output"]) for row in decoded_units)
    source_sha = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return {
        "source_sha256": source_sha,
        "source_chars": len(text),
        "segmenter_units": len(units),
        "input_tokens": total_in,
        "output_tokens": total_out,
        "units": decoded_units,
        "joined_output": result,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--repair", action="store_true", help="Apply Paper Reader's encoder/shared -> decoder embedding reassignment")
    parser.add_argument("--device", default="mps")
    args = parser.parse_args()
    if not MODEL_DIR.exists():
        raise FileNotFoundError(MODEL_DIR)
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    device = torch.device(args.device)
    dtype = torch.bfloat16 if device.type == "mps" else torch.float32
    print(f"[A/B] transformers={transformers.__version__} torch={torch.__version__} device={device} dtype={dtype}", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR), use_fast=False, local_files_only=True)
    model = T5ForConditionalGeneration.from_pretrained(str(MODEL_DIR), dtype=dtype, low_cpu_mem_usage=True, local_files_only=True)
    model = model.to(device).eval()
    before = tensor_mapping(model)
    if args.repair:
        model.shared = model.decoder.embed_tokens
        model.encoder.embed_tokens = model.decoder.embed_tokens
    after = tensor_mapping(model)
    fixtures = fixture_sources()
    results = []
    for fixture in fixtures:
        t0 = time.monotonic()
        generated = gen_one(model, tokenizer, fixture["source"])
        row = {k: v for k, v in fixture.items() if k != "source"}
        row.update(generated)
        row["elapsed_seconds"] = round(time.monotonic() - t0, 3)
        results.append(row)
        print(f"[A/B] {fixture['id']}: {generated['input_tokens']}->{generated['output_tokens']} eos={all(u['reached_eos'] for u in generated['units'])} {generated['joined_output'][:100]!r}", flush=True)
    payload = {
        "model_id": "google/madlad400-3b-mt",
        "model_snapshot": str(MODEL_DIR),
        "transformers_version": transformers.__version__,
        "torch_version": torch.__version__,
        "tokenizers_version": __import__("tokenizers").__version__,
        "safetensors_version": __import__("safetensors").__version__,
        "dtype": str(dtype),
        "device": str(device),
        "generation": {"num_beams": 1, "do_sample": False, "no_repeat_ngram_size": 4, "input_truncation": 512, "max_new_tokens": "min(max(input_tokens*3+24,48),384)"},
        "repair_applied": args.repair,
        "checkpoint_tensor_mapping_before_repair": before,
        "checkpoint_tensor_mapping_after_repair": after,
        "fixtures": results,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[A/B] saved {args.out}", flush=True)


if __name__ == "__main__":
    main()
