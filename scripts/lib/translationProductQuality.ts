export type AuditRow = Record<string, any>;

export type AuditPaper = {
  paper: {
    id: string;
    title?: string;
    doi?: string | null;
    sourceUrl?: string;
    downloadUrl?: string;
    discipline?: string;
    disciplines?: string[];
    formatFamily?: string;
  };
  rows: AuditRow[];
  error?: string;
};

export type AuditEnvelope = {
  complete?: boolean;
  runId?: string;
  createdAt?: string;
  papers: AuditPaper[];
};

export type RiskEnvelope = { rows: AuditRow[] };

const normalizeDoi = (value: unknown) => String(value ?? "").trim()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
  .replace(/^doi:\s*/i, "")
  .toLowerCase();

const arxivId = (value: unknown) => {
  const match = String(value ?? "").match(/arxiv\.org\/(?:abs|pdf)\/([^/?#]+)/i);
  return match?.[1]?.replace(/\.pdf$/i, "").replace(/v\d+$/i, "").toLowerCase();
};

export function summarizeTranslationProductQuality(audit: AuditEnvelope, risk: RiskEnvelope) {
  const canonicalPaperId = (paper: AuditPaper["paper"]) => {
    const doi = normalizeDoi(paper.doi);
    if (doi) return `doi:${doi}`;
    const arxiv = arxivId(paper.sourceUrl) ?? arxivId(paper.downloadUrl);
    return arxiv ? `arxiv:${arxiv}` : `paper:${paper.id}`;
  };
  const canonicalIdByPaperId = new Map(audit.papers.map(({ paper }) => [paper.id, canonicalPaperId(paper)]));
  const paperById = new Map(audit.papers.map(({ paper }) => [paper.id, paper]));
  const key = (row: AuditRow) => {
    if (row.canonicalKey) return String(row.canonicalKey);
    const rawKey = String(row.key ?? "");
    const separator = rawKey.indexOf(":");
    const paperId = String(row.paperId ?? (separator >= 0 ? rawKey.slice(0, separator) : ""));
    const blockId = String(row.blockId ?? (separator >= 0 ? rawKey.slice(separator + 1) : ""));
    const canonicalId = canonicalIdByPaperId.get(paperId);
    return canonicalId && blockId ? `${canonicalId}:${blockId}` : rawKey || `${paperId}:${blockId}`;
  };

  const allOrdinary = audit.papers.flatMap(({ paper, rows }) => rows
    .map((row) => ({ ...row, paperId: row.paperId ?? paper.id, canonicalKey: `${canonicalPaperId(paper)}:${row.blockId}` }))
    .filter((row) => row.sourceCategory === "ordinary-body-prose"));
  // Alias entries for the same paper can otherwise count as independent trials.
  const ordinaryByStableKey = new Map<string, AuditRow>();
  for (const row of allOrdinary.sort((a, b) => String(a.paperId).localeCompare(String(b.paperId)) || String(a.blockId).localeCompare(String(b.blockId)))) {
    if (!ordinaryByStableKey.has(key(row))) ordinaryByStableKey.set(key(row), row);
  }
  const ordinary = [...ordinaryByStableKey.values()];
  const duplicateOrdinaryRowsExcluded = allOrdinary.length - ordinary.length;
  const isFallback = (row: AuditRow) => Boolean(row.readerVisibleFallback ?? row.sourceFallback ?? !String(row.translation ?? "").trim());
  const fallback = ordinary.filter(isFallback);
  // Relation-signal envelopes contain every accepted row; only missing signals
  // are review candidates. Pre-filtered risk reports have no missingSignals.
  const riskKeys = new Set(risk.rows
    .filter((row) => !Array.isArray(row.missingSignals) || row.missingSignals.length > 0)
    .map(key));
  const riskCandidates = ordinary.filter((row) => riskKeys.has(key(row)));
  const acceptedRiskCandidates = riskCandidates.filter((row) => !isFallback(row));
  const combinedRiskCandidates = new Set([...fallback.map(key), ...acceptedRiskCandidates.map(key)]);
  const failedPapers = audit.papers.filter((entry) => entry.error).map((entry) => ({ id: entry.paper.id, error: entry.error }));

  const summarize = (rows: AuditRow[]) => {
    const scopedFallback = rows.filter(isFallback);
    const scopedRisk = rows.filter((row) => riskKeys.has(key(row)) && !isFallback(row));
    const scopedCombined = new Set([...scopedFallback.map(key), ...scopedRisk.map(key)]);
    return {
      rows: rows.length,
      acceptedRows: rows.length - scopedFallback.length,
      readerVisibleFallbacks: scopedFallback.length,
      readerVisibleFallbackRate: scopedFallback.length / Math.max(1, rows.length),
      acceptedRiskCandidateRows: scopedRisk.length,
      riskCandidateRateAmongAccepted: scopedRisk.length / Math.max(1, rows.length - scopedFallback.length),
      combinedReaderVisibleRiskCandidates: scopedCombined.size,
      combinedReaderVisibleRiskCandidateRate: scopedCombined.size / Math.max(1, rows.length),
    };
  };
  const grouping = (selector: (row: AuditRow) => string) => {
    const groups = new Map<string, AuditRow[]>();
    for (const row of ordinary) {
      const name = selector(row);
      const entries = groups.get(name) ?? [];
      entries.push(row);
      groups.set(name, entries);
    }
    return Object.fromEntries([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, rows]) => [name, summarize(rows)]));
  };
  const byDiscipline = grouping((row) => {
    const paper = paperById.get(row.paperId);
    return String(paper?.discipline ?? paper?.disciplines?.[0] ?? "unknown");
  });
  const byFormat = grouping((row) => String(paperById.get(row.paperId)?.formatFamily ?? "unknown"));

  return {
    cohort: {
      runId: audit.runId ?? null,
      createdAt: audit.createdAt ?? null,
      completeFlag: audit.complete ?? null,
      completeAfterErrorCheck: Boolean(audit.complete && failedPapers.length === 0),
      paperCount: audit.papers.length,
      failedPapers,
    },
    metrics: {
      ordinaryRows: ordinary.length,
      duplicateOrdinaryRowsExcluded,
      acceptedRows: ordinary.length - fallback.length,
      readerVisibleFallbacks: fallback.length,
      readerVisibleFallbackRate: fallback.length / Math.max(1, ordinary.length),
      ordinaryRowsWithNonEmptyTranslation: ordinary.filter((row) => String(row.translation ?? "").trim().length > 0).length,
      acceptedRiskCandidateRows: acceptedRiskCandidates.length,
      riskCandidateRateAmongOrdinary: acceptedRiskCandidates.length / Math.max(1, ordinary.length),
      riskCandidateRateAmongAccepted: acceptedRiskCandidates.length / Math.max(1, ordinary.length - fallback.length),
      combinedReaderVisibleRiskCandidates: combinedRiskCandidates.size,
      combinedReaderVisibleRiskCandidateRate: combinedRiskCandidates.size / Math.max(1, ordinary.length),
    },
    byDiscipline,
    byFormat,
    riskCandidateKeys: acceptedRiskCandidates.map(key),
  };
}
