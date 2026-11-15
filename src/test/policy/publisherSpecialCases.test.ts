import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ratchet for ROADMAP B1: "do not add per-PDF heuristic ifs".
 * Publisher / venue / institution names belong in `pdfExtraction/formats/`
 * (Format Profiles). Code lines outside `formats/` that name one are counted
 * per file; the count may go down, never up. When you move a rule into a
 * Format Profile, lower the baseline here in the same commit.
 * Inventory and migration plan: docs/EXTRACTION_SPECIAL_CASES.md
 */
const root = path.resolve(__dirname, "../../..");
const NAME =
  /\b(?:BMJ|PLOS|Frontiers|Elsevier|Springer|IEEE|ACM|Nature|arXiv|bioRxiv|BMC|Jurnal|SENOPATI|NSTDA|Biobank|Consortium|MDPI|Lancet|JAMA|Wiley)/i;
const COMMENT = /^\s*(\/\/|\*|\/\*)/;

const BASELINE: Record<string, number> = {
  "src/services/pdfExtraction/resolver/documentResolver.ts": 14,
  "src/services/pdfExtraction/projection/toPaper.ts": 12,
  "src/services/pdfExtraction/projection/frontMatter/authorRecovery.ts": 5,
  "src/services/pdfLayout.ts": 10,
  "src/services/pdfExtraction/resolver/titleResolver.ts": 2,
  "src/services/pdfExtraction/types.ts": 1,
  "src/services/pdfExtraction/index.ts": 1,
};

function listTs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "formats" ? [] : listTs(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

function countNamedLines(file: string): number {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !COMMENT.test(line) && NAME.test(line)).length;
}

describe("publisher-specific extraction rules outside formats/", () => {
  const files = [
    ...listTs(path.join(root, "src/services/pdfExtraction")),
    path.join(root, "src/services/pdfLayout.ts"),
  ];
  const counts = Object.fromEntries(
    files
      .map((file) => [path.relative(root, file).split(path.sep).join("/"), countNamedLines(file)] as const)
      .filter(([, n]) => n > 0),
  );

  it("does not grow beyond the recorded baseline", () => {
    const grown = Object.entries(counts)
      .filter(([file, n]) => n > (BASELINE[file] ?? 0))
      .map(([file, n]) => `${file}: ${n} (baseline ${BASELINE[file] ?? 0})`);
    expect(grown, "move publisher-specific rules into pdfExtraction/formats/ instead").toEqual([]);
  });
});
