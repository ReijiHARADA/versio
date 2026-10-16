import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { reconstructDocument } from "../src/services/pdfLayout.ts";

const pdf = "/Users/harada/Desktop/2686612.2686699.pdf";
const pages = await extractPdfPages(pdf);
const doc = reconstructDocument(pages);
for (const b of doc.blocks.filter(b => /^(follows|triggered|following comment):?$/i.test(b.text.trim()) || /follows:|triggered:/.test(b.text))) {
  console.log(JSON.stringify({
    role: b.role, page: b.pageStart, text: b.text,
    font: b.lines[0]?.fontName, size: b.lines[0]?.fontSize,
    items: b.lines[0]?.items?.map(i=>({t:i.text,f:i.fontName,s:i.fontSize})),
  }, null, 2));
}
// also show previous line context for follows on page 9
const p9 = doc.blocks.filter(b => b.pageStart === 9);
const i = p9.findIndex(b => /^follows:/i.test(b.text.trim()));
console.log("neighbors:");
for (const b of p9.slice(Math.max(0,i-3), i+4)) {
  console.log(b.role, b.lines[0]?.fontSize, b.lines[0]?.fontName?.slice(0,40), JSON.stringify(b.text.slice(0,70)));
}
