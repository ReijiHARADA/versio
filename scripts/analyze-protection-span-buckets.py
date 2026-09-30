#!/usr/bin/env python3
"""Summarize saved protection diagnostics by protected-span count.

This is diagnostic only: automatic error/restore outcomes are not semantic labels.
"""
import json
import argparse
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, default=ROOT / 'test-data/real-papers/reports/protection-ab-v254-30.json')
parser.add_argument('--out', type=Path, default=ROOT / 'test-data/real-papers/reports/protection-span-buckets-v1.json')
args = parser.parse_args()
source = args.source if args.source.is_absolute() else ROOT / args.source
out = args.out if args.out.is_absolute() else ROOT / args.out
data = json.loads(source.read_text())
buckets = defaultdict(lambda: {'n': 0, 'conditions': defaultdict(lambda: {'errors': 0, 'completed': 0, 'divergent_from_raw': 0})})
for rec in data['records']:
    conds = {c['condition']: c for c in rec['conditions']}
    spans = int(conds.get('current', {}).get('protectedSpanCount', 0))
    bucket = '0' if spans == 0 else '1-2' if spans <= 2 else '3-5' if spans <= 5 else '6+'
    b = buckets[bucket]; b['n'] += 1
    # Reports before v1181 used `output`; the paired summary stores the
    # post-restore value as `restoredOutput`. Accept both so the diagnostic
    # cannot silently report zero divergence after aggregation.
    raw = conds.get('raw', {}).get('output', conds.get('raw', {}).get('restoredOutput'))
    for name, c in conds.items():
        row = b['conditions'][name]
        if c.get('error'):
            row['errors'] += 1
        else:
            row['completed'] += 1
            output = c.get('output', c.get('restoredOutput'))
            if name != 'raw' and raw is not None and output != raw:
                row['divergent_from_raw'] += 1
result = {
    'version': 'protection-span-buckets-v1',
    'source': str(source.relative_to(ROOT)),
    'interpretation': 'Automatic errors and output divergence are diagnostic signals, not semantic correctness labels; source is a development cohort and must not tune production thresholds.',
    'buckets': {k: {'n': v['n'], 'conditions': {cn: dict(cv) for cn, cv in v['conditions'].items()}} for k, v in sorted(buckets.items())}
}
out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(out)
