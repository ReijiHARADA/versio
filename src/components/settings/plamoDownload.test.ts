import { describe, expect, it, vi } from "vitest";
import { downloadPlamoModelOnce, currentPlamoDownload } from "./plamoDownload";
import { introStepAfterCta } from "../intro/introSteps";

describe("downloadPlamoModelOnce", () => {
  it("shares one download between the intro and Settings", async () => {
    let finish!: () => void;
    const invoke = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const a = downloadPlamoModelOnce(invoke);
    const b = downloadPlamoModelOnce(invoke);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("download_plamo_model");
    expect(currentPlamoDownload()).not.toBeNull();
    finish();
    await Promise.all([a, b]);
    expect(currentPlamoDownload()).toBeNull();
  });

  it("allows a retry after a failed download", async () => {
    const invoke = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    await expect(downloadPlamoModelOnce(invoke)).rejects.toThrow("offline");
    expect(currentPlamoDownload()).toBeNull();
    await downloadPlamoModelOnce(invoke);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

describe("introStepAfterCta", () => {
  it("offers the PLaMo download only when the model is missing", () => {
    expect(introStepAfterCta("absent")).toBe("plamo");
    for (const state of ["present", "unavailable", "downloading", "checking", "error"] as const) {
      expect(introStepAfterCta(state)).toBe("close");
    }
  });
});
