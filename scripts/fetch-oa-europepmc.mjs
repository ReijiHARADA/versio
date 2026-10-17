/**
 * Download CC-licensed OA PDFs discovered via Europe PMC (explicit license + isOpenAccess).
 * PDF bytes come from Unpaywall / publisher OA links (Europe PMC ?pdf=render is often CF-blocked).
 * Only stores files when Europe PMC reports isOpenAccess=Y and a CC license.
 *
 *   node scripts/fetch-oa-europepmc.mjs [--limit=40]
 *
 * PDFs stay local (gitignored under pending-pdfs/). Only pending-oa-candidates.json is committed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const outDir = join(root, "test-fixtures/real-papers/pending-pdfs");
const catalogPath = join(root, "test-fixtures/real-papers/pending-oa-candidates.json");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 40;
const UNPAYWALL_EMAIL = process.env.UNPAYWALL_EMAIL ?? "you@example.com";

mkdirSync(outDir, { recursive: true });

const queries = [
  'LICENSE:"cc by" AND HAS_PDF:y AND ("human-computer interaction" OR HCI OR ergonomics OR "user experience")',
  'LICENSE:"cc by" AND HAS_PDF:y AND (linguistics OR "discourse analysis" OR morphology OR pragmatics)',
  'LICENSE:"cc by" AND HAS_PDF:y AND ("machine learning" OR "deep learning") AND (review OR survey)',
  'LICENSE:"cc by-nc" AND HAS_PDF:y AND (ergonomics OR "occupational health" OR "human factors")',
  'LICENSE:"cc by" AND HAS_PDF:y AND ("cognitive psychology" OR "eye tracking" OR "eye-tracking" OR gaze)',
  'LICENSE:"cc by" AND HAS_PDF:y AND ("natural language processing" OR NLP OR "computational linguistics")',
  'LICENSE:"cc by" AND HAS_PDF:y AND (usability OR "user interface" OR "human-robot interaction")',
  'LICENSE:"cc by" AND HAS_PDF:y AND ("systematic review" OR "scoping review") AND (psychology OR neuroscience)',
  'LICENSE:"cc by" AND HAS_PDF:y AND (frontiers OR "scientific reports" OR plos) AND (attention OR memory OR perception)',
  'LICENSE:"cc by" AND HAS_PDF:y AND ("information retrieval" OR "recommender systems" OR "knowledge graph")',
  'LICENSE:"cc by" AND HAS_PDF:y AND ("computer vision" OR "image segmentation" OR "object detection") AND (review OR survey)',
  'LICENSE:"cc by" AND HAS_PDF:y AND (education OR "learning sciences" OR "instructional design") AND (digital OR online OR technology)',
  'LICENSE:"cc by-nc" AND HAS_PDF:y AND ("public health" OR epidemiology) AND (intervention OR trial)',
];

function slugify(title) {
  return String(title || "paper")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function licenseOk(license) {
  const t = String(license || "").toLowerCase();
  return /^cc by/.test(t) || t.includes("creative commons attribution");
}

async function search(query) {
  const url =
    "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" +
    new URLSearchParams({
      query,
      resultType: "core",
      format: "json",
      pageSize: "50",
    });
  const json = await (await fetch(url, { headers: { Accept: "application/json" } })).json();
  return json.resultList?.result ?? [];
}

async function fetchPdfBytes(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "PaperReaderCorpusFetcher/1.0 (OA CC-licensed evaluation corpus)",
      Accept: "application/pdf,*/*",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 8000 || !bytes.subarray(0, 5).toString("latin1").startsWith("%PDF")) {
    throw new Error(`not a PDF (${bytes.length} bytes, ${response.headers.get("content-type") || "?"})`);
  }
  return bytes;
}

function isPmcViewerUrl(url) {
  return /(?:^|\.)ncbi\.nlm\.nih\.gov\/pmc\b|pmc\.ncbi\.nlm\.nih\.gov|europepmc\.org\/articles\//i.test(url);
}

async function resolveUnpaywallPdfUrl(doi) {
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(UNPAYWALL_EMAIL)}`;
  const json = await (await fetch(url, { headers: { Accept: "application/json" } })).json();
  if (!json?.is_oa) throw new Error("unpaywall not OA");
  const locations = [
    json.best_oa_location,
    ...(Array.isArray(json.oa_locations) ? json.oa_locations : []),
  ].filter(Boolean);
  // Prefer publisher PDFs; PMC/EuropePMC viewer URLs often return a POW HTML interstitial.
  const ranked = [...locations].sort((a, b) => {
    const score = (loc) => {
      const pdfUrl = loc.url_for_pdf || loc.url || "";
      if (loc.host_type === "publisher" && !isPmcViewerUrl(pdfUrl)) return 0;
      if (!isPmcViewerUrl(pdfUrl)) return 1;
      return 2;
    };
    return score(a) - score(b);
  });
  const errors = [];
  for (const loc of ranked) {
    const pdfUrl = loc.url_for_pdf || (/\.pdf(\?|$)/i.test(loc.url || "") ? loc.url : null);
    if (!pdfUrl) continue;
    if (isPmcViewerUrl(pdfUrl)) {
      errors.push("pmc-viewer");
      continue;
    }
    return { pdfUrl, license: loc.license || json.best_oa_location?.license || null };
  }
  throw new Error(errors.length ? "unpaywall only pmc viewer urls" : "unpaywall has no pdf url");
}

async function downloadPdf({ doi, pmcid, dest }) {
  const errors = [];
  if (doi) {
    try {
      const { pdfUrl, license } = await resolveUnpaywallPdfUrl(doi);
      const bytes = await fetchPdfBytes(pdfUrl);
      writeFileSync(dest, bytes);
      return { bytes: bytes.length, downloadUrl: pdfUrl, via: "unpaywall", unpaywallLicense: license };
    } catch (error) {
      errors.push(`unpaywall:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    const url = `https://europepmc.org/articles/${pmcid}?pdf=render`;
    const bytes = await fetchPdfBytes(url);
    writeFileSync(dest, bytes);
    return { bytes: bytes.length, downloadUrl: url, via: "europepmc-render" };
  } catch (error) {
    errors.push(`europepmc:${error instanceof Error ? error.message : String(error)}`);
  }
  throw new Error(errors.join(" | "));
}

const pending = JSON.parse(readFileSync(catalogPath, "utf8"));
const existingIds = new Set(pending.candidates.map((c) => c.id));
const existingPmc = new Set(
  pending.candidates
    .map((c) => (c.pmcid || c.sourceUrl || "").match(/PMC\d+/i)?.[0]?.toUpperCase())
    .filter(Boolean)
);

const results = [];
const added = [];

for (const query of queries) {
  if (added.length >= limit) break;
  const rows = await search(query);
  for (const row of rows) {
    if (added.length >= limit) break;
    const pmcid = String(row.pmcid || "").toUpperCase();
    if (!pmcid.startsWith("PMC")) continue;
    if (row.isOpenAccess !== "Y") continue;
    if (!licenseOk(row.license)) continue;
    if (existingPmc.has(pmcid)) continue;

    const idBase = slugify(row.title);
    let id = `epmc-${idBase}`;
    let n = 2;
    while (existingIds.has(id)) {
      id = `epmc-${idBase}-${n++}`;
    }

    const dest = join(outDir, `${id}.pdf`);
    if (existsSync(dest)) {
      results.push({ id, status: "exists", pmcid });
      continue;
    }

    try {
      const downloaded = await downloadPdf({ doi: row.doi || null, pmcid, dest });
      const candidate = {
        id,
        title: String(row.title || "").replace(/\s+/g, " ").trim(),
        discipline: "mixed-oa",
        venue: row.journalTitle || "EuropePMC",
        doi: row.doi || null,
        sourceUrl: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
        downloadUrl: downloaded.downloadUrl,
        oaStatus: "open",
        license: String(row.license || "").toLowerCase(),
        licenseVerifiedVia: "europepmc-api",
        reasonSelected: "EuropePMC CC-licensed OA PDF for extraction evaluation beyond catalog baseline",
        retrievalStatus: "downloaded",
        retrievalDate: new Date().toISOString().slice(0, 10),
        retrievalVia: downloaded.via,
        pmcid,
      };
      pending.candidates.push(candidate);
      existingIds.add(id);
      existingPmc.add(pmcid);
      added.push(candidate);
      results.push({
        id,
        status: "downloaded",
        pmcid,
        bytes: downloaded.bytes,
        via: downloaded.via,
        license: candidate.license,
      });
      console.log(JSON.stringify(results.at(-1)));
    } catch (error) {
      results.push({
        id,
        status: "failed",
        pmcid,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(JSON.stringify(results.at(-1)));
    }
    // Be polite to Unpaywall (100k/day soft limit; keep bursts small).
    await new Promise((r) => setTimeout(r, 200));
  }
}

pending.version = pending.version || "extraction-corpus-pending-v1";
pending.lastEuropePmcExpansion = new Date().toISOString();
writeFileSync(catalogPath, `${JSON.stringify(pending, null, 2)}\n`);
console.log(JSON.stringify({ added: added.length, downloaded: results.filter((r) => r.status === "downloaded").length, failed: results.filter((r) => r.status === "failed").length }, null, 2));
