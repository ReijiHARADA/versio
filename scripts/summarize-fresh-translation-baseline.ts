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
const ordinary = rows.filter(r => r.sourceCategory === "ordinary-body-prose");
const modelEligible = rows.filter(r => !["reference-chrome","damaged-extraction","caption","list"].includes(r.sourceCategory));
const fallback = (r:any) => r.readerVisibleFallback ?? r.sourceFallback ?? r.fallbackStage !== "none";
const summary = {generatedAt:new Date().toISOString(), reports:files, totalRows:rows.length, ordinaryBody:{total:ordinary.length,readerVisibleFallbacks:ordinary.filter(fallback).length,rate:ordinary.filter(fallback).length/Math.max(1,ordinary.length)}, modelEligible:{total:modelEligible.length,fallbacks:modelEligible.filter(fallback).length,rate:modelEligible.filter(fallback).length/Math.max(1,modelEligible.length)}, byFallbackStage:Object.fromEntries(["pre-model","post-model","none"].map(stage=>[stage,rows.filter(r=>r.fallbackStage===stage).length]))};
fs.writeFileSync(path.join(dir,"translation-baseline-fresh-v1.json"),JSON.stringify(summary,null,2)+"\n");
console.log(JSON.stringify(summary,null,2));
