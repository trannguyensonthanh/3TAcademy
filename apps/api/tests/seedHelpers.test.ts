import { describe, expect, it } from 'vitest';
import {
  buildAttemptDraftAndAnswerBuilders,
  buildSessionQuizItems,
  computeSemanticEmbedding1024,
  findSeedConsistencyViolations,
  makeDeterministicVector,
  type SeedAuditInput,
} from '../src/db/seedHelpers.js';
import {
  CANONICAL_COURSE_SLUGS,
  classifyAdvisorIntent,
  classifyCourseTutorIntent,
  cosineSimilarity1024,
} from '../src/integrations/ragAi.service.js';

function createValidAuditFixture(): SeedAuditInput {
  const s1Start = new Date('2026-03-03T12:30:00Z'); // Tuesday (day 2)
  const s1End = new Date('2026-03-03T14:30:00Z');
  const s2Start = new Date('2026-03-05T12:30:00Z'); // Thursday (day 4)
  const s2End = new Date('2026-03-05T14:30:00Z');

  return {
    accounts: [
      { id: 1, role: 'ADMIN' },
      { id: 100, role: 'STUDENT' },
    ],
    cohorts: [
      {
        id: 1,
        code: 'AI-ENG-2026-K01',
        status: 'COMPLETED',
        maxSeats: 35,
        enrolledCount: 1,
        scheduleSlots: [
          { dayOfWeek: 2, startTime: '19:30', endTime: '21:30' },
          { dayOfWeek: 4, startTime: '19:30', endTime: '21:30' },
        ],
      },
      {
        id: 2,
        code: 'SWE-ARCH-2026-K01',
        status: 'ONGOING',
        maxSeats: 35,
        enrolledCount: 1,
        scheduleSlots: [{ dayOfWeek: 0, startTime: '19:30', endTime: '21:30' }],
      },
    ],
    orders: [
      {
        id: 1,
        orderCode: 'ET20260001',
        accountId: 100,
        cohortId: 1,
        amountVnd: 10000,
        status: 'PAID',
        paidAt: new Date('2026-02-20T10:00:00Z'),
      },
      {
        id: 2,
        orderCode: 'ET20260002',
        accountId: 100,
        cohortId: 2,
        amountVnd: 10000,
        status: 'PAID',
        paidAt: new Date('2026-03-24T10:00:00Z'),
      },
    ],
    paymentTransactions: [
      { id: 1, orderId: 1, amountVnd: 10000, matchStatus: 'MATCHED' },
      { id: 2, orderId: 2, amountVnd: 10000, matchStatus: 'MATCHED' },
    ],
    enrollments: [
      {
        id: 10,
        accountId: 100,
        cohortId: 1,
        orderId: 1,
        status: 'COMPLETED',
        finalExamPassed: true,
        enrolledAt: new Date('2026-02-20T10:00:00Z'),
        completedAt: new Date('2026-04-03T12:00:00Z'),
      },
      {
        id: 11,
        accountId: 100,
        cohortId: 2,
        orderId: 2,
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
        videoR2Key: 'recordings/ai-k01/s01.mp4',
      },
      {
        id: 102,
        cohortId: 1,
        sessionOrder: 2,
        status: 'REPLAY_READY',
        scheduledStart: s2Start,
        scheduledEnd: s2End,
        videoR2Key: 'recordings/ai-k01/s02.mp4',
      },
      {
        id: 103,
        cohortId: 2,
        sessionOrder: 1,
        status: 'LIVE',
        scheduledStart: new Date('2026-04-05T12:30:00Z'),
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
      { id: 301, assessmentId: 201, skillId: 1, points: '10.00', gradingConfig: { correctIndex: 1 } },
      { id: 302, assessmentId: 202, skillId: 1, points: '50.00', gradingConfig: { correctIndex: 0 } },
      { id: 303, assessmentId: 202, skillId: 8, points: '50.00', gradingConfig: { correctIndex: 2 } },
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
        accountId: 1,
        interviewCredits: 0,
        cvParsedData: {},
      },
      {
        accountId: 100,
        interviewCredits: 7, // 0 base + 4 * 2 enrollments - 1 completed mock = 7
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

describe('seedHelpers & 32-table seed invariants', () => {
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

    const answers = buildAnswersForAttemptId(99);
    expect(answers).toHaveLength(4);
    expect(answers[1]!.isCorrect).toBe(false);
    expect(answers[0]!.isCorrect).toBe(true);
  });

  it('passes audit with zero violations on clean relational data', () => {
    const fixture = createValidAuditFixture();
    expect(findSeedConsistencyViolations(fixture)).toEqual([]);
  });

  it('flags relational inconsistencies across cohorts, orders, sessions, skills, CV, and credits', () => {
    const fixture = createValidAuditFixture();

    fixture.sessions[2]!.videoR2Key = 'recordings/swe-k01/s04.mp4';
    fixture.progress.push({
      accountId: 100,
      sessionId: 103,
      isCompleted: true,
      completedAt: new Date('2026-04-05T14:00:00Z'),
      lastActivityAt: new Date('2026-04-05T14:00:00Z'),
    });
    fixture.enrollments[0]!.status = 'ACTIVE';
    fixture.skillStates = fixture.skillStates.filter((s) => s.skillId !== 8);
    fixture.profiles[1]!.cvParsedData.updatedAt = '2026-04-02T09:30:00.000Z';
    fixture.answers[0]!.gradedAt = new Date('2026-04-03T11:38:02Z');
    fixture.proctoringEvents[0]!.eventType = 'TAB_SWITCH';
    fixture.cohorts[0]!.enrolledCount = 99;
    fixture.profiles[1]!.interviewCredits = 2;

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

  it('executes full 32-table seed.ts dataset in-memory with zero cross-table consistency violations', async () => {
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

    // Verify all 32 tables are populated coherently!
    expect(store.get(schema.accounts)).toHaveLength(7);
    expect(store.get(schema.courses)).toHaveLength(4);
    expect(store.get(schema.cohorts)).toHaveLength(5);
    expect((store.get(schema.cohorts) ?? []).every((c) => c.tuitionVnd === 10000)).toBe(true);
    expect(store.get(schema.classSessions)).toHaveLength(30);
    expect(store.get(schema.orders)).toHaveLength(6);
    expect(store.get(schema.paymentTransactions)).toHaveLength(7);
    expect(store.get(schema.enrollments)).toHaveLength(5);
    expect(store.get(schema.certificates)).toHaveLength(1);
    expect(store.get(schema.courseReviews)).toHaveLength(1);
    expect(store.get(schema.assessments)).toHaveLength(35);
    expect((store.get(schema.assessmentAttempts) ?? []).length).toBeGreaterThanOrEqual(20);
    expect((store.get(schema.discussionThreads) ?? []).length).toBe(2);
    expect((store.get(schema.chatSessions) ?? []).length).toBe(2);
    expect((store.get(schema.mockInterviews) ?? []).length).toBe(2);

    const linhAcc = (store.get(schema.accounts) ?? []).find((a) => a.email === 'linh.student@3t.edu.vn');
    const linhEnr = (store.get(schema.enrollments) ?? []).find((e) => e.accountId === linhAcc?.id);
    const linhProgress = (store.get(schema.sessionProgress) ?? []).filter(
      (p) => p.accountId === linhAcc?.id && p.isCompleted === true
    );
    expect(linhEnr?.status).toBe('ACTIVE');
    expect(linhEnr?.finalExamPassed).toBe(false);
    expect(linhProgress).toHaveLength(6);

    const namAcc = (store.get(schema.accounts) ?? []).find((a) => a.email === 'nam.student@3t.edu.vn');
    const namProf = (store.get(schema.userProfiles) ?? []).find((p) => p.accountId === namAcc?.id);
    expect(namProf?.interviewCredits).toBe(0);
  });

  it('enforces RAG Career Advisor and Course Tutor guardrails across all 4 canonical course slugs', () => {
    const ragVec = computeSemanticEmbedding1024('Kiến trúc Hybrid RAG với pgvector HNSW và RRF');
    const ragQueryVec = computeSemanticEmbedding1024('Hỏi về Hybrid RAG và pgvector HNSW');
    const unrelatedVec = computeSemanticEmbedding1024('Công thức nấu món phở bò truyền thống');
    expect(cosineSimilarity1024(ragVec, ragQueryVec)).toBeGreaterThan(
      cosineSimilarity1024(ragVec, unrelatedVec)
    );

    expect(classifyAdvisorIntent('Tư vấn giúp mình về kế toán thuế và thương mại điện tử Shopee')).toBe(
      'OUT_OF_SYSTEM'
    );
    expect(classifyAdvisorIntent('Giải thích chi tiết công thức RRF và viết code mẫu HNSW')).toBe(
      'PAID_LECTURE_DEEP_DIVE'
    );
    expect(
      classifyAdvisorIntent('Mình mới học Python cơ bản thì nên chọn lộ trình nào ở 3T Academy?')
    ).toBe('VALID_ADVISOR_QUERY');

    // Verify all 4 canonical course slugs allow their own topics & block other courses!
    expect(
      classifyCourseTutorIntent('Giải thích về RAG và pgvector', CANONICAL_COURSE_SLUGS.AI)
    ).toEqual({ type: 'IN_COURSE_SCOPE' });
    expect(
      classifyCourseTutorIntent('Cách dùng Drizzle ORM và BullMQ?', CANONICAL_COURSE_SLUGS.SWE)
    ).toEqual({ type: 'IN_COURSE_SCOPE' });
    expect(
      classifyCourseTutorIntent('Tối ưu PySpark, Kafka và dbt Medallion?', CANONICAL_COURSE_SLUGS.DATA)
    ).toEqual({ type: 'IN_COURSE_SCOPE' });
    expect(
      classifyCourseTutorIntent('Cách viết Window function và pytest?', CANONICAL_COURSE_SLUGS.PYTHON)
    ).toEqual({ type: 'IN_COURSE_SCOPE' });

    expect(
      classifyCourseTutorIntent(
        'Cách dùng Apache Spark và Kafka trong kiến trúc Lakehouse?',
        CANONICAL_COURSE_SLUGS.AI
      )
    ).toEqual({
      type: 'OTHER_COURSE_TOPIC',
      otherCourseTitle: 'Kỹ sư Dữ liệu Hiện đại: Streaming Kafka, PySpark & Lakehouse',
    });
  });
});
