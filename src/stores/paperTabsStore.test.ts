import { beforeEach, describe, expect, it } from "vitest";
import { readerPaperId, usePaperTabs } from "./paperTabsStore";

const state = () => usePaperTabs.getState();

describe("paperTabsStore", () => {
  beforeEach(() => usePaperTabs.setState({ tabs: [] }));

  it("opens a new tab after the given tab and never duplicates", () => {
    state().openTab("a");
    state().openTab("b");
    state().openTab("c", "a");
    state().openTab("b", "c");
    expect(state().tabs).toEqual(["a", "c", "b"]);
  });

  it("closing picks the right neighbour, then the left one", () => {
    usePaperTabs.setState({ tabs: ["a", "b", "c"] });
    expect(state().closeTab("b")).toBe("c");
    expect(state().closeTab("c")).toBe("a");
    expect(state().closeTab("a")).toBeNull();
    expect(state().tabs).toEqual([]);
  });

  it("moves and prunes tabs", () => {
    usePaperTabs.setState({ tabs: ["a", "b", "c"] });
    state().moveTab("a", 2);
    expect(state().tabs).toEqual(["b", "c", "a"]);
    state().retainTabs((id) => id !== "c");
    expect(state().tabs).toEqual(["b", "a"]);
  });

  it("reads the paper id from reader routes only", () => {
    expect(readerPaperId("/reader/p%201")).toBe("p 1");
    expect(readerPaperId("/reader/abc/extra")).toBe("abc");
    expect(readerPaperId("/project/abc")).toBeNull();
  });
});
