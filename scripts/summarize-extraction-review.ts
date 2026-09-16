import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Sample = {
  classification: string;
  manualRole: string | null;
  reviewStatus: "pending" | "reviewed";
  severity: number | null;
};

const root = path.join(fileURLToPath(new URL("..", import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(
  path.join(root, "test-fixtures/real-papers/ground-truth/layout-residuals.json"),
  "utf8",
)) as { samples: Sample[] };

const reviewed = fixture.samples.filter((sample) => sample.reviewStatus === "reviewed");
const invalid = fixture.samples.filter((sample) =>
  sample.reviewStatus === "reviewed" &&
  (sample.manualRole === null || sample.severity === null || sample.severity < 0 || sample.severity > 4)
);
if (invalid.length > 0) throw new Error(`invalid reviewed residual samples: ${invalid.length}`);

const countBy = (values: string[]) => Object.fromEntries(
  [...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]),
);
console.log(JSON.stringify({
  version: "extraction-residual-review-summary-v1",
  total: fixture.samples.length,
  reviewed: reviewed.length,
  pending: fixture.samples.length - reviewed.length,
  reviewedByRole: countBy(reviewed.map((sample) => sample.manualRole as string)),
  reviewedByClass: countBy(reviewed.map((sample) => sample.classification)),
  severity: countBy(reviewed.map((sample) => String(sample.severity))),
}, null, 2));
