const MAX_FIRESTORE_DOCUMENT_ID_BYTES = 1_500;
const DOWNSTREAM_DOCUMENT_ID_SUFFIX_BUDGET_BYTES = 200;
const MAX_PARTICIPANT_ID_BYTES =
  MAX_FIRESTORE_DOCUMENT_ID_BYTES - DOWNSTREAM_DOCUMENT_ID_SUFFIX_BUDGET_BYTES;

export function generateParticipantId(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

export function participantIdValidationError(documentId: string): string | null {
  if (!documentId || documentId === "." || documentId === "..") {
    return "Participant name does not produce a valid document ID";
  }
  if (documentId.includes("/") || /^__.*__$/.test(documentId)) {
    return "Participant name produces a reserved Firestore document ID";
  }
  if (new TextEncoder().encode(documentId).length > MAX_PARTICIPANT_ID_BYTES) {
    return `Participant document ID exceeds the ${MAX_PARTICIPANT_ID_BYTES}-byte limit reserved for downstream document ID suffixes`;
  }
  return null;
}

export function assertValidParticipantId(documentId: string): void {
  const error = participantIdValidationError(documentId);
  if (error) throw new Error(error);
}
