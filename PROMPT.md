# Hifz Platform — Migration & Feature Program

This document is the **execution spec** for a large set of changes to this project (React 18 + Vite 5 + Tailwind 3 + Firebase 11 + TanStack Router/Query/Table + Radix + i18next). It defines *what* to build and, just as importantly, *how the AI agents must be driven* to build it safely.

The operating discipline below is adapted from Bun's Zig→Rust rewrite (https://bun.com/blog/bun-in-rust), which shipped a 1,400-file migration with fleets of agents by treating **objective ground truth** and **adversarial review** as non-negotiable.

---

## 1. Operating rules for agents (read first, applies to every task)

These are hard constraints. A workflow that violates them is wrong even if the code looks right.

1. **Serialize knowledge before writing code.** For any migration or redesign task, the first phase produces a reference doc (a "porting guide") — the current shape, the target shape, the idiom-by-idiom mapping, and the risks — committed to `docs/migrations/<task>.md`. All downstream agents read that doc instead of re-deriving it. Cheap to produce during planning; expensive to discover mid-implementation.
2. **Trial run before scale-out.** Never fan out across N files/features first. Run the *full* pipeline (implement → review → fix → verify) on **3 representative units**, confirm the approach, then scale. If the trial reveals the plan is wrong, fix the plan — not the symptoms.
3. **Adversarial review is mandatory.** Every implementation unit gets **1 implementer + 2 independent reviewers** in *separate context windows*. Reviewers receive **only the diff**, are told **"assume the code is wrong — your only job is to find bugs and reasons it does not work,"** and get no access to the implementer's reasoning. Split context = independent judgment.
4. **Reject documented hacks.** If code needs a paragraph-long comment to justify why a workaround is acceptable, the reviewer rejects it. Force the correct implementation.
5. **Ground truth is objective, never self-reported.** An agent claiming "done" means nothing. Done = `npm run tsc` clean **and** `npm run lint` clean **and** the relevant smoke test passes **and** the flow was driven in a real browser (Claude in Chrome). Codex/gpt agents in particular must have their diffs and done-checks verified — never trust their self-reported completion.
6. **Type/lint errors are the work queue.** After a batch of generation, run `tsc -b`, group errors by file/feature, write them to a file, and dispatch fixes as discrete, measurable units. Same pattern Bun used with `cargo check`.
7. **No destructive git.** Agents may only run `git` commands that commit specific named files. **Never** `git stash`, `git reset`, `git checkout -- .`, `git clean`, or anything that can discard uncommitted work. Parallel agents sharing a tree will destroy each other's work otherwise.
8. **Worktree isolation for parallel writes.** Any workflow whose agents mutate files concurrently must use `isolation: 'worktree'`. This prevents cross-agent clobbering and disk contention.
9. **No skipped/deleted tests.** Once a smoke test or assertion exists, it may not be skipped, deleted, or weakened to make a build pass. Regressions are tracked and fixed, not hidden.
10. **Fix the workflow, not the mistake.** When agents misbehave in a repeatable way, edit the workflow/prompt that produced the behavior rather than hand-patching each instance.

### 1a. Build the missing ground truth first (prerequisite phase)

This repo currently has **no automated tests**. Per rule 5, ground truth cannot be self-reported, so the very first program phase establishes it:

- Add a Playwright (or Vitest + Playwright) harness and CI wiring.
- Write **language-independent smoke tests per route/feature** (admin control panel, participant management, Quran rendering page, evaluation flow, live updates). These assert observable behavior and cannot be faked by the code under test.
- Seed a Firebase emulator dataset so live-update and evaluation flows are testable deterministically offline.

Every later feature/migration task is gated on its smoke test passing. No smoke test → the task is not done.

---

## 2. Model assignment policy

Work is routed by the *kind* of judgment it needs, not by convenience.

| Work type | Model | Effort | Rationale |
|---|---|---|---|
| High-value: architecture, Firebase data-model redesign, storage migration, dependency migrations (Vite/React/Tailwind/Firebase), query/subscription perf | **gpt-5.6-sol** | high (max on the single hardest) | Frontier reasoning for the tasks where a wrong call is expensive |
| UI / UX / component work, i18n, control-panel ergonomics, Quran page rendering polish | **sonnet-5** | medium | Strong taste for user-facing surfaces |
| Validation / done-check of every unit (types, lint, smoke, behavior in browser) | **opus-4.8** | high | Careful, skeptical verification pass |
| **Adversarial review** (the 2 reviewers per unit, rule 3) | **opus-4.8** + **gpt-5.6-sol** | high | Two *different model families* = genuinely independent failure-mode coverage; a bug one family rationalizes, the other catches |

**Mechanics inside workflows:** the `Workflow`/`Agent` `model` parameter only accepts Claude models, so:
- Sonnet/Opus stages: set `model: 'sonnet'` / `model: 'opus'` directly.
- gpt-5.6-sol stages: spawn a thin Claude wrapper (`model: 'sonnet'`, low effort) whose prompt tells it to write a self-contained Codex prompt, run `codex exec -m gpt-5.6-sol -c model_reasoning_effort=high` (read-only `-s read-only` for review/analysis stages) via Bash, verify the diff/output, and return it. Or delegate through the `codex:codex-rescue` subagent.
- On Codex `usage limit` errors: report the reset time and fall back to opus — do **not** retry-loop.

---

## 3. The canonical per-unit workflow

Every feature and every migration file runs through this pipeline (`pipeline()`, not a barrier — a unit that clears review shouldn't wait on its siblings):

```
implement  →  review×2 (adversarial, diff-only)  →  apply-fixes  →  validate  →  verify-in-browser
  ▲ model by §2       ▲ opus + gpt-5.6-sol            ▲ implementer      ▲ opus         ▲ Claude in Chrome
```

- **implement** — writes code in an isolated worktree, following the migration doc from the planning phase.
- **review×2** — two reviewers in separate contexts, diff-only, "assume it's wrong." Findings are structured (schema: `{blocking: bool, findings: [...]}`).
- **apply-fixes** — implementer addresses only blocking findings; re-review if a fix is non-trivial.
- **validate** — opus runs `tsc -b`, `lint`, the unit's smoke test; confirms no test was skipped/weakened.
- **verify-in-browser** — drive the actual flow with Claude in Chrome and confirm observable behavior.

A unit is merged only when review is clean, validation is green, and the browser check passes.

---

## 4. Program phases (maps every original requirement into the discipline above)

Run these as sequential Workflow invocations — read each result before launching the next; you stay in the loop between phases.

**Phase 0 — Ground truth.** (§1a) Test harness, per-route smoke tests, Firebase emulator seed, CI. *gpt-5.6-sol* designs the harness; *sonnet-5* writes the per-route interaction tests; *opus* validates coverage.

**Phase 1 — Configurable evaluation model (highest value).** Redesign the Firestore schema so each **event** independently defines:
- its own **categories** (per-event creation, question count, JUZ range),
- its own **question types** (per-type: number of inputs, cost, per-input max/limit, and whether it adds to or subtracts from the overall score),
- its own **category assets**.

*gpt-5.6-sol @ high* owns the data-model + migration design (write the porting doc first, trial-run on 3 events); adversarial review by *opus + gpt-5.6-sol*; *opus* validates against smoke tests.

**Phase 2 — Quran page asset storage.** Move off the current Firebase-stored Quran page assets to a better storage solution (research options: Cloud Storage + CDN, object storage, image pipeline). *gpt-5.6-sol @ high* researches and designs the migration doc, validates facts before migrating; adversarial review + browser verify that pages still render.

**Phase 3 — Live-updates reliability + Firebase upgrade.** Analyze Firebase docs, upgrade the Firebase library to latest, and improve query + subscription performance and reliability. *gpt-5.6-sol @ high* (research-then-migrate, double-check facts first); *opus* validates live-update smoke tests under the emulator.

**Phase 4 — Tailwind migration.** Research Tailwind latest + dependents, validate/double-check, then migrate the codebase. *gpt-5.6-sol @ high* designs the migration doc; *sonnet-5* executes the class/config migration (UI-heavy); adversarial review + visual browser verification.

**Phase 5 — Vite + React migration.** Research what's required to update Vite, React, and their dependents; establish facts, double-check, then perform the full migration. *gpt-5.6-sol @ high*; *opus* validates the build and full smoke suite.

**Phase 6 — Quran rendering page.** Fix its issues; it currently does not detect the active participant. *sonnet-5* implements (UI); adversarial review; *opus* validates; browser-verify active-participant detection.

**Phase 7 — Admin ergonomics.** Improve the control panel, fix missing i18n in participant management, and streamline/simplify participant adding. *sonnet-5* (UI + i18n); adversarial review; browser-verify each interaction.

**Phase 8 — Performance monitoring panel.** Improve the admin performance-monitoring panel. *sonnet-5* implements; *opus* validates the metrics shown are real.

**Phase 9 — Full validation sweep.** Check every page and feature end-to-end with Claude in Chrome; confirm 100% of the smoke suite passes on CI. Track any regression explicitly and fix it — none may be left open. *opus* drives; *gpt-5.6-sol* adversarially reviews the "everything works" claim.

---

## 5. Definition of done (whole program)

- 100% of the smoke/interaction suite passes in CI.
- 0 tests skipped, deleted, or weakened.
- Every migrated surface verified in a real browser.
- Every merged unit passed 2 adversarial reviews.
- All known regressions tracked and closed.
