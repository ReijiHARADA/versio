import {FIXTURES} from '../src/test/readingOrder/builders';
import {extractFromPages} from '../src/services/pdfExtraction/pipeline/extractAcademicPdf';
const pages=FIXTURES['japanese-conference']();
const r=extractFromPages({pages,paperId:'ja',filePath:'/tmp/ja.pdf',fileHash:'x',metadata:{pageCount:1}});
console.log('paper',JSON.stringify(r.paper,null,2));
console.log('layout',r.layoutBlocks.map(b=>({role:b.role,text:b.text,lines:b.lines.map(l=>({text:l.text,font:l.items.map(i=>i.fontName),size:l.fontSize,x:l.x,y:l.y}))})));
console.log('canonical',r.canonical.nodes.map(n=>({role:n.role,text:n.text,e:n.evidence})));
