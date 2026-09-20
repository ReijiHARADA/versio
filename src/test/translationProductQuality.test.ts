import { describe, expect, it } from "vitest";
import { summarizeTranslationProductQuality } from "../../scripts/lib/translationProductQuality";

describe("translation product quality audit aggregation", () => {
  it("counts empty fallbacks, deduplicates document aliases, joins risk keys, and rejects errored completion", () => {
    const audit = {
      complete: true,
      runId: "test-run",
      createdAt: "2026-09-20T00:00:00.000Z",
      papers: [
        {
          paper: {
            id: "a-paper",
            sourceUrl: "https://arxiv.org/abs/2401.00001v2",
            discipline: "hci",
            formatFamily: "arxiv",
          },
          rows: [
            { blockId: "b1", sourceCategory: "ordinary-body-prose", translation: "翻訳", readerVisibleFallback: false },
            { blockId: "b2", sourceCategory: "ordinary-body-prose", translation: "", readerVisibleFallback: true },
          ],
        },
        {
          paper: {
            id: "z-alias",
            sourceUrl: "https://arxiv.org/pdf/2401.00001.pdf",
            discipline: "hci",
            formatFamily: "arxiv",
          },
          rows: [
            { blockId: "b1", sourceCategory: "ordinary-body-prose", translation: "同じ翻訳", readerVisibleFallback: false },
          ],
          error: "also records a failed paper entry",
        },
      ],
    };
    const risk = {
      rows: [
        { key: "z-alias:b1", missingSignals: ["negation"] },
        { key: "a-paper:b2", missingSignals: [] },
      ],
    };

    const summary = summarizeTranslationProductQuality(audit, risk);
    expect(summary.metrics.ordinaryRows).toBe(2);
    expect(summary.metrics.duplicateOrdinaryRowsExcluded).toBe(1);
    expect(summary.metrics.readerVisibleFallbacks).toBe(1);
    expect(summary.metrics.readerVisibleFallbackRate).toBe(0.5);
    expect(summary.metrics.acceptedRiskCandidateRows).toBe(1);
    expect(summary.riskCandidateKeys).toEqual(["arxiv:2401.00001:b1"]);
    expect(summary.cohort.completeFlag).toBe(true);
    expect(summary.cohort.completeAfterErrorCheck).toBe(false);
    expect(summary.byDiscipline.hci.rows).toBe(2);
    expect(summary.byFormat.arxiv.readerVisibleFallbacks).toBe(1);
  });
});
