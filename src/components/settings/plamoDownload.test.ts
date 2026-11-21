import { describe, expect, it, vi } from "vitest";
import { currentPlamoDownload, downloadPlamoModelOnce, simulatePlamoDownload, usePlamoDownloadStore } from "./plamoDownload";
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
    expect(usePlamoDownloadStore.getState().downloading).toBe(true);
    finish();
    await Promise.all([a, b]);
    expect(currentPlamoDownload()).toBeNull();
    expect(usePlamoDownloadStore.getState().downloading).toBe(false);
  });

  it("allows a retry after a failed download", async () => {
    const invoke = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    await expect(downloadPlamoModelOnce(invoke)).rejects.toThrow("offline");
    expect(currentPlamoDownload()).toBeNull();
    await downloadPlamoModelOnce(invoke);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

describe("simulatePlamoDownload (onboarding test builds)", () => {
  it("walks the shared progress from 0 to 100 before resolving", async () => {
    vi.useFakeTimers();
    const done = downloadPlamoModelOnce(simulatePlamoDownload);
    expect(usePlamoDownloadStore.getState()).toMatchObject({ downloading: true, percent: 0 });
    await vi.advanceTimersByTimeAsync(3000);
    const mid = usePlamoDownloadStore.getState().percent;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(usePlamoDownloadStore.getState()).toMatchObject({ downloading: false, percent: 100 });
    vi.useRealTimers();
  });
});

describe("introStepAfterCta", () => {
  it("offers the PLaMo download only when the model is missing", () => {
    expect(introStepAfterCta("absent", false)).toBe("plamo");
    for (const state of ["present", "unavailable", "downloading", "checking", "error"] as const) {
      expect(introStepAfterCta(state, false)).toBe("close");
    }
  });

  it("shows the PLaMo screen in onboarding preview builds even when the model is installed", () => {
    expect(introStepAfterCta("present", true)).toBe("plamo");
    expect(introStepAfterCta("unavailable", true)).toBe("close");
  });
});
