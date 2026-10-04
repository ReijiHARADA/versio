#!/usr/bin/env node
/** Audit-only discourse omission candidate scanner. Never changes production decisions. */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const inputArg = process.argv.indexOf("--input");
const input = path.resolve(root, inputArg >= 0 ? process.argv[inputArg + 1] : "test-data/real-papers/reports/heldout-v1-madlad.json");
const outputArg = process.argv.indexOf("--output");
const output = path.resolve(root, outputArg >= 0 ? process.argv[outputArg + 1] : "test-data/real-papers/reports/discourse-omission-candidates-v1.json");
const report = JSON.parse(fs.readFileSync(input, "utf8"));
const rows = (report.papers ?? []).flatMap((paper) => (paper.rows ?? []).map((row) => ({ ...row, paperId: paper.paper.id })));

const cues = [
  { name: "concession", source: /\b(?:although|though|while|whereas|despite|nevertheless|however)\b/i, target: /(?:しかし|ただし|一方|とはいえ|にもかかわらず|〜が|が、|ものの|反面)/u },
  { name: "causal", source: /\b(?:therefore|thus|hence|because|since|as a result|consequently)\b/i, target: /(?:したがって|従って|そのため|結果として|なぜなら|ので|ため|結果)/u },
  { name: "contrast", source: /\b(?:but|yet|instead|rather than|on the other hand)\b/i, target: /(?:しかし|一方|代わりに|むしろ|反対に|が、|ものの)/u },
];
const candidates = [];
for (const row of rows) {
  if (row.sourceCategory !== "ordinary-body-prose" || row.readerVisibleFallback || row.sourceFallback || !row.translation) continue;
  for (const cue of cues) {
    if (cue.source.test(row.source) && !cue.target.test(row.translation)) {
      candidates.push({ key: row.key ?? `${row.paperId}:${row.blockId}`, paperId: row.paperId, blockId: row.blockId, cue: cue.name, source: row.source, translation: row.translation, reason: `${cue.name} cue in source without a corresponding Japanese discourse marker; manual review required` });
    }
  }
}
const result = { version: "discourse-omission-candidates-v1", generatedAt: new Date().toISOString(), input: path.relative(root, input), scope: "accepted ordinary-body rows only; diagnostic candidates, never automatic truth", candidateCount: candidates.length, candidates };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`wrote ${output}: candidates=${candidates.length}`);
