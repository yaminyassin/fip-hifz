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
| Hygiene | Removed stale locked worktree `agent-a3d89d3efda68007a` (merged ancestor `e4965a9`, clean); `.claude` added to eslint ignore + `.gitignore`; deleted 10 stale/dangerous Python scripts (incl. `delete_quran_collections.py` which deletes the live root `quran/`, and `migrate_to_event_structure.py` live-by-default) + `requirements-viewer.txt` + 3 tracked `.pyc`; dropped dead `start-quran-web` npm script; fixed 7 `no-explicit-any` lint errors; added `.github/workflows/ci.yml` (Node 20 + Temurin 21, runs tsc/lint/unit/e2e). Kept Quran-storage scripts (`get_quran_images.py`, `upload_quran_images.py`, `rename_quran_pages.py`) until Phase 2. | lint 16→0 errors; tsc 0; unit 174; e2e 19/19 | `useFirestoreListener` registry typed `unknown` (heterogeneous by key) with boundary casts — file is slated for T4 redesign. |
