import { describe, expect, it } from "vitest";
import { isWorkspaceRenameDoubleClick } from "../../../components/shell/workspaceRenameGesture";

describe("isWorkspaceRenameDoubleClick", () => {
  it("only accepts rapid repeated clicks on the same folder", () => {
    expect(isWorkspaceRenameDoubleClick({ nodeId: "a", at: 100 }, "a", 350)).toBe(true);
    expect(isWorkspaceRenameDoubleClick({ nodeId: "a", at: 100 }, "a", 351)).toBe(false);
    expect(isWorkspaceRenameDoubleClick({ nodeId: "a", at: 100 }, "b", 200)).toBe(false);
  });
});
