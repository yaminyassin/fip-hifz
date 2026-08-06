import { test, expect } from "@playwright/test";
import { doc, getDoc } from "firebase/firestore";
import { getEmulatorFirestore } from "./firestoreTestClient";
import { loadEvaluationConfig } from "../src/evaluation/eventDescriptor";
import type { EvaluationConfigReaders } from "../src/evaluation/eventDescriptor";

/**
 * Config-loading-SEAM coverage (greenfield design doc §1, "Config storage
 * model"): calls the real `loadEvaluationConfig` function — the same
 * function EventContext wires up — against the real Firestore emulator via
 * real Firestore reads, rather than fake in-memory readers.
 *
 * Scope, precisely: this file does NOT open a browser page. It proves the
 * loader function's own return value against real emulator data. The
 * browser-level "the running app itself fails closed" assertion lives in
 * evaluationConfigGate.spec.ts.
 */
function readersFor(eventId: string): EvaluationConfigReaders {
  const firestore = getEmulatorFirestore();
  return {
    getEventDocument: async () => {
      const snapshot = await getDoc(doc(firestore, "events", eventId));
      return snapshot.exists() ? snapshot.data() : undefined;
    },
    getConfigDocument: async (configPath: string) => {
      try {
        const snapshot = await getDoc(doc(firestore, configPath));
        return snapshot.exists() ? snapshot.data() : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

test.describe("loadEvaluationConfig seam, against the real emulator (not a browser/UI-gating test)", () => {
  test("demo-2026: the loader resolves the provisioned jury-first-v2 config from configPath (no fallback of any kind)", async () => {
    const result = await loadEvaluationConfig("demo-2026", readersFor("demo-2026"));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.descriptor.mode).toBe("jury-first-v2");
      expect(result.config.algorithmVersion).toBe("jury-first-v2");
      // Never falls back to category "A": the real example categories are
      // present and distinct.
      expect(Object.keys(result.config.categories).sort()).toEqual([
        "CAT_A",
        "CAT_B",
        "CAT_M",
      ]);
      expect(Object.keys(result.config.categories)).not.toContain("A");
    }
  });

  test("unconfigured-event: the loader returns failClosed for an event with no evaluation descriptor (no fallback exists)", async () => {
    const result = await loadEvaluationConfig(
      "unconfigured-event",
      readersFor("unconfigured-event")
    );
    expect(result.status).toBe("failClosed");
  });

  test("does-not-exist-at-all: the loader returns failClosed for a nonexistent event", async () => {
    const result = await loadEvaluationConfig(
      "does-not-exist-at-all",
      readersFor("does-not-exist-at-all")
    );
    expect(result.status).toBe("failClosed");
  });

  test("the real seeded demo-2026 event has an app_config/evaluation document (native config, not a fallback)", async () => {
    const firestore = getEmulatorFirestore();
    const snapshot = await getDoc(
      doc(firestore, "events", "demo-2026", "app_config", "evaluation")
    );
    expect(snapshot.exists()).toBe(true);
  });
});
