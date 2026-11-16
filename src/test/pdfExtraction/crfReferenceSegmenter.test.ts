import { beforeAll, describe, expect, it } from "vitest";
import { loadNodeCrfRuntime } from "../../services/pdfExtraction/crf/nodeRuntime";
import { segmentReferences } from "../../services/pdfExtraction/crf/segmentReferences";

const line = (text: string) => ({ text, x: 20, width: 300, fontSize: 10, blockStart: true });
beforeAll(async () => {
  await loadNodeCrfRuntime();
}, 60_000);

describe("reference segmenter", () => {
  it("honours numbered reference starts", () => {
    expect(segmentReferences([line("[1] Smith. First."), line("[2] Jones. Second.")])).toHaveLength(2);
  });
  it("keeps unnumbered wrapped lines together", () => {
    expect(segmentReferences([line("Smith, J. A long title"), line("continued across lines."), line("Journal, 2020.")])).toHaveLength(1);
  });
});
