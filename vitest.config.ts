import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Pure config/scoring test target (Phase 1a trial): src/evaluation/**.
// Runs under plain node — no jsdom/DOM needed for that logic. Component
// tests (e.g. src/contexts/**/*.test.tsx) opt into jsdom per-file via
// environmentMatchGlobs below, since they render real React components.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "scripts/**/*.test.mts",
    ],
    environment: "node",
    environmentMatchGlobs: [
      ["src/contexts/**/*.test.tsx", "jsdom"],
      ["src/components/**/*.test.tsx", "jsdom"],
    ],
  },
});
