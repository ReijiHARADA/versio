import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dir, "../..");

export default defineConfig({
  root: dir,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.join(projectRoot, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5199,
    strictPort: true,
  },
});
