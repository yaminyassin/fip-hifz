# Handoff — fip-hifz evaluation-model rework

You are picking up an in-progress migration/feature program on a Quran-memorization (hifz) competition scoring app. Read this top to bottom before doing anything. It is self-contained.

**Branch:** `feature/minor-fixes` · **Stack:** React 18, Vite 5, TS ~5.6, Firebase 11 (Firestore), TanStack Router/Query/Table, Radix, i18next, npm.

---

## 1. TL;DR — where things stand

The program is defined in **`PROMPT.md`** (10 work items, run as phases with an explicit agent-operating discipline). Progress so far, all committed to `feature/minor-fixes`:

| Commit | What it delivered |
|---|---|
| `c1c0a1b` | **Phase 0** — Playwright + Firestore-emulator test harness (there were zero tests before) |
| `a0b3148` | Phase 0 design doc + the `PROMPT.md` program spec |
| `651f330` | Phase 1a design doc (`docs/migrations/phase-1-evaluation-model.md`) |
| `5748694` | Phase 1a engine trial (with Lisbon parity — later superseded) |
| `476b8ea` | **Phase 1 greenfield** — the current, per-event config-driven evaluation model |

**Current head is `476b8ea`.** `npx tsc -b` is clean; `npm run test:unit` = 75/75; `npm run test:e2e:emulator` = 18/18.

---

## 2. The single most important decision: GREENFIELD

Mid-program the user said: **start from scratch, ignore previous events (including `lisbon-2025`) — they will never be used again.** This erased the hardest ~80% of the original plan. There is deliberately:

- **NO** legacy compatibility, **NO** data migration, **NO** bit-for-bit parity with old scores, **NO** dual-read.

Do not resurrect any of that. `docs/migrations/phase-1-evaluation-model.md` still contains the *old* migration/parity design — treat it as historical; the engine type descriptions in its §2 are still accurate, but ignore all its migration/parity/freeze/allowlist content. **`docs/migrations/phase-1-greenfield.md` is the authoritative current design.**

---

## 3. Architecture of the current (greenfield) evaluation model

The app is now **config-driven per event**. Every event carries its own evaluation config; nothing is hardcoded.

- **Engine:** `src/evaluation/` — pure, well-tested, framework-free.
  - `types.ts` — `EventEvaluationConfigV2`, `EventEvaluationDescriptorV2`, `JuryEvaluationInputsV2`, `EvaluationScoreV2`, category/question-type/override types.
  - `scoringEngine.ts` — deterministic scorer: per-input weights, per-section caps, question-level void/override rules, add/subtract, additive bonus, input clamping to `[0,cap]`, multi-jury aggregation, incomplete-evaluation errors.
  - `configValidation.ts` — complete boundary validator (rejects malformed config before it can reach the engine).
  - `configHash.ts` — canonical content hash (excludes `contentHash`/timestamps; not self-referential).
  - `eventDescriptor.ts` — `loadEvaluationConfig` (fail-closed; verifies contentHash + scoringFingerprint + algorithmVersion==mode).
  - `exampleConfigSeed.ts`, `configHelpers.ts` — the `demo-2026` example config + helpers.
- **Storage (Firestore):** config at `events/{eventId}/app_config/evaluation`, pointed to by a descriptor on `events/{eventId}`. Scores at `events/{eventId}/evaluationScores/*`; jury inputs at `events/{eventId}/juryEvaluationInputs/*`. (Retired root `scores`/`overallBonuses` collections are dead.)
- **Loading/gating:** `src/contexts/EventContext.tsx` loads the config once per event (synchronously reset on event change — no stale-frame flash) and exposes `evaluationConfigStatus`. `src/components/EvaluationConfigGate.tsx` wraps every scored route (`participants`, `randomizer`, `randomizer-audience`, `jury`, `big-screen`) and **fails closed** with an explicit panel when config is missing/invalid — never falls back to the old category-'A' default.
- **Consumers:** randomizer page generation (from category page ranges), jury input rendering (from question types), scoring/ranking/exports all read the event config through the engine.
- **Provisioning:** `npm run provision-event` (`scripts/provision-event.mts`) creates a new event + its config. There is **no in-app config editor yet** (that's Phase 1b — see §6).
- **Deleted legacy:** `src/utils/scoreUtils.ts`, `src/services/scores.ts`, `src/hooks/useParticipantScores.ts`, `src/evaluation/lisbonCompat.ts`, and the obsolete `export-scores-csv`/`update-values`/`cleanup-scores` Python scripts.

---

## 4. How to build, test, verify

```bash
npm install                     # sync node_modules (devDeps incl. vitest, playwright, jsdom, @testing-library/react)
npx tsc -b                      # typecheck (covers app + node + e2e tsconfigs); must be exit 0
npm run lint                    # eslint; baseline is 8 errors/9 warnings in PRE-EXISTING untouched files — see §7
npm run test:unit               # vitest, pure engine + context tests (no emulator); currently 75/75
npm run test:e2e:emulator       # firestore emulator + seed + playwright; currently 18/18
```

**GOTCHA — Java for the emulator:** firebase-tools needs Java 21+, but this machine's default `java` is Zulu 17. Prefix emulator commands with:
```bash
JAVA_HOME=$(brew --prefix openjdk)/libexec/openjdk.jdk/Contents/Home npm run test:e2e:emulator
```
CI (GitHub Actions) uses Temurin 21 and won't hit this.

The app is **not** yet deployed from this branch; deploy workflows (`.github/workflows/firebase-hosting-*`) run on `main`. Committing to `feature/minor-fixes` does not deploy.

---

## 5. Working discipline (from `PROMPT.md`, adapted from Bun's Rust rewrite)

Follow these — they have repeatedly caught real, shipping-blocking bugs this program:

1. **Serialize knowledge first** — write a design doc to `docs/migrations/<task>.md` before code.
2. **Trial before scale-out** — build on a small representative slice, prove it, then expand.
3. **Adversarial review is mandatory** — every non-trivial change gets an independent reviewer told "assume the code is wrong," ideally **two different models** (see §8). This caught a stale-baseline conflict, 6 score-corrupting design defects, and an anomalous-data parity bug — all pre-merge.
4. **Ground truth is objective** — "done" = `tsc` clean + lint clean + relevant tests pass + verified behavior. Never trust an agent's self-report; verify diffs.
5. **No destructive git** — only commit specific named files; never `git stash`/`reset`/`checkout -- .`/`clean`.
6. **Worktree isolation** for parallel/experimental writes; keep the main tree clean. Commit by fast-forwarding `feature/minor-fixes` to the worktree branch, then `npm install` + verify on the main tree, then remove the worktree.
7. **No skipped/weakened tests.**

---

## 6. Model routing (user preference)

From the user's global config: high-value design & the hardest reasoning → **gpt-5.6-sol** (high effort); UI/UX → **sonnet-5**; validation/skeptical verification → **opus-4.8**; adversarial review → **opus + gpt-5.6-sol** (two families). **fable-5** is a strong reviewer alternative. Never use Haiku. Bulk/mechanical → gpt-5.6-terra. Escalate to a smarter model if output is weak — cost is a tie-breaker only.

---

## 7. Reliable agent orchestration mechanics (READ THIS — it took many failures to learn)

- **Workflows** (the `Workflow` tool) run subagents deterministically in the background. Use `isolation: 'worktree'` when agents mutate files. Keep Codex OUT of workflows (see below).
- **Driving gpt-5.6-sol / Codex:** do NOT use in-workflow `codex ... --wait` (dies at the ~10-min Bash tool timeout while Codex is still working) and do NOT rely on the `codex:codex-rescue` subagent for long tasks (it backgrounds and returns a stub). Instead drive the companion directly as a **background job + poll**:
  ```bash
  CJS="/Users/yaminyassin/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs"
  node "$CJS" task --background --fresh --model gpt-5.6-sol --effort high "$(cat prompt.txt)"   # -> task-... id
  node "$CJS" status <id>    # poll (grep for 'completed')
  node "$CJS" result <id>    # fetch output
  ```
  Wrap the requested output in explicit markers (e.g. `<<<DOC_BEGIN>>>…<<<DOC_END>>>`) for clean extraction. Run the poller as a `run_in_background` Bash loop so it re-invokes you on completion.
- **Known instability (2026-07-14):** the Codex background **job registry can get wiped mid-run** ("No jobs recorded yet"), losing the result; **fable-5 hit a usage limit**. When the second-model reviewer can't complete, fall back to opus + your own direct verification (grep/read the diff, hand-check the math) + the test suite — and **say so honestly** in your report. The greenfield commit `476b8ea` was gated this weaker way (opus + direct verification + tests), NOT the full two-model pass. Re-running a gpt-5.6-sol review on `476b8ea` when Codex recovers is an open, optional follow-up.

---

## 8. What's next (pick up here)

**Immediate / small:**
- (Optional) Re-run the **gpt-5.6-sol adversarial review** on `476b8ea` once Codex background jobs are stable, to restore the full two-model gate on the greenfield commit.
- Reconcile `scripts/import_participants_from_csv.py` field shape to the V2 event-scoped model (it writes `events/{id}/participants` but its fields predate V2). Noted in `docs/migrations/phase-1-evaluation-model.md` item 13.

**Phase 1b (the natural next build) — blocked on auth:**
- In-app **config editor** (create/edit event categories, question types, assets in the UI) + **enforced freeze**/immutable archive once an event has scores.
- **Hard prerequisite:** the app has **no server-side auth** — `firestore.rules` expired 2024-12-24 and auth is a client-side `sessionStorage` password only. A real auth model (Firebase Auth / custom claims or a trusted backend + tested rules) must come first, or the editor/freeze are only advisory and spoofable. Start Phase 1b with an auth-first plan.

**Remaining PROMPT.md phases (2–9):** Quran page asset storage (off Firebase → CDN/object storage), Firebase library upgrade + live-update/subscription reliability, Tailwind migration, Vite+React migration, Quran rendering page fixes (active-participant detection), admin ergonomics + i18n gaps, performance-monitoring panel, and a full end-to-end QA sweep (Claude in Chrome). Each should follow the §5 discipline: design doc → trial → adversarial review → verify.

---

## 9. Pointers

- **Program spec & discipline:** `PROMPT.md`
- **Current design:** `docs/migrations/phase-1-greenfield.md` (authoritative); `phase-1-evaluation-model.md` (historical, engine §2 still accurate); `phase-0-test-harness.md`
- **Engine:** `src/evaluation/` · **Gate:** `src/components/EvaluationConfigGate.tsx` · **Config load:** `src/contexts/EventContext.tsx` · **Provision:** `scripts/provision-event.mts`
- **Tests:** `src/evaluation/__tests__/*` (unit), `e2e/*.spec.ts` (emulator)
- **Session memory:** `~/.claude/projects/-Users-yaminyassin-work-fip-hifz/memory/` — `hifz-greenfield-pivot.md`, `driving-gpt56sol-reliably.md`

## 10. Conventions

- Commit/PR messages: describe the change and intent as a human author would. **No AI attribution, no co-author trailers, no "generated with" lines** (user's global rule).
- Confirm outward-facing or hard-to-reverse actions before doing them. Report failures honestly with output.
