import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const pending = JSON.parse(readFileSync(join(root, "test-fixtures/real-papers/pending-oa-candidates.json"), "utf8"));
const outDir = join(root, "test-fixtures/real-papers/pending-pdfs");
mkdirSync(outDir, { recursive: true });

async function resolveDirectPdfUrl(candidate) {
  if (candidate.downloadUrl) return candidate.downloadUrl;
  if (candidate.sourceUrl?.includes("arxiv.org/")) {
    return candidate.sourceUrl.replace(/\/abs\//, "/pdf/").replace(/\.pdf$/, "") + ".pdf";
  }
  // PMC article pages expose the publisher/author-manuscript PDF link in HTML.
  // Resolve it generically so catalog entries can retain a stable article URL.
  if (candidate.sourceUrl?.includes("pmc.ncbi.nlm.nih.gov/articles/")) {
    const pmcId = candidate.sourceUrl.match(/\/articles\/(PMC\d+)/i)?.[1];
    if (pmcId) return `https://europepmc.org/articles/${pmcId}?pdf=render`;
    const response = await fetch(candidate.sourceUrl, {
      redirect: "follow",
      headers: { "User-Agent": "VersioCorpusFetcher/1.0", Accept: "text/html" },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const html = await response.text();
    const links = [...html.matchAll(/href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)]
      .map((match) => new URL(match[1], candidate.sourceUrl).href);
    const preferred = links.find((url) => /pmc|nih|ncbi/i.test(url)) ?? links[0];
    if (preferred) return preferred;
  }
  return null;
}

for (const candidate of pending.candidates) {
  let url;
  try {
    url = await resolveDirectPdfUrl(candidate);
  } catch (error) {
    console.log(JSON.stringify({ id: candidate.id, status: "failed-resolving-url", error: String(error) }));
    continue;
  }
  if (!url) {
    console.log(JSON.stringify({ id: candidate.id, status: "no-direct-pdf-url" }));
    continue;
  }
  const dest = join(outDir, `${candidate.id}.pdf`);
  try {
    const response = await fetch(url, { redirect: "follow", headers: { "User-Agent": "VersioCorpusFetcher/1.0", Accept: "application/pdf" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 8000 || !bytes.subarray(0, 5).toString("latin1").startsWith("%PDF")) {
      throw new Error(`response is not a PDF (${bytes.length} bytes)`);
    }
    writeFileSync(dest, bytes);
    console.log(JSON.stringify({ id: candidate.id, status: "downloaded", path: dest, bytes: bytes.length, sourceUrl: candidate.sourceUrl }));
  } catch (error) {
    console.log(JSON.stringify({ id: candidate.id, status: "failed", url, error: String(error) }));
  }
}
