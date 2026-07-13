import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./i18n"; // Import i18n configuration
import { AuthProvider } from "./hooks/useAuth";
import { EventProvider } from "./contexts/EventContext";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// firebase setup
const app = initializeApp(firebaseConfig);
if (import.meta.env.PROD) {
  getAnalytics(app);
}
export const firestore = getFirestore(app);

if (import.meta.env.VITE_USE_FIRESTORE_EMULATOR === "true") {
  const host = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1";
  const port = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT ?? "8080");

  connectFirestoreEmulator(firestore, host, port);
}

// TanStackRouter setup
const router = createRouter({
  routeTree,
});

// Optimized QueryClient for real-time applications
const client = new QueryClient({
  defaultOptions: {
    queries: {
      // Disable automatic refetching since we're using real-time listeners
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      // Keep data in cache longer
      staleTime: Infinity, // Data never becomes stale
      gcTime: 1000 * 60 * 60 * 24, // 24 hours (previously cacheTime)
      // Retry configuration
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
      retryDelay: 1000,
    },
  },
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const container = document.getElementById("root")!;
const root = createRoot(container);

function App() {
  return <RouterProvider router={router} />;
}

root.render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <EventProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </EventProvider>
    </QueryClientProvider>
  </StrictMode>
);
