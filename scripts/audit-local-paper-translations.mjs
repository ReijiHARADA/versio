#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('usage: node scripts/audit-local-paper-translations.mjs <paper-data-directory>');
  process.exit(2);
}
const dirs = (await fs.readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory());
const rows = [];
for (const dir of dirs) {
  const base = path.join(root, dir.name);
  const [paper, translation, ja] = await Promise.all([
    readJson(path.join(base, 'paper.json')),
    readJson(path.join(base, 'translation.json')),
    readText(path.join(base, 'ja.md')),
  ]);
  if (!translation || ja == null) continue;
  const blocks = Object.values(translation.blocks ?? {});
  const statuses = Object.fromEntries(['pending', 'processing', 'completed', 'failed', 'skipped'].map((s) => [s, blocks.filter((b) => b?.status === s).length]));
  const outcomes = Object.fromEntries(['translated', 'structural_skip', 'source_fallback', 'unclassified'].map((s) => [s, blocks.filter((b) => (b?.translationOutcome ?? b?.metadata?.translationOutcome ?? 'unclassified') === s).length]));
  const japaneseChars = (ja.match(/[\u3040-\u30ff\u3400-\u9fff]/g) ?? []).length;
  const latinChars = (ja.match(/[A-Za-z]/g) ?? []).length;
  rows.push({ paperId: dir.name, title: paper?.titleOriginal ?? paper?.title_original ?? null, blocks: blocks.length, statuses, outcomes, jaChars: ja.length, japaneseChars, latinChars, japaneseRate: Number((japaneseChars / Math.max(1, ja.length)).toFixed(4)) });
}
rows.sort((a, b) => a.paperId.localeCompare(b.paperId));
console.log(JSON.stringify({ schemaVersion: 1, root, papers: rows.length, rows }, null, 2));
async function readJson(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } }
async function readText(file) { try { return await fs.readFile(file, 'utf8'); } catch { return null; } }
