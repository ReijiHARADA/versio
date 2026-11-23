import type { PlamoServerInfo } from "../translation/plamoEngine";
import { isTauriApp } from "../../utils/serverReady";

const LATIN = /^[\p{Script=Latin}\p{N}\s'-]+$/u;
const TIMEOUT_MS = 4000;
const MAX_TERM_LENGTH = 40;

const cache = new Map<string, Promise<string | null>>();

type Deps = {
  getServer: () => Promise<PlamoServerInfo | null>;
  fetchImpl: typeof fetch;
};

const defaultDeps: Deps = {
  // Only an already running sidecar: a search never pays for loading the model.
  getServer: async () => {
    if (!isTauriApp()) return null;
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<PlamoServerInfo | null>("plamo_server_if_running");
  },
  fetchImpl: (...args) => fetch(...args),
};

function cleanTranslation(source: string, output: string): string | null {
  const text = output
    .trim()
    .replace(/[。.]+$/u, "")
    .replace(/^["'「『]+|["'」』]+$/g, "")
    .trim();
  if (!text || text.length > MAX_TERM_LENGTH * 2 || text.includes("\n")) return null;
  if (text.toLocaleLowerCase() === source.toLocaleLowerCase()) return null;
  return text;
}

async function requestTranslation(term: string, deps: Deps): Promise<string | null> {
  const server = await deps.getServer();
  if (!server) return null;
  const english = LATIN.test(term);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await deps.fetchImpl(`${server.baseUrl}/v1/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${server.token}` },
      body: JSON.stringify({
        messages: [{ role: "user", content: term }],
        temperature: 0,
        max_tokens: 48,
        // `form` is a Japanese register; the chat template rejects it when the target is English.
        chat_template_kwargs: english
          ? { source_lang: "en", target_lang: "ja", form: "plain" }
          : { source_lang: "ja", target_lang: "en" },
        stop: ["<|plamo:tag|>", "<|plamo:bos|>"],
      }),
    });
    if (!res.ok) return null;
    const reply = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return cleanTranslation(term, reply.choices?.[0]?.message?.content ?? "");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Japanese ↔ English translation of a query term the dictionary does not know,
 * from the PLaMo sidecar when it is already running (otherwise null). Cached per
 * session; failures resolve to null and are retried on the next search.
 */
export function translateQueryTerm(term: string, deps: Deps = defaultDeps): Promise<string | null> {
  const key = term.trim();
  if (!key || key.length > MAX_TERM_LENGTH) return Promise.resolve(null);
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = requestTranslation(key, deps).catch(() => null);
  cache.set(key, pending);
  void pending.then((value) => {
    if (value === null) cache.delete(key);
  });
  return pending;
}
