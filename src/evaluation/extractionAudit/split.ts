/**
 * Fixed development / held-out split for extraction audits.
 *
 * Roughly 30% of documents are "test": they are only scored before and after a
 * change, never inspected while diagnosing or tuning rules. The split is a
 * hash of the document id, so it is stable as the corpus grows.
 */
export type AuditSplit = "dev" | "test";

export function auditSplit(id: string): AuditSplit {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return h % 10 < 3 ? "test" : "dev";
}
