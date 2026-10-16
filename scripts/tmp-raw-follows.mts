import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
const pdf = "/Users/harada/Desktop/2686612.2686699.pdf";
const pages = await extractPdfPages(pdf);
const page = pages.find(p => p.pageNumber === 9)!;
const items = page.textItems
  .filter(i => /follow|trigger|comment|negative comments|confusing/i.test(i.text))
  .sort((a,b)=>a.y-b.y || a.x-b.x);
for (const i of items) {
  console.log(JSON.stringify({y:i.y.toFixed(1),x:i.x.toFixed(1),s:i.fontSize,f:i.fontName,t:i.text}));
}
