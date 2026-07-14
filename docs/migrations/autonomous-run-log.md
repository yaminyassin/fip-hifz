# Autonomous run log (2026-07-14)

Decision trail for the priority program derived from the 7-agent codex/sol investigation.
Exit predicate: each unit ends green (`tsc -b` = 0, `npm run lint` = 0 errors, `npm run test:unit` = 174+, `npm run test:e2e:emulator` = all pass), reviewed, and committed. Priority order: hygiene → T1 → T2 → T3 → T4/Phase3 → T5/Phase1b → later phases.

Ground truth this session (verified, not self-reported):
- `tsc -b` exit 0.
- Unit: 174 passed.
- E2E: 19/19 passed (28.6s) with brew openjdk 26 (`JAVA_HOME=/opt/homebrew/opt/openjdk`).

Model routing (from user goal): sol high / terra medium for mechanical, sonnet-5 for UI, opus for validation + adversarial review.

| Unit | Change | Predicate moved | Notes |
|---|---|---|---|
| Hygiene | Removed stale locked worktree `agent-a3d89d3efda68007a` (merged ancestor `e4965a9`, clean); `.claude` added to eslint ignore + `.gitignore`; deleted 10 stale/dangerous Python scripts (incl. `delete_quran_collections.py` which deletes the live root `quran/`, and `migrate_to_event_structure.py` live-by-default) + `requirements-viewer.txt` + 3 tracked `.pyc`; dropped dead `start-quran-web` npm script; fixed 7 `no-explicit-any` lint errors; added `.github/workflows/ci.yml` (Node 20 + Temurin 21, runs tsc/lint/unit/e2e). Kept Quran-storage scripts (`get_quran_images.py`, `upload_quran_images.py`, `rename_quran_pages.py`) until Phase 2. | lint 16→0 errors; tsc 0; unit 174; e2e 19/19 | `useFirestoreListener` registry typed `unknown` (heterogeneous by key) with boundary casts — file is slated for T4 redesign. Committed `0af5031`. |
| T1 | Removed the silent `currentEvent \|\| 'demo-2026'` fallback across 12 files (fail-loud guards: `throw` in RQ mutationFns, early-return in handlers — implemented by gpt-5.6-sol high, reviewed). EventContext no longer defaults a param-less non-root route to `demo-2026`; instead persists the last explicitly-selected event to `localStorage` and restores it (same-browser), else fails closed via the gate. This fixes Phase 6: an event-less `/quran-page` no longer shows the wrong event's absent participant. | tsc 0; lint 0; unit 174; e2e 21→22 incl. new `eventFallback.spec.ts` | Opus adversarial review found **2 BLOCKING**, both fixed: (1) guard sat before `e.preventDefault()` in JuryLogin/JuryForm → native form submit/reload on the newly-reachable null-event state; (2) localStorage is per-browser so the comment's "second screen = separate device" claim was corrected (separate device needs `?event=`, which in-app nav includes). Deferred (noted): `/admin` un-gated with silent no-op buttons → T3; `replaceState`-after-`beforeLoad` auth bypass → T5. |
