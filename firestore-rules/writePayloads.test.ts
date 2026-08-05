import { afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  EVENT_ID,
  JURY_ID,
  PARTICIPANT_ID,
  clearData,
  db,
  juryDoc,
  juryInputsDoc,
  legacyParticipantDoc,
  participantDoc,
  scoreDoc,
  seed,
  seedEvent,
  teardownTestEnv,
} from "./harness";

afterAll(teardownTestEnv);
beforeEach(clearData);

/**
 * These are the app's REAL write payloads, replayed verbatim against the
 * ruleset. If a rule is too strict, it breaks here rather than in production.
 * This is the group that protects against reproducing the outage the expired
 * allow-all ruleset caused.
 */

describe("participants — real app payloads", () => {
  it("accepts createParticipant()'s payload", async () => {
    await seedEvent();
    const client = await db();
    // src/services/participants.ts createParticipant
    await assertSucceeds(
      setDoc(doc(client, "events", EVENT_ID, "participants", "new-person"), {
        ...participantDoc,
        assignedQuestions: [],
        isDone: false,
        isActive: false,
        evaluationStarted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("accepts partial updates against a LEGACY participant lacking evaluationStarted/createdAt", async () => {
    await seedEvent();
    await seed(async (d) => {
      await setDoc(
        doc(d, "events", EVENT_ID, "participants", "legacy-person"),
        legacyParticipantDoc
      );
    });
    const client = await db();
    const ref = doc(client, "events", EVENT_ID, "participants", "legacy-person");
    // ParticipantStatusTable.tsx: {isActive, isDone}
    await assertSucceeds(updateDoc(ref, { isActive: true, isDone: false }));
    // updateParticipantQuestions.ts
    await assertSucceeds(
      updateDoc(ref, { assignedQuestions: [10, 20], activeQuestion: 10 })
    );
    // participants.ts updateActiveQuestion
    await assertSucceeds(
      updateDoc(ref, { activeQuestion: 20, updatedAt: serverTimestamp() })
    );
    // evaluationScores.ts writeEvaluationDocument's participant stamp
    await assertSucceeds(updateDoc(ref, { evaluationStarted: true }));
    // participants.ts resetAllParticipantStatuses
    await assertSucceeds(updateDoc(ref, { isDone: false }));
  });

  it("rejects a wrong-typed field and an injected field", async () => {
    await seedEvent();
    const client = await db();
    const ref = doc(client, "events", EVENT_ID, "participants", "typed");
    await assertFails(setDoc(ref, { ...participantDoc, age: "fifteen" }));
    await assertFails(
      setDoc(ref, { ...participantDoc, assignedQuestions: 27 })
    );
    await assertFails(setDoc(ref, { ...participantDoc, isDone: "no" }));
    await assertFails(setDoc(ref, { ...participantDoc, injected: true }));
  });

  it("rejects a participant missing a required field", async () => {
    await seedEvent();
    const client = await db();
    const { category: _c, ...noCategory } = participantDoc;
    void _c;
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "participants", "x"), noCategory)
    );
  });

  it("allows the cascade delete", async () => {
    await seedEvent();
    const client = await db();
    await assertSucceeds(
      deleteDoc(doc(client, "events", EVENT_ID, "participants", PARTICIPANT_ID))
    );
  });
});

describe("jury — real app payloads", () => {
  it("accepts addJury()'s addDoc-without-id followed by the id write-back", async () => {
    await seedEvent();
    const client = await db();
    // src/services/jury.ts addJury: addDoc with no `id` field...
    const ref = await addDoc(
      collection(client, "events", EVENT_ID, "jury"),
      juryDoc
    );
    // ...then updateDoc({ id: docRef.id })
    await assertSucceeds(updateDoc(ref, { id: ref.id }));
  });

  it("rejects an id that does not match the document id", async () => {
    await seedEvent();
    const client = await db();
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "jury", "jury-a"), {
        ...juryDoc,
        id: "jury-b",
      })
    );
  });

  it("accepts the activate / finish updates", async () => {
    await seedEvent();
    const client = await db();
    const ref = doc(client, "events", EVENT_ID, "jury", JURY_ID);
    await assertSucceeds(updateDoc(ref, { isActive: true }));
    await assertSucceeds(updateDoc(ref, { hasFinishedEvaluating: true }));
    await assertSucceeds(updateDoc(ref, { currentQuestion: 3 }));
  });

  it("rejects an injected field", async () => {
    await seedEvent();
    const client = await db();
    await assertFails(
      updateDoc(doc(client, "events", EVENT_ID, "jury", JURY_ID), {
        isAdmin: true,
      })
    );
  });
});

describe("evaluationScores / juryEvaluationInputs — provenance is enforced at the rules layer", () => {
  it("accepts the exact EvaluationScoreV2 the app writes", async () => {
    await seedEvent();
    const client = await db();
    await assertSucceeds(
      setDoc(
        doc(client, "events", EVENT_ID, "evaluationScores", "score-1"),
        { ...scoreDoc, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      )
    );
  });

  it("accepts the exact JuryEvaluationInputsV2 the app writes", async () => {
    await seedEvent();
    const client = await db();
    await assertSucceeds(
      setDoc(
        doc(client, "events", EVENT_ID, "juryEvaluationInputs", "inputs-1"),
        { ...juryInputsDoc, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      )
    );
  });

  it("rejects a score stamped with a stale scoringFingerprint (the open-tab-across-republish case)", async () => {
    await seedEvent();
    const client = await db();
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "evaluationScores", "stale"), {
        ...scoreDoc,
        scoringFingerprint: "d".repeat(64),
      })
    );
  });

  it("rejects a score stamped with a stale configVersion or a foreign algorithmVersion", async () => {
    await seedEvent();
    const client = await db();
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "evaluationScores", "v"), {
        ...scoreDoc,
        configVersion: "some-old-version",
      })
    );
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "evaluationScores", "a"), {
        ...scoreDoc,
        algorithmVersion: "legacy-lisbon-display-v1",
      })
    );
  });

  it("rejects a client-forged migrated-source document", async () => {
    await seedEvent();
    const client = await db();
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "evaluationScores", "forged"), {
        ...scoreDoc,
        source: { kind: "migratedLegacy", from: "lisbon-2025" },
      })
    );
  });

  it("rejects non-positive question and page numbers, and an injected field", async () => {
    await seedEvent();
    const client = await db();
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "evaluationScores", "q0"), {
        ...scoreDoc,
        questionNumber: 0,
      })
    );
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "evaluationScores", "p0"), {
        ...scoreDoc,
        pageNumber: 0,
      })
    );
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "evaluationScores", "inj"), {
        ...scoreDoc,
        finalScore: 100,
      })
    );
  });

  it("rejects any score write to an event with no descriptor at all", async () => {
    await seed(async (d) => {
      await setDoc(doc(d, "events", "no-descriptor"), {
        name: "Unconfigured",
        status: "active",
      });
    });
    const client = await db();
    await assertFails(
      setDoc(
        doc(client, "events", "no-descriptor", "evaluationScores", "s"),
        scoreDoc
      )
    );
  });

  it("allows clearEvaluationScores()'s deletes", async () => {
    await seedEvent();
    await seed(async (d) => {
      await setDoc(
        doc(d, "events", EVENT_ID, "evaluationScores", "score-1"),
        scoreDoc
      );
    });
    const client = await db();
    await assertSucceeds(
      deleteDoc(doc(client, "events", EVENT_ID, "evaluationScores", "score-1"))
    );
  });
});
