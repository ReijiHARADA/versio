/** Reference-zone lines whose font differs from the zone median, for one field-gold document (local diagnostics only). */
import fs from "node:fs";
import path from "node:path";
import { referenceZoneLines } from "../src/services/pdfExtraction/crf/referenceZone";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";

const root = path.resolve(import.meta.dirname, "..");
const id = process.argv[process.argv.indexOf("--id") + 1];
const pdf = JSON.parse(fs.readFileSync(path.join(root, "test-data/field-gold", id, "gold.json"), "utf8")).pdfPath as string;
const pages = await extractPdfPages(path.join(root, pdf));
const zone = referenceZoneLines(pages) ?? [];
const sizes = zone.map((l) => l.fontSize).sort((a, b) => a - b);
const median = sizes[sizes.length >> 1];
console.log(`lines ${zone.length} median font ${median?.toFixed(2)}`);
zone.forEach((l, i) => {
  if (Math.abs(l.fontSize - median) > 0.4 || /^(appendix|supplement|[A-H](\.\d+)*\s+[A-Z])/i.test(l.text)) console.log(i, `p${l.page}`, l.fontSize.toFixed(1), l.text.slice(0, 70));
});
