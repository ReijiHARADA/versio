import { isTauriApp } from "../../utils/serverReady";
import { parseBibliographicIdentifier } from "../bibliography/identifiers";
import { startBackgroundImport } from "./startBackgroundImport";

/**
 * Download an open-access PDF for an arXiv id / DOI (or their URLs) and import it
 * like a dropped file. The download runs in Rust (fixed hosts / OpenAlex only).
 */
export async function importByIdentifier(
  input: string,
  options?: { workspaceNodeId?: string }
): Promise<boolean> {
  const identifier = parseBibliographicIdentifier(input);
  if (!identifier) throw new Error("arXiv ID か DOI（または arxiv.org / doi.org の URL）を入力してください");
  if (!isTauriApp()) throw new Error("arXiv・DOI からの追加はデスクトップ版のみ対応しています");
  const { invoke } = await import("@tauri-apps/api/core");
  const bytes = await invoke<number[] | Uint8Array>("download_open_access_pdf", {
    kind: identifier.kind,
    id: identifier.id,
  });
  const data = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
  const name = `${identifier.id.replace(/[\\/:*?"<>|]+/g, "_")}.pdf`;
  return startBackgroundImport(new File([data], name, { type: "application/pdf" }), options);
}
