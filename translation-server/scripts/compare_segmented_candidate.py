"""Audit-only local seq2seq comparison using Versio's production units.

The candidate sees exactly the semantic unit model_input produced by the
production segmenter. Scientific/citation spans are protected and restored
with the same implementation as MADLAD. This script never changes routing.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

from engines.citation_protect import protect_citations, restore_citations
from engines.segmenter import segment_for_translation


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True, help='Local model directory or Hugging Face model id')
    ap.add_argument('--input', required=True, help='JSON with rows: key, paperId, source')
    ap.add_argument('--output', required=True)
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    args = ap.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding='utf-8'))
    rows = payload.get('rows', [])
    if args.limit:
        rows = rows[:args.limit]
    print(f"loading candidate {args.model}; rows={len(rows)}")
    tokenizer = AutoTokenizer.from_pretrained(args.model, local_files_only=args.offline)
    model = AutoModelForSeq2SeqLM.from_pretrained(args.model, local_files_only=args.offline)
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    model.to(device)
    model.eval()
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    results = []
    for row_index, row in enumerate(rows, 1):
        units = segment_for_translation(row['source'])
        translated_units = []
        total_input_tokens = total_output_tokens = 0
        started = time.time()
        for unit_index, unit in enumerate(units):
            protected, spans, nonce = protect_citations(unit.model_input)
            encoded = tokenizer(
                protected,
                return_tensors='pt',
                truncation=True,
                max_length=512,
            ).to(device)
            input_tokens = int(encoded['input_ids'].shape[1])
            max_new_tokens = min(max(input_tokens * 3 + 24, 48), 384)
            with torch.inference_mode():
                generated = model.generate(
                    **encoded,
                    max_new_tokens=max_new_tokens,
                    num_beams=1,
                    do_sample=False,
                    no_repeat_ngram_size=4,
                )
            decoded = tokenizer.decode(generated[0], skip_special_tokens=True).strip()
            output_tokens = int(generated.shape[1])
            error = None
            try:
                restored = restore_citations(decoded, spans, nonce, reject_missing=True).strip()
            except ValueError as exc:
                restored = ''
                error = f'protected_span_restore_failed:{exc}'
            translated_units.append({
                'index': unit_index,
                'source': unit.text,
                'modelInput': unit.model_input,
                'protectedInput': protected,
                'outputRaw': decoded,
                'outputRestored': restored,
                'protectedSpanCount': len(spans),
                'inputTokens': input_tokens,
                'outputTokens': output_tokens,
                'error': error,
            })
            total_input_tokens += input_tokens
            total_output_tokens += output_tokens
        joined = ''.join(unit['outputRestored'] for unit in translated_units)
        result = {
            **{k: row.get(k) for k in ('key', 'paperId', 'blockId', 'source')},
            'model': args.model,
            'segmenterVersion': 'semantic-v75',
            'sourceProtectionVersion': 'source-protect-v11',
            'translation': joined,
            'unitCount': len(translated_units),
            'units': translated_units,
            'inputTokens': total_input_tokens,
            'outputTokens': total_output_tokens,
            'timeMs': round((time.time() - started) * 1000),
            'allUnitsRestored': all(not unit['error'] for unit in translated_units),
        }
        results.append(result)
        output_path.write_text(json.dumps({
            'model': args.model,
            'generation': {'num_beams': 1, 'do_sample': False, 'no_repeat_ngram_size': 4, 'maxInputTokensPerUnit': 512},
            'segmentation': 'production segment_for_translation; citation_protect protect/restore',
            'results': results,
        }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f"[{row_index}/{len(rows)}] {row.get('key')} units={len(units)} tokens={total_input_tokens}->{total_output_tokens} {joined[:120]}", flush=True)
    print(f'wrote {output_path}')


if __name__ == '__main__':
    main()
