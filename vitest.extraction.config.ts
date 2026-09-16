import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/** Explicit config for the locally cached real-paper extraction corpus. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    // Real PDFs vary widely in page count and pdfjs parsing cost. Keep the
    // corpus gate deterministic on developer machines instead of allowing
    // the default 60s per-paper timeout to turn host contention into a false
    // extraction regression.
    testTimeout: 180_000,
    maxWorkers: 1,
    minWorkers: 1,
    include: [
      "src/test/readingOrder/realPapers.test.ts",
      "src/test/pdfExtraction/baselineRealPapers.test.ts",
    ],
    exclude: ["node_modules/**"],
  },
});
