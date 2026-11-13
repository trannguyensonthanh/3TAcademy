import { describe, expect, it } from 'vitest';
import {
  buildAttemptDraftAndAnswerBuilders,
  buildSessionQuizItems,
  findSeedConsistencyViolations,
  makeDeterministicVector,
  type SeedAuditInput,
} from '../src/db/seedHelpers.js';

function createValidAuditFixture(): SeedAuditInput {
  const s1Start = new Date('2026-03-03T12:30:00Z'); // Tuesday (day 2)
  const s1End = new Date('2026-03-03T14:30:00Z');
  const s2Start = new Date('2026-03-05T12:30:00Z'); // Thursday (day 4)
  const s2End = new Date('2026-03-05T14:30:00Z');

  return {
    cohorts: [
      {
        id: 1,
        code: 'AI-ENG-2026-K01',
        enrolledCount: 1,
        scheduleSlots: [
          { dayOfWeek: 2, startTime: '19:30', endTime: '21:30' },
          { dayOfWeek: 4, startTime: '19:30', endTime: '21:30' },
        ],
      },
      {
        id: 2,
        code: 'SWE-ARCH-2026-K01',
        enrolledCount: 1,
        scheduleSlots: [{ dayOfWeek: 0, startTime: '19:30', endTime: '21:30' }],
      },
    ],
    enrollments: [
      {
        id: 10,
        accountId: 100,
        cohortId: 1,
        status: 'COMPLETED',
        finalExamPassed: true,
        enrolledAt: new Date('2026-02-20T10:00:00Z'),
        completedAt: new Date('2026-04-03T12:00:00Z'),
      },
      {
        id: 11,
        accountId: 100,
        cohortId: 2,
        status: 'ACTIVE',
        finalExamPassed: false,
        enrolledAt: new Date('2026-03-24T10:00:00Z'),
        completedAt: null,
      },
    ],
    certificates: [
      {
        enrollmentId: 10,
        accountId: 100,
        certificateCode: 'CERT-3T-2026-8891',
        issuedAt: new Date('2026-04-03T12:00:00Z'),
      },
    ],
    sessions: [
      {
        id: 101,
        cohortId: 1,
        sessionOrder: 1,
        status: 'REPLAY_READY',
        scheduledStart: s1Start,
        scheduledEnd: s1End,
        videoR2Key: 'recordings/ai-k01/s01/master.m3u8',
      },
      {
        id: 102,
        cohortId: 1,
        sessionOrder: 2,
        status: 'REPLAY_READY',
        scheduledStart: s2Start,
        scheduledEnd: s2End,
        videoR2Key: 'recordings/ai-k01/s02/master.m3u8',
      },
      {
        id: 103,
        cohortId: 2,
        sessionOrder: 1,
        status: 'LIVE',
        scheduledStart: new Date('2026-04-05T12:30:00Z'), // Sunday (day 0)
        scheduledEnd: new Date('2026-04-05T14:30:00Z'),
        videoR2Key: null,
      },
    ],
    subtitles: [{ sessionId: 101 }, { sessionId: 102 }],
    progress: [
      {
        accountId: 100,
        sessionId: 101,
        isCompleted: true,
        completedAt: new Date('2026-03-03T15:00:00Z'),
        lastActivityAt: new Date('2026-03-03T15:00:00Z'),
      },
      {
        accountId: 100,
        sessionId: 102,
        isCompleted: true,
        completedAt: new Date('2026-03-05T15:00:00Z'),
        lastActivityAt: new Date('2026-03-05T15:00:00Z'),
      },
    ],
    assessments: [
      { id: 201, cohortId: 1, sessionId: 101, purpose: 'SESSION_ASSIGNMENT', passScorePct: 70 },
      { id: 202, cohortId: 1, sessionId: null, purpose: 'FINAL_EXAM', passScorePct: 70 },
    ],
    assessmentItems: [
      { id: 301, assessmentId: 201, skillId: 1, points: '10.00' },
      { id: 302, assessmentId: 202, skillId: 1, points: '50.00' },
      { id: 303, assessmentId: 202, skillId: 8, points: '50.00' }, // e.g., LANGGRAPH_AGENT
    ],
    attempts: [
      {
        id: 401,
        assessmentId: 201,
        accountId: 100,
        totalScore: '10.00',
        scorePct: '100.00',
        isPassed: true,
        integrityStatus: 'CLEAN',
        totalRiskScore: '0.00',
        startedAt: new Date('2026-03-03T15:05:00Z'),
        gradingCompletedAt: new Date('2026-03-03T15:15:01Z'),
      },
      {
        id: 402,
        assessmentId: 202,
        accountId: 100,
        totalScore: '100.00',
        scorePct: '100.00',
        isPassed: true,
        integrityStatus: 'CLEARED_BY_INSTRUCTOR',
        totalRiskScore: '20.00',
        startedAt: new Date('2026-04-03T11:00:00Z'),
        gradingCompletedAt: new Date('2026-04-03T11:38:02Z'),
      },
    ],
    answers: [
      {
        attemptId: 401,
        itemId: 301,
        finalScore: '10.00',
        gradedAt: new Date('2026-03-03T15:15:01Z'),
      },
      {
        attemptId: 402,
        itemId: 302,
        finalScore: '50.00',
        gradedAt: new Date('2026-04-03T11:38:02Z'),
      },
      {
        attemptId: 402,
        itemId: 303,
        finalScore: '50.00',
        gradedAt: new Date('2026-04-03T11:38:02Z'),
      },
    ],
    proctoringEvents: [
      {
        attemptId: 402,
        eventType: 'TAB_HIDDEN',
        riskDelta: '20.00',
        occurredAt: new Date('2026-04-03T11:14:20Z'),
      },
    ],
    knowledgeChunks: [
      { sessionId: 101, sourceType: 'VIDEO_TRANSCRIPT' },
      { sessionId: 102, sourceType: 'VIDEO_TRANSCRIPT' },
    ],
    profiles: [
      {
        accountId: 100,
        interviewCredits: 5, // 2 base + 4*1 cert - 1 completed mock
        cvParsedData: {
          updatedAt: '2026-04-03T13:30:00.000Z',
          extractedAt: '2026-04-03T13:30:00.000Z',
          awardsAndCerts: [{ dateOrCode: '04/2026 · CERT-3T-2026-8891' }],
        },
      },
    ],
    mockInterviews: [
      {
        accountId: 100,
        status: 'COMPLETED',
        createdAt: new Date('2026-04-03T13:58:00Z'),
        completedAt: new Date('2026-04-03T14:03:30Z'),
      },
    ],
    skillStates: [
      { accountId: 100, skillId: 1 },
      { accountId: 100, skillId: 8 },
    ],
  };
}

describe('seedHelpers', () => {
  it('generates unit-normalized deterministic vectors', () => {
    const v1 = makeDeterministicVector(42, 1024);
    const v2 = makeDeterministicVector(42, 1024);
    expect(v1).toHaveLength(1024);
    expect(v1).toEqual(v2);

    const norm = Math.sqrt(v1.reduce((acc, x) => acc + x * x, 0));
    expect(norm).toBeCloseTo(1, 3);
  });

  it('builds consistent attempt drafts, remedial recommendations, and submission answers', () => {
    const items = buildSessionQuizItems(10, 4, 'Function Calling', 3, 8, [
      {
        prompt: 'Q1',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 1,
        explanationMd: 'Exp 1',
      },
      {
        prompt: 'Q2',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
        explanationMd: 'Exp 2',
      },
      {
        prompt: 'Q3',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 2,
        explanationMd: 'Exp 3',
      },
      {
        prompt: 'Q4',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 3,
        explanationMd: 'Exp 4',
      },
    ]).map((item, idx) => ({ ...item, id: 500 + idx }));

    const skillNamesById = new Map([
      [3, 'Function Calling & Agentic Workflows'],
      [8, 'Multi-Agent Orchestration & Memory'],
    ]);
    const gradedAt = new Date('2026-03-12T15:32:01Z');

    const { attemptRow, buildAnswersForAttemptId } = buildAttemptDraftAndAnswerBuilders({
      assessmentId: 10,
      accountId: 7,
      items,
      wrongIndices: [1],
      startedAt: new Date('2026-03-12T15:20:00Z'),
      submittedAt: new Date('2026-03-12T15:32:00Z'),
      gradingCompletedAt: gradedAt,
      skillNamesById,
    });

    expect(attemptRow.totalScore).toBe('30.00');
    expect(attemptRow.maxPossibleScore).toBe('40.00');
    expect(attemptRow.scorePct).toBe('75.00');
    expect(attemptRow.isPassed).toBe(true);
    expect(attemptRow.remedialRecommendations).toHaveLength(1);
    expect(attemptRow.remedialRecommendations[0]).toMatchObject({
      number: 2,
      skillId: 8,
      skillName: 'Multi-Agent Orchestration & Memory',
      correctIndex: 0,
    });

    const answers = buildAnswersForAttemptId(99);
    expect(answers).toHaveLength(4);
    expect(answers.every((a) => a.attemptId === 99 && a.gradedAt.getTime() === gradedAt.getTime())).toBe(true);
    expect(answers[1]!.isCorrect).toBe(false);
    expect(answers[1]!.finalScore).toBe('0.00');
    expect(answers[0]!.isCorrect).toBe(true);
    expect(answers[0]!.finalScore).toBe('10.00');
  });

  it('passes audit with zero violations on clean relational data', () => {
    const fixture = createValidAuditFixture();
    expect(findSeedConsistencyViolations(fixture)).toEqual([]);
  });

  it('flags scheduled/live sessions with recordings or progress, active completed enrollments, missing skills, outdated CV, and mismatched gradedAt', () => {
    const fixture = createValidAuditFixture();

    // Bug 1 & 3: LIVE session with videoR2Key + progress
    fixture.sessions[2]!.videoR2Key = 'recordings/swe-k01/s04/master.m3u8';
    fixture.progress.push({
      accountId: 100,
      sessionId: 103,
      isCompleted: true,
      completedAt: new Date('2026-04-05T14:00:00Z'),
      lastActivityAt: new Date('2026-04-05T14:00:00Z'),
    });

    // Bug 2: finalExamPassed=true yet status='ACTIVE'
    fixture.enrollments[0]!.status = 'ACTIVE';

    // Bug 4: missing skill 8 (LANGGRAPH_AGENT)
    fixture.skillStates = fixture.skillStates.filter((s) => s.skillId !== 8);

    // Bug 5: CV timestamp older than certificate issuedAt
    fixture.profiles[0]!.cvParsedData.updatedAt = '2026-04-02T09:30:00.000Z';

    // Bug 6: hardcoded wrong gradedAt & missing answer
    fixture.answers[0]!.gradedAt = new Date('2026-04-03T11:38:02Z');

    // Extra: invalid proctoring type + mismatched enrolledCount + wrong interviewCredits
    fixture.proctoringEvents[0]!.eventType = 'TAB_SWITCH';
    fixture.cohorts[0]!.enrolledCount = 99;
    fixture.profiles[0]!.interviewCredits = 2;

    const violations = findSeedConsistencyViolations(fixture);
    expect(violations.some((v) => v.includes('must have videoR2Key=null'))).toBe(true);
    expect(violations.some((v) => v.includes('must have 0 session_progress rows'))).toBe(true);
    expect(violations.some((v) => v.includes('finalExamPassed=true but status=ACTIVE'))).toBe(true);
    expect(violations.some((v) => v.includes('missing from student_skill_states'))).toBe(true);
    expect(violations.some((v) => v.includes('cvParsedData.updatedAt'))).toBe(true);
    expect(violations.some((v) => v.includes('gradedAt mismatch'))).toBe(true);
    expect(violations.some((v) => v.includes('Invalid proctoring eventType'))).toBe(true);
    expect(violations.some((v) => v.includes('enrolledCount=99'))).toBe(true);
    expect(violations.some((v) => v.includes('interviewCredits=2'))).toBe(true);
  });

  it('executes full seed.ts dataset in-memory with zero cross-table consistency violations', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
    process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'test-internal-api-key-123456';
    process.env.JWT_ACCESS_SECRET =
      process.env.JWT_ACCESS_SECRET || 'test-jwt-access-secret-key-32-chars-min';
    process.env.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-key-32-chars-min';

    const store = new Map<unknown, Array<Record<string, unknown>>>();
    const idCounters = new Map<unknown, number>();

    const mockDb = {
      execute: async () => ({ rows: [] }),
      insert: (table: unknown) => ({
        values: (rows: Array<Record<string, unknown>>) => {
          const current = store.get(table) ?? [];
          let nextId = idCounters.get(table) ?? 1;
          const inserted = rows.map((row) => ({
            id: nextId++,
            ...row,
          }));
          idCounters.set(table, nextId);
          store.set(table, [...current, ...inserted]);
          return {
            returning: async () => inserted,
            then: (resolve: (val: unknown) => void) => resolve(inserted),
          };
        },
      }),
      select: () => ({
        from: async (table: unknown) => store.get(table) ?? [],
      }),
    };

    const { runSeed } = await import('../src/db/seed.js');
    const schema = await import('../src/db/schema/index.js');

    await expect(runSeed(mockDb as never)).resolves.toBeUndefined();

    const accountsRows = store.get(schema.accounts) ?? [];
    const anAcc = accountsRows.find((a) => a.email === 'an.student@3t.edu.vn');
    expect(anAcc).toBeDefined();

    const enrollmentsRows = store.get(schema.enrollments) ?? [];
    const cohortsRows = store.get(schema.cohorts) ?? [];
    const aiK01 = cohortsRows.find((c) => c.code === 'AI-ENG-2026-K01');
    const sweK01 = cohortsRows.find((c) => c.code === 'SWE-ARCH-2026-K01');
    expect(aiK01).toBeDefined();
    expect(sweK01).toBeDefined();

    const anAiEnrollment = enrollmentsRows.find(
      (e) => e.accountId === anAcc!.id && e.cohortId === aiK01!.id
    );
    expect(anAiEnrollment?.status).toBe('COMPLETED');
    expect(anAiEnrollment?.finalExamPassed).toBe(true);

    const anSweEnrollment = enrollmentsRows.find(
      (e) => e.accountId === anAcc!.id && e.cohortId === sweK01!.id
    );
    expect(anSweEnrollment?.status).toBe('ACTIVE');

    const skillStatesRows = store.get(schema.studentSkillStates) ?? [];
    const skillsRows = store.get(schema.skills) ?? [];
    const langGraphSkill = skillsRows.find((s) => s.code === 'LANGGRAPH_AGENT');
    expect(langGraphSkill).toBeDefined();
    const anHasLangGraph = skillStatesRows.some(
      (st) => st.accountId === anAcc!.id && st.skillId === langGraphSkill!.id
    );
    expect(anHasLangGraph).toBe(true);

    const sessionsRows = store.get(schema.classSessions) ?? [];
    expect(sessionsRows).toHaveLength(24);
  });
});
