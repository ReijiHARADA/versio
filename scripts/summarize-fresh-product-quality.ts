import fs from "node:fs";
import path from "node:path";
import { summarizeTranslationProductQuality, type AuditEnvelope, type RiskEnvelope } from "./lib/translationProductQuality";

const root = path.resolve(process.cwd());
const auditPath = path.resolve(root, process.env.TRANSLATION_PRODUCT_AUDIT_INPUT ?? "test-data/real-papers/reports/translation-audit-fresh-v2.json");
const riskPath = path.resolve(root, process.env.TRANSLATION_PRODUCT_RISK_INPUT ?? "test-data/real-papers/reports/semantic-risk-fresh-v2-v1.json");
const outputPath = path.resolve(root, process.env.TRANSLATION_PRODUCT_OUTPUT ?? "test-data/real-papers/reports/fresh-v2-product-quality-v2.json");
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8")) as AuditEnvelope;
const risk = JSON.parse(fs.readFileSync(riskPath, "utf8")) as RiskEnvelope;
const summary = summarizeTranslationProductQuality(audit, risk);

const report = {
  version: "translation-product-quality-v4",
  generatedAt: new Date().toISOString(),
  source: { audit: auditPath, riskCandidates: riskPath },
  scope: "all sampled ordinary-body-prose rows; empty translations count as reader-visible fallback; relation-signal matches are review candidates, never ground truth",
  ...summary,
};
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...summary.metrics }));
