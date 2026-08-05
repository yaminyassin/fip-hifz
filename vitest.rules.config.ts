import { defineConfig } from "vitest/config";
import path from "path";

// Firestore rules unit tests. Deliberately a SEPARATE vitest project from
// vitest.config.ts: those tests are pure and run anywhere, these require a
// live Firestore emulator on 127.0.0.1:8085 (firebase.rules.json) and a JDK.
// vitest.config.ts's include globs are src/** and scripts/**, so firestore-rules/**
// is picked up by this config only — the two never overlap.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["firestore-rules/**/*.test.ts"],
    environment: "node",
    // Rules evaluation round-trips to the emulator; the default 5s is tight
    // when the JVM is cold.
    testTimeout: 15000,
    hookTimeout: 30000,
    // The emulator is shared mutable state and every file calls clearFirestore().
    fileParallelism: false,
  },
});
