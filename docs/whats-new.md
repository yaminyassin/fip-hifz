# What changed — feature/minor-fixes

An explainer for the 15 commits on `feature/minor-fixes` (`0af5031` → `b37fd83`).
Scope: correctness and reliability fixes for the greenfield per-event evaluation
model, a Firebase SDK upgrade, and the migration of Quran page images out of
Firestore. Nothing here is deployed yet — it all sits on the branch. Companion:
`docs/migrations/autonomous-run-log.md` (terse per-commit trail),
`docs/migrations/phase-1-greenfield.md` (the evaluation model),
`docs/migrations/phase-2-quran-assets.md` (the asset-storage decision).

Ground truth for every commit: `tsc -b` clean, `npm run lint` 0 errors,
`npm run test:unit` (now 180), `npm run test:e2e:emulator` (22/22). The
user-visible changes were also driven in Chrome against the Firestore emulator.

---

## 1. What changed, by theme

### Event identity and fail-closed gating
- **No more silent `demo-2026`.** The app used to default a missing event to the
  trial event `demo-2026` on any non-root page, and ~18 write handlers used
  `currentEvent || 'demo-2026'`. Now a missing event stays `null`: the app
  restores the operator's **last explicitly-selected event from `localStorage`**
  (`fip-hifz.currentEvent`), reflects it into the URL, and otherwise fails
  closed. Every write handler guards on a real event instead of defaulting.
  (`3f98818`)
- **Jury scoring is fully gated.** The `/jury` route used to call its scoring
  and navigation hooks *outside* `<EvaluationConfigGate>` — only `ScoreForm` was
  gated. They now live in a new `JuryScoringPanel` rendered strictly inside the
  gate, so scoring can never run against a loading, missing, or invalid config.
  (`b3cc542`)

### Scoring engine hardening
- `scoreJury` now rejects duplicate assigned question numbers (previously a
  duplicate could double-score one question), and `scoreParticipant` rejects a
  non-finite jury result instead of emitting `NaN`/`Infinity`. (`9636939`)

### Live-update reliability + Firebase 12
- **Listener callback leak fixed.** `useFirestoreListener` shares one Firestore
  `onSnapshot` per key across hook instances. It added one closure to the
  callback set on subscribe but deleted a *different* closure on cleanup, so
  stale callbacks accumulated and fired on every snapshot. Fixed with a stable
  per-instance subscriber. (`3060353`)
- **Optimistic updates now work.** `useUpdateActiveQuestion` /
  `useUpdateParticipantQuestion` wrote optimistic updates to the unscoped
  `["activeParticipant"]` cache key while `useActiveParticipant` reads
  `["activeParticipant", currentEvent]` — so the optimistic UI silently did
  nothing until the round-trip. All keys are now event-scoped. (`3060353`)
- **Firebase JS SDK 11 → 12.16.0.** Drop-in (Node 20 / ES2020 already met; the
  removed Vertex AI APIs are unused). Only `package.json`/lockfile changed. (`211ff19`)
- **Listener errors are now visible.** The three `useParticipants` listeners
  only logged to the console on failure. A Firestore `onSnapshot` error is
  terminal (the listener stops), so a live-event disconnect used to freeze the
  ranking silently. They now surface a red "Live updates disconnected — reload"
  banner on `/participants`. (`b37fd83`)

### Quran page images: out of Firestore, onto Hosting (the data-model change)
- **Migrated 619 page images** from the Firestore `quran` collection (base64
  blobs) to immutable static WebP assets at
  `public/quran/mushaf-v1/{page}.webp` (52 MB, q85), with a sha256
  `manifest.json`. Served by Firebase Hosting with a one-year immutable cache
  header. (`33671c4` = the evaluation doc, `93c4048` = the migration)
- **Fixed two real render bugs** in the process: the app fetched `quran/{n}`
  but the documents are keyed `NNN_small`, *and* the viewer prepended a
  `data:image/png;base64,` prefix onto an already-prefixed value. Quran
  rendering had been fully broken; it now works.
- The page image scales to fill its container (`object-contain`), instead of
  sitting small at its natural size. (`12b4b69`)

### UX / i18n / admin polish
- Big-screen shows a **config-driven Juz/page range** per category instead of a
  hardcoded "Juz 1 - 20". (`a65adba`)
- Filled 28 `[MISSING]`/`[FALTA]` placeholder translations, and translated 6
  remaining hardcoded English strings in the participant form (European
  Portuguese). (`59721e3`, `db926a2`)
- The Performance Monitor's destructive "Cleanup All" button (which disconnects
  every live listener with one click) is now **dev-only**, tree-shaken out of
  production builds. (`414f2f7`)

### Repo hygiene + CI
- Deleted dangerous/stale operator scripts (notably `delete_quran_collections.py`,
  which deletes the live `quran/` collection, and a migration script that ran
  live-by-default), removed a stale git worktree, fixed all lint errors, and
  added a **CI workflow** (Node 20 + Temurin 21) that runs tsc/lint/unit/e2e —
  previously only `build` ran. (`0af5031`)

---

## 2. Where the new features live

| Area | Files |
|---|---|
| Event identity + persistence | `src/contexts/EventContext.tsx` |
| Fail-closed gate | `src/components/EvaluationConfigGate.tsx` |
| Jury scoring panel (gated) | `src/components/ui/JuryScoringPanel.tsx` (new), `src/routes/jury.lazy.tsx` |
| Scoring engine | `src/evaluation/scoringEngine.ts` |
| Listener registry | `src/hooks/useFirestoreListener.ts` |
| Active participant + optimistic writes | `src/hooks/useActiveParticipant.ts`, `useUpdateActiveQuestion.ts`, `useUpdateParticipantQuestion.ts` |
| Listener-error surface | `src/hooks/useParticipants.ts` (`useParticipantsListenerError`), `src/routes/participants.lazy.tsx` |
| Quran static assets | `public/quran/mushaf-v1/*.webp` + `manifest.json`, `src/hooks/useQuranPage.ts`, `src/components/ui/QuranViewer.tsx`, `firebase.json` (headers) |
| Big-screen range | `src/routes/big-screen.lazy.tsx` |
| i18n | `src/locales/{en,pt}/translation.json`, `src/components/ui/ParticipantForm.tsx` |
| CI | `.github/workflows/ci.yml` |
| Tests added | `src/components/ui/QuranViewer.test.tsx`, `e2e/eventFallback.spec.ts`, plus cases in `scoringEngine.test.ts` / `useParticipants.test.ts` |

---

## 3. The Firestore document model

The app is **per-event and config-driven**; every event carries its own
evaluation config. This model is the greenfield rework (predates this branch);
what this branch changed is called out below.

```
events/{eventId}                              ← EventDocumentV2
  .evaluation = {                             ← EventEvaluationDescriptorV2 (the pointer)
      schemaVersion: 2, mode: "jury-first-v2",
      configVersion, configPath, contentHash, scoringFingerprint
  }

events/{eventId}/app_config/evaluation        ← EventEvaluationConfigV2 (the full config)
    schemaVersion, configVersion, algorithmVersion,
    contentHash, scoringFingerprint, provisionedAt,
    scoring:      { baseScorePerQuestion, questionBounds, finalBounds, rounding, ... }
    categories:   { CAT_A: { questionCount, questionSlots:[{ pageRange, sourceJuzRange? }], label, assetRef? }, ... }
    questionTypes:{ hifdh: { operation:"subtract", perSectionDeductionCap, inputs:[{ perInputWeight, min,max,step, role }] }, ... }
    overrideRules:      [ { when, action:"voidQuestion"|"fixedScore", ... } ]
    participantAdjustments: { overall_bonus: { operation:"add", additionCap, inputs:[...] } }

events/{eventId}/app_config/auth_settings     ← { eventPassword }   (plaintext; see Security note)

events/{eventId}/participants/{participantId} ← participant records
events/{eventId}/jury/{juryId}                ← jury members
events/{eventId}/evaluationScores/{id}        ← EvaluationScoreV2   (id = SHA-256 of the logical key)
events/{eventId}/juryEvaluationInputs/{id}    ← JuryEvaluationInputsV2  (per-jury participant adjustments)
```

Key points:
- **The config is loaded once per event** (one-shot `getDoc`, cached in
  `EventContext`) and verified fail-closed: `contentHash`, `scoringFingerprint`,
  `configVersion`, and `algorithmVersion` must all match the descriptor, or the
  event renders the fail-closed panel and cannot be scored.
- **Score and adjustment documents carry full provenance** (`configVersion`,
  `scoringFingerprint`, `algorithmVersion`, `assignmentHash`, `categoryId`).
  `useParticipants` re-verifies provenance before scoring, so a stale or
  reassigned document is rejected rather than silently mis-scored.
- **Score/adjustment values are nested maps** keyed by config IDs:
  `values: Record<questionTypeId, Record<inputId, number>>` — exactly the shape
  the scoring engine consumes. The old flat `scores` / `overallBonuses`
  collections are retired.

### What this branch changed in the data model
- **Quran page images left Firestore.** They were base64 blobs in a root
  `quran/{NNN_small}` collection. They are now static assets under
  `public/quran/mushaf-v1/` served by Hosting. **The root `quran` collection is
  now unused** and should be deleted *after* the branch is deployed and
  verified in production (it is the only remaining copy of the original PNG
  bytes, so archive those first).
- **No other Firestore schema changed.** The two new pieces of state this branch
  adds are client-side, not Firestore: the selected event in `localStorage`
  (`fip-hifz.currentEvent`), and the listener-error message in the React Query
  cache (`["participantsListenerError", eventId]`).

---

## 4. Bug fixes an operator would notice

1. **Quran pages now render.** Previously blank (wrong doc key + double-prefix).
2. **Opening a display page (`/quran-page`, `/big-screen`) without `?event=`
   recovers the last event** instead of showing the wrong/trial event.
3. **Optimistic UI is instant** on active-question changes (was waiting for the
   server round-trip).
4. **A live disconnect is now visible** on the participants ranking, instead of a
   silently frozen table.
5. **Big-screen shows the real category range**, not a fixed "Juz 1‑20".
6. **Portuguese users see Portuguese** in the participant form and the previously
   `[MISSING]`/`[FALTA]` strings.

---

## 5. Not done — follow-ups and decisions needed

- **Deploy, then delete the Firestore `quran` collection.** Post-deploy only;
  archive the original PNGs first (WebP is lossy q85 of low-res "_small" scans).
- **Auth / Firestore rules (Phase 1b).** Deferred by decision. Auth is still a
  plaintext `eventPassword` compared in the browser with a spoofable
  `sessionStorage` gate, and `firestore.rules` is an expired allow-all/deny-all.
  This blocks the in-app config editor and enforced freeze.
- **Fast participant-add** (streamline the form) — needs the minimal field-set
  decision.
- **Schedule day/time i18n** — the day labels feed a persisted `scheduled`
  string; needs storing structured values instead.
- **Tailwind 4 / Vite 8 / React 19** upgrades — risky, deferred.
- **Higher-resolution Quran scans** if the current "_small" images look soft on a
  large display.
- Audience-display (big-screen/quran-page) disconnect banner — the participants
  view has one; extending it is a natural follow-up.

---

## 6. How to run and verify

```bash
npm install
npx tsc -b            # 0
npm run lint          # 0 errors
npm run test:unit     # 180
JAVA_HOME=$(brew --prefix openjdk)/... npm run test:e2e:emulator   # 22/22 (needs JDK 21+)
```

To drive the real app against seeded data: run the Firestore emulator + seed +
`npm run dev` (wired to the emulator via `playwright.config.ts`'s env), then open
`/participants?event=demo-2026`, `/quran-page`, `/big-screen`, `/jury`.

Nothing is deployed. To verify in a real Firebase environment without touching
production, use a Hosting preview channel:
`firebase hosting:channel:deploy <name>`.

---

## 7. Check your understanding

1. What happens now if you open `/big-screen` with no `?event=` in the URL and
   nothing in `localStorage`?
2. Where do Quran page images come from after this branch, and which Firestore
   collection is now unused?
3. Why does a duplicate assigned question number now fail the engine instead of
   scoring?
4. A jury member's scores stop updating mid-event. What does the operator see on
   `/participants`, and why can't the listener recover on its own?
5. Why did event-scoping the `["activeParticipant"]` cache key fix the optimistic
   UI?

<details><summary>Answers</summary>

1. `currentEvent` stays `null`, so `<EvaluationConfigGate>` shows "No event
   selected" — it never loads the trial event.
2. From `public/quran/mushaf-v1/{page}.webp` (Hosting static assets); the root
   `quran` Firestore collection is now unused.
3. The engine's contract is exactly one score per assigned question; a duplicate
   would double-count that question and let an unrelated map entry pass the size
   check, so it fails closed.
4. A red "Live updates disconnected — reload" banner. A Firestore `onSnapshot`
   error is terminal, so the listener is dead until the page reloads and
   re-establishes it.
5. `useActiveParticipant` reads/writes `["activeParticipant", currentEvent]`; the
   mutations were writing the unscoped `["activeParticipant"]`, a different cache
   entry the reader never saw, so the optimistic update was invisible.
</details>
