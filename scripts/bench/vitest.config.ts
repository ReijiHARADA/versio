import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["scripts/bench/*.bench.ts"], testTimeout: 3_600_000 },
});
