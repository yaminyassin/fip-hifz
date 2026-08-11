// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearAuthenticatedJury,
  getAuthenticatedJury,
  logoutJury,
  setAuthenticatedJury,
} from "./juryAuth";

const mocks = vi.hoisted(() => ({
  updateJuryActiveStatus: vi.fn(),
}));

vi.mock("@/main", () => ({ firestore: {} }));

vi.mock("./jury", () => ({
  updateJuryActiveStatus: mocks.updateJuryActiveStatus,
}));

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("jury session storage", () => {
  it("keeps each event's jury identity separate", () => {
    setAuthenticatedJury("event-a", "jury-a");
    setAuthenticatedJury("event-b", "jury-b");

    expect(getAuthenticatedJury("event-a")).toBe("jury-a");
    expect(getAuthenticatedJury("event-b")).toBe("jury-b");

    clearAuthenticatedJury("event-a");

    expect(getAuthenticatedJury("event-a")).toBeNull();
    expect(getAuthenticatedJury("event-b")).toBe("jury-b");
  });

  it("logs out and clears only the current event", async () => {
    setAuthenticatedJury("event-a", "jury-a");
    setAuthenticatedJury("event-b", "jury-b");

    await logoutJury("event-a");

    expect(mocks.updateJuryActiveStatus).toHaveBeenCalledWith(
      "event-a",
      "jury-a",
      false
    );
    expect(getAuthenticatedJury("event-a")).toBeNull();
    expect(getAuthenticatedJury("event-b")).toBe("jury-b");
  });
});
