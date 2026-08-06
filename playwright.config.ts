import { defineConfig, devices } from "@playwright/test";

const testEnv = {
  VITE_FIREBASE_API_KEY: "test-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-fip-hifz.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-fip-hifz",
  VITE_FIREBASE_STORAGE_BUCKET: "demo-fip-hifz.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  VITE_FIREBASE_APP_ID: "1:000000000000:web:phase0",
  VITE_FIREBASE_MEASUREMENT_ID: "G-PHASE00000",
  VITE_USE_FIRESTORE_EMULATOR: "true",
  VITE_FIRESTORE_EMULATOR_HOST: "127.0.0.1",
  VITE_FIRESTORE_EMULATOR_PORT: "8080",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: process.env.CI ? 1 : 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html"], ["github"]] : "html",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    env: testEnv,
  },
});
