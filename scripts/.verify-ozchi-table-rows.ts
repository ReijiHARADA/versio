import { extractPdfPages } from '../src/test/readingOrder/extractPdf.ts';
import { extractFromPages } from '../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts';
import { attachLinesToBlocks } from '../src/data/package/layoutFromExtraction.ts';
const filePath = '/Users/harada/Desktop/2686612.2686699.pdf';
const pages = await extractPdfPages(filePath);
const extracted = extractFromPages({ pages, paperId: 'ozchi-rows', filePath, fileHash: 'x', metadata: { pageCount: pages.length } });
const blocks = attachLinesToBlocks(extracted.blocks, extracted.layoutBlocks);
console.log(JSON.stringify(blocks.filter((block) => /^(?:Finger Thumb Finger1|Function Call tapped contact|Finger Phonebook Gallery)/.test(block.original ?? '')).map((block) => ({ page: block.pageStart, original: block.original, rows: block.metadata.tableRows })), null, 2));
