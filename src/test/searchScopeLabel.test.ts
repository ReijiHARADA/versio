import { describe, expect, it } from "vitest";
import { searchScopeLabel } from "../components/shell/AppSidebar";
import type { WorkspaceNode } from "../types/project";

const nodes = [{ id: "n1", parentId: null, name: "卒論", order: 0 }] as WorkspaceNode[];

describe("searchScopeLabel", () => {
  it("follows the current screen", () => {
    expect(searchScopeLabel("/", nodes)).toBe("ライブラリ");
    expect(searchScopeLabel("/inbox", nodes)).toBe("インボックス");
    expect(searchScopeLabel("/reader/p1", nodes)).toBe("この論文");
    expect(searchScopeLabel("/project/n1", nodes)).toBe("卒論");
    expect(searchScopeLabel("/project/missing", nodes)).toBe("ワークスペース");
  });
});
