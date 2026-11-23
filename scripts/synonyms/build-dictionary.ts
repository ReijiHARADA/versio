/**
 * Build the bundled search synonym dictionary (`src/generated/synonyms.json`).
 *
 *   npx tsx scripts/synonyms/build-dictionary.ts [--fetch]
 *
 * Sources are pinned in `scripts/synonyms/sources.json` and cached (gitignored)
 * in `.cache/synonyms-src/`; `--fetch` downloads missing ones and checks SHA-256.
 * Curated academic terms come from `scripts/synonyms/curated.txt`.
 * See docs/research/search-synonym-dictionary-2026-11.md.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeSearchText } from "../../src/domain/search/normalizeSearchText";
import {
  ROLE,
  entryWithNorm,
  type SynonymConcept,
  type SynonymDictionaryData,
  type SynonymEntry,
  type SynonymSource,
} from "../../src/domain/search/synonymDictionary";

type SourceSpec = {
  name: string;
  version: string;
  license: string;
  url: string;
  file: string;
  sha256: string;
  homepage: string;
};

const ROOT = join(import.meta.dirname, "..", "..");
const CACHE = join(ROOT, ".cache", "synonyms-src");
const OUT = join(ROOT, "src", "generated", "synonyms.json");
const specs = JSON.parse(readFileSync(join(import.meta.dirname, "sources.json"), "utf8")) as Record<
  "sudachi" | "oewn" | "wnja",
  SourceSpec
>;

function ensureSource(spec: SourceSpec, fetch: boolean): string {
  const path = join(CACHE, spec.file);
  if (!existsSync(path)) {
    if (!fetch) throw new Error(`${spec.file} missing; run with --fetch`);
    mkdirSync(CACHE, { recursive: true });
    execFileSync("curl", ["-sfL", "-o", path, spec.url]);
  }
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (hash !== spec.sha256) throw new Error(`${spec.file}: sha256 ${hash} != ${spec.sha256}`);
  return path;
}

function extract(archive: string, dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    if (archive.endsWith(".zip")) execFileSync("unzip", ["-q", "-o", archive, "-d", dir]);
    else execFileSync("tar", ["-xJf", archive, "-C", dir]);
  }
  return dir;
}

const sources: SynonymSource[] = [];
const concepts: SynonymConcept[] = [];

function addSource(source: SynonymSource): number {
  sources.push(source);
  return sources.length - 1;
}

/** Drop forms that normalize to nothing or to another form of the same lexeme. */
function pushConcept(sourceIndex: number, entries: SynonymEntry[]): void {
  const seen = new Set<string>();
  const kept = entries.filter(([surface, lexeme]) => {
    const key = `${lexeme}\u0000${normalizeSearchText(surface)}`;
    if (!normalizeSearchText(surface) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const norms = new Set(kept.map(([surface]) => normalizeSearchText(surface)));
  if (norms.size >= 2 && kept.some((entry) => entry[3] === 1)) {
    concepts.push([sourceIndex, kept.map((entry) => entryWithNorm(entry, normalizeSearchText(entry[0])))]);
  }
}

// ---- Sudachi -------------------------------------------------------------

/** Domains that do not help paper search (and make up most of the file). */
const SUDACHI_SKIP_DOMAINS = ["企業名", "人名", "キャラ", "店名", "店", "不快", "料理", "ファッション", "美容", "観光", "娯楽"];

function sudachiRole(formType: string, abbr: string, spelling: string): number {
  if (abbr === "1" || abbr === "2") return ROLE.abbr;
  if (formType === "1") return ROLE.translation;
  if (formType === "2") return ROLE.alias;
  if (formType === "3") return ROLE.former;
  if (formType === "4") return ROLE.misuse;
  if (spelling === "1") return ROLE.translation;
  if (spelling === "3") return ROLE.misuse;
  if (spelling === "2") return ROLE.spelling;
  return ROLE.base;
}

function buildSudachi(path: string): void {
  const spec = specs.sudachi;
  const sourceIndex = addSource({
    id: "sudachi",
    name: spec.name,
    version: spec.version,
    license: spec.license,
    url: spec.homepage,
    synonymWeight: 0.6,
    // Different Sudachi lexemes across languages (学習 / study) are as loose as same-language ones.
    crossWeight: 0.6,
  });
  const groups = new Map<string, SynonymEntry[]>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const fields = line.split(",");
    if (fields.length < 9) continue;
    const [group, , expansion, lexeme, formType, abbr, spelling, domain, surface] = fields;
    if (expansion === "2" || !surface) continue;
    const domains = domain.replace(/[()]/g, "").split("/");
    if (domains.some((name) => SUDACHI_SKIP_DOMAINS.includes(name))) continue;
    const entry: SynonymEntry = [
      surface,
      Number(lexeme) || 0,
      sudachiRole(formType, abbr, spelling),
      expansion === "1" ? 0 : 1,
    ];
    const list = groups.get(group);
    if (list) list.push(entry);
    else groups.set(group, [entry]);
  }
  for (const entries of groups.values()) pushConcept(sourceIndex, entries);
}

// ---- WordNet (Open English WordNet + Japanese Wordnet via ILI) -----------

/**
 * Only monosemous lemmas (one synset in their language) are used: a word like
 * `load` (14 synsets) or 認知 (13) would pull in unrelated senses.
 */
const WORDNET_MAX_MEMBERS = 8;

function buildWordnet(oewnDir: string, wnjaDir: string): void {
  const oewn = specs.oewn;
  const wnja = specs.wnja;
  const sourceIndex = addSource({
    id: "wordnet",
    name: `${oewn.name} ${oewn.version} + ${wnja.name} ${wnja.version}`,
    version: `${oewn.version}+${wnja.version}`,
    license: `${oewn.license} / ${wnja.license}`,
    url: `${oewn.homepage} ${wnja.homepage}`,
    synonymWeight: 0.5,
    crossWeight: 0.7,
  });

  const enByIli = new Map<string, string[]>();
  const enSenses = new Map<string, number>();
  for (const file of readdirSync(oewnDir)) {
    if (!/^(noun|verb|adj|adv)\..+\.json$/.test(file)) continue;
    const synsets = JSON.parse(readFileSync(join(oewnDir, file), "utf8")) as Record<
      string,
      { ili?: string; members: string[] }
    >;
    for (const synset of Object.values(synsets)) {
      for (const member of synset.members) enSenses.set(member.toLowerCase(), (enSenses.get(member.toLowerCase()) ?? 0) + 1);
      if (synset.ili && synset.ili !== "in") enByIli.set(synset.ili, synset.members);
    }
  }

  const xmlFile = readdirSync(join(wnjaDir, "wnja")).find((file) => file.endsWith(".xml"));
  if (!xmlFile) throw new Error("wnja xml not found");
  const xml = readFileSync(join(wnjaDir, "wnja", xmlFile), "utf8");
  const iliBySynset = new Map<string, string>();
  for (const match of xml.matchAll(/<Synset id="([^"]+)" ili="([^"]+)"/g)) iliBySynset.set(match[1], match[2]);
  const jaByIli = new Map<string, string[]>();
  for (const match of xml.matchAll(/<Lemma writtenForm="([^"]+)"[^>]*\/>([\s\S]*?)<\/LexicalEntry>/g)) {
    const lemma = match[1];
    const synsets = [...match[2].matchAll(/synset="([^"]+)"/g)].map((sense) => sense[1]);
    if (synsets.length !== 1 || [...lemma].length < 2) continue;
    const ili = iliBySynset.get(synsets[0]);
    if (!ili) continue;
    const list = jaByIli.get(ili);
    if (list) list.push(lemma);
    else jaByIli.set(ili, [lemma]);
  }

  for (const [ili, members] of enByIli) {
    const en = members.filter((member) => enSenses.get(member.toLowerCase()) === 1 && member.length > 2);
    const ja = jaByIli.get(ili) ?? [];
    if (en.length + ja.length > WORDNET_MAX_MEMBERS) continue;
    // English-only synsets add little over the typed word and are the noisiest part; keep only
    // synsets that link Japanese, plus English synonyms when the synset is small.
    if (ja.length === 0 && en.length > 3) continue;
    const entries: SynonymEntry[] = [...en, ...ja].map((surface, index) => [surface, index + 1, ROLE.base, 1]);
    pushConcept(sourceIndex, entries);
  }
}

// ---- Curated academic terms ------------------------------------------------

/**
 * `curated.txt`: one concept per line. Lexemes are separated by ` ~ `, forms of
 * one lexeme by ` / `.
 * `#` starts a comment.
 * A form with at least two capitals and no spaces (HCI, fNIRS, VR) is an abbreviation.
 */
function buildCurated(path: string): void {
  const sourceIndex = addSource({
    id: "versio-curated",
    name: "Versio 学術用語（独自）",
    version: "1",
    license: "MIT",
    url: "https://github.com/ReijiHARADA/versio",
    synonymWeight: 0.7,
    crossWeight: 0.85,
  });
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const entries: SynonymEntry[] = [];
    line.split(" ~ ").forEach((lexeme, index) => {
      for (const form of lexeme.split(" / ").map((value) => value.trim()).filter(Boolean)) {
        const capitals = form.match(/[A-Z]/g)?.length ?? 0;
        const role = /^[A-Za-z0-9-]{2,8}$/.test(form) && capitals >= 2 ? ROLE.abbr : ROLE.base;
        entries.push([form, index + 1, role, 1]);
      }
    });
    pushConcept(sourceIndex, entries);
  }
}

const fetch = process.argv.includes("--fetch");
buildCurated(join(import.meta.dirname, "curated.txt"));
buildSudachi(ensureSource(specs.sudachi, fetch));
buildWordnet(
  extract(ensureSource(specs.oewn, fetch), join(CACHE, "oewn")),
  extract(ensureSource(specs.wnja, fetch), join(CACHE, "wnja"))
);

const data: SynonymDictionaryData = { version: 1, sources, concepts };
writeFileSync(OUT, `${JSON.stringify(data)}\n`);
const counts = sources.map((source, index) => `${source.id}=${concepts.filter(([s]) => s === index).length}`);
console.log(`wrote ${OUT}: ${concepts.length} concepts (${counts.join(", ")}), ${(readFileSync(OUT).length / 1e6).toFixed(2)} MB`);
