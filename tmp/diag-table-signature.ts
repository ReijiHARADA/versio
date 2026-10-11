import { extractPdfPages } from '../src/test/readingOrder/extractPdf';
import { buildCaptionAnchoredTableSignature } from '../src/services/pdfService';
const pages=await extractPdfPages('/Users/harada/Desktop/2686612.2686699.pdf');
for(const p of pages){
 const sig=buildCaptionAnchoredTableSignature(p.textItems,p.graphicsPrimitives??[]);
 const caps=p.textItems.filter(i=>/^Table\s+\d/i.test(i.text));
 if(caps.length||sig) console.log(JSON.stringify({page:p.pageNumber,caps:caps.map(i=>({text:i.text,x:i.x,y:i.y,w:i.width,h:i.height})),graphics:(p.graphicsPrimitives??[]).length,sig},null,2));
}
