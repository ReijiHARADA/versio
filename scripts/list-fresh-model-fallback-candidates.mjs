import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const modelRe = new RegExp(process.argv[2] ?? 'gemma', 'i');
const dir = path.resolve('test-data/real-papers/reports');
const used = new Set(); const candidates = new Map();
function walk(v, file) {
  if (Array.isArray(v)) return v.forEach(x => walk(x, file));
  if (!v || typeof v !== 'object') return;
  if (typeof v.source === 'string') {
    const h = crypto.createHash('sha256').update(v.source).digest('hex');
    if (modelRe.test(file) || modelRe.test(JSON.stringify(v).slice(0, 1500))) used.add(h);
    if (v.sourceCategory === 'ordinary-body-prose' && (v.readerVisibleFallback || v.postModelFallback || v.fallback === true) && !candidates.has(h)) candidates.set(h, { hash:h, key:v.key, paperId:v.paperId, source:v.source, report:file });
  }
  Object.values(v).forEach(x => walk(x, file));
}
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) { try { walk(JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')), file); } catch {} }
const fresh = [...candidates.values()].filter(x => !used.has(x.hash));
const out={generatedAt:new Date().toISOString(),modelPattern:modelRe.source,usedHashes:used.size,totalFallbackHashes:candidates.size,freshCount:fresh.length,candidates:fresh};
const output=path.join(dir,`fresh-${modelRe.source.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-fallback-candidates-v1.json`); fs.writeFileSync(output,JSON.stringify(out,null,2)); console.log(JSON.stringify({output,usedHashes:used.size,totalFallbackHashes:candidates.size,freshCount:fresh.length,keys:fresh.slice(0,20).map(x=>x.key)},null,2));
