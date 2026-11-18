import crypto from 'node:crypto';

export interface SeedQuestionBase {
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanationMd: string;
  skillId?: number;
  reviewJumpSec?: number;
  slidePage?: number;
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

export function sha256Hex(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
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

/**
 * Computes a deterministic 1024-dimensional L2-normalized semantic feature-hashing vector
 * from Vietnamese/English text so pgvector Cosine Similarity (`1 - (embedding <=> query_vec)`)
 * accurately ranks relevant knowledge chunks, courses, user goals, and quiz items.
 */
export function computeSemanticEmbedding1024(text: string, dims = 1024): number[] {
  const vec = new Float64Array(dims);
  const cleaned = (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return makeDeterministicVector(1, dims);
  }

  const tokens = cleaned.split(' ').filter((t) => t.length >= 2);
  const features: Array<{ token: string; weight: number }> = [];

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i]!;
    features.push({ token: `u:${tk}`, weight: 1.5 });
    if (i + 1 < tokens.length) {
      features.push({ token: `b:${tk}_${tokens[i + 1]!}`, weight: 2.0 });
    }
    if (tk.length >= 4) {
      for (let j = 0; j <= tk.length - 4; j++) {
        features.push({ token: `c:${tk.slice(j, j + 4)}`, weight: 0.6 });
      }
    }
  }

  for (const { token, weight } of features) {
    let h1 = 2166136261;
    let h2 = 16777619;
    for (let i = 0; i < token.length; i++) {
      const code = token.charCodeAt(i);
      h1 ^= code;
      h1 = Math.imul(h1, 16777619);
      h2 ^= code;
      h2 = Math.imul(h2, 1099511627);
    }
    const idx1 = Math.abs(h1) % dims;
    const idx2 = Math.abs(h2) % dims;
    const sign1 = (h1 & 1) === 0 ? 1 : -1;
    const sign2 = (h2 & 1) === 0 ? 1 : -1;
    vec[idx1] = (vec[idx1] ?? 0) + sign1 * weight;
    vec[idx2] = (vec[idx2] ?? 0) + sign2 * (weight * 0.5);
  }

  let normSq = 0;
  for (let i = 0; i < dims; i++) {
    normSq += vec[i]! * vec[i]!;
  }
  if (normSq === 0) {
    return makeDeterministicVector(1, dims);
  }
  const norm = Math.sqrt(normSq);
  return Array.from(vec, (v) => Number((v / norm).toFixed(6)));
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
    const jumpSec = q.reviewJumpSec ?? 180 + idx * 240;
    const endSec = jumpSec + 60;
    const slidePage = q.slidePage ?? 6 + idx * 3;
    const promptText =
      sessionOrder > 0
        ? `Câu ${idx + 1} (Buổi ${sessionOrder} - ${topicTitle}): ${q.prompt}`
        : `Câu ${idx + 1} (${topicTitle}): ${q.prompt}`;
    return {
      assessmentId,
      skillId: q.skillId ?? (idx % 2 === 0 ? primarySkillId : secondarySkillId),
      itemOrder: idx + 1,
      itemType: 'SINGLE_CHOICE' as const,
      points: '10.00',
      promptConfig: {
        number: idx + 1,
        prompt: promptText,
        options: q.options,
        slideLabel:
          sessionOrder > 0
            ? `Buổi ${sessionOrder} · Slide Trang ${slidePage}`
            : `Tổng ôn · Slide Trang ${slidePage}`,
        scenarioTag: idx % 2 === 0 ? 'Tình huống thực chiến' : 'Kiến thức cốt lõi',
      },
      gradingConfig: {
        correctIndex: q.correctIndex,
        reviewTimestampLabel: `${formatMmSs(jumpSec)} — ${formatMmSs(endSec)}`,
        reviewJumpSec: jumpSec,
        reviewSegmentRangeSec: [jumpSec, endSec],
      },
      explanationMd: q.explanationMd,
      itemEmbedding: computeSemanticEmbedding1024(`${q.prompt} ${q.explanationMd}`),
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
      const jumpSec = gCfg.reviewJumpSec ?? 120;
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
        reviewTimestampLabel: gCfg.reviewTimestampLabel ?? '02:00 — 03:00',
        reviewJumpSec: jumpSec,
        reviewSegmentRangeSec: gCfg.reviewSegmentRangeSec ?? [jumpSec, jumpSec + 60],
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
  const isPassed =
    !forceZeroScore &&
    integrityStatus !== 'FLAGGED' &&
    integrityStatus !== 'CONFIRMED_CHEAT' &&
    scorePctNum >= passScorePct;

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
  accounts?: Array<{
    id: number;
    role: string;
  }>;
  cohorts: Array<{
    id: number;
    code: string;
    status?: string;
    maxSeats?: number;
    enrolledCount: number;
    scheduleSlots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  }>;
  orders?: Array<{
    id: number;
    orderCode: string;
    accountId: number;
    cohortId: number;
    amountVnd: number;
    status: string;
    paidAt: Date | null;
  }>;
  paymentTransactions?: Array<{
    id: number;
    orderId: number | null;
    amountVnd: number;
    matchStatus: string;
  }>;
  enrollments: Array<{
    id: number;
    accountId: number;
    cohortId: number;
    orderId?: number | null;
    enrolledByAdmin?: number | null;
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
    revokedAt?: Date | null;
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
    gradingConfig?: unknown;
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

export const VALID_PROCTORING_TYPES = new Set([
  'NO_FACE',
  'MULTI_FACE',
  'FACE_MISMATCH',
  'TAB_HIDDEN',
  'FULLSCREEN_EXIT',
  'PHONE_DETECTED',
]);

function getVietnamDayOfWeek(date: Date): number {
  const ictMs = date.getTime() + 7 * 60 * 60 * 1000;
  return new Date(ictMs).getUTCDay();
}

export function findSeedConsistencyViolations(data: SeedAuditInput): string[] {
  const errors: string[] = [];
  const cohortMap = new Map(data.cohorts.map((c) => [c.id, c]));
  const sessionMap = new Map(data.sessions.map((s) => [s.id, s]));
  const assessmentMap = new Map(data.assessments.map((a) => [a.id, a]));
  const accountRoleMap = new Map((data.accounts ?? []).map((a) => [a.id, a.role]));

  // 1. Cohort enrolledCount, maxSeats & status vs session statuses
  for (const cohort of data.cohorts) {
    const actualCount = data.enrollments.filter(
      (e) => e.cohortId === cohort.id && e.status !== 'REVOKED'
    ).length;
    if (cohort.enrolledCount !== actualCount) {
      errors.push(
        `Cohort ${cohort.code} enrolledCount=${cohort.enrolledCount} does not match actual enrollments=${actualCount}`
      );
    }
    if (typeof cohort.maxSeats === 'number' && cohort.enrolledCount > cohort.maxSeats) {
      errors.push(
        `Cohort ${cohort.code} enrolledCount=${cohort.enrolledCount} exceeds maxSeats=${cohort.maxSeats}`
      );
    }

    const cSessions = data.sessions.filter((s) => s.cohortId === cohort.id);
    if (cohort.status === 'OPENING' && cSessions.some((s) => s.status === 'REPLAY_READY' || s.status === 'LIVE')) {
      errors.push(`Cohort ${cohort.code} has status=OPENING but already contains LIVE/REPLAY_READY sessions`);
    }
    if (cohort.status === 'COMPLETED' && cSessions.some((s) => s.status !== 'REPLAY_READY')) {
      errors.push(`Cohort ${cohort.code} has status=COMPLETED but not all sessions are REPLAY_READY`);
    }
  }

  // 2. Orders <-> PaymentTransactions <-> Enrollments invariants
  if (data.orders && data.paymentTransactions) {
    const orderMap = new Map(data.orders.map((o) => [o.id, o]));
    for (const order of data.orders) {
      const txns = data.paymentTransactions.filter((t) => t.orderId === order.id);
      if (order.status === 'PAID') {
        if (!order.paidAt) {
          errors.push(`Order ${order.orderCode} is PAID but paidAt=null`);
        }
        const matchedTxn = txns.find(
          (t) => t.matchStatus === 'MATCHED' && t.amountVnd >= order.amountVnd
        );
        if (!matchedTxn) {
          errors.push(`Order ${order.orderCode} is PAID without a MATCHED payment >= ${order.amountVnd}`);
        }
        const enr = data.enrollments.find(
          (e) => e.accountId === order.accountId && e.cohortId === order.cohortId
        );
        if (!enr) {
          errors.push(`Order ${order.orderCode} is PAID but missing enrollment for account ${order.accountId}`);
        }
      } else {
        const wrongEnr = data.enrollments.find((e) => e.orderId === order.id);
        if (wrongEnr) {
          errors.push(`Enrollment ${wrongEnr.id} references non-PAID order ${order.orderCode} (${order.status})`);
        }
      }
    }
    for (const enr of data.enrollments) {
      if (!enr.enrolledByAdmin && enr.orderId !== undefined) {
        const linkedOrder = enr.orderId ? orderMap.get(enr.orderId) : undefined;
        if (!linkedOrder || linkedOrder.status !== 'PAID') {
          errors.push(`Enrollment ${enr.id} has neither enrolledByAdmin nor a PAID order`);
        }
      }
    }
  }

  // 3. Session media/subtitle/progress/chunk invariants + Vietnam (UTC+7) weekday check
  for (const sess of data.sessions) {
    const cohort = cohortMap.get(sess.cohortId);
    if (cohort && sess.scheduledStart && cohort.scheduleSlots.length > 0) {
      const ictDay = getVietnamDayOfWeek(sess.scheduledStart);
      const utcDay = sess.scheduledStart.getUTCDay();
      const allowedDays = cohort.scheduleSlots.map((slot) => slot.dayOfWeek);
      if (!allowedDays.includes(ictDay) && !allowedDays.includes(utcDay)) {
        errors.push(
          `Session ${sess.id} (cohort ${cohort.code} order ${sess.sessionOrder}) scheduledStart day=${ictDay} not in scheduleSlots [${allowedDays.join(',')}]`
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

    // Verify every session_progress belongs to an enrolled student
    for (const p of sessProg) {
      const hasEnrollment = data.enrollments.some(
        (e) => e.accountId === p.accountId && e.cohortId === sess.cohortId && e.status !== 'REVOKED'
      );
      if (!hasEnrollment) {
        errors.push(
          `Session progress for account ${p.accountId} on session ${sess.id} lacks active/completed enrollment`
        );
      }
    }
  }

  // 4. Enrollment completion vs certificate consistency
  for (const enr of data.enrollments) {
    const cert = data.certificates.find((c) => c.enrollmentId === enr.id && !c.revokedAt);
    if (enr.finalExamPassed) {
      if (enr.status !== 'COMPLETED') {
        errors.push(`Enrollment ${enr.id} has finalExamPassed=true but status=${enr.status}`);
      }
      if (!enr.completedAt) {
        errors.push(`Enrollment ${enr.id} has finalExamPassed=true but completedAt=null`);
      }
      if (!cert) {
        errors.push(`Enrollment ${enr.id} has finalExamPassed=true but no active certificate`);
      } else if (enr.completedAt && cert.issuedAt.getTime() !== enr.completedAt.getTime()) {
        errors.push(
          `Enrollment ${enr.id} completedAt (${enr.completedAt.toISOString()}) !== cert.issuedAt (${cert.issuedAt.toISOString()})`
        );
      }
    } else if (cert) {
      errors.push(`Certificate ${cert.certificateCode} issued for non-passed enrollment ${enr.id}`);
    }
  }

  // 5. Assessment answer-key distribution check (when gradingConfig is provided)
  for (const ass of data.assessments) {
    const items = data.assessmentItems.filter((i) => i.assessmentId === ass.id);
    const indices = items
      .map((i) => (i.gradingConfig as { correctIndex?: number } | undefined)?.correctIndex)
      .filter((idx): idx is number => typeof idx === 'number');
    if (indices.length >= 4) {
      const uniqueIndices = new Set(indices);
      if (uniqueIndices.size < 2) {
        errors.push(
          `Assessment ${ass.id} has all ${indices.length} items using identical correctIndex=${indices[0]}`
        );
      }
    }
  }

  // 6. Final exam eligibility & attempt/answers/proctoring/skills invariants
  for (const att of data.attempts) {
    const ass = assessmentMap.get(att.assessmentId);
    if (!ass) {
      errors.push(`Attempt ${att.id} references missing assessment ${att.assessmentId}`);
      continue;
    }

    const hasEnr = data.enrollments.some(
      (e) => e.accountId === att.accountId && e.cohortId === ass.cohortId && e.status !== 'REVOKED'
    );
    if (!hasEnr) {
      errors.push(`Attempt ${att.id} by account ${att.accountId} has no enrollment in cohort ${ass.cohortId}`);
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

    const attEvents = data.proctoringEvents.filter((ev) => ev.attemptId === att.id);
    const sumRisk = attEvents.reduce((acc, ev) => acc + Number(ev.riskDelta ?? 0), 0);
    if (Math.abs(sumRisk - Number(att.totalRiskScore ?? 0)) > 0.01) {
      errors.push(
        `Attempt ${att.id} totalRiskScore=${att.totalRiskScore} !== sum(proctoring_events.riskDelta)=${sumRisk}`
      );
    }

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

  // 7. Proctoring event type validation
  for (const ev of data.proctoringEvents) {
    if (!VALID_PROCTORING_TYPES.has(ev.eventType)) {
      errors.push(`Invalid proctoring eventType "${ev.eventType}" on attempt ${ev.attemptId}`);
    }
  }

  // 8. CV updatedAt / extractedAt vs certificate issuedAt
  for (const prof of data.profiles) {
    const cv = prof.cvParsedData || {};
    const awards = Array.isArray(cv.awardsAndCerts) ? cv.awardsAndCerts : [];
    const userCerts = data.certificates.filter((c) => c.accountId === prof.accountId && !c.revokedAt);
    const updatedStr = typeof cv.updatedAt === 'string' ? cv.updatedAt : null;
    const extractedStr = typeof cv.extractedAt === 'string' ? cv.extractedAt : null;

    for (const cert of userCerts) {
      const mentioned = awards.some(
        (aw) =>
          typeof aw === 'object' &&
          aw !== null &&
          typeof (aw as { dateOrCode?: unknown }).dateOrCode === 'string' &&
          (aw as { dateOrCode: string }).dateOrCode.includes(cert.certificateCode)
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

  // 9. Interview credits accounting:
  //    Default 0 on registration, +4 per non-revoked course enrollment, -1 per COMPLETED mock interview (0 for ADMIN/INSTRUCTOR).
  for (const prof of data.profiles) {
    const role = accountRoleMap.get(prof.accountId) ?? 'STUDENT';
    if (role !== 'STUDENT') {
      if (prof.interviewCredits !== 0) {
        errors.push(`Non-student account ${prof.accountId} (${role}) must have interviewCredits=0`);
      }
      continue;
    }
    const activeOrCompletedEnrollments = data.enrollments.filter(
      (e) => e.accountId === prof.accountId && e.status !== 'REVOKED'
    ).length;
    const completedMockCount = data.mockInterviews.filter(
      (m) => m.accountId === prof.accountId && m.status === 'COMPLETED'
    ).length;
    const expectedCredits = Math.max(0, 4 * activeOrCompletedEnrollments - completedMockCount);
    if (prof.interviewCredits !== expectedCredits) {
      errors.push(
        `Account ${prof.accountId} interviewCredits=${prof.interviewCredits} !== expected ${expectedCredits} (0 base + 4*${activeOrCompletedEnrollments} enrollments - ${completedMockCount} mocks)`
      );
    }
  }

  return errors;
}
