/**
 * Check `curated.txt` translation pairs against PLaMo, the engine that writes
 * Versio's Japanese text, in context.
 *
 *   npx tsx scripts/synonyms/validate-curated.ts [--papers <dir>] [--limit N]
 *
 * For every concept with English and Japanese forms, each English form is
 * translated bare, in a template sentence, and in up to two sentences from the
 * local library (`<AppData>/papers/*\/original.md`) that use it. A concept is
 * `confirmed` when one of its Japanese forms appears in a translation; PLaMo's
 * own bare rendering is reported as a candidate when it is not listed yet.
 * Japanese forms are translated back to English the same way (bare only).
 *
 * Starts its own llama-server on a free port with the downloaded model and
 * writes `scripts/synonyms/review/curated-validation.tsv` for review.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { normalizeIndexText, normalizeSearchText } from "../../src/domain/search/normalizeSearchText";

const ROOT = join(import.meta.dirname, "..", "..");
const APP_DATA = join(homedir(), "Library", "Application Support", "com.harada.versio");
const MODEL = join(APP_DATA, "models", "plamo-3-translate-2b-Q4_K_M.gguf");
const SERVER = join(ROOT, "src-tauri", "binaries", "llama-server-aarch64-apple-darwin");
const OUT_DIR = join(import.meta.dirname, "review");
const LATIN = /^[\p{Script=Latin}\p{N}\s'’–-]+$/u;
const CONCURRENCY = 4;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

type Concept = { line: string; en: string[]; ja: string[] };

function readConcepts(): Concept[] {
  const concepts: Concept[] = [];
  for (const raw of readFileSync(join(import.meta.dirname, "curated.txt"), "utf8").split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const forms = line.split(/ ~ | \/ /).map((form) => form.trim()).filter(Boolean);
    const isAbbr = (form: string) => /^[A-Za-z0-9-]{2,8}$/.test(form) && (form.match(/[A-Z]/g)?.length ?? 0) >= 2;
    const en = forms.filter((form) => LATIN.test(form) && !isAbbr(form));
    const ja = forms.filter((form) => !LATIN.test(form));
    if (en.length && ja.length) concepts.push({ line, en, ja });
  }
  return concepts;
}

/** Sentences from local papers, keyed later by the English term they contain. */
function readSentences(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const sentences: string[] = [];
  for (const id of readdirSync(dir)) {
    const path = join(dir, id, "original.md");
    if (!existsSync(path)) continue;
    for (const sentence of readFileSync(path, "utf8").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)) {
      if (sentence.length >= 40 && sentence.length <= 300 && !/[|#\\$]/.test(sentence)) sentences.push(sentence);
    }
  }
  return sentences;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("port"))));
    });
  });
}

async function startServer(): Promise<{ url: string; stop: () => void }> {
  if (!existsSync(MODEL)) throw new Error(`model missing: ${MODEL}`);
  if (!existsSync(SERVER)) throw new Error(`llama-server missing: run npm run build:llama-server`);
  const port = await freePort();
  const child = spawn(
    SERVER,
    ["-m", MODEL, "--host", "127.0.0.1", "--port", String(port), "--jinja", "-c", "8192", "-np", String(CONCURRENCY), "-ngl", "99"],
    { stdio: "ignore" }
  );
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${url}/v1/models`)).ok) return { url, stop: () => child.kill() };
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child.kill();
  throw new Error("llama-server did not start");
}

async function translate(url: string, text: string, from: "en" | "ja"): Promise<string> {
  const res = await fetch(`${url}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: text }],
      temperature: 0,
      max_tokens: 400,
      // `form` (Japanese register) makes the template fail for English output.
      chat_template_kwargs:
        from === "en" ? { source_lang: "en", target_lang: "ja", form: "plain" } : { source_lang: "ja", target_lang: "en" },
      stop: ["<|plamo:tag|>", "<|plamo:bos|>"],
    }),
  });
  const reply = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (reply.choices?.[0]?.message?.content ?? "").trim();
}

async function pool<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    })
  );
  return results;
}

function contains(output: string, forms: string[]): string[] {
  const text = normalizeIndexText(output);
  return forms.filter((form) => {
    const norm = normalizeSearchText(form);
    return norm && (LATIN.test(form) ? text.includes(` ${norm}`) : text.includes(norm));
  });
}

const clean = (value: string) => value.replace(/[。.]+$/u, "").replace(/[\t\n]/g, " ").trim();

const concepts = readConcepts().slice(0, Number(arg("--limit") ?? Infinity));
const sentences = readSentences(arg("--papers") ?? join(APP_DATA, "papers"));
const server = await startServer();
try {
  const rows = await pool(concepts, async (concept) => {
    const jaHits = new Set<string>();
    const plamoJa: string[] = [];
    let contexts = 0;
    for (const en of concept.en) {
      const bare = await translate(server.url, en, "en");
      plamoJa.push(clean(bare));
      const prompts = [`This study examines ${en} in detail.`];
      const needle = ` ${normalizeSearchText(en)}`;
      prompts.push(...sentences.filter((sentence) => normalizeIndexText(sentence).includes(needle)).slice(0, 2));
      contexts += prompts.length - 1;
      for (const output of [bare, ...(await Promise.all(prompts.map((prompt) => translate(server.url, prompt, "en"))))]) {
        for (const hit of contains(output, concept.ja)) jaHits.add(hit);
      }
    }
    const enHits = new Set<string>();
    const plamoEn: string[] = [];
    for (const ja of concept.ja) {
      const bare = await translate(server.url, ja, "ja");
      plamoEn.push(clean(bare));
      for (const hit of contains(bare, concept.en)) enHits.add(hit);
    }
    const known = new Set(concept.ja.map(normalizeSearchText));
    const candidates = [...new Set(plamoJa)].filter((value) => value && !known.has(normalizeSearchText(value)));
    const status = jaHits.size > 0 ? (enHits.size > 0 ? "confirmed" : "confirmed-en→ja") : "unconfirmed";
    return [status, concept.line, [...jaHits].join(" / "), candidates.join(" / "), [...enHits].join(" / "), [...new Set(plamoEn)].join(" / "), String(contexts)];
  });
  mkdirSync(OUT_DIR, { recursive: true });
  const header = ["status", "concept", "ja forms PLaMo used", "PLaMo ja not listed", "en forms PLaMo used", "PLaMo en", "library sentences"];
  writeFileSync(join(OUT_DIR, "curated-validation.tsv"), [header, ...rows].map((row) => row.join("\t")).join("\n") + "\n");
  const count = (status: string) => rows.filter((row) => row[0] === status).length;
  console.log(
    `concepts=${rows.length} confirmed=${count("confirmed")} confirmed-en→ja=${count("confirmed-en→ja")} unconfirmed=${count("unconfirmed")} candidates=${rows.filter((row) => row[3]).length}`
  );
} finally {
  server.stop();
}
