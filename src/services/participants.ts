import { firestore } from "@/main";
import { Participant } from "@/models/models";
import { getEventCollectionPath } from "@/utils/firebaseUtils";
import {
  assertValidParticipantId,
  generateParticipantId,
} from "@/lib/participantId";
import {
  EVALUATION_SCORES_COLLECTION,
  JURY_EVALUATION_INPUTS_COLLECTION,
} from "@/services/evaluationScores";
import {
  collection,
  doc,
  serverTimestamp,
  updateDoc,
  query,
  getDocs,
  runTransaction,
  where,
  writeBatch,
} from "firebase/firestore";

type ParticipantInput = Omit<
  Participant,
  "id" | "assignedQuestions" | "evaluationStarted"
> & {
  assignedQuestions?: number[];
};

const MAX_PARTICIPANT_ID_SUFFIX = 100;
const FIRESTORE_BATCH_LIMIT = 500;

function participantDocumentRef(eventId: string, participantId: string) {
  return doc(
    collection(firestore, getEventCollectionPath(eventId, "participants")),
    participantId
  );
}

function participantEvaluationQuery(
  eventId: string,
  collectionName: string,
  participantId: string
) {
  const collectionRef = collection(
    firestore,
    getEventCollectionPath(eventId, collectionName)
  );
  return query(collectionRef, where("participantId", "==", participantId));
}

/**
 * Creates a new participant in Firestore
 * @param eventId The event identifier
 * @param participant The participant data to create
 * @returns A promise that resolves to the ID of the newly created participant
 */
export const createParticipant = async (
  eventId: string,
  participant: ParticipantInput
): Promise<string> => {
  const baseId = generateParticipantId(participant.name);
  assertValidParticipantId(baseId);

  const newParticipant = {
    ...participant,
    assignedQuestions: participant.assignedQuestions || [],
    isDone: participant.isDone || false,
    isActive: participant.isActive || false,
    evaluationStarted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Two distinct people can share a normalized name; allocate the first free
  // base/base_1/base_2 id. The transaction re-checks occupancy so a concurrent
  // create can't hand out the same id.
  return runTransaction(firestore, async (transaction) => {
    for (let suffix = 0; suffix <= MAX_PARTICIPANT_ID_SUFFIX; suffix++) {
      const candidateId = suffix === 0 ? baseId : `${baseId}_${suffix}`;
      const candidateRef = participantDocumentRef(eventId, candidateId);
      const existing = await transaction.get(candidateRef);
      if (!existing.exists()) {
        transaction.set(candidateRef, newParticipant);
        return candidateId;
      }
    }
    throw new Error(
      `Unable to allocate a unique participant id for base ${JSON.stringify(baseId)}`
    );
  });
};

/**
 * Updates an existing participant in Firestore
 * @param eventId The event identifier
 * @param id The ID of the participant to update
 * @param participant The updated participant data
 */
export const updateParticipant = async (
  eventId: string,
  id: string,
  participant: ParticipantInput
): Promise<void> => {
  const participantRef = participantDocumentRef(eventId, id);

  await runTransaction(firestore, async (transaction) => {
    const currentSnapshot = await transaction.get(participantRef);
    if (!currentSnapshot.exists()) throw new Error(`Participant ${JSON.stringify(id)} does not exist`);
    const current = currentSnapshot.data() as Participant;
    if (current.category !== participant.category) {
      const hasAssignments = current.assignedQuestions.length > 0;
      const hasProgress = current.activeQuestion !== 0 || current.isDone;
      if (hasAssignments || hasProgress || current.evaluationStarted === true) {
        throw new Error(
          "Category cannot be changed after questions have been assigned or evaluation has started"
        );
      }
    }
    transaction.update(participantRef, {
      ...participant,
      updatedAt: serverTimestamp(),
    });
  });
};

/**
 * Deletes a participant and cascades to its evaluation score / jury-input docs
 * so a later participant reusing the same deterministic id can't resurrect a
 * previous evaluation. Not atomic with concurrent evaluation writes: a score
 * written between the reads and the deletes can be orphaned (accepted for this
 * single-operator offline admin flow).
 */
export const deleteParticipant = async (
  eventId: string,
  id: string
): Promise<void> => {
  const participantRef = participantDocumentRef(eventId, id);
  const [evaluationScores, juryEvaluationInputs] = await Promise.all([
    getDocs(participantEvaluationQuery(eventId, EVALUATION_SCORES_COLLECTION, id)),
    getDocs(participantEvaluationQuery(eventId, JURY_EVALUATION_INPUTS_COLLECTION, id)),
  ]);

  // Dependents first, the participant doc LAST: if a later batch fails, the
  // participant still exists, so a re-run finds and clears the leftovers —
  // rather than deleting the participant and orphaning scores under an id that
  // can be reused.
  const refs = [
    ...evaluationScores.docs.map((snapshot) => snapshot.ref),
    ...juryEvaluationInputs.docs.map((snapshot) => snapshot.ref),
    participantRef,
  ];

  // Chunk to Firestore's per-batch write limit so a large evaluation history
  // can't push the delete past 500 ops and fail wholesale.
  for (let start = 0; start < refs.length; start += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(firestore);
    for (const ref of refs.slice(start, start + FIRESTORE_BATCH_LIMIT)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
};

/**
 * Resets the isDone status for all participants in Firestore.
 * @param eventId The event identifier
 */
export const resetAllParticipantStatuses = async (
  eventId: string
): Promise<void> => {
  const participantsRef = collection(
    firestore,
    getEventCollectionPath(eventId, "participants")
  );
  const q = query(participantsRef); // Query all participants
  const batch = writeBatch(firestore);

  try {
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((docSnapshot) => {
      // Update only the isDone field to false
      batch.update(docSnapshot.ref, { isDone: false });
    });

    await batch.commit();
    console.log("Successfully reset isDone status for all participants.");
  } catch (error) {
    console.error("Error resetting participant statuses:", error);
    throw new Error("Failed to reset participant statuses."); // Re-throw for mutation error handling
  }
};

/**
 * Updates the activeQuestion field for a specific participant.
 * @param eventId The event identifier
 * @param participantId The ID of the participant to update.
 * @param newActiveQuestionPage The new page number to set as active.
 */
export const updateActiveQuestion = async (
  eventId: string,
  participantId: string,
  newActiveQuestionPage: number
): Promise<void> => {
  if (!participantId) {
    console.error("updateActiveQuestion called with invalid participantId");
    throw new Error("Invalid participant ID provided.");
  }

  const participantsCollection = collection(
    firestore,
    getEventCollectionPath(eventId, "participants")
  );
  const participantRef = doc(participantsCollection, participantId);

  try {
    await updateDoc(participantRef, {
      activeQuestion: newActiveQuestionPage,
      updatedAt: serverTimestamp(), // Also update the timestamp
    });
    console.log(
      `Successfully updated activeQuestion for participant ${participantId} to ${newActiveQuestionPage}.`
    );
  } catch (error) {
    console.error(
      `Error updating activeQuestion for participant ${participantId}:`,
      error
    );
    throw new Error("Failed to update active question."); // Re-throw for mutation error handling
  }
};
