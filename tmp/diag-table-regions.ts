import { extractPdfPages } from '../src/test/readingOrder/extractPdf';
import { generateGenericCandidates } from '../src/services/pdfExtraction/generic/candidates';
import { buildTableRegionEvidence } from '../src/services/pdfExtraction/generic/tableRegions';
const pages=await extractPdfPages('/Users/harada/Desktop/2686612.2686699.pdf'); const g=generateGenericCandidates(pages); const rs=buildTableRegionEvidence(pages,g.candidates); console.log(JSON.stringify(rs,null,2));
