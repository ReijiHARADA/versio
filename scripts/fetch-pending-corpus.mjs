import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const pending = JSON.parse(readFileSync(join(root, "test-fixtures/real-papers/pending-oa-candidates.json"), "utf8"));
const outDir = join(root, "test-fixtures/real-papers/pending-pdfs");
mkdirSync(outDir, { recursive: true });

for (const candidate of pending.candidates) {
  const url = candidate.downloadUrl ?? (candidate.sourceUrl?.includes("arxiv.org/")
    ? candidate.sourceUrl.replace(/\/abs\//, "/pdf/").replace(/\.pdf$/, "") + ".pdf"
    : null);
  if (!url) {
    console.log(JSON.stringify({ id: candidate.id, status: "no-direct-pdf-url" }));
    continue;
  }
  const dest = join(outDir, `${candidate.id}.pdf`);
  try {
    const response = await fetch(url, { redirect: "follow", headers: { "User-Agent": "PaperReaderCorpusFetcher/1.0", Accept: "application/pdf" } });
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
