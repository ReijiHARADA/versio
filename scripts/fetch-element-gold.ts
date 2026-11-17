/**
 * Element-gold drafts for papers outside Europe PMC (local evaluation only, never redistributed).
 *
 *   npx vite-node --script scripts/fetch-element-gold.ts -- [--arxiv 20] [--acl 20] [--redraft [--ids a,b]]
 *
 * - arXiv: CC BY 4.0 papers (license from the arXiv OAI-PMH record) across subject
 *   sets; the PDF is compiled from the same LaTeX source, so the versions match.
 * - ACL Anthology: conference papers (CC BY 4.0 since 2016) that also have an arXiv
 *   source; the PDF is the Anthology camera-ready, the draft comes from the arXiv LaTeX.
 *
 * Each paper gets test-data/element-gold/<id>/{source.pdf, draft.json}. The draft is
 * LaTeX-derived and snapped onto the PDF's printed words (src/evaluation/elementGold/snap.ts);
 * it becomes gold.json only after a Claude review against the rendered pages
 * (docs/ELEMENT_GOLD.md). Unreviewed drafts are never scored.
 */
import fs from "node:fs";
import path from "node:path";
import { latexElementDraft } from "../src/evaluation/elementGold/latex";
import { printedWords, snapToPrinted } from "../src/evaluation/elementGold/snap";
import type { ElementGold } from "../src/evaluation/elementGold/types";
import { similarity } from "../src/evaluation/fieldGold/normalize";
import { seededShuffle } from "../src/evaluation/fieldGold/sample";
import { elements, first, text } from "../src/evaluation/fieldGold/xml";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { unpackSource } from "./lib/arxivSource";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const num = (name: string, fallback: number) => (args.includes(`--${name}`) ? Number(args[args.indexOf(`--${name}`) + 1]) : fallback);
const wantArxiv = num("arxiv", 20);
const wantAcl = num("acl", 20);
const outRoot = path.join(root, "test-data/element-gold");
const cacheDir = path.join(outRoot, "_cache");
const SEED = 20261117;
const MAX_PAGES = 25;
const CC_BY = "http://creativecommons.org/licenses/by/4.0/";
const UA = "VersioCorpusFetcher/1.0 (CC-licensed local evaluation corpus)";

// ---------- polite cached fetch ----------
const lastHit = new Map<string, number>();
async function get(url: string): Promise<Buffer | null> {
  const host = new URL(url).host;
  const gap = /arxiv\.org$/.test(host) ? 3100 : 600;
  const wait = (lastHit.get(host) ?? 0) + gap - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(90_000) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
async function cached(file: string, url: string): Promise<Buffer | null> {
  const p = path.join(cacheDir, file);
  if (fs.existsSync(p)) return fs.readFileSync(p);
  const body = await get(url);
  if (!body) return null;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return body;
}
const isPdf = (b: Buffer | null): b is Buffer => !!b && b.subarray(0, 5).toString() === "%PDF-";

// ---------- draft ----------
type Entry = { id: string; source: ElementGold["source"]; license: string; sourceUrl: string; pdfUrl: string; arxivId: string; discipline: string };
const index: Entry[] = fs.existsSync(path.join(outRoot, "index.json")) ? JSON.parse(fs.readFileSync(path.join(outRoot, "index.json"), "utf8")) : [];
const excluded: Record<string, number> = {};
const skip = (why: string) => { excluded[why] = (excluded[why] ?? 0) + 1; return false; };

/** Build, snap and save a draft; false when the source and PDF do not agree well enough to review. */
async function draft(entry: Entry, pdf: Buffer): Promise<boolean> {
  const safe = entry.arxivId.replace(/\//g, "_");
  const archive = await cached(`arxiv/${safe}.eprint`, `https://arxiv.org/e-print/${entry.arxivId}`);
  const src = archive && archive.length < 60e6 ? unpackSource(archive, path.join(cacheDir, "arxiv-src", safe)) : null;
  if (!src) return skip("no LaTeX source");
  const pdfPath = path.join(cacheDir, "pdf", `${entry.id}.pdf`);
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  fs.writeFileSync(pdfPath, pdf);
  let pages;
  try {
    pages = await extractPdfPages(pdfPath);
  } catch {
    return skip("unreadable PDF");
  }
  if (pages.length > MAX_PAGES) return skip(`over ${MAX_PAGES} pages`);
  const printed = printedWords(pages.map((p) => p.textItems.map((t) => t.text).join(" ")).join("\n"));
  const d = latexElementDraft(src, { id: entry.id, source: entry.source, license: entry.license, sourceUrl: entry.sourceUrl });
  if (d.paragraphs.length < 10) return skip("too few paragraphs in draft");
  const snapped = d.paragraphs.map((p) => snapToPrinted(p, printed));
  const median = snapped.map((s) => s.matched).sort((a, b) => a - b)[snapped.length >> 1];
  // Another version (the arXiv text was revised after the camera-ready), or a source the draft cannot read.
  if (median < 0.9) return skip("source and PDF disagree");
  const snap = (s: string) => { const r = snapToPrinted(s, printed); return r.matched >= 0.6 ? r.text : s; };
  const out: ElementGold & { check: Record<string, unknown> } = {
    ...d,
    paragraphs: snapped.filter((s) => s.matched >= 0.6).map((s) => s.text),
    footnotes: d.footnotes.map(snap),
    figures: d.figures.map((f) => ({ ...f, caption: snap(f.caption) })),
    tables: d.tables.map((t) => ({ ...t, caption: snap(t.caption) })),
    // For the reviewer: draft items the printed text did not confirm.
    check: {
      pages: pages.length,
      droppedParagraphs: snapped.filter((s) => s.matched < 0.6).length,
      unconfirmedParagraphs: snapped.map((s, i) => ({ i, m: s.matched })).filter((s) => s.m >= 0.6 && s.m < 0.85).length,
    },
  };
  const dir = path.join(outRoot, entry.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "source.pdf"), pdf);
  fs.writeFileSync(path.join(dir, "draft.json"), JSON.stringify(out, null, 1));
  if (!index.some((e) => e.id === entry.id)) index.push(entry);
  fs.writeFileSync(path.join(outRoot, "index.json"), JSON.stringify(index, null, 1));
  console.log(`  + ${entry.id} (${pages.length} pp, ${out.paragraphs.length} paragraphs)`);
  return true;
}

// ---------- arXiv (CC BY 4.0, several subject sets) ----------
const ARXIV_QUOTA: Array<[string, number]> = [["cs", 4], ["math", 3], ["physics:cond-mat", 2], ["physics:astro-ph", 2], ["stat", 2], ["q-bio", 2], ["eess", 2], ["econ", 2], ["q-fin", 1]];
async function arxiv(): Promise<void> {
  let total = index.filter((e) => e.source === "arxiv").length;
  for (const [set, quota] of ARXIV_QUOTA) {
    if (total >= wantArxiv) break;
    let have = index.filter((e) => e.source === "arxiv" && e.discipline === set).length;
    if (have >= quota) continue;
    const url = `https://oaipmh.arxiv.org/oai?verb=ListRecords&metadataPrefix=arXiv&set=${encodeURIComponent(set)}&from=2025-09-01&until=2025-09-05`;
    const xml = (await cached(`oai/${set.replace(":", "_")}.xml`, url))?.toString("utf8") ?? "";
    const records = elements(xml, "arXiv")
      .map((r) => ({ id: text(first(r.inner, "id")?.inner ?? ""), license: text(first(r.inner, "license")?.inner ?? "") }))
      .filter((r) => r.id && r.license === CC_BY);
    console.log(`arxiv ${set}: ${records.length} CC BY 4.0 records`);
    for (const r of seededShuffle(records, SEED)) {
      if (have >= quota || total >= wantArxiv) break;
      const id = `arxiv-${r.id.replace(/\//g, "_")}`;
      if (index.some((e) => e.id === id)) continue;
      const pdf = await cached(`pdf-dl/${id}.pdf`, `https://arxiv.org/pdf/${r.id}`);
      if (!isPdf(pdf)) { skip("PDF fetch failed"); continue; }
      if (await draft({ id, source: "arxiv", license: "CC BY 4.0", sourceUrl: `https://arxiv.org/abs/${r.id}`, pdfUrl: `https://arxiv.org/pdf/${r.id}`, arxivId: r.id, discipline: set }, pdf)) { have += 1; total += 1; }
    }
  }
}

// ---------- ACL Anthology (CC BY 4.0) with an arXiv source ----------
const ACL_VOLUMES = ["2024.acl", "2023.emnlp", "2024.naacl", "2024.eacl", "2023.acl", "2024.emnlp"];
async function arxivIdForTitle(title: string): Promise<string | null> {
  const q = title.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  const feed = (await get(`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(`ti:"${q}"`)}&max_results=3`))?.toString("utf8") ?? "";
  for (const entry of elements(feed, "entry")) {
    const t = text(first(entry.inner, "title")?.inner ?? "");
    const id = text(first(entry.inner, "id")?.inner ?? "").replace(/^https?:\/\/arxiv\.org\/abs\//, "").replace(/v\d+$/, "");
    if (id && similarity(t, title) >= 0.95) return id;
  }
  return null;
}
async function acl(): Promise<void> {
  const perVolume = Math.ceil(wantAcl / 4);
  for (const volume of ACL_VOLUMES) {
    let have = index.filter((e) => e.source === "acl" && e.discipline === volume).length;
    const xml = (await cached(`acl/${volume}.xml`, `https://raw.githubusercontent.com/acl-org/acl-anthology/master/data/xml/${volume}.xml`))?.toString("utf8") ?? "";
    // Main-conference long and short papers only (not demos, tutorials or front matter).
    const papers = elements(xml, "volume")
      .filter((v) => /^(long|short|main)$/.test(v.attrs.id ?? ""))
      .flatMap((v) => elements(v.inner, "paper").map((p) => ({ anthology: `${volume}-${v.attrs.id}.${p.attrs.id}`, title: text(first(p.inner, "title")?.inner ?? "") })))
      .filter((p) => p.title);
    console.log(`acl ${volume}: ${papers.length} papers`);
    let tries = 0;
    for (const p of seededShuffle(papers.map((x) => ({ ...x, id: x.anthology })), SEED)) {
      if (have >= perVolume || index.filter((e) => e.source === "acl").length >= wantAcl || tries >= perVolume * 15) break;
      const id = `acl-${p.anthology}`;
      if (index.some((e) => e.id === id)) continue;
      tries += 1;
      const arxivId = await arxivIdForTitle(p.title);
      if (!arxivId) { skip("ACL paper not on arXiv"); continue; }
      const pdf = await cached(`pdf-dl/${id}.pdf`, `https://aclanthology.org/${p.anthology}.pdf`);
      if (!isPdf(pdf)) { skip("PDF fetch failed"); continue; }
      if (await draft({ id, source: "acl", license: "CC BY 4.0", sourceUrl: `https://aclanthology.org/${p.anthology}/`, pdfUrl: `https://aclanthology.org/${p.anthology}.pdf`, arxivId, discipline: volume }, pdf)) have += 1;
    }
  }
}

if (args.includes("--redraft")) {
  // Rebuild drafts from the cache after a draft-builder change (no network for cached papers).
  const only = args.includes("--ids") ? args[args.indexOf("--ids") + 1].split(",") : null;
  for (const entry of index.filter((e) => !only || only.includes(e.id))) {
    const pdf = fs.readFileSync(path.join(outRoot, entry.id, "source.pdf"));
    if (!(await draft(entry, pdf))) console.log(`  ! ${entry.id} no longer passes; left as before`);
  }
} else {
  await arxiv();
  await acl();
}
console.log(`\n${index.filter((e) => e.source === "arxiv").length} arXiv + ${index.filter((e) => e.source === "acl").length} ACL drafts; excluded`, excluded);
