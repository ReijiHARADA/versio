import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/** Explicit config for the locally cached real-paper extraction corpus. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: [
      "src/test/readingOrder/realPapers.test.ts",
      "src/test/pdfExtraction/baselineRealPapers.test.ts",
    ],
    exclude: ["node_modules/**"],
  },
});
