"""Audit-only EN->JA evaluation for instruction-tuned causal models."""
from __future__ import annotations
import argparse, json, time
from pathlib import Path
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--input', required=True)
    ap.add_argument('--output', required=True)
    ap.add_argument('--limit', type=int, default=12)
    ap.add_argument('--max-new-tokens', type=int, default=128)
    args = ap.parse_args()
    tok = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(args.model, torch_dtype=torch.float16, low_cpu_mem_usage=True)
    rows = json.loads(Path(args.input).read_text(encoding='utf-8')).get('rows', [])[:args.limit]
    results = []
    for index, row in enumerate(rows, 1):
        prompt = ('Translate the following English text into Japanese.\n\n'
                  + str(row['source']))
        encoded = tok.apply_chat_template(
            [{'role': 'user', 'content': prompt}], tokenize=True,
            add_generation_prompt=True, return_tensors='pt', return_dict=True
        )['input_ids']
        started = time.perf_counter()
        generated = model.generate(encoded, max_new_tokens=args.max_new_tokens, do_sample=False)
        output = tok.decode(generated[0, encoded.shape[-1]:], skip_special_tokens=True).strip()
        elapsed = (time.perf_counter() - started) * 1000
        results.append({'paperId': row.get('paperId'), 'blockId': row.get('blockId'),
                        'source': row.get('source'), 'model': args.model,
                        'translation': output, 'inputTokens': int(encoded.shape[-1]),
                        'outputTokens': int(generated.shape[-1] - encoded.shape[-1]),
                        'timeMs': round(elapsed, 1)})
        print(f'[{index}/{len(rows)}] {row.get("paperId")} {len(output)} chars {elapsed:.0f}ms', flush=True)
    Path(args.output).write_text(json.dumps({'model': args.model,
        'category': 'same-fixture-causal-model', 'count': len(results),
        'results': results}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
