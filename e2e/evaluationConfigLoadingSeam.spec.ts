import { test, expect } from "@playwright/test";
import { doc, getDoc } from "firebase/firestore";
import { getEmulatorFirestore } from "./firestoreTestClient";
import { loadEvaluationConfig } from "../src/evaluation/eventDescriptor";
import type { EvaluationConfigReaders } from "../src/evaluation/eventDescriptor";

/**
 * Config-loading-SEAM coverage (design section 5, "Exact smoke gates"
 * #15-18): calls the real `loadEvaluationConfig` function — the same
 * function EventContext wires up — against the real Firestore emulator via
 * real Firestore reads, rather than fake in-memory readers.
 *
 * Scope, precisely: this file does NOT open a browser page and does NOT
 * prove that the running application refuses to render, mutate, or export
 * when `loadEvaluationConfig` returns `failClosed`. It proves the loader
 * function's own return value against real emulator data. `EventContext`
 * already stores that return value as `evaluationConfigStatus`
 * ('ready' | 'failClosed'), but gating every consumer (scoring, jury forms,
 * exports, randomizer, ...) on that status — so an app-level "fails closed"
 * claim would actually hold end to end — is deferred scale-out work per
 * `src/contexts/EventContext.tsx`'s own "Phase 1a trial scope" comment;
 * existing consumers keep reading `currentEvent` exactly as before this
 * trial. Do not read a "fails closed" assertion below as evidence that any
 * UI is gated.
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
  test("lisbon-2025: the loader falls back to the bundled config when configPath is absent and the event is allowlisted", async () => {
    const result = await loadEvaluationConfig("lisbon-2025", readersFor("lisbon-2025"));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.source).toBe("bundledLisbonFallback");
      expect(result.descriptor.mode).toBe("legacy-lisbon-display-v1");
      expect(result.config.algorithmVersion).toBe("legacy-lisbon-display-v1");
      // Never falls back to category "A": Lisbon's real leaf categories are
      // present and distinct.
      expect(Object.keys(result.config.categories).sort()).toContain("A1");
      expect(Object.keys(result.config.categories)).not.toContain("A");
    }
  });

  test("unconfigured-event: the loader returns failClosed for an event with no evaluation descriptor (no fallback, even though unrelated data exists)", async () => {
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

  test("fallback-trigger precondition: the real seeded event document has no app_config/evaluation document", async () => {
    const firestore = getEmulatorFirestore();
    const snapshot = await getDoc(
      doc(firestore, "events", "lisbon-2025", "app_config", "evaluation")
    );
    expect(snapshot.exists()).toBe(false);
  });
});
