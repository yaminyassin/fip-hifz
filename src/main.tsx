import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./i18n"; // Import i18n configuration
import { AuthProvider, useAuth } from "./hooks/useAuth";

const firebaseConfig = {
  apiKey: "AIzaSyBXU4Jv-lSCp4IfeBPINGVmYJd3fs9ya5U",
  authDomain: "fip-hifz.firebaseapp.com",
  projectId: "fip-hifz",
  storageBucket: "fip-hifz.firebasestorage.app",
  messagingSenderId: "38455279748",
  appId: "1:38455279748:web:2b3595c3409052f17882d1",
  measurementId: "G-84RZXSQMN8",
};

// firebase setup
const app = initializeApp(firebaseConfig);
getAnalytics(app);
export const firestore = getFirestore(app);

// TanStackRouter setup
const router = createRouter({
  routeTree,
  context: {
    auth: undefined!, // This will be overridden below
  },
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
  // This hook will grab the auth context from the provider
  const auth = useAuth();
  // Provide the auth context to the router
  return <RouterProvider router={router} context={{ auth }} />;
}

root.render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
