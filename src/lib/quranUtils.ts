/**
 * Build-time-only helper for AUTHORING config page ranges (e.g. when hand
 * writing a new event's category `questionSlots` in a seed/provisioning
 * script). Per docs/migrations/phase-1-greenfield.md §3, this map must never
 * be read at scoring or randomization time — those are driven entirely by
 * the event's `EventEvaluationConfigV2.categories[...].questionSlots`
 * page ranges via the committed engine.
 */
export const juzToPageMap: Record<number, { start: number; end: number }> = {
  1: { start: 3, end: 21 },
  2: { start: 22, end: 41 },
  2.5: { start: 42, end: 53 },
  3: { start: 42, end: 61 },
  4: { start: 62, end: 81 },
  5: { start: 82, end: 101 },
  6: { start: 102, end: 121 },
  7: { start: 122, end: 141 },
  8: { start: 142, end: 161 },
  9: { start: 162, end: 181 },
  10: { start: 182, end: 201 },
  11: { start: 202, end: 221 },
  12: { start: 222, end: 241 },
  13: { start: 242, end: 261 },
  14: { start: 262, end: 281 },
  15: { start: 282, end: 301 },
  16: { start: 302, end: 321 },
  17: { start: 322, end: 341 },
  18: { start: 342, end: 361 },
  19: { start: 362, end: 381 },
  20: { start: 382, end: 401 },
  21: { start: 402, end: 421 },
  22: { start: 422, end: 441 },
  23: { start: 442, end: 461 },
  24: { start: 462, end: 481 },
  25: { start: 482, end: 501 },
  26: { start: 502, end: 521 },
  27: { start: 522, end: 541 },
  28: { start: 542, end: 561 },
  29: { start: 562, end: 581 },
  30: { start: 582, end: 596 },
};
