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

// Prefer DOI-backed CC papers so Unpaywall can resolve publisher PDFs.
// PMC/EuropePMC viewer URLs are often Cloudflare-blocked.
// Prefer publishers whose PDF URLs download reliably (Frontiers / PLOS / BMC).
// MDPI and PMC viewer URLs often 403 / Cloudflare interstitial.
// Prefer Frontiers / PLOS / BMC publisher PDF URLs. Broad SRC:MED and
// EuropePMC-render fallbacks mostly 403 under Cloudflare.
const queries = [
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Psychology" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Psychology" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Psychology" AND PUBYEAR:2023',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Human Neuroscience"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Virtual Reality"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Robotics and AI"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Computer Science"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Public Health" AND (HCI OR cognition OR digital OR wellbeing)',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Digital Health"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Neuroscience" AND (vision OR attention OR gaze)',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Education" AND (technology OR digital OR AI)',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PLoS ONE" AND (HCI OR visualization OR "machine learning" OR cognition OR "eye tracking")',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PLoS Computational Biology"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PLoS Digital Health"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"BMC Psychology"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"BMC Digital Health"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Journal of Medical Internet Research" AND (HCI OR usability OR VR)',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND ("information visualization" OR "visual analytics") AND (JOURNAL:"Frontiers*" OR JOURNAL:"PLoS*")',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND ("eye tracking" OR gaze) AND (JOURNAL:"Frontiers*" OR JOURNAL:"PLoS*")',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND ("large language model" OR LLM) AND (JOURNAL:"Frontiers*" OR JOURNAL:"PLoS*")',
  // Broader OA venues / topics for extraction stress diversity (still CC + DOI).
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Scientific Reports" AND (HCI OR cognition OR "machine learning" OR vision OR robotics)',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Nature Communications" AND ("machine learning" OR neuroscience OR cognition OR vision)',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PeerJ" AND (HCI OR cognition OR "computer vision" OR robotics)',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PeerJ Computer Science"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"BMC Bioinformatics"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"BMC Medical Informatics and Decision Making"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Artificial Intelligence"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Neurorobotics"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Aging Neuroscience"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"JMIR Human Factors"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"JMIR mHealth and uHealth"',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND ("human-robot interaction" OR HRI) AND (JOURNAL:"Frontiers*" OR JOURNAL:"PLoS*" OR JOURNAL:"PeerJ*")',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND ("multimodal" OR "multi-modal") AND (JOURNAL:"Frontiers*" OR JOURNAL:"PLoS*") AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND ("table extraction" OR "document understanding" OR "layout analysis") AND (JOURNAL:"Frontiers*" OR JOURNAL:"PLoS*" OR JOURNAL:"PeerJ*")',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Psychology" AND PUBYEAR:2022',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Psychology" AND PUBYEAR:2021',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Digital Health" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Digital Health" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Digital Health" AND PUBYEAR:2023',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Human Neuroscience" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Human Neuroscience" AND PUBYEAR:2023',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Robotics and AI" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Robotics and AI" AND PUBYEAR:2023',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Virtual Reality" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Computer Science" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PLoS ONE" AND (HCI OR visualization OR cognition OR "eye tracking" OR robotics) AND PUBYEAR:2023',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PLoS ONE" AND (HCI OR visualization OR cognition OR "eye tracking" OR robotics) AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PLoS Digital Health" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PLoS Digital Health" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"BMC Digital Health" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PeerJ Computer Science" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Artificial Intelligence" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Neurorobotics" AND PUBYEAR:2024',
  // More venue/year diversity (PDF bytes stay gitignored). Prefer Frontiers/PLOS/BMC/PeerJ/Nature DOI PDFs.
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Psychology" AND PUBYEAR:2020',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Psychology" AND PUBYEAR:2019',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Human Neuroscience" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Human Neuroscience" AND PUBYEAR:2022',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Virtual Reality" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Virtual Reality" AND PUBYEAR:2023',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Robotics and AI" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Computer Science" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Computer Science" AND PUBYEAR:2023',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Aging Neuroscience" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Aging Neuroscience" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Digital Health" AND PUBYEAR:2022',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Artificial Intelligence" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Neurorobotics" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PLoS ONE" AND (HCI OR visualization OR cognition OR robotics) AND PUBYEAR:2022',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PLoS ONE" AND (HCI OR visualization OR cognition OR robotics) AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PLoS Computational Biology" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PLoS Computational Biology" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"BMC Psychology" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"BMC Psychology" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"BMC Bioinformatics" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"BMC Bioinformatics" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"BMC Medical Informatics and Decision Making" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PeerJ" AND (cognition OR robotics OR "computer vision") AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PeerJ" AND (cognition OR robotics OR "computer vision") AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PeerJ Computer Science" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Scientific Reports" AND (cognition OR vision OR robotics OR "machine learning") AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Scientific Reports" AND (cognition OR vision OR robotics OR "machine learning") AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Scientific Reports" AND (HCI OR "eye tracking" OR attention) AND PUBYEAR:2023',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Nature Communications" AND (neuroscience OR cognition OR vision) AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Nature Communications" AND ("machine learning" OR robotics) AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND ("augmented reality" OR "virtual reality" OR "mixed reality") AND (JOURNAL:"Frontiers*" OR JOURNAL:"PLoS*" OR JOURNAL:"PeerJ*") AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND ("human-computer interaction" OR usability) AND (JOURNAL:"Frontiers*" OR JOURNAL:"PLoS*") AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND ("brain-computer" OR BCI OR EEG) AND (JOURNAL:"Frontiers*" OR JOURNAL:"PLoS*") AND PUBYEAR:2024',
  // Extra diversity for layout stress (still CC + DOI; PDF bytes stay gitignored).
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Psychology" AND PUBYEAR:2018',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Psychology" AND PUBYEAR:2017',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Education" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Education" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Public Health" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Public Health" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"JMIR Human Factors" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"JMIR Human Factors" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"JMIR mHealth and uHealth" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"JMIR mHealth and uHealth" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"BMC Digital Health" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"BMC Medical Informatics and Decision Making" AND PUBYEAR:2025',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PLoS Digital Health" AND PUBYEAR:2023',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Scientific Reports" AND (HCI OR cognition OR vision) AND PUBYEAR:2022',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND ("document layout" OR "PDF extraction" OR "table detection") AND (JOURNAL:"Frontiers*" OR JOURNAL:"PLoS*" OR JOURNAL:"PeerJ*")',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND ("reading comprehension" OR "information foraging") AND (JOURNAL:"Frontiers*" OR JOURNAL:"PLoS*")',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND ("wearable" OR "smartwatch") AND (JOURNAL:"Frontiers*" OR JOURNAL:"JMIR*" OR JOURNAL:"PLoS*") AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"PeerJ Computer Science" AND PUBYEAR:2023',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Neuroscience" AND PUBYEAR:2024',
  'LICENSE:"cc by" AND HAS_PDF:y AND HAS_DOI:y AND JOURNAL:"Frontiers in Neuroscience" AND PUBYEAR:2025',
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

function plosPrintableFromDoi(doiOrUrl) {
  const m = String(doiOrUrl || "").match(/10\.1371\/journal\.([\w-]+)\.(\d+)/i);
  if (!m) return null;
  const journal = m[1].toLowerCase(); // e.g. pone, pcbi, pdig
  const journalPath =
    journal === "pone" ? "plosone"
    : journal === "pcbi" ? "ploscompbiol"
    : journal === "pdig" ? "digitalhealth"
    : journal === "pbio" ? "plosbiology"
    : journal === "pgen" ? "plosgenetics"
    : journal === "ppat" ? "plospathogens"
    : journal === "pmed" ? "plosmedicine"
    : journal === "pntd" ? "plosntds"
    : null;
  if (!journalPath) return null;
  return `https://journals.plos.org/${journalPath}/article/file?id=10.1371/journal.${m[1]}.${m[2]}&type=printable`;
}

function frontiersPdfFromDoi(doiOrUrl) {
  const m = String(doiOrUrl || "").match(/(10\.3389\/[\w.-]+)/i);
  if (!m) return null;
  return `https://www.frontiersin.org/articles/${m[1]}/pdf`;
}

function bmcPdfFromDoi(doiOrUrl) {
  const m = String(doiOrUrl || "").match(/(10\.1186\/[\w.-]+)/i);
  if (!m) return null;
  return `https://link.springer.com/content/pdf/${m[1]}.pdf`;
}

function naturePdfFromDoi(doiOrUrl) {
  // Scientific Reports / Nat Commun / etc.: 10.1038/s41598-… → nature.com/articles/s41598-….pdf
  const m = String(doiOrUrl || "").match(/10\.1038\/(s\d{4,5}-\d[\w.-]*)/i);
  if (!m) return null;
  return `https://www.nature.com/articles/${m[1]}.pdf`;
}

function peerjPdfFromDoi(doiOrUrl) {
  const m = String(doiOrUrl || "").match(/10\.7717\/peerj(?:-cs)?\.(\d+)/i);
  if (!m) return null;
  const cs = /peerj-cs/i.test(doiOrUrl) || /10\.7717\/peerj-cs/i.test(String(doiOrUrl));
  return cs
    ? `https://peerj.com/articles/cs-${m[1]}.pdf`
    : `https://peerj.com/articles/${m[1]}.pdf`;
}

function candidatePdfUrl(loc) {
  if (!loc) return null;
  if (loc.url_for_pdf && !isPmcViewerUrl(loc.url_for_pdf)) return loc.url_for_pdf;
  const url = loc.url || "";
  const fromDoi = plosPrintableFromDoi(url) || plosPrintableFromDoi(loc.doi);
  if (fromDoi) return fromDoi;
  if (/\.pdf(\?|$)/i.test(url) && !isPmcViewerUrl(url)) return url;
  // MDPI / Frontiers / BMC article landing pages often expose a stable /pdf path.
  if (/mdpi\.com\/\d+\/\d+\/\d+/i.test(url) && !/\/pdf/i.test(url)) return `${url.replace(/\/$/, "")}/pdf`;
  if (/frontiersin\.org\/(?:journals\/[^/]+\/)?articles\//i.test(url) && !/\/pdf\/?$/i.test(url)) {
    return `${url.replace(/\/$/, "")}/pdf`;
  }
  if (/biomedcentral\.com\/articles\//i.test(url) && !/\.pdf/i.test(url)) {
    return `${url.replace(/\/$/, "")}.pdf`;
  }
  if (/journals\.plos\.org\/.+\/article\?id=/i.test(url)) {
    return url.replace(/article\?id=/, "article/file?id=") + (url.includes("type=") ? "" : "&type=printable");
  }
  return loc.url_for_pdf && !isPmcViewerUrl(loc.url_for_pdf) ? loc.url_for_pdf : null;
}

function publisherPdfFromDoi(doi) {
  return (
    plosPrintableFromDoi(doi) ||
    frontiersPdfFromDoi(doi) ||
    bmcPdfFromDoi(doi) ||
    naturePdfFromDoi(doi) ||
    peerjPdfFromDoi(doi)
  );
}

async function resolveUnpaywallPdfUrl(doi) {
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(UNPAYWALL_EMAIL)}`;
  let json = null;
  try {
    json = await (await fetch(url, { headers: { Accept: "application/json" } })).json();
  } catch {
    json = null;
  }
  const locations = json
    ? [
        json.best_oa_location,
        ...(Array.isArray(json.oa_locations) ? json.oa_locations : []),
      ].filter(Boolean)
    : [];
  // Prefer publisher PDFs; PMC/EuropePMC viewer URLs often return a POW HTML interstitial.
  const ranked = [...locations].sort((a, b) => {
    const score = (loc) => {
      const pdfUrl = candidatePdfUrl(loc) || loc.url || "";
      if (loc.host_type === "publisher" && !isPmcViewerUrl(pdfUrl)) return 0;
      if (!isPmcViewerUrl(pdfUrl)) return 1;
      return 2;
    };
    return score(a) - score(b);
  });
  const errors = [];
  for (const loc of ranked) {
    const pdfUrl = candidatePdfUrl({ ...loc, doi: loc.doi || doi });
    if (!pdfUrl) continue;
    if (isPmcViewerUrl(pdfUrl)) {
      errors.push("pmc-viewer");
      continue;
    }
    return { pdfUrl, license: loc.license || json?.best_oa_location?.license || null };
  }
  const publisherFallback = publisherPdfFromDoi(doi);
  if (publisherFallback) {
    return { pdfUrl: publisherFallback, license: json?.best_oa_location?.license || null };
  }
  if (json && json.is_oa === false) throw new Error("unpaywall not OA");
  throw new Error(errors.length ? "unpaywall only pmc viewer urls" : "unpaywall has no pdf url");
}

async function downloadPdf({ doi, pmcid, dest }) {
  const errors = [];
  // Known publisher DOI → PDF paths are more reliable than Unpaywall/PMC viewer.
  if (doi) {
    const direct = publisherPdfFromDoi(doi);
    if (direct) {
      try {
        const bytes = await fetchPdfBytes(direct);
        writeFileSync(dest, bytes);
        return { bytes: bytes.length, downloadUrl: direct, via: "publisher-doi" };
      } catch (error) {
        errors.push(`publisher:${error instanceof Error ? error.message : String(error)}`);
      }
    }
    try {
      const { pdfUrl, license } = await resolveUnpaywallPdfUrl(doi);
      if (pdfUrl !== direct) {
        const bytes = await fetchPdfBytes(pdfUrl);
        writeFileSync(dest, bytes);
        return { bytes: bytes.length, downloadUrl: pdfUrl, via: "unpaywall", unpaywallLicense: license };
      }
    } catch (error) {
      errors.push(`unpaywall:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // Europe PMC ?pdf=render is often Cloudflare 403; keep as last resort only.
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
let attempts = 0;
const maxAttempts = Math.max(limit * 4, 80);

for (const query of queries) {
  if (added.length >= limit || attempts >= maxAttempts) break;
  const rows = await search(query);
  for (const row of rows) {
    if (added.length >= limit || attempts >= maxAttempts) break;
    const pmcid = String(row.pmcid || "").toUpperCase();
    if (!pmcid.startsWith("PMC")) continue;
    if (row.isOpenAccess !== "Y") continue;
    if (!licenseOk(row.license)) continue;
    if (!row.doi) continue; // publisher PDF via Unpaywall requires DOI
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

    attempts += 1;
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
