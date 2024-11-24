import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBXU4Jv-lSCp4IfeBPINGVmYJd3fs9ya5U",
  authDomain: "fip-hifz.firebaseapp.com",
  projectId: "fip-hifz",
  storageBucket: "fip-hifz.firebasestorage.app",
  messagingSenderId: "38455279748",
  appId: "1:38455279748:web:2b3595c3409052f17882d1",
  measurementId: "G-84RZXSQMN8",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
getAnalytics(app);
export const firestore = getFirestore(app);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
