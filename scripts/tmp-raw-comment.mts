import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
const pages = await extractPdfPages("/Users/harada/Desktop/2686612.2686699.pdf");
const page = pages.find(p => p.pageNumber === 7)!;
const items = [...page.textItems].sort((a,b)=>a.y-b.y||a.x-b.x)
  .filter(i => i.y > 100 && i.y < 140);
for (const i of items) console.log(JSON.stringify({y:+i.y.toFixed(1),x:+i.x.toFixed(1),f:i.fontName,t:i.text}));
