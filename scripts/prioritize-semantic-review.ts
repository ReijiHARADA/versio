import fs from "node:fs";
import path from "node:path";

type Review = { paperId: string; blockId: string; severity?: number; labels?: string[]; readerVisibleFallback?: boolean; productionDecision?: string; source: string; translation?: string };
type Coverage = { paperId: string; blockId: string; sourceChars: number; translationChars: number; lengthRatio: number; invariantCount: number; preservedInvariantCount: number; relations: Record<string, boolean> };
const root = process.cwd();
const reviews = JSON.parse(fs.readFileSync(path.join(root, "test-data/real-papers/audit-manual-review.json"), "utf8")).reviews as Review[];
const coverage = JSON.parse(fs.readFileSync(path.join(root, "test-data/real-papers/reports/translation-coverage-v68.json"), "utf8")).rows as Coverage[];
const byKey = new Map(coverage.map((row) => [`${row.paperId}:${row.blockId}`, row]));
const rows = reviews.filter((r) => !r.readerVisibleFallback && (r.severity ?? 0) >= 2).map((r) => {
  const c = byKey.get(`${r.paperId}:${r.blockId}`);
  const relationLoss = c ? Object.entries(c.relations).filter(([k, v]) => k.endsWith("Preserved") && v === false).map(([k]) => k) : [];
  const invariantLoss = c ? Math.max(0, c.invariantCount - c.preservedInvariantCount) : 0;
  const priority = (r.severity ?? 0) * 10 + relationLoss.length * 3 + invariantLoss * 2 + Math.min(3, Math.floor((c?.sourceChars ?? r.source.length) / 300));
  return { paperId: r.paperId, blockId: r.blockId, severity: r.severity, labels: r.labels ?? [], productionDecision: r.productionDecision, sourceChars: c?.sourceChars ?? r.source.length, translationChars: c?.translationChars ?? (r.translation ?? "").length, relationLoss, invariantLoss, priority, source: r.source, translation: r.translation ?? "" };
}).sort((a, b) => b.priority - a.priority);
const output = { version: "semantic-review-priority-v1", generatedAt: new Date().toISOString(), scope: "accepted rows with manual severity >= 2; audit-only", rows };
const target = path.join(root, "test-data/real-papers/reports/semantic-review-priority-v1.json");
fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ rows: rows.length, top: rows.slice(0, 5).map(({ paperId, blockId, priority, relationLoss, invariantLoss }) => ({ paperId, blockId, priority, relationLoss, invariantLoss })) }));
