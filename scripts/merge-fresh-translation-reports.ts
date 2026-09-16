import fs from "node:fs";
import path from "node:path";
const dir="test-data/real-papers/reports";
const names=(process.env.FRESH_TRANSLATION_REPORTS??"").split(",").map(s=>s.trim()).filter(Boolean);
if(!names.length) throw new Error("Set FRESH_TRANSLATION_REPORTS to comma-separated report filenames");
const papers=names.flatMap(name=>{const r=JSON.parse(fs.readFileSync(path.join(dir,name),"utf8"));return r.papers??[]});
const out={schemaVersion:1,generatedAt:new Date().toISOString(),sourceReports:names,papers};
fs.writeFileSync(path.join(dir,"translation-audit-fresh-v1.json"),JSON.stringify(out,null,2)+"\n");
console.log(`merged ${papers.length} papers from ${names.length} fresh reports`);
