import { firestore } from "@/main";
import { AppConfigPreviousQuestions } from "@/models/models";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";

const PREVIOUS_QUESTIONS_DOC = "previous_questions";

/**
 * Gets the previous questions from the app_config collection.
 *
 * Rejects on a read failure rather than returning `[]`. An empty list is a
 * meaningful answer — "nothing has been issued yet" — so swallowing the error
 * into one told the randomizer every page was free to re-issue, and a
 * participant could be handed a page a previous participant had already
 * recited. The caller must decide whether to proceed without the exclusion
 * list; this function will not decide it silently.
 *
 * @param eventId The event ID to get previous questions for
 * @returns A promise that resolves to the array of previous question page numbers
 * @throws when the app_config document cannot be read
 */
export const getPreviousQuestions = async (eventId: string): Promise<number[]> => {
  try {
    const docRef = doc(
      firestore,
      "events",
      eventId,
      "app_config",
      PREVIOUS_QUESTIONS_DOC
    );
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as AppConfigPreviousQuestions;
      return data?.previous_questions || [];
    } else {
      // Document doesn't exist, return empty array
      return [];
    }
  } catch (error) {
    console.error("Error getting previous questions:", error);
    throw new Error("Failed to load the previously issued questions.");
  }
};

/**
 * Adds new question page numbers to the previous_questions array
 * @param eventId The event ID to add previous questions for
 * @param questionPages Array of page numbers to add
 */
export const addToPreviousQuestions = async (
  eventId: string,
  questionPages: number[]
): Promise<void> => {
  try {
    const docRef = doc(
      firestore,
      "events",
      eventId,
      "app_config",
      PREVIOUS_QUESTIONS_DOC
    );
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      // Document exists, update it by adding new questions
      await updateDoc(docRef, {
        previous_questions: arrayUnion(...questionPages),
        updatedAt: serverTimestamp(),
      });
    } else {
      // Document doesn't exist, create it
      await setDoc(docRef, {
        previous_questions: questionPages,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    console.log(
      `Successfully added ${questionPages.length} questions to previous_questions`
    );
  } catch (error) {
    console.error("Error adding questions to previous_questions:", error);
    throw new Error("Failed to save previous questions.");
  }
};

/**
 * Replaces the entire previous_questions array with new values
 * @param eventId The event ID to set previous questions for
 * @param questionPages Array of page numbers to set
 */
export const setPreviousQuestions = async (
  eventId: string,
  questionPages: number[]
): Promise<void> => {
  try {
    const docRef = doc(
      firestore,
      "events",
      eventId,
      "app_config",
      PREVIOUS_QUESTIONS_DOC
    );
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      // Document exists, update it
      await updateDoc(docRef, {
        previous_questions: questionPages,
        updatedAt: serverTimestamp(),
      });
    } else {
      // Document doesn't exist, create it
      await setDoc(docRef, {
        previous_questions: questionPages,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    console.log(
      `Successfully set previous_questions with ${questionPages.length} questions`
    );
  } catch (error) {
    console.error("Error setting previous_questions:", error);
    throw new Error("Failed to set previous questions.");
  }
};

/**
 * Clears all previous questions from the app_config
 * @param eventId The event ID to clear previous questions for
 */
export const clearPreviousQuestions = async (eventId: string): Promise<void> => {
  try {
    const docRef = doc(
      firestore,
      "events",
      eventId,
      "app_config",
      PREVIOUS_QUESTIONS_DOC
    );

    await updateDoc(docRef, {
      previous_questions: [],
      updatedAt: serverTimestamp(),
    });

    console.log("Successfully cleared all previous questions");
  } catch (error) {
    console.error("Error clearing previous questions:", error);
    throw new Error("Failed to clear previous questions.");
  }
};
