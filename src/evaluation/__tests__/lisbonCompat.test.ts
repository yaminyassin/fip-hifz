import { describe, expect, it } from "vitest";
import {
  computeLisbonDisplayResult,
  type LisbonBonusSource,
  type LisbonParticipantInput,
  type LisbonScoreSource,
} from "../lisbonCompat";
import { scoreJury, scoreParticipant, scoreQuestion, type QuestionValueMap } from "../scoringEngine";
import { buildLisbonEvaluationConfig, LISBON_CATEGORY_QUESTION_COUNTS } from "../lisbonConfigSeed";
import { Timestamp } from "firebase/firestore";
import { sha256Hex } from "../configHash";
import {
  LISBON_EIGHT_FIELD_FIXTURE_SCORES,
  LISBON_EIGHT_FIELD_FIXTURE_SHA256,
  // @ts-expect-error -- plain .mjs, no type declarations.
} from "../../../scripts/lisbonEightFieldFixtureScores.mjs";

const eightZeroFields = {
  hifdh_judge_correction: 0,
  hifdh_self_correction: 0,
  hifdh_stuck_count: 0,
  tajweed_major: 0,
  tajweed_minor: 0,
  waqf_ibtida_incorrect: 0,
  waqf_ibtida_meaning: 0,
  husn_al_ada_score: 0,
};

describe("legacy-lisbon-display-v1: the unchanged eight-field fixture (diagnostic only)", () => {
  // Byte-identity guard: this imports the SAME object
  // scripts/seed-firestore-emulator.mjs writes into
  // events/lisbon-2025/scores/participant-active_jury-one_1 (isDone: false),
  // rather than retyping the eight numeric fields by hand — a hand
  // re-creation could silently drift from what's actually seeded and this
  // test would never notice. The canonical-hash pin below additionally
  // catches an edit to the shared fixture object itself.
  it("scripts/lisbonEightFieldFixtureScores.mjs matches its pinned canonical SHA-256", async () => {
    const sortedKeys = Object.keys(LISBON_EIGHT_FIELD_FIXTURE_SCORES).sort();
    const sorted: Record<string, number> = {};
    for (const key of sortedKeys) {
      sorted[key] = LISBON_EIGHT_FIELD_FIXTURE_SCORES[key];
    }
    const hash = await sha256Hex(JSON.stringify(sorted));
    expect(hash).toBe(LISBON_EIGHT_FIELD_FIXTURE_SHA256);
  });

  const participant: LisbonParticipantInput = {
    participantId: "participant-active",
    isDone: false,
    assignedQuestions: [42, 87],
    expectedQuestions: LISBON_CATEGORY_QUESTION_COUNTS.A1,
  };
  const scoreSources: LisbonScoreSource[] = [
    {
      sourcePath: "events/lisbon-2025/scores/participant-active_jury-one_1",
      juryId: "jury-one",
      questionNumber: 1,
      pageNumber: 42,
      scores: LISBON_EIGHT_FIELD_FIXTURE_SCORES,
    },
  ];
  const bonusSources: LisbonBonusSource[] = [{ juryId: "jury-one", overallBonus: 2 }];

  it("diagnostic base = 98.5, additive diagnostic = 100.5, delta = +2, but displayed finalScore = -1", () => {
    const result = computeLisbonDisplayResult(participant, scoreSources, bonusSources);
    expect(result.rankingEligible).toBe(false);
    expect(result.oldDisplayedBase).toBe(98.5);
    expect(result.bonusApplied).toBe(2);
    expect(result.newDisplayedDiagnostic).toBe(100.5);
    expect(result.newDisplayedDiagnostic - result.oldDisplayedBase).toBe(2);
    // The sentinel: an ineligible participant never displays or ranks,
    // regardless of the diagnostic values above.
    expect(result.finalScore).toBe(-1);
  });
});

describe("legacy-lisbon-display-v1: the completed ranking fixture", () => {
  const participant: LisbonParticipantInput = {
    participantId: "participant-ranking-done",
    isDone: true,
    assignedQuestions: [42, 87],
    expectedQuestions: LISBON_CATEGORY_QUESTION_COUNTS.A1,
  };
  const scoreSources: LisbonScoreSource[] = [
    {
      sourcePath: "events/lisbon-2025/scores/participant-ranking-done_jury-one_1",
      juryId: "jury-one",
      questionNumber: 1,
      pageNumber: 42,
      // Same shared, byte-identical fixture object as the unchanged
      // eight-field fixture above (and as seeded by
      // scripts/seed-firestore-emulator.mjs for this document).
      scores: LISBON_EIGHT_FIELD_FIXTURE_SCORES,
    },
  ];
  const bonusSources: LisbonBonusSource[] = [{ juryId: "jury-one", overallBonus: 2 }];

  it("displays finalScore = 100.5 and is ranking eligible", () => {
    const result = computeLisbonDisplayResult(participant, scoreSources, bonusSources);
    expect(result.rankingEligible).toBe(true);
    expect(result.oldDisplayedBase).toBe(98.5);
    expect(result.newDisplayedDiagnostic).toBe(100.5);
    expect(result.finalScore).toBe(100.5);
  });
});

describe("legacy-lisbon-display-v1: fractional judge-correction parity fixtures", () => {
  const participant: LisbonParticipantInput = {
    participantId: "participant-fractional",
    isDone: true,
    assignedQuestions: [42, 87],
    expectedQuestions: 2,
  };

  it("complete fixture: Q1=92.5 (not void), base = 96.25", () => {
    const scoreSources: LisbonScoreSource[] = [
      {
        sourcePath: "a",
        juryId: "jury-1",
        questionNumber: 1,
        pageNumber: 42,
        scores: { ...eightZeroFields, hifdh_judge_correction: 2 },
      },
      {
        sourcePath: "b",
        juryId: "jury-1",
        questionNumber: 2,
        pageNumber: 87,
        scores: { ...eightZeroFields },
      },
      {
        sourcePath: "c",
        juryId: "jury-2",
        questionNumber: 1,
        pageNumber: 42,
        scores: { ...eightZeroFields, hifdh_judge_correction: 3 },
      },
      {
        sourcePath: "d",
        juryId: "jury-2",
        questionNumber: 2,
        pageNumber: 87,
        scores: { ...eightZeroFields },
      },
    ];
    const result = computeLisbonDisplayResult(participant, scoreSources, []);
    expect(result.averagingBranch).toBe("complete");
    expect(result.questions[0].fields.hifdh_judge_correction).toBe(2.5);
    expect(result.questions[0].isVoid).toBe(false);
    expect(result.questions[0].score).toBe(92.5);
    expect(result.questions[1].score).toBe(100);
    expect(result.oldDisplayedBase).toBe(96.25);
  });

  it("incomplete fixture: Q2 missing for both juries, Math.round(2.5)=3 voids Q1, base = 50", () => {
    const scoreSources: LisbonScoreSource[] = [
      {
        sourcePath: "a",
        juryId: "jury-1",
        questionNumber: 1,
        pageNumber: 42,
        scores: { ...eightZeroFields, hifdh_judge_correction: 2 },
      },
      {
        sourcePath: "c",
        juryId: "jury-2",
        questionNumber: 1,
        pageNumber: 42,
        scores: { ...eightZeroFields, hifdh_judge_correction: 3 },
      },
    ];
    const result = computeLisbonDisplayResult(participant, scoreSources, []);
    expect(result.averagingBranch).toBe("incomplete");
    expect(result.questions[0].fields.hifdh_judge_correction).toBe(3);
    expect(result.questions[0].isVoid).toBe(true);
    expect(result.questions[0].score).toBe(0);
    expect(result.questions[1].score).toBe(100);
    expect(result.oldDisplayedBase).toBe(50);
  });
});

describe("legacy-lisbon-display-v1: additional fixtures", () => {
  const singleQuestionParticipant = (assignedQuestions: number[]): LisbonParticipantInput => ({
    participantId: "p",
    isDone: true,
    assignedQuestions,
    expectedQuestions: 1,
  });

  it("1. void threshold: judge_correction = 3 => question score 0", () => {
    const result = computeLisbonDisplayResult(
      singleQuestionParticipant([42]),
      [
        {
          sourcePath: "a",
          juryId: "jury-1",
          questionNumber: 1,
          pageNumber: 42,
          scores: { ...eightZeroFields, hifdh_judge_correction: 3 },
        },
      ],
      []
    );
    expect(result.questions[0].isVoid).toBe(true);
    expect(result.questions[0].score).toBe(0);
  });

  it("2. section cap: tajweed_major=10, tajweed_minor=10 clamps to 30", () => {
    const result = computeLisbonDisplayResult(
      singleQuestionParticipant([42]),
      [
        {
          sourcePath: "a",
          juryId: "jury-1",
          questionNumber: 1,
          pageNumber: 42,
          scores: { ...eightZeroFields, tajweed_major: 10, tajweed_minor: 10 },
        },
      ],
      []
    );
    // raw tajweed impact = 10*2 + 10*1 = 30, applied = min(30, 30) = 30.
    expect(result.questions[0].score).toBe(70);
  });

  it("4. stale page: excluded from scoring, jury still registered, missing slot scores 100", () => {
    const result = computeLisbonDisplayResult(
      singleQuestionParticipant([42]),
      [
        {
          sourcePath: "a",
          juryId: "jury-1",
          questionNumber: 1,
          pageNumber: 999, // not in assignedQuestions
          scores: { ...eightZeroFields, hifdh_judge_correction: 5 },
        },
      ],
      []
    );
    expect(result.staleSourcePaths).toEqual(["a"]);
    expect(result.scoreDerivedJuryIds).toEqual(["jury-1"]);
    expect(result.questions[0].score).toBe(100); // vacated slot treated as perfect
  });

  it("5. duplicate effective index: two sources remap to the same slot, both reported", () => {
    const result = computeLisbonDisplayResult(
      singleQuestionParticipant([42]),
      [
        {
          sourcePath: "a-first",
          juryId: "jury-1",
          questionNumber: 1,
          pageNumber: 42,
          scores: { ...eightZeroFields, hifdh_judge_correction: 1 },
        },
        {
          sourcePath: "b-second",
          juryId: "jury-1",
          questionNumber: 1,
          pageNumber: 42,
          scores: { ...eightZeroFields, hifdh_judge_correction: 2 },
        },
      ],
      []
    );
    expect(result.duplicateEffectiveKeys).toHaveLength(1);
    expect(result.duplicateEffectiveKeys[0].sourcePaths).toEqual(["a-first", "b-second"]);
    // Current app behavior: later source overwrites in iteration order.
    expect(result.questions[0].fields.hifdh_judge_correction).toBe(2);
  });

  it("6. embedded ninth field: overall_bonus in the nested map never enters the base score", () => {
    const result = computeLisbonDisplayResult(
      singleQuestionParticipant([42]),
      [
        {
          sourcePath: "a",
          juryId: "jury-1",
          questionNumber: 1,
          pageNumber: 42,
          scores: { ...eightZeroFields, overall_bonus: 5 } as Record<string, unknown>,
        },
      ],
      []
    );
    expect(result.questions[0].score).toBe(100);
  });

  it("7. bonus jury set: score-without-bonus=0, bonus-without-score excluded, stale-score jury included", () => {
    const participant: LisbonParticipantInput = {
      participantId: "p",
      isDone: true,
      assignedQuestions: [42, 999], // second slot only reachable via stale source below
      expectedQuestions: 2,
    };
    const result = computeLisbonDisplayResult(
      participant,
      [
        {
          sourcePath: "scored-no-bonus",
          juryId: "jury-no-bonus",
          questionNumber: 1,
          pageNumber: 42,
          scores: { ...eightZeroFields },
        },
        {
          sourcePath: "stale-source",
          juryId: "jury-stale",
          questionNumber: 2,
          pageNumber: 12345, // not assigned -> stale
          scores: { ...eightZeroFields },
        },
      ],
      [
        { juryId: "jury-no-bonus", overallBonus: 0 },
        { juryId: "jury-bonus-only", overallBonus: 4 }, // no score doc -> excluded
      ]
    );
    expect([...result.scoreDerivedJuryIds].sort()).toEqual(["jury-no-bonus", "jury-stale"]);
    // mean over score-derived juries: jury-no-bonus=0, jury-stale has no
    // bonus doc => 0. bonusApplied = (0 + 0) / 2 = 0.
    expect(result.bonusApplied).toBe(0);
  });
});

describe("multi-jury nonlinear aggregation (legacy displayed 0, jury-first diagnostic 47)", () => {
  it("legacy raw-field average = 3 voids the question; jury-first diagnostic = 47", async () => {
    const participant = {
      participantId: "p",
      isDone: true,
      assignedQuestions: [42],
      expectedQuestions: 1,
    };
    const compat = computeLisbonDisplayResult(
      participant,
      [
        {
          sourcePath: "a",
          juryId: "jury-1",
          questionNumber: 1,
          pageNumber: 42,
          scores: { ...eightZeroFields, hifdh_judge_correction: 2 },
        },
        {
          sourcePath: "b",
          juryId: "jury-2",
          questionNumber: 1,
          pageNumber: 42,
          scores: { ...eightZeroFields, hifdh_judge_correction: 4 },
        },
      ],
      []
    );
    expect(compat.questions[0].fields.hifdh_judge_correction).toBe(3);
    expect(compat.questions[0].isVoid).toBe(true);
    expect(compat.questions[0].score).toBe(0);

    // jury-first-v2 diagnostic: each jury scored independently, then
    // averaged, using the same Lisbon config's hifdh section.
    const config = await buildLisbonEvaluationConfig(Timestamp.now());
    const values = (judgeCorrection: number): QuestionValueMap => ({
      hifdh: { judge_correction: judgeCorrection, self_correction: 0, stuck_count: 0 },
      tajweed: { major: 0, minor: 0 },
      waqf_ibtida: { incorrect: 0, meaning: 0 },
      husn_al_ada: { mistake_count: 0 },
    });

    const q1 = scoreQuestion(config, values(2));
    const q2 = scoreQuestion(config, values(4));
    expect(q1.ok && q1.value.score).toBe(94);
    expect(q2.ok && q2.value.score).toBe(0);

    const jury1 = scoreJury(config, [1], new Map([[1, values(2)]]), {
      overall_bonus: { bonus: 0 },
    });
    const jury2 = scoreJury(config, [1], new Map([[1, values(4)]]), {
      overall_bonus: { bonus: 0 },
    });
    expect(jury1.ok && jury1.value.juryFinal).toBe(94);
    expect(jury2.ok && jury2.value.juryFinal).toBe(0);

    if (jury1.ok && jury2.ok) {
      const participantResult = scoreParticipant(
        new Map([
          ["jury-1", jury1.value],
          ["jury-2", jury2.value],
        ])
      );
      expect(participantResult).toEqual({ ok: true, value: 47 });
    }
  });
});

describe("F2: complete-branch anomalous extra question key (denominator parity)", () => {
  it("A1 (expectedQuestions=2) with effective questions {1:100, 2:100, 3:0}: compat == legacy == 66.67", async () => {
    const { calculateFinalScore } = await import("@/utils/scoreUtils");

    const participant: LisbonParticipantInput = {
      participantId: "p-extra-key",
      isDone: true,
      // Three assigned slots so a third source can remap to effective
      // question 3, one more than A1's expectedQuestions (2).
      assignedQuestions: [10, 20, 30],
      expectedQuestions: LISBON_CATEGORY_QUESTION_COUNTS.A1,
    };
    const scoreSources: LisbonScoreSource[] = [
      { sourcePath: "a", juryId: "jury-1", questionNumber: 1, pageNumber: 10, scores: { ...eightZeroFields } },
      { sourcePath: "b", juryId: "jury-1", questionNumber: 2, pageNumber: 20, scores: { ...eightZeroFields } },
      {
        sourcePath: "c",
        juryId: "jury-1",
        questionNumber: 3,
        pageNumber: 30,
        scores: { ...eightZeroFields, hifdh_judge_correction: 3 }, // voided -> 0
      },
    ];

    const compat = computeLisbonDisplayResult(participant, scoreSources, []);
    expect(compat.averagingBranch).toBe("complete");
    // All three effective questions (1, 2, 3) are scored and counted, not
    // just the two expected by A1's category config.
    expect(compat.questions.map((q) => q.questionNumber)).toEqual([1, 2, 3]);
    expect(compat.questions.map((q) => q.score)).toEqual([100, 100, 0]);
    expect(compat.oldDisplayedBase).toBe(66.67);

    // Cross-check against the actual legacy scorer over the same
    // three-key map: `fillMissingQuestionsWithPerfectScores` preserves the
    // anomalous key 3 (`{...questionScores}`), and `calculateFinalScore`'s
    // denominator is `Object.values(allScores).length` — every key.
    const legacyAllScores = {
      1: { ...eightZeroFields },
      2: { ...eightZeroFields },
      3: { ...eightZeroFields, hifdh_judge_correction: 3 },
    };
    const legacyResult = calculateFinalScore(legacyAllScores, 0);
    expect(legacyResult.percentage).toBe(66.67);
    expect(compat.oldDisplayedBase).toBe(legacyResult.percentage);
  });
});

describe("F5: duplicate logical bonus key (last-wins parity + mandatory cutover blocker)", () => {
  it("two bonus docs (1, then 5) for the same jury: blocker raised, bonusApplied uses last-wins (5), matching legacy", () => {
    const participant: LisbonParticipantInput = {
      participantId: "p-dup-bonus",
      isDone: true,
      assignedQuestions: [42],
      expectedQuestions: 1,
    };
    const scoreSources: LisbonScoreSource[] = [
      {
        sourcePath: "a",
        juryId: "jury-1",
        questionNumber: 1,
        pageNumber: 42,
        scores: { ...eightZeroFields },
      },
    ];
    // Legacy `useParticipants` builds a map from `overallBonuses` snapshot
    // docs keyed by (participantId, juryId); iterating these two docs in
    // this order and assigning into the map means the SECOND (5) is what
    // the live app actually displays, not the first (1).
    const bonusSources: LisbonBonusSource[] = [
      { juryId: "jury-1", overallBonus: 1 },
      { juryId: "jury-1", overallBonus: 5 },
    ];

    const result = computeLisbonDisplayResult(participant, scoreSources, bonusSources);

    expect(result.duplicateBonusKeys).toEqual([
      { juryId: "jury-1", overallBonuses: [1, 5] },
    ]);
    // Last-wins, not first-match: matches legacy's snapshot-overwrite
    // semantics, not `.find()`'s first-match semantics.
    expect(result.bonusApplied).toBe(5);
    expect(result.newDisplayedDiagnostic).toBe(105); // 100 base + 5 bonus, clamped to 105
  });

  it("a single bonus source per jury never raises the duplicate blocker", () => {
    const participant: LisbonParticipantInput = {
      participantId: "p-single-bonus",
      isDone: true,
      assignedQuestions: [42],
      expectedQuestions: 1,
    };
    const result = computeLisbonDisplayResult(
      participant,
      [{ sourcePath: "a", juryId: "jury-1", questionNumber: 1, pageNumber: 42, scores: { ...eightZeroFields } }],
      [{ juryId: "jury-1", overallBonus: 3 }]
    );
    expect(result.duplicateBonusKeys).toEqual([]);
    expect(result.bonusApplied).toBe(3);
  });
});
