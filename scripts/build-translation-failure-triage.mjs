#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const input = process.argv[2] ?? 'test-data/real-papers/reports/translation-audit.json';
const output = process.argv[3] ?? 'test-data/real-papers/reports/translation-failure-triage-v1.json';
const report = JSON.parse(fs.readFileSync(path.resolve(root, input), 'utf8'));
const rows = report.papers.flatMap((entry) => entry.rows.map((row) => ({ ...row, paperTitle: entry.paper.title, discipline: entry.paper.discipline ?? 'unclassified' })));
const scoped = rows.filter((row) => row.sourceCategory === 'ordinary-body-prose' && row.readerVisibleFallback);
const classify = (row) => {
  const text = [row.fallbackReason, row.serverFallbackReason, ...(row.structuralWarnings ?? [])].filter(Boolean).join('; ');
  if (/protected_token_restore_failed|engine_exception|server (?:returned .*fallback|partial_unit_fallback|whole_item_fallback)/i.test(text)) return 'server-or-protection';
  if (/scientific invariants|relation|untranslated|degenerate|source span|citation year/i.test(text)) return 'quality-gate';
  if ((row.structuralWarnings ?? []).length > 0 || row.sourceIntegrity !== 'clean') return 'extraction-or-structure';
  return 'other';
};
const result = {
  generatedAt: new Date().toISOString(),
  sourceReport: input,
  sourceRunId: report.runId,
  scope: { papers: report.papers.filter((entry) => !entry.error).length, ordinaryBodyFallbackRows: scoped.length },
  counts: Object.fromEntries(['server-or-protection', 'quality-gate', 'extraction-or-structure', 'other'].map((key) => [key, scoped.filter((row) => classify(row) === key).length])),
  rows: scoped.map((row) => ({
    key: row.key,
    paperId: row.paperId,
    paperTitle: row.paperTitle,
    discipline: row.discipline,
    pageStart: row.pageStart,
    pageEnd: row.pageEnd,
    source: row.source,
    category: classify(row),
    fallbackStage: row.fallbackStage,
    fallbackReason: row.fallbackReason ?? null,
    serverFallbackStage: row.serverFallbackStage ?? null,
    serverFallbackReason: row.serverFallbackReason ?? null,
    qualityReasons: row.quality?.reasons ?? [],
    structuralWarnings: row.structuralWarnings ?? [],
    sourceIntegrity: row.sourceIntegrity ?? null,
    wouldSubmitToModel: row.wouldSubmitToModel,
  })),
};
fs.mkdirSync(path.dirname(path.resolve(root, output)), { recursive: true });
fs.writeFileSync(path.resolve(root, output), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, ...result.scope, counts: result.counts }, null, 2));
