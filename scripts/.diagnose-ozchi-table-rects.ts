import { extractPdfPages } from '../src/test/readingOrder/extractPdf.ts';
import { reconstructDocument, figureImageRect } from '../src/services/pdfLayout.ts';
const pdf='/Users/harada/Desktop/2686612.2686699.pdf';
const pages=await extractPdfPages(pdf);
const {blocks, layouts}=reconstructDocument(pages);
console.log(JSON.stringify(blocks.filter(b=>/^Table\s+[1-5]\b/i.test(b.text.trim())).map(c=>({
  page:c.pageStart, text:c.text, bbox:c.bbox, column:c.column,
  rect: figureImageRect(c, blocks, layouts.find(l=>l.page===c.pageStart)!),
  nearby: blocks.filter(b=>b.pageStart===c.pageStart && b!==c && Math.abs(b.bbox.y-c.bbox.y)<330).map(b=>({role:b.role,text:b.text.slice(0,220),bbox:b.bbox,column:b.column,items:b.lines.flatMap(l=>l.items).length}))
})),null,2));
