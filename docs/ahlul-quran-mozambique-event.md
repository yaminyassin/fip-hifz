# Ahlul Qur'an International Competition — Mozambique

The event `ahlul-quran-international-competition---mozambique` was created by
the app's old "New Event" path, which wrote only the event document and auth
settings. It had **no `evaluation` descriptor and no `app_config/evaluation`
document**, so it failed closed: it could not be scored, randomized, or
exported. Neither in-app path could repair it — `createEvent` refuses an id
that already exists, and `publishRevision` needs a config document to
compare-and-set against. `scripts/provision-ahlul-quran-mozambique.mts` exists
to fix that from outside the app.

The provisioner uses the **client SDK, not firebase-admin**. Every write it
makes is one the security rules already permit, so rules are enforced rather
than bypassed and no service-account key is needed. The descriptor and the
config are written in one batch from the same validated, hashed object, so the
event is never half-provisioned.

## Categories

Each category is declared as a Juz span plus a question count in
`src/evaluation/ahlulQuranMozambiqueSeed.ts`; the authoritative `pageRange` for
every question slot is **derived** from `juzToPageMap` rather than transcribed,
so a page range cannot silently disagree with the Juz span it claims to cover.

| Category | Juz | Questions | Page ranges |
|---|---|---:|---|
| A1 — 1 Juz (Juz Amma) | 30 | 2 | 582–588; 589–596 |
| A2 — 1 Juz (Alif Lam Mim) | 1 | 2 | 3–11; 12–21 |
| B1 — First 5 Juz | 1–5 | 2 | 3–51; 52–101 |
| B2 — Last 5 Juz | 26–30 | 2 | 502–548; 549–596 |
| C1 — First 15 Juz | 1–15 | 3 | 3–101; 102–200; 201–301 |
| C2 — Last 15 Juz | 16–30 | 3 | 302–399; 400–497; 498–596 |
| D — Full Qur'an | 1–30 | 3 | 3–200; 201–398; 399–596 |

The splitting rule — first `n-1` slots take `floor(total / n)` pages, the last
takes the remainder — reproduces every category partition published in
`phase-1-evaluation-model.md` exactly, which is what pins it as the event's
authoring rule rather than one of several defensible roundings.

**No category carries an `assetRef`.** The artwork in `src/assets/categories`
was drawn for the Lisbon scheme, where the same letters mean different spans:
Lisbon's `A2` card reads "5 AJZA (26–30)", but `A2` here is a single Juz.
Pointing at those files would print a wrong Juz range on the audience big
screen. Set `assetRef` once artwork exists for this scheme.

## Scoring

The Lisbon rubric, with one deliberate change: **Tajweed scores minor mistakes
only**. The major-mistake input is removed outright rather than left at weight
zero — a scored input must have a weight above zero, and an unused input would
still be rendered to every juror. The engine now rejects a stored `major` value
instead of silently ignoring it.

| Section | Operation | Inputs | Cap |
|---|---|---|---:|
| Memorisation | subtract | judge correction ×3, self correction ×2, times stuck (informational) | 50 |
| Qur'anic rules | subtract | minor mistake ×1 | 30 |
| Stopping and starting | subtract | incorrect pause/start ×0.3, alters meaning ×0.7 | 10 |
| Husn al-Adā' | subtract | fluency/performance mistakes ×1 | 10 |
| Bonus marks | add (participant level) | overall bonus 0–5 | 5 |

Three judge corrections void the question, carried over from the Lisbon rubric.
Base 100 per question, question bounds `[0, 100]` (every section subtracts),
final bounds `[0, 105]` for the additive bonus. Missing questions make the
evaluation incomplete rather than perfect.

## The roster is not in this repository

A roster lists children by name, age, home province and school, and this
repository is public. `scripts/data/ahlul-quran-mozambique-participants.ts` is
therefore **gitignored** and loaded from disk at run time;
`ahlul-quran-mozambique-participants.example.ts` is the committed template.
`scripts/data/rosterTypes.ts` builds its import specifier from a computed URL
on purpose — a literal specifier would put the gitignored file in `tsc`'s
graph and break the build on a fresh clone.

`province` is never written to Firestore: `Participant` has no province field
and `participantShapeOk()` pins the document to an exact key set.

`scheduled` is left empty. It is a **session bucket** that `ParticipantsTable`
groups the roster by (`"S5: Friday afternoon"` in the other events), not a
running order; the sheet gives no timetable, so everyone lands in one
"Unscheduled" group. Putting the sheet's row number there instead renders one
singleton session per participant.

## Deferred rows

The source sheet groups rows under Juz headings and only some rows carry an
explicit leaf category. Rows whose category cell repeats a group heading have
no recorded leaf category, so they are **not provisioned**: an event that fails
closed on an unknown category is recoverable, but a participant scored against
the wrong half of the Qur'an is an invisible failure until they are on stage.

As of the initial import, six rows are deferred — three in the "5 Juzs" group
needing `B1` or `B2`, and three in the "15 Juzs" group needing `C1` or `C2`.
One of those also has no age, which `participantShapeOk()` requires. Resolve
them by moving the rows into `ROSTER` with a category and re-running the
provisioner. The named list lives beside the roster, outside git.

## Running it

```bash
# Emulator
FIRESTORE_EMULATOR_HOST=127.0.0.1:8082 npm run provision-mozambique -- \
  --apply --seed-jury --event-password <password>

# Production: always dry-run first
npm run provision-mozambique -- --target production --dry-run
npm run provision-mozambique -- --target production --apply
```

`--apply` is required to write anything and `--dry-run` always wins over it.
The script refuses to write when the event already has participants unless
`--replace-participants` is passed, because document ids come from name
spellings that may differ from the sheet and it would otherwise create
duplicates instead of updating. It further refuses to replace participants
while any evaluation documents exist, since deleting a participant here does
not run `deleteParticipant()`'s cascade and would orphan their scores.

Verify afterwards with the independent checker, which re-derives every claim
from first principles rather than trusting what the app wrote:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8082 npm run verify:emulator -- \
  --event ahlul-quran-international-competition---mozambique
```
