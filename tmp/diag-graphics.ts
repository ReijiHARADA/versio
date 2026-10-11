import { extractPdfPages } from '../src/test/readingOrder/extractPdf';
const ps=await extractPdfPages('/Users/harada/Desktop/2686612.2686699.pdf');
for(const p of ps.filter(p=>[5,6,8].includes(p.pageNumber))) console.log('PAGE',p.pageNumber,JSON.stringify((p.graphicsPrimitives??[]).map(x=>({...x})),null,2));
