import { describe, expect, it } from "vitest";
import {
  assertValidParticipantId,
  generateParticipantId,
  participantIdValidationError,
} from "./participantId";

describe("generateParticipantId", () => {
  it("uses the same Unicode-aware identity for every participant writer", () => {
    expect(generateParticipantId("Ámina Rahman")).toBe("amina_rahman");
    expect(generateParticipantId("M.Uzair Dawood")).toBe("m_uzair_dawood");
    expect(generateParticipantId("يوسف بن علي")).toBe("يوسف_بن_علي");
  });

  it("reserves downstream suffix space within Firestore's UTF-8 document ID limit", () => {
    expect(participantIdValidationError("a".repeat(1_300))).toBeNull();
    expect(participantIdValidationError("a".repeat(1_301))).toContain("1300-byte");
    expect(participantIdValidationError("界".repeat(434))).toContain("1300-byte");
    expect(() => assertValidParticipantId("a".repeat(1_301))).toThrow("1300-byte");
  });
});
