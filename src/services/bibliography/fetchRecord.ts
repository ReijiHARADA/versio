import { isTauriApp } from "../../utils/serverReady";
import type { BibliographicIdentifier } from "./identifiers";
import { parseArxivAtom, parseCrossrefWork, type BibliographicRecord } from "./parseRecords";

/** Network access happens only here, on an explicit user action (local-first). */
export async function fetchBibliographicRecord(
  identifier: BibliographicIdentifier
): Promise<BibliographicRecord> {
  if (!isTauriApp()) throw new Error("書誌情報の取得はデスクトップ版のみ対応しています");
  const { invoke } = await import("@tauri-apps/api/core");
  const body = await invoke<string>("fetch_bibliographic_record", {
    kind: identifier.kind,
    id: identifier.id,
  });
  return identifier.kind === "doi"
    ? parseCrossrefWork(body)
    : parseArxivAtom(body, identifier.id);
}
