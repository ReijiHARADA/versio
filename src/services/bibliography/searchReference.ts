import { isTauriApp } from "../../utils/serverReady";
import {
  guessReferenceTitle,
  parseCrossrefSearch,
  parseOpenAlexSearch,
  pickReferenceMatch,
  referenceQuery,
  type ReferenceCandidate,
} from "./referenceMatch";

type Search = (source: "crossref" | "openalex", query: string) => Promise<string>;

const tauriSearch: Search = async (source, query) => {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("search_bibliographic_records", { source, query });
};

/**
 * The work a reference with no DOI / arXiv id names: Crossref with the whole
 * reference string, then OpenAlex by guessed title (covers arXiv-only works).
 * Null when no hit passes the title / year / first-author checks.
 */
export async function findCitedWork(
  rawText: string,
  search: Search = tauriSearch
): Promise<ReferenceCandidate | null> {
  if (search === tauriSearch && !isTauriApp()) {
    throw new Error("題名からの検索はデスクトップ版のみ対応しています");
  }
  const crossref = pickReferenceMatch(rawText, parseCrossrefSearch(await search("crossref", referenceQuery(rawText))));
  if (crossref) return crossref.candidate;
  const title = guessReferenceTitle(rawText);
  if (!title) return null;
  return pickReferenceMatch(rawText, parseOpenAlexSearch(await search("openalex", title)))?.candidate ?? null;
}
