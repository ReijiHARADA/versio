import fs from "node:fs";
import path from "node:path";

type Row = Record<string, any>;

const root = path.resolve(process.cwd());
const auditPath = path.resolve(root, process.env.TRANSLATION_PRODUCT_AUDIT_INPUT ?? "test-data/real-papers/reports/translation-audit-fresh-v2.json");
const riskPath = path.resolve(root, process.env.TRANSLATION_PRODUCT_RISK_INPUT ?? "test-data/real-papers/reports/semantic-risk-fresh-v2-v1.json");
const outputPath = path.resolve(root, process.env.TRANSLATION_PRODUCT_OUTPUT ?? "test-data/real-papers/reports/fresh-v2-product-quality-v2.json");

const audit = JSON.parse(fs.readFileSync(auditPath, "utf8")) as { papers: Array<{ paper: { id: string }; rows: Row[] }> };
const risk = JSON.parse(fs.readFileSync(riskPath, "utf8")) as { rows: Row[] };
const key = (row: Row) => `${String(row.paperId ?? "")}:${String(row.blockId ?? "")}`;
const ordinary = audit.papers.flatMap(({ paper, rows }) => rows
  .map((row) => ({ ...row, paperId: row.paperId ?? paper.id }))
  .filter((row) => row.sourceCategory === "ordinary-body-prose" && String(row.translation ?? "").trim().length > 0));
const fallback = ordinary.filter((row) => Boolean(row.readerVisibleFallback));
const riskKeys = new Set(risk.rows.map(key));
const semanticRisk = ordinary.filter((row) => riskKeys.has(key(row)));
const acceptedSemanticRisk = semanticRisk.filter((row) => !row.readerVisibleFallback);
const combinedRisk = new Set([...fallback.map(key), ...acceptedSemanticRisk.map(key)]);

const metrics = {
  ordinaryRows: ordinary.length,
  acceptedRows: ordinary.length - fallback.length,
  readerVisibleFallbacks: fallback.length,
  readerVisibleFallbackRate: fallback.length / Math.max(1, ordinary.length),
  semanticRiskRows: semanticRisk.length,
  semanticRiskAmongOrdinary: semanticRisk.length / Math.max(1, ordinary.length),
  semanticRiskAmongAccepted: semanticRisk.length / Math.max(1, ordinary.length - fallback.length),
  combinedReaderVisibleRisk: combinedRisk.size,
  combinedReaderVisibleRiskRate: combinedRisk.size / Math.max(1, ordinary.length),
};

const report = {
  version: "fresh-v2-product-quality-v2",
  generatedAt: new Date().toISOString(),
  source: { audit: auditPath, semanticRisk: riskPath },
  scope: "ordinary-body-prose rows with non-empty translation; fallback and semantic risk are separate signals",
  metrics,
  semanticRiskKeys: semanticRisk.map(key),
};
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...metrics }));
