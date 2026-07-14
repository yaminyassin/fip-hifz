import { defineConfig } from "vitest/config";
import path from "path";

// Pure config/scoring test target (Phase 1a trial): src/evaluation/**.
// Deliberately does not use jsdom/React plugins — these tests exercise
// plain TypeScript scoring/config logic only, no components.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/evaluation/**/*.test.ts"],
    environment: "node",
  },
});
