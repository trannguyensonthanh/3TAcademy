import { describe, expect, it } from 'vitest';
import {
  computeProgressiveSkillMastery,
  computeStageWeight,
  computeWeightedCohortScorePct,
} from '../src/modules/assessment/skillMasteryModel.js';

describe('Progressive Elo-IRT + Bayesian Skill Mastery Engine', () => {
  it('increases stage weights progressively from Session 1 (1.0) to Session 6 (2.0) and Final Exam (3.0)', () => {
    expect(computeStageWeight(1, 6, false)).toBe(1.0);
    expect(computeStageWeight(3, 6, false)).toBeCloseTo(1.4, 2);
    expect(computeStageWeight(6, 6, false)).toBe(2.0);
    expect(computeStageWeight(null, 6, true)).toBe(3.0);
  });

  it('prevents cold-start 100/100 score inflation on Session 1 introductory quiz', () => {
    const s1Result = computeProgressiveSkillMastery({
      previousScore: null,
      previousEvidenceCount: 0,
      sessionOrder: 1,
      totalSessionsInCohort: 6,
      isFinalExam: false,
      attemptPassed: true,
      items: [
        { isCorrect: true, points: 1, itemOrder: 1, totalItems: 4 },
        { isCorrect: true, points: 1, itemOrder: 2, totalItems: 4 },
        { isCorrect: true, points: 1, itemOrder: 3, totalItems: 4 },
        { isCorrect: true, points: 1, itemOrder: 4, totalItems: 4 },
      ],
    });

    expect(s1Result.previousScore).toBe(0);
    expect(s1Result.newScore).toBeGreaterThanOrEqual(50);
    expect(s1Result.newScore).toBeLessThanOrEqual(68);
  });

  it('rewards late-course improvement strongly and unlocks >90 mastery after passing Final Exam', () => {
    // Student struggles in Session 1 (1/4 correct)
    let state = computeProgressiveSkillMastery({
      previousScore: null,
      previousEvidenceCount: 0,
      sessionOrder: 1,
      totalSessionsInCohort: 6,
      isFinalExam: false,
      attemptPassed: false,
      items: [
        { isCorrect: true },
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: false },
      ],
    });
    const lowStartScore = state.newScore;
    expect(lowStartScore).toBeLessThan(40);

    // Student improves steadily across Sessions 2..6 (4/4 correct each)
    for (let s = 2; s <= 6; s += 1) {
      state = computeProgressiveSkillMastery({
        previousScore: state.newScore,
        previousEvidenceCount: state.updatedEvidenceCount,
        sessionOrder: s,
        totalSessionsInCohort: 6,
        isFinalExam: false,
        attemptPassed: true,
        items: [
          { isCorrect: true, hasScenarioTag: s >= 4 },
          { isCorrect: true, hasScenarioTag: s >= 4 },
          { isCorrect: true, points: 1.5, hasScenarioTag: true },
          { isCorrect: true, points: 1.5, hasScenarioTag: true },
        ],
      });
    }
    expect(state.newScore).toBeGreaterThanOrEqual(75);
    expect(state.newScore).toBeLessThanOrEqual(88);

    // Student excels on proctored FINAL_EXAM -> unlocks > 88 Mastery
    const finalState = computeProgressiveSkillMastery({
      previousScore: state.newScore,
      previousEvidenceCount: state.updatedEvidenceCount,
      sessionOrder: null,
      totalSessionsInCohort: 6,
      isFinalExam: true,
      attemptPassed: true,
      items: Array.from({ length: 8 }, (_, idx) => ({
        isCorrect: true,
        points: 2,
        itemOrder: idx + 1,
        totalItems: 8,
        hasScenarioTag: true,
      })),
    });
    expect(finalState.newScore).toBeGreaterThan(state.newScore);
    expect(finalState.newScore).toBeGreaterThanOrEqual(90);
  });

  it('penalizes missing easy foundational items more sharply than missing advanced items at high ability', () => {
    const missEasy = computeProgressiveSkillMastery({
      previousScore: 78,
      previousEvidenceCount: 8,
      sessionOrder: 1,
      totalSessionsInCohort: 6,
      isFinalExam: false,
      attemptPassed: false,
      items: [{ isCorrect: false, points: 1, itemOrder: 1, totalItems: 4 }],
    });

    const missHard = computeProgressiveSkillMastery({
      previousScore: 78,
      previousEvidenceCount: 8,
      sessionOrder: 6,
      totalSessionsInCohort: 6,
      isFinalExam: false,
      attemptPassed: false,
      items: [{ isCorrect: false, points: 2, itemOrder: 4, totalItems: 4, hasScenarioTag: true }],
    });

    // Note: stageWeight is higher on Session 6, so let's compare same-session easy vs hard item!
    const sameSessionMissEasy = computeProgressiveSkillMastery({
      previousScore: 78,
      previousEvidenceCount: 8,
      sessionOrder: 4,
      totalSessionsInCohort: 6,
      isFinalExam: false,
      attemptPassed: false,
      items: [{ isCorrect: false, points: 1, itemOrder: 1, totalItems: 10, hasScenarioTag: false }],
    });
    const sameSessionMissHard = computeProgressiveSkillMastery({
      previousScore: 78,
      previousEvidenceCount: 8,
      sessionOrder: 4,
      totalSessionsInCohort: 6,
      isFinalExam: false,
      attemptPassed: false,
      items: [{ isCorrect: false, points: 2, itemOrder: 10, totalItems: 10, hasScenarioTag: true }],
    });

    expect(sameSessionMissEasy.delta).toBeLessThanOrEqual(sameSessionMissHard.delta);
    expect(missEasy.newScore).toBeLessThan(78);
    expect(missHard.newScore).toBeLessThan(78);
  });

  it('computes stage-weighted cohort score favoring late sessions and Final Exam over Session 1', () => {
    const weighted = computeWeightedCohortScorePct(
      [
        { scorePct: 50, sessionOrder: 1, isFinalExam: false }, // weight 1.0
        { scorePct: 90, sessionOrder: 6, isFinalExam: false }, // weight 2.0
        { scorePct: 95, sessionOrder: null, isFinalExam: true }, // weight 3.0
      ],
      6
    );
    // Flat average would be (50 + 90 + 95)/3 = 78; stage-weighted is (50*1 + 90*2 + 95*3)/6 = 86!
    expect(weighted).toBe(86);
  });
});
