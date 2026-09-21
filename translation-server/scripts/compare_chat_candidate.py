"""Audit-only comparison for locally cached chat-style translation models.

Uses Paper Reader's production semantic segmenter and citation/scientific span
protection, then applies the candidate model's required chat template. This
script records generations only; it never changes production routing.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from engines.citation_protect import placeholder_for, protect_citations, restore_citations
from engines.segmenter import segment_for_translation


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True, help='Local model directory or Hugging Face model id')
    ap.add_argument('--input', required=True, help='JSON with rows: key, paperId, source')
    ap.add_argument('--output', required=True)
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--max-new-tokens', type=int, default=512)
    ap.add_argument('--no-protection', action='store_true', help='Diagnostic only: send source without citation/scientific placeholders')
    ap.add_argument('--explicit-placeholder-instruction', action='store_true', help='Diagnostic only: explicitly ask the model to copy protected spans unchanged')
    args = ap.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding='utf-8'))
    rows = payload.get('rows', [])
    if args.limit:
        rows = rows[:args.limit]
    print(f'loading chat candidate {args.model}; rows={len(rows)}', flush=True)
    tokenizer = AutoTokenizer.from_pretrained(args.model, local_files_only=args.offline)
    dtype = torch.bfloat16 if torch.backends.mps.is_available() else torch.float32
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        torch_dtype=dtype,
        local_files_only=args.offline,
    )
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
            if args.no_protection:
                protected, spans, nonce = unit.model_input, [], 0
            else:
                protected, spans, nonce = protect_citations(unit.model_input)
            model_protected = protected
            markers: list[tuple[str, str]] = []
            if args.explicit_placeholder_instruction and spans:
                for span_index in range(len(spans)):
                    original_marker = placeholder_for(span_index, nonce)
                    readable_marker = f'[[PR{span_index + 1}]]'
                    model_protected = model_protected.replace(original_marker, readable_marker)
                    markers.append((readable_marker, original_marker))
            prompt = 'Translate the following English text into Japanese.'
            if args.explicit_placeholder_instruction and markers:
                prompt += ' Copy every [[PRn]] marker exactly once without changing it; do not translate, modify, or omit these markers.'
            prompt += f'\n\n{model_protected}'
            messages = [{'role': 'user', 'content': prompt}]
            encoded = tokenizer.apply_chat_template(
                messages,
                tokenize=True,
                add_generation_prompt=True,
                return_tensors='pt',
                return_dict=True,
            ).to(device)
            input_tokens = int(encoded['input_ids'].shape[1])
            max_new = min(max(input_tokens * 3 + 64, 96), args.max_new_tokens)
            with torch.inference_mode():
                generated = model.generate(
                    **encoded,
                    max_new_tokens=max_new,
                    num_beams=1,
                    do_sample=False,
                    no_repeat_ngram_size=4,
                    pad_token_id=tokenizer.eos_token_id,
                    eos_token_id=tokenizer.eos_token_id,
                )
            new_tokens = generated[0, input_tokens:]
            decoded = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
            recovered_markers: list[int] = []
            for readable_marker, original_marker in markers:
                marker_index = int(re.search(r"\d+", readable_marker).group(0))
                marker_pattern = re.compile(rf"\[\[\s*PR\s*{marker_index}\s*\]\s*\]", re.IGNORECASE)
                decoded, recovered = marker_pattern.subn(original_marker, decoded, count=1)
                if recovered:
                    recovered_markers.append(marker_index)
            output_tokens = int(new_tokens.shape[0])
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
                'chatPrompt': prompt,
                'outputRaw': decoded,
                'outputRestored': restored,
                'protectedSpanCount': len(spans),
                'recoveredExplicitMarkers': recovered_markers,
                'inputTokens': input_tokens,
                'outputTokens': output_tokens,
                'error': error,
            })
            total_input_tokens += input_tokens
            total_output_tokens += output_tokens
        joined = ''.join(unit['outputRestored'] for unit in translated_units)
        results.append({
            **{k: row.get(k) for k in ('key', 'paperId', 'blockId', 'source')},
            'model': args.model,
            'segmenterVersion': 'semantic-v74',
            'sourceProtectionVersion': None if args.no_protection else ('source-protect-v11; explicit-marker-instruction' if args.explicit_placeholder_instruction else 'source-protect-v11'),
            'promptTemplate': 'CAT-Translate model card: Translate the following {src_lang} text into {tgt_lang}.',
            'translation': joined,
            'unitCount': len(translated_units),
            'units': translated_units,
            'inputTokens': total_input_tokens,
            'outputTokens': total_output_tokens,
            'timeMs': round((time.time() - started) * 1000),
            'allUnitsRestored': all(not unit['error'] for unit in translated_units),
        })
        output_path.write_text(json.dumps({
            'model': args.model,
            'generation': {
                'num_beams': 1,
                'do_sample': False,
                'no_repeat_ngram_size': 4,
                'dtype': str(dtype),
                'device': device,
                'maxNewTokensPerUnit': args.max_new_tokens,
            },
            'segmentation': 'production segment_for_translation; ' + ('protection disabled for diagnostic' if args.no_protection else 'citation_protect protect/restore'),
            'chatTemplate': tokenizer.chat_template,
            'results': results,
        }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f"[{row_index}/{len(rows)}] {row.get('key')} units={len(units)} tokens={total_input_tokens}->{total_output_tokens} {joined[:160]}", flush=True)
    print(f'wrote {output_path}')


if __name__ == '__main__':
    main()
