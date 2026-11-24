import { beforeEach, describe, expect, it } from "vitest";
import { folderTab, migratePaperTabs, paperTab, readerPaperId, tabForPath, tabPath, usePaperTabs } from "./paperTabsStore";

const state = () => usePaperTabs.getState();
const [a, b, c] = [paperTab("a"), paperTab("b"), folderTab("c")];

describe("paperTabsStore", () => {
  beforeEach(() => usePaperTabs.setState({ tabs: [] }));

  it("opens a new tab after the given tab and never duplicates", () => {
    state().openTab(a);
    state().openTab(b);
    state().openTab(c, a);
    state().openTab(b, c);
    expect(state().tabs).toEqual([a, c, b]);
  });

  it("closing picks the right neighbour, then the left one", () => {
    usePaperTabs.setState({ tabs: [a, b, c] });
    expect(state().closeTab(b)).toBe(c);
    expect(state().closeTab(c)).toBe(a);
    expect(state().closeTab(a)).toBeNull();
    expect(state().tabs).toEqual([]);
  });

  it("moves and prunes tabs; a no-op move keeps the same state", () => {
    usePaperTabs.setState({ tabs: [a, b, c] });
    state().moveTab(a, 2);
    expect(state().tabs).toEqual([b, c, a]);
    const before = state().tabs;
    state().moveTab(c, 1);
    expect(state().tabs).toBe(before);
    state().retainTabs((key) => key !== c);
    expect(state().tabs).toEqual([b, a]);
  });

  it("maps reader and folder routes to tabs and back", () => {
    expect(tabForPath("/reader/p%201")).toBe("paper:p 1");
    expect(tabForPath("/project/n1")).toBe("folder:n1");
    expect(tabForPath("/inbox")).toBeNull();
    expect(tabPath(paperTab("p 1"))).toBe("/reader/p%201");
    expect(tabPath(folderTab("n1"))).toBe("/project/n1");
    expect(readerPaperId("/reader/abc/extra")).toBe("abc");
    expect(readerPaperId("/project/abc")).toBeNull();
  });

  it("migrates v1 bare paper ids", () => {
    expect(migratePaperTabs({ tabs: ["x", 3, "y"] }, 1)).toEqual({ tabs: ["paper:x", "paper:y"] });
  });
});
