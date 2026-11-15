/** Summarize human-review completeness without generating a score. */
import fs from "node:fs";
import path from "node:path";
import { isEvaluationBundle, type EvaluationBundle } from "../src/evaluation/schema.ts";

const root = path.resolve(import.meta.dirname, ".."); const args = process.argv.slice(2); const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const directory = path.resolve(root, option("--dir") ?? "test-data/extraction-evaluation/reviews");
const files = (current: string): string[] => fs.existsSync(current) ? fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(current, entry.name)) : entry.name.endsWith(".evaluation.json") ? [path.join(current, entry.name)] : []) : [];
const rows = files(directory).flatMap((file) => {
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as EvaluationBundle; if (!isEvaluationBundle(value)) return [];
  const pages = value.review.pages;
  const eligible = (predicate: (page: typeof pages[number]) => boolean) => pages.filter(predicate).length;
  return [{ id: value.snapshot.source.paperId, file: path.relative(root, file), pages: pages.length, complete: pages.filter((page) => page.status === "complete").length, inProgress: pages.filter((page) => page.status === "in-progress").length,
    blockGoldPages: eligible((page) => page.status === "complete" && page.coverage.predictedComplete && page.coverage.goldComplete),
    textPages: eligible((page) => page.status === "complete" && page.coverage.textComplete),
    readingOrderPages: eligible((page) => page.status === "complete" && page.coverage.readingOrderComplete && (page.goldReadingOrder?.length ?? 0) > 1),
    boundaryPages: eligible((page) => page.status === "complete" && page.coverage.paragraphBoundariesComplete && (page.goldParagraphBoundaries?.length ?? 0) > 0),
    captionRelationPages: eligible((page) => page.status === "complete" && page.coverage.relationsComplete && (page.goldCaptionRelations?.length ?? 0) > 0),
    tablePages: eligible((page) => page.status === "complete" && page.coverage.tablesComplete && (page.goldTables?.length ?? 0) > 0),
    formulaPages: eligible((page) => page.status === "complete" && page.coverage.formulasComplete && (page.goldFormulas?.length ?? 0) > 0) }];
});
const grouped = Map.groupBy(rows, (row) => row.id);
const duplicates = [...grouped.entries()].flatMap(([id, entries]) => entries.length > 1 ? [{ id, files: entries.map((entry) => entry.file) }] : []);
// Never count a duplicated paper twice. It needs cleanup before it can be used
// as a benchmark source; the first path is only retained for progress visibility.
const uniqueRows = [...grouped.values()].map((entries) => entries[0]);
const result = { generatedAt: new Date().toISOString(), bundles: uniqueRows.length, duplicatePapers: duplicates, totals: { pages: uniqueRows.reduce((sum, row) => sum + row.pages, 0), complete: uniqueRows.reduce((sum, row) => sum + row.complete, 0), blockGoldPages: uniqueRows.reduce((sum, row) => sum + row.blockGoldPages, 0), textPages: uniqueRows.reduce((sum, row) => sum + row.textPages, 0), readingOrderPages: uniqueRows.reduce((sum, row) => sum + row.readingOrderPages, 0), boundaryPages: uniqueRows.reduce((sum, row) => sum + row.boundaryPages, 0), captionRelationPages: uniqueRows.reduce((sum, row) => sum + row.captionRelationPages, 0), tablePages: uniqueRows.reduce((sum, row) => sum + row.tablePages, 0), formulaPages: uniqueRows.reduce((sum, row) => sum + row.formulaPages, 0) }, rows: uniqueRows };
console.log(JSON.stringify(result, null, 2));
