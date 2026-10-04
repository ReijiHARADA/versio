/**
 * Add legally discoverable OA candidates from OpenAlex to the pending corpus.
 * Candidates are never treated as fixtures until a PDF response is verified.
 */
import fs from "node:fs";

const path = "test-fixtures/real-papers/pending-oa-candidates.json";
const corpus = JSON.parse(fs.readFileSync(path, "utf8"));
const existing = new Set(corpus.candidates.map((item) => item.id));
const targets = [
  ["hci", "human computer interaction", 10],
  ["cognitive-psychology", "cognitive psychology memory", 10],
  ["marketing", "consumer behavior marketing", 10],
  ["ergonomics", "ergonomics human factors", 8],
  ["linguistics", "linguistics discourse language", 8],
  ["hci", "user experience usability design", 5],
  ["cognitive-psychology", "attention decision cognition", 5],
  ["marketing", "digital advertising consumer choice", 5],
  ["ergonomics", "occupational safety workload fatigue", 5],
  ["linguistics", "computational linguistics natural language", 5],
];

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
const seenTitles = new Set(corpus.candidates.map((item) => item.title.toLowerCase()));
let added = 0;
for (const [discipline, search, limit] of targets) {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", search);
  url.searchParams.set("filter", "is_oa:true,has_fulltext:true,from_publication_date:2015-01-01");
  url.searchParams.set("per-page", String(Math.max(limit * 3, 30)));
  url.searchParams.set("select", "id,title,doi,publication_year,type,primary_location,open_access");
  url.searchParams.set("mailto", process.env.UNPAYWALL_EMAIL ?? "you@example.com");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`OpenAlex ${response.status} for ${discipline}`);
  const data = await response.json();
  let taken = 0;
  for (const work of data.results ?? []) {
    const title = String(work.title ?? "").trim();
    const pdfUrl = work.primary_location?.pdf_url;
    const landing = work.primary_location?.landing_page_url;
    if (!title || !pdfUrl || !landing || work.open_access?.is_oa !== true) continue;
    const normalized = title.toLowerCase();
    if (seenTitles.has(normalized)) continue;
    const id = `${discipline}-${slug(title)}`;
    if (existing.has(id)) continue;
    corpus.candidates.push({
      id,
      title,
      discipline,
      venue: work.primary_location?.source?.display_name ?? "OA repository",
      publisher: work.primary_location?.source?.host_organization_name ?? "",
      doi: work.doi ? work.doi.replace(/^https?:\/\/doi.org\//, "") : null,
      sourceUrl: landing,
      downloadUrl: pdfUrl,
      oaStatus: "open",
      reasonSelected: `OpenAlex OA candidate for ${discipline} format variation; PDF URL exposed by an OA location`,
      retrievalStatus: "pending",
      publicationYear: work.publication_year,
    });
    existing.add(id); seenTitles.add(normalized); added++; taken++;
    if (taken >= limit) break;
  }
}
corpus.generatedAt = new Date().toISOString();
fs.writeFileSync(path, `${JSON.stringify(corpus, null, 2)}\n`);
console.log(JSON.stringify({ added, candidates: corpus.candidates.length }, null, 2));
