import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";

const pdf = path.join(
  "test-fixtures/real-papers/pending-pdfs",
  process.argv[2] ||
    "epmc-digital-behavioral-addictions-in-adolescents-and-young-adults-protocol-f.pdf"
);

async function main() {
  const pages = await extractPdfPages(pdf);
  const page = pages[0]!;
  const items = [...(page.items || [])].map((it: any) => ({
    t: String(it.str || it.text || "").trim(),
    x: Math.round(it.x ?? it.transform?.[4] ?? 0),
    y: Math.round(it.y ?? it.transform?.[5] ?? 0),
    fs: Math.round((it.fontSize || it.height || 0) * 10) / 10,
  }));
  const nonempty = items.filter((i) => i.t);
  nonempty.sort((a, b) => b.fs - a.fs || b.y - a.y || a.x - b.x);
  console.log("TOP FONT:");
  for (const it of nonempty.slice(0, 40)) {
    console.log(`${it.fs}\t${it.y}\t${it.x}\t${it.t.slice(0, 100)}`);
  }
  console.log("\nY-ORDER top band:");
  const band = nonempty.filter((i) => i.y > 600 || i.fs >= 11).sort((a, b) => b.y - a.y || a.x - b.x);
  for (const it of band.slice(0, 60)) {
    console.log(`${it.fs}\t${it.y}\t${it.x}\t${it.t.slice(0, 100)}`);
  }
}
main();
