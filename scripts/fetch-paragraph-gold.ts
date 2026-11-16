/**
 * Paragraph-gold corpus for the extraction audit (local evaluation only, never redistributed).
 *
 *   npx vite-node --script scripts/fetch-paragraph-gold.ts [--limit N]
 *
 * Takes the CC-licensed Europe PMC PDFs already downloaded by fetch-oa-europepmc
 * (test-fixtures/real-papers/pending-pdfs, license checked through the Europe PMC
 * API) and fetches each paper's publisher JATS (Europe PMC fullTextXML, free) as
 * paragraph gold. Writes the list to gitignored test-data/paragraph-gold/index.json;
 * the JATS cache is shared with the field-gold corpus.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const limit = Number(args[args.indexOf("--limit") + 1] ?? Infinity) || Infinity;
const pdfDir = path.join(root, "test-fixtures/real-papers/pending-pdfs");
const cacheDir = path.join(root, "test-data/field-gold/_cache/epmc");
const outPath = path.join(root, "test-data/paragraph-gold/index.json");
fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(path.dirname(outPath), { recursive: true });

type Candidate = { id: string; pmcid?: string; license?: string; licenseVerifiedVia?: string };
const candidates = (JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/pending-oa-candidates.json"), "utf8")) as { candidates: Candidate[] }).candidates
  .filter((c) => c.pmcid && /^cc by/.test(c.license ?? "") && c.licenseVerifiedVia === "europepmc-api" && fs.existsSync(path.join(pdfDir, `${c.id}.pdf`)))
  .slice(0, limit);

const docs: Array<{ id: string; pdf: string }> = [];
let failed = 0;
async function one(c: Candidate) {
  const xmlPath = path.join(cacheDir, `${c.pmcid}.xml`);
  if (!fs.existsSync(xmlPath)) {
    try {
      const res = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/${c.pmcid}/fullTextXML`, { headers: { "User-Agent": "VersioCorpusFetcher/1.0 (CC-licensed local evaluation corpus)" }, signal: AbortSignal.timeout(45_000) });
      const xml = res.ok ? await res.text() : "";
      if (!/<body[\s>]/.test(xml)) throw new Error(String(res.status));
      fs.writeFileSync(xmlPath, xml);
    } catch {
      failed += 1;
      return;
    }
  }
  docs.push({ id: `epmc-${c.pmcid}`, pdf: path.relative(root, path.join(pdfDir, `${c.id}.pdf`)) });
}
// The Europe PMC full-text endpoint takes several seconds per paper; a few requests run at once.
let next = 0;
await Promise.all(Array.from({ length: 10 }, async () => {
  while (next < candidates.length) await one(candidates[next++]);
}));
const seen = new Set<string>();
const unique = docs.filter((d) => !seen.has(d.id) && seen.add(d.id)).sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(outPath, JSON.stringify(unique, null, 1));
console.log(`\n${unique.length} papers with JATS gold, ${failed} without full text`);
