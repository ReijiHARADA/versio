/** Show what a query expands to: npx tsx scripts/synonyms/probe.ts 使いやすさ "cognitive load" (`-` = offered, off by default). */
import { readFileSync } from "node:fs";
import { SynonymDictionary } from "../../src/domain/search/synonymDictionary";
import { buildSearchQuery } from "../../src/domain/search/searchQuery";
const t = performance.now();
const dict = new SynonymDictionary(JSON.parse(readFileSync("src/generated/synonyms.json", "utf8")));
console.log(`index ${(performance.now() - t).toFixed(0)}ms`);
for (const q of process.argv.slice(2)) {
  const query = buildSearchQuery(q, { dictionary: dict });
  console.log(q, "=>", query.groups.map((g) => `[${g.suggestions.map((v) => `${v.active ? "" : "-"}${v.label}:${v.relation[0]}${v.weight}`).join(", ")}]`).join(" AND "));
}
