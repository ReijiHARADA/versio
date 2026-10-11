import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
const textItems = [
  { text: "Table 4. Summary", x: 80, y: 100, width: 140, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
  ...Array.from({ length: 7 }, (_, row) => [
    { text: `Method${row + 1}`, x: 80, y: 125 + row * 14, width: 52, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
    { text: row % 2 ? "Camera" : "Sensor", x: 155, y: 125 + row * 14, width: 48, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
    { text: `${10 + row}`, x: 225, y: 125 + row * 14, width: 20, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
    { text: `${80 + row}.5%`, x: 285, y: 125 + row * 14, width: 34, height: 8, fontSize: 8, fontName: "Helvetica", page: 1 },
  ]).flat(),
];
const result = extractFromPages({ pages: [{ pageNumber: 1, width: 500, height: 700, textItems }], paperId: "captioned-grid", filePath: "/tmp/captioned-grid.pdf", fileHash: "captioned-grid", metadata: { pageCount: 1 } });
console.log("layout", result.layoutBlocks.map((b) => ({ role:b.role, text:b.text, lines:b.lines.map(l=>({text:l.text, items:l.items.map(i=>({text:i.text,x:i.x,width:i.width,font:i.fontName,size:i.fontSize}))})) })));
console.log("blocks", result.blocks.map((b) => ({type:b.type, original:b.original})));
console.log("nodes", result.canonical.nodes.map(n=>({role:n.role,text:n.text,label:n.structuralLabel,e:n.evidence})));
