import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extractPdfPages } from '../src/test/readingOrder/extractPdf';
import { buildCaptionAnchoredTableSignature } from '../src/services/pdfService';
const root='test-data/real-papers'; const files=(await readdir(root)).filter(f=>f.toLowerCase().endsWith('.pdf'));
const oldLog=console.log; console.log=()=>{}; const papers:any[]=[];
for(const file of files){try{const pages=await extractPdfPages(path.join(root,file)); let anchored=0,rules=0; for(const p of pages){const s=buildCaptionAnchoredTableSignature(p.textItems,p.graphicsPrimitives);if(s){anchored++;rules+=s.horizontalRules+s.verticalRules;}} papers.push({file,pages:pages.length,anchoredPages:anchored,totalRules:rules});}catch(e){papers.push({file,error:String(e)});}}
console.log=oldLog; await mkdir(path.join(root,'reports'),{recursive:true}); await writeFile(path.join(root,'reports','table-signature-corpus-v1.json'),JSON.stringify({generatedAt:new Date().toISOString(),paperCount:papers.length,papers},null,2));
