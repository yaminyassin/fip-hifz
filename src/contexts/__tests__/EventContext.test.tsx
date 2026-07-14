import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, cleanup } from "@testing-library/react";
import { EventProvider, useEvent, type EvaluationConfigStatus } from "../EventContext";
import { loadEvaluationConfig } from "@/evaluation/eventDescriptor";
import type { EventEvaluationConfigV2, EventEvaluationDescriptorV2 } from "@/evaluation/types";

// EventContext imports `@/main` only for its `firestore` export (used to
// build Firestore readers passed into `loadEvaluationConfig`, which is
// mocked below and never invokes them). Stub it out so importing the real
// module (which calls `initializeApp`/`createRoot` at module scope) never
// runs in this unit test.
vi.mock("@/main", () => ({ firestore: {} }));

vi.mock("@/evaluation/eventDescriptor", async () => {
  const actual = await vi.importActual<typeof import("@/evaluation/eventDescriptor")>(
    "@/evaluation/eventDescriptor"
  );
  return { ...actual, loadEvaluationConfig: vi.fn() };
});

const mockedLoad = vi.mocked(loadEvaluationConfig);

interface RenderSnapshot {
  currentEvent: string | null;
  status: EvaluationConfigStatus;
  hasConfig: boolean;
}

/**
 * Regression test for the stale-frame flash (design doc §1, "Config
 * storage model"): EventContext used to clear the previous event's
 * compiled config in a `useEffect`, which runs after commit. That let one
 * committed render show the NEW `currentEvent` alongside the OLD event's
 * `evaluationConfig`/`ready` status -- in a real browser this is the frame
 * that renders stale scored content before `EvaluationConfigGate` catches
 * up. The fix resets the config synchronously during render (React's
 * "adjust state during rendering" pattern), so no such commit exists.
 *
 * This test proves it by capturing a snapshot on every render of a
 * consumer component (in the render body itself, not an effect, so it
 * sees exactly what each commit would have painted) and asserting no
 * snapshot ever pairs the new event id with the previous event's ready
 * config/status.
 */
describe("EventContext: synchronous config reset on event switch", () => {
  let snapshots: RenderSnapshot[];
  let latestSetCurrentEvent: (event: string) => void;

  function Consumer() {
    const ctx = useEvent();
    latestSetCurrentEvent = ctx.setCurrentEvent;
    snapshots.push({
      currentEvent: ctx.currentEvent,
      status: ctx.evaluationConfigStatus,
      hasConfig: ctx.evaluationConfig !== null,
    });
    return null;
  }

  beforeEach(() => {
    snapshots = [];
    latestSetCurrentEvent = () => {
      throw new Error("Consumer has not rendered yet");
    };
    mockedLoad.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("never commits a render pairing the new currentEvent with the previous event's config", async () => {
    const configA = { algorithmVersion: "config-a" } as unknown as EventEvaluationConfigV2;
    const descriptorA = { mode: "jury-first-v2" } as unknown as EventEvaluationDescriptorV2;

    mockedLoad.mockImplementation(async (eventId: string) => {
      if (eventId === "event-a") {
        return { status: "ready" as const, config: configA, descriptor: descriptorA };
      }
      // event-b intentionally never resolves in this test: we only care
      // about the state visible in the render that first observes the
      // switch to it, not its eventual (unrelated) load outcome.
      return new Promise(() => {
        /* never resolves */
      });
    });

    await act(async () => {
      render(
        <EventProvider>
          <Consumer />
        </EventProvider>
      );
    });

    await act(async () => {
      latestSetCurrentEvent("event-a");
    });
    // Flush the mocked event-a load to `ready`.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      snapshots.some((s) => s.currentEvent === "event-a" && s.status === "ready" && s.hasConfig)
    ).toBe(true);

    // Switch mid-session to a second event, the way EventSelector does.
    await act(async () => {
      latestSetCurrentEvent("event-b");
    });

    const staleFrame = snapshots.find(
      (s) => s.currentEvent === "event-b" && (s.hasConfig || s.status === "ready")
    );
    expect(staleFrame).toBeUndefined();

    // The very first render that observes event-b must already reflect the
    // reset (config cleared, status back to loading) -- not a later one.
    const firstEventBSnapshot = snapshots.find((s) => s.currentEvent === "event-b");
    expect(firstEventBSnapshot).toEqual({
      currentEvent: "event-b",
      status: "loading",
      hasConfig: false,
    });
  });
});
