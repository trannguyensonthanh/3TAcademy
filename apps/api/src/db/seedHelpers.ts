export interface SeedQuestionBase {
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanationMd: string;
  skillId?: number;
}

export interface BuiltQuizItemInput {
  assessmentId: number;
  skillId: number;
  itemOrder: number;
  itemType: 'SINGLE_CHOICE';
  points: string;
  promptConfig: {
    number: number;
    prompt: string;
    options: [string, string, string, string];
    slideLabel: string;
    scenarioTag: string;
  };
  gradingConfig: {
    correctIndex: number;
    reviewTimestampLabel: string;
    reviewJumpSec: number;
    reviewSegmentRangeSec: [number, number];
  };
  explanationMd: string;
  itemEmbedding: number[];
}

export interface InsertedItemLike {
  id: number;
  assessmentId: number;
  skillId: number;
  itemOrder: number;
  points: string | number;
  promptConfig: unknown;
  gradingConfig: unknown;
  explanationMd: string | null;
}

export interface AttemptSeedSpec {
  assessmentId: number;
  accountId: number;
  attemptNumber?: number;
  items: InsertedItemLike[];
  wrongIndices: number[];
  passScorePct?: number;
  forceZeroScore?: boolean;
  totalRiskScore?: string;
  integrityStatus?: 'CLEAN' | 'FLAGGED' | 'CONFIRMED_CHEAT' | 'CLEARED_BY_INSTRUCTOR';
  verdictNote?: string;
  verdictBy?: number;
  verdictAt?: Date;
  startedAt: Date;
  submittedAt: Date;
  gradingCompletedAt: Date;
  skillNamesById?: Map<number, string>;
}

export function makeDeterministicVector(seedNum: number, dims: number): number[] {
  const vec: number[] = [];
  let normSq = 0;
  for (let i = 0; i < dims; i++) {
    const val = Math.sin(seedNum * 17.31 + i * 0.73) * Math.cos(seedNum * 3.17 - i * 0.29);
    vec.push(val);
    normSq += val * val;
  }
  const norm = Math.sqrt(normSq) || 1;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

function formatMmSs(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function buildSessionQuizItems(
  assessmentId: number,
  sessionOrder: number,
  topicTitle: string,
  primarySkillId: number,
  secondarySkillId: number,
  baseQuestions: SeedQuestionBase[]
): BuiltQuizItemInput[] {
  return baseQuestions.map((q, idx) => {
    const jumpSec = 180 + idx * 240;
    const endSec = jumpSec + 45;
    return {
      assessmentId,
      skillId: q.skillId ?? (idx % 2 === 0 ? primarySkillId : secondarySkillId),
      itemOrder: idx + 1,
      itemType: 'SINGLE_CHOICE' as const,
      points: '10.00',
      promptConfig: {
        number: idx + 1,
        prompt: `Câu ${idx + 1} (Buổi ${sessionOrder} - ${topicTitle}): ${q.prompt}`,
        options: q.options,
        slideLabel: `Buổi ${sessionOrder} · Slide Trang ${6 + idx * 2}`,
        scenarioTag: idx % 3 === 0 ? 'Tình huống thực chiến' : 'Kiến thức cốt lõi',
      },
      gradingConfig: {
        correctIndex: q.correctIndex,
        reviewTimestampLabel: `${formatMmSs(jumpSec)} — ${formatMmSs(endSec)}`,
        reviewJumpSec: jumpSec,
        reviewSegmentRangeSec: [jumpSec, endSec],
      },
      explanationMd: q.explanationMd,
      itemEmbedding: makeDeterministicVector(assessmentId * 100 + idx, 1024),
    };
  });
}

export function buildAttemptDraftAndAnswerBuilders(spec: AttemptSeedSpec) {
  const {
    assessmentId,
    accountId,
    attemptNumber = 1,
    items,
    wrongIndices,
    passScorePct = 70,
    forceZeroScore = false,
    totalRiskScore = '0.00',
    integrityStatus = 'CLEAN',
    verdictNote,
    verdictBy,
    verdictAt,
    startedAt,
    submittedAt,
    gradingCompletedAt,
    skillNamesById,
  } = spec;

  const wrongSet = new Set(wrongIndices);
  let totalScoreNum = 0;
  let maxPossibleScoreNum = 0;
  const wrongItems: Array<Record<string, unknown>> = [];

  const answerDrafts = items.map((item, idx) => {
    const pCfg = (item.promptConfig || {}) as {
      number?: number;
      prompt?: string;
      options?: string[];
      slideLabel?: string;
    };
    const gCfg = (item.gradingConfig || {}) as {
      correctIndex?: number;
      reviewTimestampLabel?: string;
      reviewJumpSec?: number;
      reviewSegmentRangeSec?: [number, number];
    };
    const correctIdx = gCfg.correctIndex ?? 0;
    const options = Array.isArray(pCfg.options) ? pCfg.options : [];
    const maxPts = Number(item.points) || 0;
    maxPossibleScoreNum += maxPts;

    const isWrong = forceZeroScore || wrongSet.has(idx);
    const chosenIndex = isWrong ? (correctIdx + 1) % 4 : correctIdx;
    const ptsEarned = isWrong ? 0 : maxPts;
    totalScoreNum += ptsEarned;

    if (isWrong && !forceZeroScore) {
      const jumpSec = gCfg.reviewJumpSec ?? 10;
      wrongItems.push({
        id: String(item.id),
        number: pCfg.number ?? item.itemOrder ?? idx + 1,
        skillId: item.skillId,
        skillName: skillNamesById?.get(item.skillId) ?? '',
        prompt: pCfg.prompt ?? '',
        options,
        chosenIndex,
        chosenOptionText: options[chosenIndex] ?? 'Chưa chọn đáp án',
        correctIndex: correctIdx,
        correctOptionText: options[correctIdx] ?? '',
        explanation: item.explanationMd ?? '',
        reviewTimestampLabel: gCfg.reviewTimestampLabel ?? '00:10 — 00:25',
        reviewJumpSec: jumpSec,
        reviewSegmentRangeSec: gCfg.reviewSegmentRangeSec ?? [jumpSec, jumpSec + 15],
        slideLabel: pCfg.slideLabel ?? '',
      });
    }

    return {
      itemId: item.id,
      responseData: { selectedIndex: chosenIndex },
      gradingStatus: 'AUTO_GRADED' as const,
      autoScore: ptsEarned.toFixed(2),
      finalScore: ptsEarned.toFixed(2),
      isCorrect: !isWrong,
      feedbackMd: item.explanationMd,
      gradedAt: gradingCompletedAt,
    };
  });

  const scorePctNum =
    forceZeroScore || maxPossibleScoreNum <= 0
      ? 0
      : Math.round((totalScoreNum / maxPossibleScoreNum) * 100);
  const isPassed = !forceZeroScore && integrityStatus !== 'FLAGGED' && integrityStatus !== 'CONFIRMED_CHEAT' && scorePctNum >= passScorePct;

  const attemptRow = {
    assessmentId,
    accountId,
    attemptNumber,
    startedAt,
    submittedAt,
    gradingCompletedAt,
    totalScore: totalScoreNum.toFixed(2),
    maxPossibleScore: maxPossibleScoreNum.toFixed(2),
    scorePct: scorePctNum.toFixed(2),
    isPassed,
    remedialRecommendations: wrongItems,
    totalRiskScore,
    integrityStatus,
    verdictNote: verdictNote ?? null,
    verdictBy: verdictBy ?? null,
    verdictAt: verdictAt ?? null,
  };

  return {
    attemptRow,
    buildAnswersForAttemptId: (attemptId: number) =>
      answerDrafts.map((ans) => ({
        attemptId,
        ...ans,
      })),
  };
}

export interface SeedAuditInput {
  cohorts: Array<{
    id: number;
    code: string;
    enrolledCount: number;
    scheduleSlots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  }>;
  enrollments: Array<{
    id: number;
    accountId: number;
    cohortId: number;
    status: string;
    finalExamPassed: boolean;
    enrolledAt: Date;
    completedAt: Date | null;
  }>;
  certificates: Array<{
    enrollmentId: number;
    accountId: number;
    certificateCode: string;
    issuedAt: Date;
  }>;
  sessions: Array<{
    id: number;
    cohortId: number;
    sessionOrder: number;
    status: string;
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
    videoR2Key: string | null;
  }>;
  subtitles: Array<{ sessionId: number }>;
  progress: Array<{
    accountId: number;
    sessionId: number;
    isCompleted: boolean;
    completedAt: Date | null;
    lastActivityAt: Date;
  }>;
  assessments: Array<{
    id: number;
    cohortId: number;
    sessionId: number | null;
    purpose: string;
    passScorePct: number;
  }>;
  assessmentItems: Array<{
    id: number;
    assessmentId: number;
    skillId: number;
    points: string | number;
  }>;
  attempts: Array<{
    id: number;
    assessmentId: number;
    accountId: number;
    totalScore: string | null;
    scorePct: string | null;
    isPassed: boolean | null;
    integrityStatus: string;
    totalRiskScore: string | null;
    startedAt: Date;
    gradingCompletedAt: Date | null;
  }>;
  answers: Array<{
    attemptId: number;
    itemId: number;
    finalScore: string | null;
    gradedAt: Date | null;
  }>;
  proctoringEvents: Array<{
    attemptId: number;
    eventType: string;
    riskDelta: string | number;
    occurredAt: Date;
  }>;
  knowledgeChunks: Array<{
    sessionId: number | null;
    sourceType: string;
  }>;
  profiles: Array<{
    accountId: number;
    interviewCredits: number;
    cvParsedData: Record<string, unknown>;
  }>;
  mockInterviews: Array<{
    accountId: number;
    status: string;
    createdAt: Date;
    completedAt: Date | null;
  }>;
  skillStates: Array<{
    accountId: number;
    skillId: number;
  }>;
}

const VALID_PROCTORING_TYPES = new Set([
  'NO_FACE',
  'MULTI_FACE',
  'FACE_MISMATCH',
  'TAB_HIDDEN',
  'FULLSCREEN_EXIT',
]);

export function findSeedConsistencyViolations(data: SeedAuditInput): string[] {
  const errors: string[] = [];
  const cohortMap = new Map(data.cohorts.map((c) => [c.id, c]));
  const sessionMap = new Map(data.sessions.map((s) => [s.id, s]));
  const assessmentMap = new Map(data.assessments.map((a) => [a.id, a]));

  // 1. Cohort enrolledCount vs active/completed enrollments
  for (const cohort of data.cohorts) {
    const actualCount = data.enrollments.filter(
      (e) => e.cohortId === cohort.id && e.status !== 'REVOKED'
    ).length;
    if (cohort.enrolledCount !== actualCount) {
      errors.push(
        `Cohort ${cohort.code} enrolledCount=${cohort.enrolledCount} does not match actual enrollments=${actualCount}`
      );
    }
  }

  // 2. Session media/subtitle/progress/chunk invariants + weekday check
  for (const sess of data.sessions) {
    const cohort = cohortMap.get(sess.cohortId);
    if (cohort && sess.scheduledStart && cohort.scheduleSlots.length > 0) {
      const utcDay = sess.scheduledStart.getUTCDay();
      const allowedDays = cohort.scheduleSlots.map((slot) => slot.dayOfWeek);
      if (!allowedDays.includes(utcDay)) {
        errors.push(
          `Session ${sess.id} (cohort ${cohort.code} order ${sess.sessionOrder}) scheduledStart day=${utcDay} not in scheduleSlots [${allowedDays.join(',')}]`
        );
      }
    }

    const sessSubs = data.subtitles.filter((sub) => sub.sessionId === sess.id);
    const sessProg = data.progress.filter((p) => p.sessionId === sess.id);
    const sessQuizzes = data.assessments.filter((a) => a.sessionId === sess.id);
    const sessAttempts = data.attempts.filter((att) =>
      sessQuizzes.some((q) => q.id === att.assessmentId)
    );
    const sessVideoChunks = data.knowledgeChunks.filter(
      (ch) => ch.sessionId === sess.id && ch.sourceType === 'VIDEO_TRANSCRIPT'
    );

    if (sess.status === 'SCHEDULED' || sess.status === 'LIVE') {
      if (sess.videoR2Key !== null) {
        errors.push(`Session ${sess.id} (${sess.status}) must have videoR2Key=null`);
      }
      if (sessSubs.length > 0) {
        errors.push(`Session ${sess.id} (${sess.status}) must have 0 subtitles`);
      }
      if (sessProg.length > 0) {
        errors.push(`Session ${sess.id} (${sess.status}) must have 0 session_progress rows`);
      }
      if (sessAttempts.length > 0) {
        errors.push(`Session ${sess.id} (${sess.status}) must have 0 assessment_attempts rows`);
      }
      if (sessVideoChunks.length > 0) {
        errors.push(`Session ${sess.id} (${sess.status}) must have 0 VIDEO_TRANSCRIPT chunks`);
      }
    } else if (sess.status === 'REPLAY_READY') {
      if (!sess.videoR2Key) {
        errors.push(`Session ${sess.id} (REPLAY_READY) is missing videoR2Key`);
      }
      if (sessSubs.length === 0) {
        errors.push(`Session ${sess.id} (REPLAY_READY) is missing session_subtitles`);
      }
    }
  }

  // 3. Enrollment completion vs certificate consistency
  for (const enr of data.enrollments) {
    const cert = data.certificates.find((c) => c.enrollmentId === enr.id);
    if (enr.finalExamPassed) {
      if (enr.status !== 'COMPLETED') {
        errors.push(`Enrollment ${enr.id} has finalExamPassed=true but status=${enr.status}`);
      }
      if (!enr.completedAt) {
        errors.push(`Enrollment ${enr.id} has finalExamPassed=true but completedAt=null`);
      }
      if (!cert) {
        errors.push(`Enrollment ${enr.id} has finalExamPassed=true but no certificate`);
      } else if (enr.completedAt && cert.issuedAt.getTime() !== enr.completedAt.getTime()) {
        errors.push(
          `Enrollment ${enr.id} completedAt (${enr.completedAt.toISOString()}) !== cert.issuedAt (${cert.issuedAt.toISOString()})`
        );
      }
    } else if (cert) {
      errors.push(`Certificate ${cert.certificateCode} issued for non-passed enrollment ${enr.id}`);
    }
  }

  // 4. Final exam eligibility & timeline check
  for (const att of data.attempts) {
    const ass = assessmentMap.get(att.assessmentId);
    if (!ass) {
      errors.push(`Attempt ${att.id} references missing assessment ${att.assessmentId}`);
      continue;
    }

    const items = data.assessmentItems.filter((i) => i.assessmentId === ass.id);
    const ans = data.answers.filter((a) => a.attemptId === att.id);
    if (ans.length !== items.length) {
      errors.push(
        `Attempt ${att.id} has ${ans.length} submission_answers but assessment ${ass.id} has ${items.length} items`
      );
    }

    const sumAnsScore = ans.reduce((acc, a) => acc + Number(a.finalScore ?? 0), 0);
    if (Math.abs(sumAnsScore - Number(att.totalScore ?? 0)) > 0.01) {
      errors.push(
        `Attempt ${att.id} totalScore=${att.totalScore} !== sum(submission_answers.finalScore)=${sumAnsScore}`
      );
    }

    if (att.gradingCompletedAt) {
      for (const a of ans) {
        if (!a.gradedAt || a.gradedAt.getTime() !== att.gradingCompletedAt.getTime()) {
          errors.push(
            `Attempt ${att.id} submission_answer gradedAt mismatch vs attempt.gradingCompletedAt`
          );
          break;
        }
      }
    }

    // Proctoring risk delta check
    const attEvents = data.proctoringEvents.filter((ev) => ev.attemptId === att.id);
    const sumRisk = attEvents.reduce((acc, ev) => acc + Number(ev.riskDelta ?? 0), 0);
    if (Math.abs(sumRisk - Number(att.totalRiskScore ?? 0)) > 0.01) {
      errors.push(
        `Attempt ${att.id} totalRiskScore=${att.totalRiskScore} !== sum(proctoring_events.riskDelta)=${sumRisk}`
      );
    }

    // Skill coverage check
    const skillSet = new Set(
      data.skillStates.filter((s) => s.accountId === att.accountId).map((s) => s.skillId)
    );
    for (const item of items) {
      if (!skillSet.has(item.skillId)) {
        errors.push(
          `Account ${att.accountId} attempted item ${item.id} (skill ${item.skillId}) missing from student_skill_states`
        );
      }
    }

    if (ass.purpose === 'FINAL_EXAM') {
      const cohortSessions = data.sessions.filter((s) => s.cohortId === ass.cohortId);
      for (const cs of cohortSessions) {
        if (cs.status !== 'REPLAY_READY') {
          errors.push(
            `Final exam attempt ${att.id} exists while cohort session ${cs.id} has status=${cs.status}`
          );
        }
        if (cs.scheduledEnd && att.startedAt.getTime() <= cs.scheduledEnd.getTime()) {
          errors.push(
            `Final exam attempt ${att.id} startedAt (${att.startedAt.toISOString()}) <= session ${cs.id} scheduledEnd (${cs.scheduledEnd.toISOString()})`
          );
        }
        const prog = data.progress.find(
          (p) => p.accountId === att.accountId && p.sessionId === cs.id && p.isCompleted
        );
        if (!prog) {
          errors.push(
            `Account ${att.accountId} attempted FINAL_EXAM ${ass.id} without completing session ${cs.id}`
          );
        }
      }
    } else if (ass.sessionId) {
      const sess = sessionMap.get(ass.sessionId);
      if (sess?.scheduledStart && att.startedAt.getTime() < sess.scheduledStart.getTime()) {
        errors.push(
          `Session quiz attempt ${att.id} startedAt (${att.startedAt.toISOString()}) before session scheduledStart`
        );
      }
    }
  }

  // 5. Proctoring event type validation
  for (const ev of data.proctoringEvents) {
    if (!VALID_PROCTORING_TYPES.has(ev.eventType)) {
      errors.push(`Invalid proctoring eventType "${ev.eventType}" on attempt ${ev.attemptId}`);
    }
  }

  // 6. CV updatedAt / extractedAt vs certificate issuedAt
  for (const prof of data.profiles) {
    const cv = prof.cvParsedData || {};
    const awards = Array.isArray(cv.awardsAndCerts) ? cv.awardsAndCerts : [];
    const userCerts = data.certificates.filter((c) => c.accountId === prof.accountId);
    const updatedStr = typeof cv.updatedAt === 'string' ? cv.updatedAt : null;
    const extractedStr = typeof cv.extractedAt === 'string' ? cv.extractedAt : null;

    for (const cert of userCerts) {
      const mentioned = awards.some(
        (aw) =>
          typeof aw === 'object' &&
          aw !== null &&
          typeof (aw as { dateOrCode?: unknown }).dateOrCode === 'string' &&
          ((aw as { dateOrCode: string }).dateOrCode.includes(cert.certificateCode))
      );
      if (mentioned) {
        if (updatedStr && new Date(updatedStr).getTime() < cert.issuedAt.getTime()) {
          errors.push(
            `Account ${prof.accountId} cvParsedData.updatedAt (${updatedStr}) precedes listed certificate ${cert.certificateCode} issuedAt (${cert.issuedAt.toISOString()})`
          );
        }
        if (extractedStr && new Date(extractedStr).getTime() < cert.issuedAt.getTime()) {
          errors.push(
            `Account ${prof.accountId} cvParsedData.extractedAt (${extractedStr}) precedes listed certificate ${cert.certificateCode} issuedAt (${cert.issuedAt.toISOString()})`
          );
        }
      }
    }
  }

  // 7. Interview credits accounting for students
  const enrolledAccountIds = new Set(data.enrollments.map((e) => e.accountId));
  for (const prof of data.profiles) {
    if (!enrolledAccountIds.has(prof.accountId)) continue;
    const certsCount = data.certificates.filter((c) => c.accountId === prof.accountId).length;
    const completedMockCount = data.mockInterviews.filter(
      (m) => m.accountId === prof.accountId && m.status === 'COMPLETED'
    ).length;
    const expectedCredits = 2 + 4 * certsCount - completedMockCount;
    if (prof.interviewCredits !== expectedCredits) {
      errors.push(
        `Account ${prof.accountId} interviewCredits=${prof.interviewCredits} !== expected ${expectedCredits} (2 base + 4*${certsCount} certs - ${completedMockCount} mocks)`
      );
    }
  }

  return errors;
}
