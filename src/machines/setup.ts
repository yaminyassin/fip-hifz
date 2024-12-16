import { setup, assign } from "xstate";
import { actors } from "./actors";
import { MachineContext, MachineEvents } from "./types";

export const machine = setup({
  types: {
    context: {} as MachineContext,
    events: {} as MachineEvents,
  },
  actions: {
    log: ({ event }) => {
      if (event.type === "LOG") console.log(event.message);
    },
  },
  actors,
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QGMD2BbADmALgS31QDsBiMAJ3NXIDpMAbAQxwDNr0a0tcC9iE8RAG6pkzPkQDaABgC6M2YlCZUsXsSUgAHogAsAJgA0IAJ6IAjAGZpNAOy6AnA4CsADmcA2abdfT9AX39jLmx8QiIaelRGCEEoAAVGcnxkPExGIhxYEgAZAHkAcQVNFTVwzR0EfScaaV0PV3t9fWdrauMzKukHGicnL11XA2dhwKCQIlQIOE0QnnKkEFL1IgrEAFoPDo2PQOCMUJXI6NiiBKSUtIysktUVtYQDbYRzV1cafUcHQfrLB1sWrY9iA5mEJDRYABXZDIODwRbLBagSoGHqeT4uWyWYYORrPfTdD5fLGuSweDz2cwBcago4UKjkW5lCQPao9OoNJotNoOZ5U95fBzk5pkyyuamBIA */
  id: "competition",
  context: {
    participants: [],
    selectedQuestions: [],
    scores: [],
    currentQuestionIndex: 0,
  },
  initial: "loadingParticipants",
  invoke: {
    id: "getParticipants",
    src: "getParticipants",
    onSnapshot: {
      actions: assign({
        participants: ({ context, event }) => {
          console.log("ON SNAPSHOT", event.snapshot.context);
          if (event.snapshot.context !== undefined) {
            return event.snapshot.context;
          }
          return context.participants;
        },
      }),
    },
  },
  states: {
    loadingParticipants: {
      description: "Loads participants from Database",
      on: {
        LOG: {
          target: "success",
        },
      },
    },
    success: {
      type: "final",
    },
    error: {
      type: "final",
    },
  },
});

///Other states:
// participantSelection: {
//   entry: "log",
//   on: {
//     SELECT_PARTICIPANT: {
//       target: "loadingScores",
//       actions: "selectParticipant",
//     },
//   },
// },
// loadingScores: {
//   entry: "pickQuestions",
//   on: {
//     NEXT_QUESTION: {
//       target: "scoring",
//     },
//   },
// },
// scoring: {
//   on: {
//     SUBMIT_SCORE: {
//       actions: "addScore",
//       target: "checkCompletion",
//     },
//   },
// },
// checkCompletion: {
//   always: [
//     {
//       guard: ({ context }) =>
//         context.currentQuestionIndex >=
//         context.selectedQuestions.length - 1,
//       target: "completed",
//     },
//     {
//       actions: "nextQuestion",
//       target: "scoring",
//     },
//   ],
// },
// completed: {
//   on: {
//     COMPLETE_PARTICIPANT: "participantSelection",
//   },
// },

///Actions
// pickQuestions: ({ context }) => {
//   const questions = Array.from({ length: 3 }, (_, i) => i + 1);
//   context.selectedQuestions = questions;
//   context.currentQuestionIndex = 0;
// },
// selectParticipant: ({ context, event }) => {
//   if (event.type === "SELECT_PARTICIPANT") {
//     context.activeParticipant = event.participant;
//   }
// },
// addScore: ({ context, event }) => {
//   if (event.type === "SUBMIT_SCORE") {
//     context.scores.push(event.score);
//   }
// },
// nextQuestion: ({ context }) => {
//   context.currentQuestionIndex++;
// },
