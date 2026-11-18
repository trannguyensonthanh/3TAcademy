/**
 * Progressive Elo-IRT + Bayesian Skill Mastery Engine (`skillMasteryModel.ts`)
 *
 * Replaces naive arithmetic mean / fixed EMA with a psychometric 2PL-IRT / Elo model
 * featuring:
 * 1. Modest Bayesian Cold-Start Prior (theta_0 = 35) to prevent 100/100 score inflation on Session 1.
 * 2. Progressive Stage Weighting (W_stage: 1.0 -> 2.0 across sessions 1..S, and 3.0 on FINAL_EXAM)
 *    so later, deeper sessions and proctored final exams carry significantly greater authority.
 * 3. Item-Difficulty-Aware Asymmetric Residual Updates (y_i - P_i):
 *    - Answering a hard question correctly yields a large positive gain.
 *    - Missing a foundational/easy question yields a sharper penalty than missing an advanced edge case.
 * 4. Progressive Curriculum Coverage Ceiling:
 *    - Early sessions cap mastery around foundational/intermediate levels (~68..88).
 *    - Passing FINAL_EXAM unlocks the full [0..100] Mastery ceiling.
 */

export interface SkillItemObservation {
  isCorrect: boolean;
  points?: number;
  itemOrder?: number;
  totalItems?: number;
  hasScenarioTag?: boolean;
}

export interface ProgressiveSkillUpdateInput {
  /** Existing normalized score in [0..100], or null/undefined if no prior evidence exists */
  previousScore: number | null | undefined;
  /** Number of prior assessment evidences recorded for this (student, skill) */
  previousEvidenceCount: number;
  /** 1-based session order (1..S) for SESSION_ASSIGNMENT, or null for FINAL_EXAM */
  sessionOrder: number | null;
  /** Total sessions in the cohort (default 6) */
  totalSessionsInCohort?: number;
  /** Whether the current attempt is a cohort-wide proctored FINAL_EXAM */
  isFinalExam: boolean;
  /** Whether the student passed the current attempt */
  attemptPassed: boolean;
  /** Whether the student has already passed the cohort FINAL_EXAM previously */
  hasPassedCohortFinalExam?: boolean;
  /** Graded item outcomes belonging to this skill */
  items: SkillItemObservation[];
}

export interface ProgressiveSkillUpdateOutput {
  previousScore: number;
  newScore: number;
  delta: number;
  stageWeight: number;
  ceilingApplied: number;
  updatedEvidenceCount: number;
}

const COLD_START_PRIOR_THETA = 40;
const IRT_DISCRIMINATION_ALPHA = 0.08;
const BASE_K_FACTOR = 18;

/**
 * Computes progressive stage weight W_stage:
 * - Session 1 of 6 -> 1.00
 * - Session 6 of 6 -> 2.00
 * - FINAL_EXAM     -> 3.00
 */
export function computeStageWeight(
  sessionOrder: number | null,
  totalSessionsInCohort = 6,
  isFinalExam = false
): number {
  if (isFinalExam) {
    return 3.0;
  }
  const safeTotal = Math.max(1, totalSessionsInCohort);
  const clampedOrder = Math.min(safeTotal, Math.max(1, sessionOrder ?? 1));
  if (safeTotal === 1) {
    return 1.5;
  }
  const progressRatio = (clampedOrder - 1) / (safeTotal - 1);
  return Number((1.0 + 1.0 * progressRatio).toFixed(3));
}

/**
 * Estimates calibrated item difficulty D_i in [25, 85] from curriculum depth,
 * item points weight, relative position inside the assessment, and scenario complexity.
 */
export function estimateItemDifficulty(
  obs: SkillItemObservation,
  sessionOrder: number | null,
  totalSessionsInCohort = 6,
  isFinalExam = false
): number {
  const safeTotalSessions = Math.max(1, totalSessionsInCohort);
  const sessionDepthRatio = isFinalExam
    ? 0.9
    : (Math.min(safeTotalSessions, Math.max(1, sessionOrder ?? 1)) - 1) /
      Math.max(1, safeTotalSessions - 1);

  // Base difficulty rises from 30 (Session 1) -> 62 (Session 6) -> 68 (Final Exam)
  let difficulty = 30 + sessionDepthRatio * 32 + (isFinalExam ? 6 : 0);

  // Relative item position within the quiz/exam (+0..8)
  const totalItems = Math.max(1, obs.totalItems ?? 1);
  const itemIdx = Math.min(totalItems, Math.max(1, obs.itemOrder ?? 1));
  if (totalItems > 1) {
    difficulty += ((itemIdx - 1) / (totalItems - 1)) * 8;
  }

  // Higher point weight or real-world scenario tag increases difficulty (+4..7)
  if ((obs.points ?? 1) > 1.2) {
    difficulty += 5;
  }
  if (obs.hasScenarioTag) {
    difficulty += 4;
  }

  return Math.min(85, Math.max(25, Number(difficulty.toFixed(2))));
}

/**
 * Computes curriculum coverage ceiling so early introductory quizzes cannot inflate
 * mastery to 100/100 before advanced sessions and Final Exam are completed.
 */
export function computeCurriculumCeiling(params: {
  sessionOrder: number | null;
  totalSessionsInCohort?: number;
  isFinalExam: boolean;
  attemptPassed: boolean;
  hasPassedCohortFinalExam?: boolean;
}): number {
  if ((params.isFinalExam && params.attemptPassed) || params.hasPassedCohortFinalExam) {
    return 100;
  }
  if (params.isFinalExam && !params.attemptPassed) {
    return 88;
  }
  const safeTotal = Math.max(1, params.totalSessionsInCohort ?? 6);
  const clampedOrder = Math.min(safeTotal, Math.max(1, params.sessionOrder ?? 1));
  const depthRatio = safeTotal > 1 ? (clampedOrder - 1) / (safeTotal - 1) : 1;
  // Session 1 cap = 68, Session 2 = 72, Session 3 = 76, Session 4 = 80, Session 5 = 84, Session 6 = 88
  return Math.min(88, Math.round(68 + depthRatio * 20));
}

export function computeProgressiveSkillMastery(
  input: ProgressiveSkillUpdateInput
): ProgressiveSkillUpdateOutput {
  const totalSessions = Math.max(1, input.totalSessionsInCohort ?? 6);
  const hasPrior =
    typeof input.previousScore === 'number' &&
    Number.isFinite(input.previousScore) &&
    input.previousEvidenceCount > 0;

  const displayedPreviousScore = hasPrior
    ? Math.min(100, Math.max(0, Math.round(input.previousScore!)))
    : 0;

  // Latent ability starts at Bayesian prior (35) on first observation
  let theta = hasPrior ? displayedPreviousScore : COLD_START_PRIOR_THETA;

  const stageWeight = computeStageWeight(
    input.sessionOrder,
    totalSessions,
    input.isFinalExam
  );

  // Dampen step size gently with evidence count, but amplify by stageWeight so late sessions dominate!
  const evidenceDamping = 1 / (1 + 0.06 * Math.min(12, Math.max(0, input.previousEvidenceCount)));
  const itemsCount = Math.max(1, input.items.length);
  const effectiveK = (BASE_K_FACTOR * stageWeight * evidenceDamping) / Math.sqrt(itemsCount);

  for (let i = 0; i < input.items.length; i += 1) {
    const item = input.items[i]!;
    const d_i = estimateItemDifficulty(
      {
        ...item,
        itemOrder: item.itemOrder ?? i + 1,
        totalItems: item.totalItems ?? itemsCount,
      },
      input.sessionOrder,
      totalSessions,
      input.isFinalExam
    );

    const expectedProb = 1 / (1 + Math.exp(-IRT_DISCRIMINATION_ALPHA * (theta - d_i)));
    const actualOutcome = item.isCorrect ? 1 : 0;
    const residual = actualOutcome - expectedProb;

    // Asymmetric penalty/reward: missing an easy item (expectedProb > 0.7) carries 1.15x weight
    const asymmetryFactor = !item.isCorrect && expectedProb > 0.7 ? 1.15 : 1.0;
    theta += effectiveK * asymmetryFactor * residual;
  }

  // Blend in stage-weighted empirical performance anchor when stageWeight >= 1.8 (late sessions / Final Exam)
  // so a student who improved dramatically in late sessions is not held back by early low scores!
  const correctRatio =
    input.items.filter((it) => it.isCorrect).length / Math.max(1, input.items.length);
  if (stageWeight >= 1.8 && correctRatio >= 0.8) {
    const targetAnchor = 55 + correctRatio * 42;
    const pullAlpha = input.isFinalExam ? 0.42 : 0.25;
    theta = theta * (1 - pullAlpha) + targetAnchor * pullAlpha;
  }

  const ceiling = computeCurriculumCeiling({
    sessionOrder: input.sessionOrder,
    totalSessionsInCohort: totalSessions,
    isFinalExam: input.isFinalExam,
    attemptPassed: input.attemptPassed,
    hasPassedCohortFinalExam: input.hasPassedCohortFinalExam,
  });

  // Never drop an already-higher score purely due to ceiling if they already unlocked a higher score earlier
  const effectiveCeiling = hasPrior ? Math.max(ceiling, displayedPreviousScore) : ceiling;
  const boundedNewScore = Math.min(
    effectiveCeiling,
    Math.max(8, Math.round(theta))
  );
  const delta = boundedNewScore - displayedPreviousScore;

  return {
    previousScore: displayedPreviousScore,
    newScore: boundedNewScore,
    delta,
    stageWeight,
    ceilingApplied: effectiveCeiling,
    updatedEvidenceCount: Math.max(0, input.previousEvidenceCount) + input.items.length,
  };
}

/**
 * Stage-weighted average score across multiple assessment attempts in a cohort.
 * Later sessions (1.0x -> 2.0x) and FINAL_EXAM (3.0x) weigh more than early introductory quizzes.
 */
export function computeWeightedCohortScorePct(
  attempts: Array<{
    scorePct: number;
    sessionOrder?: number | null;
    isFinalExam?: boolean;
  }>,
  totalSessionsInCohort = 6
): number {
  if (attempts.length === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const att of attempts) {
    const w = computeStageWeight(
      att.sessionOrder ?? null,
      totalSessionsInCohort,
      Boolean(att.isFinalExam)
    );
    weightedSum += att.scorePct * w;
    weightTotal += w;
  }
  return weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;
}
