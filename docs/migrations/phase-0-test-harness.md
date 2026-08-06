# Phase 0 — Test Harness Design

Phase 0 will use Playwright E2E only: the highest-risk behavior crosses routing, browser storage, real DOM interactions, downloads, debounce timing, and Firestore `onSnapshot` propagation, so browser-level tests provide the most useful ground truth. All tests will use the Firestore emulator through an explicit `VITE_USE_FIRESTORE_EMULATOR` bootstrap seam, an idempotent `lisbon-2025` seed script, and dedicated permissive emulator-only rules; production Firebase credentials and data must never be used.

## 1. Harness choice

Use `@playwright/test` without Vitest or Testing Library in Phase 0.

These routes are primarily integration surfaces:

- Firestore listeners update the React Query cache asynchronously.
- Jury scoring performs debounced writes.
- Participant management uses client-side filtering and Radix controls.
- Login and event selection involve `sessionStorage` and hard navigation.
- Participant export produces a browser download.
- Randomization combines timed animation, Firestore history, and writes.
- Lazy route generation is owned by the Vite TanStack Router plugin.

Playwright exercises those behaviors in the real browser and avoids constructing a parallel jsdom model of Firestore listeners, Radix behavior, downloads, and routing.

Vitest plus Testing Library would add value later for isolated hook state, debounce timing, score calculations, and pure category/page-selection functions in `quranUtils.ts`. It would also add immediate Phase 0 costs: jsdom-specific mocks for Firestore subscriptions, another alias configuration for `@`, test-environment setup for browser APIs, and a dependency on generating `routeTree.gen.ts` before tests importing router code can run. Add Vitest only when a concrete unit-level target justifies it; do not install it speculatively.

Initial development dependencies:

```sh
npm install --save-dev @playwright/test firebase-tools
npx playwright install chromium
```

Playwright configuration should use one worker initially because tests share one emulator database and several flows mutate global event state:

```ts
fullyParallel: false,
workers: process.env.CI ? 1 : undefined,
use: {
  baseURL: "http://127.0.0.1:4173",
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
  video: "retain-on-failure",
},
webServer: {
  command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
  url: "http://127.0.0.1:4173",
  reuseExistingServer: !process.env.CI,
},
```

## 2. Firebase emulator strategy

### Emulator configuration

Add this exact block to `firebase.json`:

```json
{
  "emulators": {
    "firestore": {
      "host": "127.0.0.1",
      "port": 8080
    },
    "ui": {
      "enabled": true,
      "host": "127.0.0.1",
      "port": 4000
    },
    "singleProjectMode": true
  }
}
```

The committed `firestore.rules` expired on 2024-12-24 and now denies all production reads and writes. The emulator also loads configured rules, so using the current file would make the application and seed client fail.

Do not replace the production rules with permissive test rules. The correct production authorization model cannot be inferred safely during harness work, and deploying an allow-all rule would be worse than the current denial. Treat the expired production rules as a separate release-blocking defect.

Create `firestore.test.rules`:

```text
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

Create a complete emulator-specific `firebase.test.json` so this permissive file is never selected by a normal Firebase deployment:

```json
{
  "firestore": {
    "rules": "firestore.test.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "firestore": {
      "host": "127.0.0.1",
      "port": 8080
    },
    "ui": {
      "enabled": true,
      "host": "127.0.0.1",
      "port": 4000
    },
    "singleProjectMode": true
  }
}
```

All test commands must use:

```sh
--config firebase.test.json --project demo-fip-hifz
```

Using a `demo-*` project ID prevents accidental fallback to the real Firebase project.

### Application connection seam

Add `connectFirestoreEmulator` to the Firebase imports. Connect immediately after `getFirestore(app)` and before exporting the instance, constructing providers, or permitting any feature import to perform a read:

```ts
import {
  connectFirestoreEmulator,
  getFirestore,
} from "firebase/firestore";

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

if (import.meta.env.VITE_USE_FIRESTORE_EMULATOR === "true") {
  const host =
    import.meta.env.VITE_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1";
  const port = Number(
    import.meta.env.VITE_FIRESTORE_EMULATOR_PORT ?? "8080",
  );

  connectFirestoreEmulator(firestore, host, port);
}

export { firestore };
```

Declare the three environment variables in the project’s Vite environment types:

```ts
readonly VITE_USE_FIRESTORE_EMULATOR?: string;
readonly VITE_FIRESTORE_EMULATOR_HOST?: string;
readonly VITE_FIRESTORE_EMULATOR_PORT?: string;
```

The branch must be controlled only by the explicit flag. Do not connect merely because `import.meta.env.DEV` is true: ordinary local development may intentionally use the configured remote project.

### Seed script

Create one idempotent Node ESM script at `scripts/seed-firestore-emulator.mjs`. It should:

1. Refuse to run unless `FIRESTORE_EMULATOR_HOST` is set.
2. Refuse any project ID that does not begin with `demo-`.
3. Clear the emulator database through its emulator REST endpoint.
4. Connect the existing Firebase client SDK to `127.0.0.1:8080`.
5. Write the complete fixture using fixed IDs and fixed timestamps.
6. Exit non-zero if any write fails.

Use `eventId = "lisbon-2025"` because the application falls back to it in EventContext and several jury/question hooks.

The fixture must contain:

- `events/lisbon-2025`
  - Stable event name, description, `status: "active"`, and timestamp.
- `events/lisbon-2025/app_config/auth_settings`
  - Known `eventPassword`, for example `phase-0-password`.
- `events/lisbon-2025/app_config/previous_questions`
  - `previous_questions: []` plus fixed timestamps.
- `events/lisbon-2025/participants/participant-active`
  - Complete participant shape.
  - `isActive: true`, `isDone: false`.
  - `assignedQuestions: [42, 87]`.
  - `activeQuestion: 42`.
- `events/lisbon-2025/participants/participant-inactive`
  - Complete participant shape with a different name/category.
  - `isActive: false`.
- `events/lisbon-2025/participants/participant-done`
  - Complete participant shape with `isDone: true`.
- `events/lisbon-2025/jury/jury-one`
  - `id: "jury-one"`, `isActive: false`, `currentQuestion: 1`, and `hasFinishedEvaluating: false`.
- `events/lisbon-2025/jury/jury-two`
  - `id: "jury-two"` and a contrasting active/evaluation state.
- `events/lisbon-2025/scores/participant-active_jury-one_1`
  - `participantId: "participant-active"`.
  - `juryId: "jury-one"`.
  - `questionNumber: 1`.
  - `pageNumber: 42`.
  - All eight numeric score fields:
    `hifdh_judge_correction`, `hifdh_self_correction`,
    `hifdh_stuck_count`, `tajweed_major`, `tajweed_minor`,
    `waqf_ibtida_incorrect`, `waqf_ibtida_meaning`,
    and `husn_al_ada_score`.
  - No `overall_bonus` inside the score map.
- `events/lisbon-2025/overallBonuses/participant-active_jury-one`
  - Matching participant/jury IDs and an `overallBonus` from 0 through 5.
- `quran/42`, `quran/87`, and every other referenced page
  - A minimal valid `page` payload matching the existing Quran viewer contract.

Two fixture invariants are mandatory:

- `scores.pageNumber` must equal
  `participant.assignedQuestions[questionNumber - 1]`; otherwise
  `useParticipants` silently discards the score.
- Every jury document ID must equal its `id` field:
  `doc.id === data.id`.

The seed should be reusable from Playwright global setup and from local debugging. Mutating tests must either restore their affected documents or reseed before the next test; do not rely on test order.

Recommended scripts:

```json
{
  "scripts": {
    "seed:emulator": "node scripts/seed-firestore-emulator.mjs",
    "test:e2e": "playwright test",
    "test:e2e:ci": "npm run seed:emulator && playwright test",
    "test:e2e:emulator": "firebase emulators:exec --only firestore --project demo-fip-hifz --config firebase.test.json \"npm run test:e2e:ci\""
  }
}
```

### Deterministic custom authentication

Playwright storage-state files do not preserve `sessionStorage`. Use an initialization script before navigation:

```ts
await page.addInitScript(
  ({ eventId, juryId }) => {
    sessionStorage.setItem(
      "authenticatedEvents",
      JSON.stringify([eventId]),
    );

    if (juryId) {
      sessionStorage.setItem("authenticatedJuryId", juryId);
    } else {
      sessionStorage.removeItem("authenticatedJuryId");
    }
  },
  {
    eventId: "lisbon-2025",
    juryId: null,
  },
);
```

Use storage seeding for tests whose subject is not authentication. This includes protected-route rendering, participant filtering, big-screen updates, randomizer behavior, and admin tabs.

Drive the real UI instead when authentication is itself under test:

- Event login: leave both keys absent, submit the seeded event password, and verify navigation plus access to the protected route.
- Jury login: seed only `authenticatedEvents`, leave `authenticatedJuryId` absent, submit `jury-one`, and verify the score form replaces the jury login.
- Logout: begin with seeded storage and verify that the relevant key is removed and the expected navigation occurs.

Always include `?event=lisbon-2025` when testing a protected route. Omitting it exercises the known gate bypass and must not be mistaken for a successful authentication test.

## 3. Per-route smoke test list

- `/` — With `authenticatedEvents` pre-seeded, selecting a routed menu tile navigates to its destination while preserving `event=lisbon-2025`. **Empty emulator sufficient.**
- `/login?event=lisbon-2025` — Submitting the seeded correct password reaches the event home screen, while an incorrect password remains on login with an error. **Seed required: `auth_settings`.**
- `/admin?event=lisbon-2025` — Selecting each admin tab replaces the visible panel with the corresponding control, participant, jury, performance, or event content. **Empty emulator sufficient.**
- `/big-screen?event=lisbon-2025` — After an emulator batch changes the sole active participant, the displayed participant changes without a browser reload. **Seed required: participants and referenced Quran pages.**
- `/jury?event=lisbon-2025` — Submitting a known jury ID replaces the jury-login screen with the active participant’s score form. **Seed required: jury and active participant.**
- `/participants?event=lisbon-2025` — Entering a participant name in search reduces the visible rows to the matching seeded participant. **Seed required: contrasting participants.**
- `/quran-page?event=lisbon-2025` — With no active participant, the route settles on its explicit no-participant state rather than remaining in loading state. **Empty emulator sufficient.**
- `/randomizer?event=lisbon-2025` — Starting generation disables the control during rolling and settles every configured question tile on a non-zero page number. **Seed required: active participant, category-compatible question count, and `previous_questions`.**
- `/randomizer-audience?event=lisbon-2025` — The displayed question numbers equal the active participant’s assigned questions and update after an emulator write. **Seed required: active participant and assigned questions.**

## 4. CI wiring

Create `.github/workflows/phase-0-test-harness.yml` and run it on every pull request and every push to `main`.

PR execution prevents unverified changes from merging. Running again on `main` catches merge-result differences and direct pushes. Configure this workflow’s `quality` job as a required branch-protection check.

Use the committed `firebase-tools` and Playwright versions through `npm ci`; do not install floating global versions in CI. Firebase’s Firestore emulator requires Java, so pin Temurin 21.

```yaml
name: Phase 0 test harness

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read
  checks: write
  pull-requests: write

env:
  CI: "true"
  VITE_FIREBASE_API_KEY: test-api-key
  VITE_FIREBASE_AUTH_DOMAIN: demo-fip-hifz.firebaseapp.com
  VITE_FIREBASE_PROJECT_ID: demo-fip-hifz
  VITE_FIREBASE_STORAGE_BUCKET: demo-fip-hifz.appspot.com
  VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000"
  VITE_FIREBASE_APP_ID: "1:000000000000:web:phase0"
  VITE_FIREBASE_MEASUREMENT_ID: G-PHASE00000
  VITE_USE_FIRESTORE_EMULATOR: "true"
  VITE_FIRESTORE_EMULATOR_HOST: 127.0.0.1
  VITE_FIRESTORE_EMULATOR_PORT: "8080"
  FIRESTORE_EMULATOR_HOST: 127.0.0.1:8080
  PLAYWRIGHT_BROWSERS_PATH: ~/.cache/ms-playwright

jobs:
  quality:
    name: quality
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"

      - run: npm ci

      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

      - name: Install Chromium and system dependencies
        run: npx playwright install --with-deps chromium

      - run: npm run lint
      - run: npm run tsc
      - run: npm run build

      - name: Run emulator-backed browser tests
        run: >
          npx firebase emulators:exec
          --only firestore
          --project demo-fip-hifz
          --config firebase.test.json
          "npm run test:e2e:ci"

      - name: Upload Playwright evidence
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-failure-${{ github.run_id }}
          path: |
            playwright-report/
            test-results/
          if-no-files-found: ignore
          retention-days: 14

  deploy-preview:
    if: github.event_name == 'pull_request'
    needs: quality
    uses: ./.github/workflows/firebase-hosting-pull-request.yml
    secrets: inherit

  deploy-main:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: quality
    uses: ./.github/workflows/firebase-hosting-merge.yml
    secrets: inherit
```

Convert both existing Firebase Hosting workflows from independently triggered workflows into reusable workflows by declaring `on: workflow_call`. Their existing deployment steps and secrets remain inside them. The new workflow becomes the single PR/main entry point, and `needs: quality` prevents preview and production deployment when lint, typecheck, build, emulator startup, seeding, or Playwright fails.

Do not leave deployment workflows independent: a parallel deploy can publish a build before its ground-truth checks finish. Apply the dependency after the three-route trial is stable on its branch, then make `quality` required before merging.

The dummy `VITE_FIREBASE_*` values are intentional. `initializeApp` still needs a complete, non-empty configuration, but the Firestore emulator does not validate the API key or contact the named production project. No Firebase service-account secret is required by the test job.

`firebase emulators:exec` is preferred over backgrounding the emulator because it starts Firestore before seeding, forwards the test exit code, and shuts the emulator down even after failure. Playwright’s `webServer` owns the Vite process inside that command.

## 5. Trial selection

Run exactly these three routes before implementing the remaining six:

1. `/participants?event=lisbon-2025`
   - Stresses the event gate with deterministic `sessionStorage` injection, multiple Firestore listeners, seeded table data, and a real browser filtering interaction.
   - Proves the fixture can support richer admin and jury screens without remote Firebase access.

2. `/big-screen?event=lisbon-2025`
   - Stresses live `onSnapshot` propagation by changing the active participant in an emulator batch and observing the screen update without navigation or refetch.
   - Proves the core mechanism needed by jury, Quran page, randomizer, randomizer audience, and the floating admin panel.

3. `/`
   - Stresses the minimal public boot path, provider/router initialization, session restoration, and client-side navigation while requiring no Firestore fixture data.
   - Separates application-boot and routing failures from emulator or seed failures.

Together these cover the three harness foundations: deterministic browser session setup, seeded Firestore-backed interaction, and asynchronous listener propagation. If all three pass repeatedly in CI, the remaining routes are extensions of already-proven mechanics rather than new infrastructure experiments.
