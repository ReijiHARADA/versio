import { describe, expect, it } from "vitest";
import { withTimeout } from "../services/pdfService";

describe("withTimeout", () => {
  it("rejects an unresponsive optional PDF operation and invokes its cancellation hook", async () => {
    let cancelled = false;
    const never = new Promise<never>(() => undefined);

    await expect(withTimeout(never, 10, "figure operation timed out", () => {
      cancelled = true;
    })).rejects.toThrow("figure operation timed out");

    expect(cancelled).toBe(true);
  });
});
