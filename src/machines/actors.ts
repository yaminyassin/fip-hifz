import { Observable } from "rxjs";
import { fromObservable } from "xstate";
import { Participant } from "../models/models";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { firestore } from "../main";

export const actors = {
  getParticipants: fromObservable(
    () =>
      new Observable<Participant[]>((subscriber) => {
        const participantsQuery = query(
          collection(firestore, "participants"),
          where("isDone", "==", false)
        );

        // Set up realtime listener
        const unsubscribe = onSnapshot(
          participantsQuery,
          (snapshot) => {
            const participants = snapshot.docs.map(
              (doc) =>
                ({
                  id: doc.id,
                  ...doc.data(),
                }) as Participant
            );

            subscriber.next(participants);
          },
          (error) => {
            subscriber.error(error);
          }
        );

        return unsubscribe;
      })
  ),
};
