import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dir = path.resolve('test-data/real-papers/reports');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const qwenHashes = new Set();
const qwenSources = new Map();
const ordinaryFallbacks = new Map();
function walk(value, visit) {
  if (Array.isArray(value)) return value.forEach(v => walk(v, visit));
  if (!value || typeof value !== 'object') return;
  visit(value);
  Object.values(value).forEach(v => walk(v, visit));
}
for (const file of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); } catch { continue; }
  const isQwen = /qwen2?\.5|qwen[-_ ]?14|qwen[-_ ]?7/i.test(JSON.stringify(data).slice(0, 3000)) || /qwen/i.test(file);
  walk(data, value => {
    if (typeof value.source !== 'string') return;
    const hash = crypto.createHash('sha256').update(value.source).digest('hex');
    if (isQwen) { qwenHashes.add(hash); qwenSources.set(hash, file); }
    if (value.sourceCategory === 'ordinary-body-prose' && (value.readerVisibleFallback || value.postModelFallback || value.fallback === true)) {
      const previous = ordinaryFallbacks.get(hash);
      if (!previous) ordinaryFallbacks.set(hash, { key: value.key, file, chars: value.source.length, source: value.source });
    }
  });
}
const fresh = [...ordinaryFallbacks.entries()].filter(([hash]) => !qwenHashes.has(hash)).map(([hash, value]) => ({ hash, ...value }));
const out = { generatedAt: new Date().toISOString(), qwenHashCount: qwenHashes.size, fallbackHashCount: ordinaryFallbacks.size, freshCount: fresh.length, candidates: fresh };
fs.writeFileSync(path.join(dir, 'fresh-fallback-candidates-v1.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ qwenHashCount: out.qwenHashCount, fallbackHashCount: out.fallbackHashCount, freshCount: out.freshCount, keys: fresh.slice(0, 20).map(x => x.key) }, null, 2));
