import type { PaperBlock } from "../types/paper";
import type { CanonicalDocument } from "../services/pdfExtraction/canonical/types";

/**
 * `extractFromPages` numbers generic candidates from zero for every invocation.
 * A Studio page re-extraction is therefore not allowed to splice those raw
 * IDs into a multi-page snapshot: `g-0` from page 14 could otherwise replace
 * or select `g-0` from page 1. Keep the extraction result structurally intact
 * while making its IDs page-local and unambiguous inside the saved snapshot.
 */
export function namespaceReextractedPage(
  canonical: CanonicalDocument,
  blocks: PaperBlock[],
  page: number,
): { canonical: CanonicalDocument; blocks: PaperBlock[] } {
  const prefix = `eval-reextract-p${page}--`;
  const ids = new Map(canonical.nodes.map((node) => [node.id, `${prefix}${node.id}`]));
  const nodeId = (id: string) => ids.get(id) ?? id;

  return {
    canonical: {
      ...canonical,
      nodes: canonical.nodes.map((node) => ({ ...node, id: nodeId(node.id) })),
      relations: canonical.relations.map((relation) => ({
        ...relation,
        from: nodeId(relation.from),
        to: nodeId(relation.to),
      })),
    },
    blocks: blocks.map((block) => {
      const canonicalNodeId = block.metadata.canonicalNodeId;
      if (typeof canonicalNodeId !== "string" || !ids.has(canonicalNodeId)) return block;
      return { ...block, metadata: { ...block.metadata, canonicalNodeId: nodeId(canonicalNodeId) } };
    }),
  };
}
