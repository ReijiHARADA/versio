import fs from "node:fs";
import path from "node:path";
const dir = path.join("test-data/real-papers/reports");
const requested = process.env.FRESH_TRANSLATION_REPORTS?.split(",").map(s=>s.trim()).filter(Boolean);
const files = fs.readdirSync(dir).filter(f => (f === "translation-audit.json" || /^translation-audit-.*\.json$/.test(f)) && (!requested || requested.includes(f)));
const rows = files.flatMap(file => {
  const report = JSON.parse(fs.readFileSync(path.join(dir,file),"utf8"));
  return (report.papers ?? []).flatMap((paper: any) => {
    const metadata = paper.paper ?? paper;
    const paperId = metadata.id ?? metadata.paper ?? file;
    return (paper.rows ?? []).map((row: any) => ({
      ...row,
      paper: paperId,
      disciplines: metadata.disciplines ?? [],
      formatFamily: metadata.formatFamily ?? "unknown",
    }));
  });
});
const uniqueByKey = new Map<string, any>();
for (const row of rows) {
  const key = String(row.key ?? `${row.paper ?? ""}:${row.blockId ?? ""}:${row.source ?? ""}`);
  uniqueByKey.set(key, row);
}
const uniqueRows = [...uniqueByKey.values()];
const ordinary = rows.filter(r => r.sourceCategory === "ordinary-body-prose");
const modelEligible = rows.filter(r => !["reference-chrome","damaged-extraction","caption","list"].includes(r.sourceCategory));
const fallback = (r:any) => r.readerVisibleFallback ?? r.sourceFallback ?? r.fallbackStage !== "none";
const disciplineNames = [...new Set(rows.flatMap(r => Array.isArray(r.disciplines) && r.disciplines.length ? r.disciplines : ["unclassified"]))].sort();
const byDiscipline = Object.fromEntries(disciplineNames.map(discipline => {
  const scoped = rows.filter(r => (Array.isArray(r.disciplines) && r.disciplines.length ? r.disciplines : ["unclassified"]).includes(discipline));
  const ordinaryScoped = scoped.filter(r => r.sourceCategory === "ordinary-body-prose");
  return [discipline, { total: scoped.length, ordinaryBodyTotal: ordinaryScoped.length, ordinaryBodyFallbacks: ordinaryScoped.filter(fallback).length, ordinaryBodyFallbackRate: ordinaryScoped.filter(fallback).length / Math.max(1, ordinaryScoped.length) }];
}));
const uniqueOrdinary = uniqueRows.filter(r => r.sourceCategory === "ordinary-body-prose");
const summary = {generatedAt:new Date().toISOString(), reports:files, totalRows:rows.length, uniqueRows:uniqueRows.length, uniqueOrdinaryBody:{total:uniqueOrdinary.length,readerVisibleFallbacks:uniqueOrdinary.filter(fallback).length,rate:uniqueOrdinary.filter(fallback).length/Math.max(1,uniqueOrdinary.length)}, ordinaryBody:{total:ordinary.length,readerVisibleFallbacks:ordinary.filter(fallback).length,rate:ordinary.filter(fallback).length/Math.max(1,ordinary.length)}, modelEligible:{total:modelEligible.length,fallbacks:modelEligible.filter(fallback).length,rate:modelEligible.filter(fallback).length/Math.max(1,modelEligible.length)}, byDiscipline, byFallbackStage:Object.fromEntries(["pre-model","post-model","none"].map(stage=>[stage,rows.filter(r => r.fallbackStage===stage).length])), serverErrors: rows.filter(r => Boolean(r.serverError)).length, byServerError: Object.fromEntries([...new Set(rows.filter(r => r.serverError).map(r => String(r.serverError)))].map(error => [error, rows.filter(r => r.serverError === error).length]))};
fs.writeFileSync(path.join(dir,"translation-baseline-fresh-v1.json"),JSON.stringify(summary,null,2)+"\n");
console.log(JSON.stringify(summary,null,2));
