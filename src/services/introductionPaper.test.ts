import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  getSetting: vi.fn(),
  saveSetting: vi.fn(),
  savePaper: vi.fn(),
  saveSections: vi.fn(),
  saveBlocks: vi.fn(),
}));
vi.mock("./database", () => db);

import { seedIntroductionPaper } from "./introductionPaper";
import { useLibraryCache } from "../stores/libraryCache";

const FLAG = "onboarding.introductionSeeded";

describe("seedIntroductionPaper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLibraryCache.setState({ papers: [] });
  });

  it("adds the Introduction to an empty first-run library and remembers it", async () => {
    db.getSetting.mockResolvedValue(undefined);
    expect(await seedIntroductionPaper(0)).toBe("added");
    expect(db.savePaper).toHaveBeenCalledOnce();
    expect(db.saveSections).toHaveBeenCalledOnce();
    expect(db.saveBlocks).toHaveBeenCalledOnce();
    expect(db.saveSetting).toHaveBeenCalledWith(FLAG, true);
    expect(useLibraryCache.getState().papers.map((p) => p.id)).toEqual(["versio-introduction"]);
  });

  it("never re-adds after it was seeded once (e.g. the user trashed it)", async () => {
    db.getSetting.mockResolvedValue(true);
    expect(await seedIntroductionPaper(0)).toBe("skipped");
    expect(db.savePaper).not.toHaveBeenCalled();
  });

  it("skips existing users and marks them so it never appears later", async () => {
    db.getSetting.mockResolvedValue(undefined);
    expect(await seedIntroductionPaper(1)).toBe("skipped");
    expect(db.savePaper).not.toHaveBeenCalled();
    expect(db.saveSetting).toHaveBeenCalledWith(FLAG, true);
  });

  it("leaves the flag unset when saving fails so the next launch retries", async () => {
    db.getSetting.mockResolvedValue(undefined);
    db.savePaper.mockRejectedValueOnce(new Error("disk full"));
    await expect(seedIntroductionPaper(0)).rejects.toThrow("disk full");
    expect(db.saveSetting).not.toHaveBeenCalled();
  });
});
