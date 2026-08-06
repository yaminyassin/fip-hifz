#!/usr/bin/env npx tsx
/** Read-only dump of a live event's descriptor, config and participants. */
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, getDocs } from "firebase/firestore";
process.loadEnvFile(new URL("../.env", import.meta.url));

const eventId = process.argv[2] ?? "ahlul-quran-international-competition---mozambique";

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);

const events = await getDocs(collection(db, "events"));
console.log("EVENTS:", events.docs.map((d) => d.id));

const event = await getDoc(doc(db, "events", eventId));
console.log("\nEVENT DOC:", JSON.stringify(event.data(), null, 2));

const cfg = await getDoc(doc(db, "events", eventId, "app_config", "evaluation"));
console.log("\nCONFIG EXISTS:", cfg.exists());
if (cfg.exists()) console.log(JSON.stringify(cfg.data(), null, 2));

const participants = await getDocs(collection(db, "events", eventId, "participants"));
console.log(`\nPARTICIPANTS (${participants.size}):`);
for (const p of participants.docs) {
  const d = p.data();
  console.log(` - ${p.id} | ${d.name} | cat=${d.category} | sched=${d.scheduled} | q=${JSON.stringify(d.assignedQuestions)}`);
}

const jury = await getDocs(collection(db, "events", eventId, "jury"));
console.log(`\nJURY (${jury.size}):`, jury.docs.map((d) => `${d.id}:${d.data().name}`));

for (const c of ["evaluationScores", "juryEvaluationInputs"]) {
  const snap = await getDocs(collection(db, "events", eventId, c));
  console.log(`${c}: ${snap.size} docs`);
}

process.exit(0);
