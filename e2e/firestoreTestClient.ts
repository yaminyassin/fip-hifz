import { initializeApp, getApps, getApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-fip-hifz";
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

/**
 * A Firestore client connected to the emulator, for use directly from
 * Playwright test bodies (Node context) to mutate fixture data mid-test —
 * e.g. simulating a jury/admin action that the app under test should react
 * to via its onSnapshot listeners.
 */
export function getEmulatorFirestore() {
  const app = getApps().length
    ? getApp()
    : initializeApp({ apiKey: "test-api-key", projectId: PROJECT_ID });
  const firestore = getFirestore(app);

  const [host, portRaw] = EMULATOR_HOST.split(":");
  const port = Number(portRaw ?? "8080");

  // connectFirestoreEmulator throws if called more than once on the same
  // instance; guard with a module-level flag.
  if (!connectedInstances.has(firestore)) {
    connectFirestoreEmulator(firestore, host, port);
    connectedInstances.add(firestore);
  }

  return firestore;
}

const connectedInstances = new WeakSet<object>();
