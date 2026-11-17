/**
 * Build the field-level gold corpus (local evaluation only, never redistributed).
 *
 *   npx vite-node --script scripts/fetch-field-gold.ts [--dry-run] [--only=europepmc,ja,arxiv,jstage,manual]
 *
 * Rights: only papers whose license is confirmed as Creative Commons are fetched
 * (Europe PMC `license`, arXiv OAI-PMH `<license>`, J-STAGE article-page CC link).
 * J-STAGE robots.txt disallows `/*_pdf` for crawlers, so J-STAGE PDFs are never
 * downloaded here: the script lists licensed candidates and ingests PDFs a person
 * saved by hand into `test-data/field-gold/jstage-inbox/<key>.pdf`.
 *
 * Data goes to gitignored `test-data/field-gold/`; only the manifest is committed.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { unpackSource as unpackArxivSource } from "./lib/arxivSource";
import { parseJatsFields } from "../src/evaluation/fieldGold/jats";
import { parseJstageFields } from "../src/evaluation/fieldGold/jstage";
import { parseLatexFields } from "../src/evaluation/fieldGold/latex";
import { acceptPair, goldFromManual, quotaKey, seededShuffle, stratifiedSample } from "../src/evaluation/fieldGold/sample";
import type { FieldGold, FieldName, FieldRecord, GoldSource } from "../src/evaluation/fieldGold/types";
import { elements, first, text } from "../src/evaluation/fieldGold/xml";

const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.join(root, "test-data/field-gold");
const cacheDir = path.join(dataDir, "_cache");
const manifestPath = path.join(root, "test-fixtures/field-gold/manifest.json");
const SEED = 20261115;
const UA = "VersioCorpusFetcher/1.0 (CC-licensed local evaluation corpus)";
const QUOTAS: Record<string, number> = {
  "europepmc/medicine": 25,
  "europepmc/social": 15,
  "europepmc/ja": 18,
  "arxiv/cs.HC": 25,
  "arxiv/other": 20,
  "jstage/ja": 18,
  "manual/manual": 15,
};
const ALL_TRUSTED: FieldName[] = ["title", "authors", "authorAffiliation", "emails", "captions", "references"];
const ARXIV_TRUSTED: FieldName[] = ["title", "authors", "captions", "references"];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = new Set((onlyArg ? onlyArg.slice(7) : "europepmc,ja,arxiv,jstage,manual").split(","));

type Candidate = { id: string; source: GoldSource; language: "en" | "ja"; discipline: string; license: string; sourceUrl: string; gold: FieldGold };
const excluded = { versionMismatch: 0, noLicense: 0, fetchFailed: 0, noBbl: 0 };
const accepted: Candidate[] = [];

// ---------- helpers ----------

const lastHit = new Map<string, number>();
const INTERVAL: Record<string, number> = { "arxiv.org": 3100, "oaipmh.arxiv.org": 3100, "www.jstage.jst.go.jp": 2000, "api.jstage.jst.go.jp": 2000, "f1000research.com": 1500 };
async function polite(url: string): Promise<void> {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + (INTERVAL[host] ?? 400) - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

async function get(url: string): Promise<Buffer | null> {
  await polite(url);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(90_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
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
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Normalized CC license name, or null when the license is not Creative Commons. */
function ccLicense(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").toLowerCase().trim();
  if (/publicdomain\/zero|^cc0/.test(t)) return "cc0";
  const url = t.match(/creativecommons\.org\/licenses\/(by(?:-nc)?(?:-sa|-nd)?)\//);
  if (url) return `cc ${url[1]}`;
  const name = t.match(/^cc[ -](by(?:-nc)?(?:-sa|-nd)?)$/);
  return name ? `cc ${name[1]}` : null;
}

const require = createRequire(import.meta.url);
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js") as typeof import("pdfjs-dist");
const cMapUrl = `${path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "cmaps")}/`;

async function firstPagesText(pdf: Buffer): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), disableWorker: true, cMapUrl, cMapPacked: true, useSystemFonts: true, verbosity: 0 } as never).promise;
  let out = "";
  for (let n = 1; n <= Math.min(2, doc.numPages); n += 1) {
    const content = await (await doc.getPage(n)).getTextContent();
    for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) out += (item.str ?? "") + (item.hasEOL ? "\n" : " ");
    out += "\n";
  }
  await doc.destroy();
  return out;
}

function goldOf(c: Omit<Candidate, "gold">, fields: FieldRecord, trustedFields: FieldName[], pdfPath: string, pdf: Buffer): FieldGold {
  // An empty reference list means the source lacked it, not that the paper has none.
  const trusted = trustedFields.filter(
    (f) =>
      (f !== "references" || fields.references.length > 0) &&
      // Without any author→affiliation link the pairing gold is unknown.
      (f !== "authorAffiliation" || fields.authors.some((a) => a.affiliationKeys.length > 0)),
  );
  return { id: c.id, source: c.source, language: c.language, discipline: c.discipline, pdfPath: path.relative(root, pdfPath), pdfSha256: sha256(pdf), trustedFields: trusted, fields };
}

async function consider(meta: Omit<Candidate, "gold">, fields: FieldRecord, trusted: FieldName[], pdf: Buffer, pdfPath: string): Promise<boolean> {
  let pageText: string;
  try {
    pageText = await firstPagesText(pdf);
  } catch {
    excluded.fetchFailed += 1;
    return false;
  }
  if (!acceptPair(fields, pageText, meta.language)) {
    excluded.versionMismatch += 1;
    return false;
  }
  accepted.push({ ...meta, gold: goldOf(meta, fields, trusted, pdfPath, pdf) });
  console.log(`  + ${meta.id} (${quotaKey(meta)} ${count(quotaKey(meta))})`);
  return true;
}

const count = (key: string) => accepted.filter((c) => quotaKey(c) === key).length;
const full = (key: string) => count(key) >= (QUOTAS[key] ?? 0);

// ---------- Europe PMC (English): reuse the already-downloaded CC corpus ----------

function epmcDiscipline(jats: string): string {
  const journal = text(first(jats, "journal-title")?.inner ?? "");
  const subjects = elements(jats, "subject").map((e) => text(e.inner)).join(" ");
  return /psycholog|social|sociol|educat|behavio|econom|communication|human[- ]computer|linguist|political/i.test(`${journal} ${subjects}`) ? "social" : "medicine";
}

async function europePmc(): Promise<void> {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/pending-oa-candidates.json"), "utf8")).candidates as Array<Record<string, string>>;
  const pdfDir = path.join(root, "test-fixtures/real-papers/pending-pdfs");
  const pool = catalog.filter((c) => c.pmcid && String(c.retrievalStatus).startsWith("downloaded") && fs.existsSync(path.join(pdfDir, `${c.id}.pdf`)));
  const licensed = pool.filter((c) => ccLicense(c.license));
  excluded.noLicense += pool.length - licensed.length;
  console.log(`europepmc: ${licensed.length} local CC PDFs with PMCID`);
  if (dryRun) return;
  for (const c of seededShuffle(licensed, SEED)) {
    if (full("europepmc/medicine") && full("europepmc/social")) break;
    const xml = await cached(`epmc/${c.pmcid}.xml`, `https://www.ebi.ac.uk/europepmc/webservices/rest/${c.pmcid}/fullTextXML`);
    if (!xml) { excluded.fetchFailed += 1; continue; }
    const jats = xml.toString("utf8");
    const discipline = epmcDiscipline(jats);
    if (full(`europepmc/${discipline}`)) continue;
    const pdfPath = path.join(pdfDir, `${c.id}.pdf`);
    await consider(
      { id: `epmc-${c.pmcid}`, source: "europepmc", language: "en", discipline, license: ccLicense(c.license)!, sourceUrl: `https://europepmc.org/article/PMC/${c.pmcid}` },
      parseJatsFields(jats), ALL_TRUSTED, fs.readFileSync(pdfPath), pdfPath,
    );
  }
}

// ---------- Europe PMC (Japanese full text, F1000Research PDFs) ----------

async function europePmcJapanese(): Promise<void> {
  const q = encodeURIComponent("LANG:jpn AND OPEN_ACCESS:y AND HAS_FT:y");
  const body = await get(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&pageSize=100&resultType=core`);
  if (!body) { console.log("ja: search failed"); return; }
  const results = JSON.parse(body.toString("utf8")).resultList.result as Array<Record<string, any>>;
  const licensed = results.filter((r) => ccLicense(r.license));
  excluded.noLicense += results.length - licensed.length;
  // Only F1000Research exposes a crawlable PDF URL derivable from the record; others are skipped.
  const f1000 = licensed.filter((r) => /^10\.12688\/f1000research\.\d+\.\d+$/.test(r.doi ?? "") && r.journalInfo?.volume && r.pageInfo);
  excluded.fetchFailed += licensed.length - f1000.length;
  console.log(`ja: ${results.length} Japanese OA full texts, ${licensed.length} CC, ${f1000.length} with fetchable PDF`);
  if (dryRun) return;
  for (const r of seededShuffle(f1000, SEED)) {
    if (full("europepmc/ja")) break;
    const version = r.doi.split(".").pop();
    const pdf = await cached(`ja/${r.pmcid}.pdf`, `https://f1000research.com/articles/${r.journalInfo.volume}-${r.pageInfo}/v${version}/pdf`);
    const xml = await cached(`epmc/${r.pmcid}.xml`, `https://www.ebi.ac.uk/europepmc/webservices/rest/${r.pmcid}/fullTextXML`);
    if (!isPdf(pdf) || !xml) { excluded.fetchFailed += 1; continue; }
    const id = `epmc-${r.pmcid}`;
    const pdfPath = path.join(dataDir, id, "source.pdf");
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    fs.writeFileSync(pdfPath, pdf);
    await consider(
      { id, source: "europepmc", language: "ja", discipline: "ja", license: ccLicense(r.license)!, sourceUrl: `https://europepmc.org/article/PMC/${r.pmcid}` },
      parseJatsFields(xml.toString("utf8")), ALL_TRUSTED, pdf, pdfPath,
    );
  }
}

// ---------- arXiv ----------

type ArxivRecord = { id: string; primary: string; license: string };

async function arxivCandidates(): Promise<ArxivRecord[]> {
  const out: ArxivRecord[] = [];
  let url: string | null = "https://oaipmh.arxiv.org/oai?verb=ListRecords&metadataPrefix=arXiv&set=cs&from=2025-10-01&until=2025-10-07";
  let page = 0;
  while (url && page < 20) {
    const body = await cached(`arxiv/oai-${page}.xml`, url);
    if (!body) break;
    const xml = body.toString("utf8");
    for (const rec of elements(xml, "arXiv")) {
      const id = text(first(rec.inner, "id")?.inner ?? "");
      const primary = text(first(rec.inner, "categories")?.inner ?? "").split(/\s+/)[0];
      const license = ccLicense(text(first(rec.inner, "license")?.inner ?? ""));
      if (!license) { excluded.noLicense += 1; continue; }
      out.push({ id, primary, license });
    }
    const token = text(first(xml, "resumptionToken")?.inner ?? "");
    url = token ? `https://oaipmh.arxiv.org/oai?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}` : null;
    page += 1;
  }
  return out;
}

/** Unpack an e-print into the cache and return the main .tex (inputs expanded) and its .bbl. */
function unpackSource(id: string, archive: Buffer): { mainTex: string; bbl: string | null } | null {
  return unpackArxivSource(archive, path.join(cacheDir, "arxiv-src", id.replace(/\//g, "_")));
}

/**
 * LaTeX author blocks vary by template; when the parsed list contains
 * institutions, places or emails, the author gold is not trusted for that paper.
 */
const NOT_A_NAME = /\b(univ|universit|institut|school|department|dept|lab|laborator|college|inc|corp|center|centre|academy|of|and|ph\.?d)\b|@|\d/i;
function plausibleAuthors(fields: FieldRecord): boolean {
  return fields.authors.length > 0 && fields.authors.every(({ name }) => {
    const tokens = name.trim().split(/\s+/);
    return tokens.length >= 2 && tokens.length <= 5 && !NOT_A_NAME.test(name) && /^\p{Lu}/u.test(name);
  });
}

async function arxiv(): Promise<void> {
  const candidates = await arxivCandidates();
  const hc = candidates.filter((c) => c.primary === "cs.HC").length;
  console.log(`arxiv: ${candidates.length} CC records (cs.HC primary ${hc})`);
  if (dryRun) return;
  for (const c of seededShuffle(candidates, SEED)) {
    const discipline = c.primary === "cs.HC" ? "cs.HC" : "other";
    if (full("arxiv/cs.HC") && full("arxiv/other")) break;
    if (full(`arxiv/${discipline}`)) continue;
    const safe = c.id.replace(/\//g, "_");
    const archive = await cached(`arxiv/${safe}.eprint`, `https://arxiv.org/e-print/${c.id}`);
    const src = archive && archive.length < 60e6 ? unpackSource(c.id, archive) : null;
    if (!src) { excluded.fetchFailed += 1; continue; }
    if (!src.bbl) { excluded.noBbl += 1; continue; }
    const id = `arxiv-${safe}`;
    const fields = parseLatexFields(src);
    const pdf = await cached(`arxiv/${safe}.pdf`, `https://arxiv.org/pdf/${c.id}`);
    if (!isPdf(pdf)) { excluded.fetchFailed += 1; continue; }
    const pdfPath = path.join(dataDir, id, "source.pdf");
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    fs.writeFileSync(pdfPath, pdf);
    await consider(
      { id, source: "arxiv", language: "en", discipline, license: c.license, sourceUrl: `https://arxiv.org/abs/${c.id}` },
      fields, ARXIV_TRUSTED.filter((f) => (f !== "authors" || plausibleAuthors(fields)) && (f !== "references" || fields.references.length > 0)), pdf, pdfPath,
    );
  }
}

// ---------- J-STAGE (metadata + license only; PDFs are saved by a person) ----------

const JSTAGE_KEYWORDS = ["デザイン", "インタフェース", "ユーザビリティ", "情報処理", "心理学", "教育", "看護", "社会学"];

async function jstage(): Promise<void> {
  const inbox = path.join(dataDir, "jstage-inbox");
  const listPath = path.join(dataDir, "jstage-candidates.json");
  fs.mkdirSync(inbox, { recursive: true });
  const known: Array<{ key: string; articleUrl: string; license: string; entryXml: string }> = fs.existsSync(listPath) ? JSON.parse(fs.readFileSync(listPath, "utf8")) : [];
  if (known.length < 40 && !dryRun) {
    for (const kw of JSTAGE_KEYWORDS) {
      const body = await get(`https://api.jstage.jst.go.jp/searchapi/do?service=3&keyword=${encodeURIComponent(kw)}&count=30`);
      if (!body) continue;
      for (const entry of elements(body.toString("utf8"), "entry")) {
        const doi = text(first(entry.inner, "prism:doi")?.inner ?? "");
        const link = entry.inner.match(/<link[^>]*href="([^"]+_article[^"]*)"/)?.[1];
        const titleJa = text(first(first(entry.inner, "article_title")?.inner ?? "", "ja")?.inner ?? "");
        if (!doi || !link || !titleJa || known.some((k) => k.key === doi)) continue;
        const page = await get(link.replace(/&amp;/g, "&"));
        const license = ccLicense(page?.toString("utf8").match(/https?:\/\/creativecommons\.org\/(?:licenses|publicdomain)\/[a-z0-9./-]+/i)?.[0]);
        if (!license) { excluded.noLicense += 1; continue; }
        known.push({ key: doi, articleUrl: link.replace(/&amp;/g, "&"), license, entryXml: `<entry>${entry.inner}</entry>` });
      }
    }
    fs.writeFileSync(listPath, JSON.stringify(known, null, 2));
  }
  console.log(`jstage: ${known.length} CC-licensed Japanese candidates (list: ${path.relative(root, listPath)}; save PDFs by hand as jstage-inbox/<doi with / → _>.pdf)`);
  if (dryRun) return;
  for (const k of known) {
    if (full("jstage/ja")) break;
    const inboxPdf = path.join(inbox, `${k.key.replace(/\//g, "_")}.pdf`);
    if (!fs.existsSync(inboxPdf)) continue;
    const { fields, trustedFields } = parseJstageFields({ searchApiXml: k.entryXml, fullTextJats: null });
    await consider(
      { id: `jstage-${k.key.replace(/[^\w.-]/g, "_")}`, source: "jstage", language: "ja", discipline: "ja", license: k.license, sourceUrl: k.articleUrl },
      fields, trustedFields, fs.readFileSync(inboxPdf), inboxPdf,
    );
  }
}

// ---------- existing hand-made ground truth ----------

function manual(): void {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8"));
  const gtDir = path.join(root, "test-fixtures/real-papers/ground-truth");
  let n = 0;
  for (const p of catalog.papers as Array<{ id: string; filename: string }>) {
    const gtPath = path.join(gtDir, `${p.id}.json`);
    const pdfPath = path.join(root, catalog.pdfDir, p.filename);
    if (!fs.existsSync(gtPath) || !fs.existsSync(pdfPath)) continue;
    n += 1;
    if (dryRun) continue;
    const gt = JSON.parse(fs.readFileSync(gtPath, "utf8"));
    // Only English and Japanese are in scope; a Chinese-titled ground truth would mislabel a language bucket.
    if (/\p{Script=Han}/u.test(gt.title ?? "") && !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(gt.title ?? "")) continue;
    const gold = goldFromManual(gt, path.relative(root, pdfPath), sha256(fs.readFileSync(pdfPath)));
    accepted.push({ id: gold.id, source: "manual", language: gold.language, discipline: "manual", license: "existing-local-corpus", sourceUrl: "", gold });
  }
  console.log(`manual: ${n} hand-made ground truths with local PDFs`);
}

// ---------- main ----------

fs.mkdirSync(cacheDir, { recursive: true });
if (only.has("manual")) manual();
if (only.has("europepmc")) await europePmc();
if (only.has("ja")) await europePmcJapanese();
if (only.has("arxiv")) await arxiv();
if (only.has("jstage")) await jstage();

if (!dryRun) {
  const sample = stratifiedSample(accepted, QUOTAS, SEED);
  for (const c of sample) {
    fs.mkdirSync(path.join(dataDir, c.id), { recursive: true });
    fs.writeFileSync(path.join(dataDir, c.id, "gold.json"), JSON.stringify(c.gold, null, 2));
  }
  const documents = sample
    .map(({ id, source, language, discipline, gold, license, sourceUrl }) => ({ id, source, language, discipline, pdfSha256: gold.pdfSha256, license, sourceUrl }))
    .sort((a, b) => a.id.localeCompare(b.id));
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(), seed: SEED, quotas: QUOTAS, excluded, documents }, null, 2)}\n`);
  const by = (f: (d: (typeof documents)[number]) => string) => Object.entries(documents.reduce<Record<string, number>>((m, d) => ({ ...m, [f(d)]: (m[f(d)] ?? 0) + 1 }), {}));
  console.log(`documents: ${documents.length}`);
  console.log(`by stratum: ${by((d) => `${d.source}/${d.discipline}`).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log(`by language: ${by((d) => d.language).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log(`excluded: ${JSON.stringify(excluded)}`);
}
