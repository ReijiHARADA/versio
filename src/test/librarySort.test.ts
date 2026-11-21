import { describe, expect, it } from "vitest";
import { sortPapers } from "../components/library/LibrarySortMenu";
import type { Paper } from "../types/paper";

const paper = (id: string, over: Partial<Paper>): Paper =>
  ({ id, titleOriginal: id, titleTranslated: null, year: null, createdAt: "2026-01-01", ...over }) as Paper;

const a = paper("b-title", { year: 2020, createdAt: "2026-01-02", lastOpenedAt: "2026-03-01" });
const b = paper("a-title", { year: null, createdAt: "2026-01-03" });
const c = paper("c-title", { year: 2024, createdAt: "2026-01-01", lastOpenedAt: "2026-02-01" });
const ids = (list: Paper[]) => list.map((p) => p.id);

describe("sortPapers", () => {
  it("orders by added date, newest first by default", () => {
    expect(ids(sortPapers([a, b, c], { key: "added", dir: "desc" }))).toEqual(["a-title", "b-title", "c-title"]);
  });
  it("orders by title ascending", () => {
    expect(ids(sortPapers([a, b, c], { key: "title", dir: "asc" }))).toEqual(["a-title", "b-title", "c-title"]);
  });
  it("puts papers without a year last when newest year first", () => {
    expect(ids(sortPapers([a, b, c], { key: "year", dir: "desc" }))).toEqual(["c-title", "b-title", "a-title"]);
  });
  it("puts never-opened papers last when recently opened first", () => {
    expect(ids(sortPapers([a, b, c], { key: "opened", dir: "desc" }))).toEqual(["b-title", "c-title", "a-title"]);
  });
});
