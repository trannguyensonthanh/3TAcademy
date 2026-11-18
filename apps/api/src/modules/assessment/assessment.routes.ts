import { Router } from 'express';
import { eq, and, asc, desc, inArray } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../../db/index.js';
import {
  assessments,
  assessmentItems,
  assessmentAttempts,
  submissionAnswers,
  proctoringEvents,
  studentSkillStates,
  skills,
  sessionProgress,
  classSessions,
  cohorts,
  enrollments,
  certificates,
  userProfiles,
  notifications,
} from '../../db/schema/index.js';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { env } from '../../config/env.js';
import {
  resolveAssessment,
  normalizeMasteryScore,
  toDbMasteryScore,
} from '../../db/helpers.js';
import { computeProgressiveSkillMastery } from './skillMasteryModel.js';

export const assessmentRouter = Router();

interface PromptConfigShape {
  number?: number;
  scenarioTag?: string;
  prompt?: string;
  question?: string;
  options?: string[];
  slideLabel?: string;
}

interface GradingConfigShape {
  correctIndex?: number;
  correct_option_id?: string;
  reviewTimestampLabel?: string;
  reviewJumpSec?: number;
  reviewSegmentRangeSec?: [number, number];
}

function resolveCorrectOptionIndex(gCfg: GradingConfigShape): number {
  if (typeof gCfg.correctIndex === 'number' && gCfg.correctIndex >= 0) {
    return gCfg.correctIndex;
  }
  if (typeof gCfg.correct_option_id === 'string') {
    const idx = ['A', 'B', 'C', 'D'].indexOf(gCfg.correct_option_id.trim().toUpperCase());
    if (idx >= 0) return idx;
  }
  return 0;
}

type NormalizedProctoringType =
  | 'NO_FACE'
  | 'MULTI_FACE'
  | 'FACE_MISMATCH'
  | 'TAB_HIDDEN'
  | 'FULLSCREEN_EXIT'
  | 'PHONE_DETECTED';

function classifyIncomingProctoringEvent(
  rawType: string,
  details?: Record<string, unknown>
): { benign: true } | { benign: false; eventType: NormalizedProctoringType; riskDelta: number } {
  const upper = (rawType || '').trim().toUpperCase();

  // Benign heartbeat / camera ready events must NEVER add risk!
  if (
    upper === 'CAMERA_NORMAL' ||
    upper === 'FACE_VERIFIED' ||
    upper === 'HEARTBEAT' ||
    upper === 'WEBCAM_READY'
  ) {
    return { benign: true };
  }

  const canonicalRisk: Record<NormalizedProctoringType, number> = {
    FACE_MISMATCH: 50,
    PHONE_DETECTED: 45,
    MULTI_FACE: 40,
    TAB_HIDDEN: 20,
    FULLSCREEN_EXIT: 15,
    NO_FACE: 15,
  };

  if (upper in canonicalRisk) {
    const et = upper as NormalizedProctoringType;
    return { benign: false, eventType: et, riskDelta: canonicalRisk[et] };
  }

  if (upper.includes('PHONE')) {
    return { benign: false, eventType: 'PHONE_DETECTED', riskDelta: 45 };
  }
  if (upper.includes('MULTI_FACE') || details?.faceCount && Number(details.faceCount) > 1) {
    return { benign: false, eventType: 'MULTI_FACE', riskDelta: 35 };
  }
  if (upper.includes('MISMATCH')) {
    return { benign: false, eventType: 'FACE_MISMATCH', riskDelta: 50 };
  }
  if (upper.includes('LOOK_AWAY') || upper.includes('NO_FACE')) {
    return { benign: false, eventType: 'NO_FACE', riskDelta: 15 };
  }
  if (upper.includes('FULLSCREEN')) {
    return { benign: false, eventType: 'FULLSCREEN_EXIT', riskDelta: 15 };
  }

  return { benign: false, eventType: 'TAB_HIDDEN', riskDelta: 20 };
}

async function verifyAssessmentAccess(params: {
  assessment: typeof assessments.$inferSelect;
  userId: number;
  userRole: string;
}) {
  const { assessment, userId, userRole } = params;

  if (userRole === 'ADMIN') {
    return { enrollment: undefined, allCohortSessionsCompleted: true };
  }

  if (userRole === 'INSTRUCTOR') {
    const [cohort] = await db
      .select()
      .from(cohorts)
      .where(eq(cohorts.id, assessment.cohortId))
      .limit(1);
    if (!cohort || cohort.instructorId !== userId) {
      throw Object.assign(
        new Error('Bạn không phụ trách giảng dạy đợt học của bài kiểm tra này'),
        { statusCode: 403, code: 'FORBIDDEN_NOT_COHORT_INSTRUCTOR' }
      );
    }
    return { enrollment: undefined, allCohortSessionsCompleted: true };
  }

  const [enrollment] = await db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.accountId, userId),
        eq(enrollments.cohortId, assessment.cohortId),
        inArray(enrollments.status, ['ACTIVE', 'COMPLETED'])
      )
    )
    .limit(1);

  if (!enrollment) {
    throw Object.assign(
      new Error('Bạn cần ghi danh vào đợt học này trước khi thực hiện bài kiểm tra.'),
      { statusCode: 403, code: 'FORBIDDEN_NOT_ENROLLED' }
    );
  }

  const cohortSessionRows = await db
    .select({ id: classSessions.id })
    .from(classSessions)
    .where(eq(classSessions.cohortId, assessment.cohortId));

  let allCohortSessionsCompleted = true;
  if (cohortSessionRows.length > 0) {
    const progressRows = await db
      .select()
      .from(sessionProgress)
      .where(
        and(
          eq(sessionProgress.accountId, userId),
          inArray(
            sessionProgress.sessionId,
            cohortSessionRows.map((s) => s.id)
          )
        )
      );
    const completedSet = new Set(
      progressRows.filter((p) => p.isCompleted).map((p) => p.sessionId)
    );
    allCohortSessionsCompleted = cohortSessionRows.every((s) => completedSet.has(s.id));
  }

  return { enrollment, allCohortSessionsCompleted };
}

async function getOrCreateOpenAttempt(params: {
  assessment: typeof assessments.$inferSelect;
  accountId: number;
}) {
  const { assessment, accountId } = params;
  const existingAttempts = await db
    .select()
    .from(assessmentAttempts)
    .where(
      and(
        eq(assessmentAttempts.assessmentId, assessment.id),
        eq(assessmentAttempts.accountId, accountId)
      )
    )
    .orderBy(desc(assessmentAttempts.startedAt));

  const openAttempt = existingAttempts.find((a) => a.submittedAt === null);
  if (openAttempt) return openAttempt;

  const now = new Date();
  const durationMin =
    assessment.durationMinutes || (assessment.purpose === 'FINAL_EXAM' ? 45 : 15);
  const expiresAt = new Date(now.getTime() + durationMin * 60 * 1000);
  const nextAttemptNumber = existingAttempts.length + 1;

  const [created] = await db
    .insert(assessmentAttempts)
    .values({
      assessmentId: assessment.id,
      accountId,
      attemptNumber: nextAttemptNumber,
      startedAt: now,
      expiresAt,
      submittedAt: null,
      totalRiskScore: '0.00',
      integrityStatus: 'CLEAN',
    })
    .returning();

  return created!;
}

/**
 * Unified assessment grading engine used by BOTH `/assessments/:id/submit`
 * and `/sessions/:sessionId/quiz-submit`.
 */
export async function gradeAndRecordAssessmentSubmission(params: {
  assessment: typeof assessments.$inferSelect;
  accountId: number;
  userRole: string;
  rawAnswers: unknown;
}) {
  const { assessment, accountId, userRole, rawAnswers } = params;
  const isFinalExam = assessment.purpose === 'FINAL_EXAM';

  const { enrollment, allCohortSessionsCompleted } = await verifyAssessmentAccess({
    assessment,
    userId: accountId,
    userRole,
  });

  if (assessment.status === 'DRAFT' && userRole === 'STUDENT') {
    throw Object.assign(
      new Error('Đề kiểm tra này đang ở trạng thái Nháp, chưa mở nộp bài.'),
      { statusCode: 403, code: 'ASSESSMENT_DRAFT_LOCKED' }
    );
  }

  if (isFinalExam && userRole === 'STUDENT') {
    if (enrollment?.finalExamPassed) {
      throw Object.assign(
        new Error(
          'Bạn đã vượt qua Kỳ Thi Cuối Khóa này. Hệ thống đã khóa làm lại để bảo toàn kết quả cấp chứng chỉ.'
        ),
        { statusCode: 409, code: 'FINAL_EXAM_ALREADY_PASSED' }
      );
    }
    if (!allCohortSessionsCompleted) {
      throw Object.assign(
        new Error(
          'Bạn cần hoàn thành đầy đủ tất cả các buổi học (đạt Quiz từng buổi) trước khi nộp bài Thi cuối khóa.'
        ),
        { statusCode: 403, code: 'FINAL_EXAM_PREREQUISITES_INCOMPLETE' }
      );
    }
  }

  const [items, allSkills, priorAttempts, cohortSessions] = await Promise.all([
    db
      .select()
      .from(assessmentItems)
      .where(eq(assessmentItems.assessmentId, assessment.id))
      .orderBy(asc(assessmentItems.itemOrder)),
    db.select().from(skills),
    db
      .select()
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.assessmentId, assessment.id),
          eq(assessmentAttempts.accountId, accountId)
        )
      )
      .orderBy(desc(assessmentAttempts.startedAt)),
    db
      .select()
      .from(classSessions)
      .where(eq(classSessions.cohortId, assessment.cohortId)),
  ]);

  const totalSessionsInCohort = cohortSessions.length || 6;
  const currentSessionOrder = assessment.sessionId
    ? cohortSessions.find((s) => s.id === assessment.sessionId)?.sessionOrder ?? 1
    : null;

  // Enforce maxAttempts on submitted non-retake-cleared attempts
  const submittedCount = priorAttempts.filter(
    (a) => a.submittedAt !== null && a.integrityStatus !== 'CONFIRMED_CHEAT'
  ).length;
  if (
    userRole === 'STUDENT' &&
    assessment.maxAttempts &&
    assessment.maxAttempts > 0 &&
    submittedCount >= assessment.maxAttempts &&
    !priorAttempts.some((a) => a.isPassed)
  ) {
    // Allow session quizzes to be retaken until passed, enforce strict cap on FINAL_EXAM
    if (isFinalExam) {
      throw Object.assign(
        new Error(
          `Bạn đã sử dụng hết tối đa ${assessment.maxAttempts} lượt thi cuối khóa cho phép.`
        ),
        { statusCode: 409, code: 'MAX_ATTEMPTS_EXCEEDED' }
      );
    }
  }

  const skillMap = new Map(allSkills.map((s) => [s.id, s]));

  let totalScore = 0;
  let maxPossibleScore = 0;
  let correctCount = 0;
  const selectedAnswersRecord: Record<number, number> = {};
  const selectedIndices: number[] = [];

  const gradedAnswers: Array<{
    itemId: number;
    skillId: number;
    itemOrder: number;
    hasScenarioTag: boolean;
    selectedIndex: number;
    correctIndex: number;
    isCorrect: boolean;
    pointsEarned: number;
    maxPoints: number;
    explanationMd: string | null;
  }> = [];

  const wrongItems: Array<{
    id: string;
    number: number;
    skillId: number;
    skillName: string;
    prompt: string;
    options: string[];
    chosenIndex: number;
    chosenOptionText: string;
    correctIndex: number;
    correctOptionText: string;
    explanation: string;
    reviewTimestampLabel: string;
    reviewJumpSec: number;
    reviewSegmentRangeSec: [number, number];
    slideLabel: string;
  }> = [];

  items.forEach((item, idx) => {
    const maxPts = Number(item.points) || 1;
    maxPossibleScore += maxPts;

    const pCfg = (item.promptConfig || {}) as PromptConfigShape;
    const gCfg = (item.gradingConfig || {}) as GradingConfigShape;
    const qNumber = pCfg.number ?? item.itemOrder ?? idx + 1;
    const correctIdx = resolveCorrectOptionIndex(gCfg);
    const options = Array.isArray(pCfg.options) ? pCfg.options : [];
    const sk = skillMap.get(item.skillId);

    let chosenIndex = -1;
    if (Array.isArray(rawAnswers)) {
      const firstElem = rawAnswers[0];
      if (typeof firstElem === 'number') {
        chosenIndex = typeof rawAnswers[idx] === 'number' ? (rawAnswers[idx] as number) : -1;
      } else {
        const objArr = rawAnswers as Array<Record<string, unknown>>;
        const userAns =
          objArr.find(
            (a) =>
              (a.itemId !== undefined && String(a.itemId) === String(item.id)) ||
              a.questionNumber === qNumber ||
              a.itemOrder === qNumber
          ) || objArr[idx];
        if (userAns) {
          if (typeof userAns.selectedIndex === 'number') chosenIndex = userAns.selectedIndex;
          else if (typeof userAns.selectedIdx === 'number') chosenIndex = userAns.selectedIdx;
          else if (typeof userAns.chosenIndex === 'number') chosenIndex = userAns.chosenIndex;
          else if (typeof userAns.selectedOptionId === 'string') {
            chosenIndex = ['A', 'B', 'C', 'D'].indexOf(
              userAns.selectedOptionId.trim().toUpperCase()
            );
          }
        }
      }
    } else if (rawAnswers && typeof rawAnswers === 'object') {
      const recordAns = rawAnswers as Record<string, number | string>;
      const val =
        recordAns[String(item.id)] ??
        recordAns[String(qNumber)] ??
        recordAns[String(idx)];
      if (typeof val === 'number') {
        chosenIndex = val;
      } else if (typeof val === 'string') {
        const letterIdx = ['A', 'B', 'C', 'D'].indexOf(val.trim().toUpperCase());
        chosenIndex = letterIdx >= 0 ? letterIdx : Number(val);
      }
    }

    if (Number.isNaN(chosenIndex)) chosenIndex = -1;

    selectedAnswersRecord[qNumber] = chosenIndex;
    selectedIndices.push(chosenIndex);

    const isCorrect = chosenIndex === correctIdx;
    const pointsEarned = isCorrect ? maxPts : 0;

    if (isCorrect) {
      totalScore += pointsEarned;
      correctCount += 1;
    } else {
      const jumpSec = gCfg.reviewJumpSec ?? 180;
      wrongItems.push({
        id: String(item.id),
        number: qNumber,
        skillId: item.skillId,
        skillName: sk?.name || '',
        prompt: pCfg.prompt || pCfg.question || '',
        options,
        chosenIndex,
        chosenOptionText:
          chosenIndex >= 0 && options[chosenIndex]
            ? options[chosenIndex]!
            : 'Chưa chọn đáp án',
        correctIndex: correctIdx,
        correctOptionText: options[correctIdx] || '',
        explanation: item.explanationMd || '',
        reviewTimestampLabel: gCfg.reviewTimestampLabel || '03:00 — 04:00',
        reviewJumpSec: jumpSec,
        reviewSegmentRangeSec: gCfg.reviewSegmentRangeSec || [jumpSec, jumpSec + 60],
        slideLabel: pCfg.slideLabel || '',
      });
    }

    gradedAnswers.push({
      itemId: item.id,
      skillId: item.skillId,
      itemOrder: qNumber,
      hasScenarioTag: Boolean(pCfg.scenarioTag),
      selectedIndex: chosenIndex,
      correctIndex: correctIdx,
      isCorrect,
      pointsEarned,
      maxPoints: maxPts,
      explanationMd: item.explanationMd,
    });
  });

  const scorePercent =
    maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0;
  const scoreOutOf10 = Number((scorePercent / 10).toFixed(1));
  const now = new Date();

  const openAttempt = priorAttempts.find((a) => a.submittedAt === null);
  const effectiveIntegrityStatus = openAttempt?.integrityStatus ?? 'CLEAN';
  const effectiveRiskScore = openAttempt?.totalRiskScore ?? '0.00';

  // If proctoring flagged the exam (`FLAGGED` or `CONFIRMED_CHEAT`), hold `isPassed = false` pending instructor review!
  const isIntegrityBlocked =
    isFinalExam &&
    (effectiveIntegrityStatus === 'FLAGGED' || effectiveIntegrityStatus === 'CONFIRMED_CHEAT');
  const isPassed = !isIntegrityBlocked && scorePercent >= assessment.passScorePct;

  let issuedCertificateCode: string | undefined;
  const bonusInterviewCreditsAdded = 0;
  let updatedInterviewCredits: number | undefined;

  const updatedSkills: Array<{
    skillId: string;
    code: string;
    name: string;
    skillName: string;
    previousScore: number;
    newScore: number;
    delta: string;
  }> = [];

  const attempt = await db.transaction(async (tx) => {
    let savedAttempt: typeof assessmentAttempts.$inferSelect;

    if (openAttempt) {
      const [updatedAtt] = await tx
        .update(assessmentAttempts)
        .set({
          submittedAt: now,
          gradingCompletedAt: now,
          totalScore: totalScore.toFixed(2),
          maxPossibleScore: maxPossibleScore.toFixed(2),
          scorePct: scorePercent.toFixed(2),
          isPassed,
          remedialRecommendations: wrongItems,
          totalRiskScore: effectiveRiskScore,
          integrityStatus: effectiveIntegrityStatus,
        })
        .where(eq(assessmentAttempts.id, openAttempt.id))
        .returning();
      savedAttempt = updatedAtt!;

      await tx
        .delete(submissionAnswers)
        .where(eq(submissionAnswers.attemptId, savedAttempt.id));
    } else {
      const [newAttempt] = await tx
        .insert(assessmentAttempts)
        .values({
          assessmentId: assessment.id,
          accountId,
          attemptNumber: priorAttempts.length + 1,
          startedAt: now,
          submittedAt: now,
          gradingCompletedAt: now,
          totalScore: totalScore.toFixed(2),
          maxPossibleScore: maxPossibleScore.toFixed(2),
          scorePct: scorePercent.toFixed(2),
          isPassed,
          remedialRecommendations: wrongItems,
          totalRiskScore: effectiveRiskScore,
          integrityStatus: effectiveIntegrityStatus,
        })
        .returning();
      savedAttempt = newAttempt!;
    }

    if (gradedAnswers.length > 0) {
      await tx.insert(submissionAnswers).values(
        gradedAnswers.map((ans) => ({
          attemptId: savedAttempt.id,
          itemId: ans.itemId,
          responseData: { selectedIndex: ans.selectedIndex },
          gradingStatus: 'AUTO_GRADED' as const,
          autoScore: ans.pointsEarned.toFixed(2),
          finalScore: ans.pointsEarned.toFixed(2),
          isCorrect: ans.isCorrect,
          feedbackMd: ans.explanationMd,
          gradedAt: now,
        }))
      );
    }

    const uniqueSkillIds = [...new Set(gradedAnswers.map((a) => a.skillId))];
    for (const skId of uniqueSkillIds) {
      const skItems = gradedAnswers.filter((a) => a.skillId === skId);
      const sk = skillMap.get(skId);

      const [existingState] = await tx
        .select()
        .from(studentSkillStates)
        .where(
          and(
            eq(studentSkillStates.accountId, accountId),
            eq(studentSkillStates.skillId, skId)
          )
        )
        .limit(1);

      const priorNormalized = existingState
        ? normalizeMasteryScore(existingState.masteryScore)
        : null;

      const masteryUpdate = computeProgressiveSkillMastery({
        previousScore: priorNormalized,
        previousEvidenceCount: existingState?.evidenceCount ?? 0,
        sessionOrder: currentSessionOrder,
        totalSessionsInCohort,
        isFinalExam,
        attemptPassed: isPassed,
        hasPassedCohortFinalExam: Boolean(enrollment?.finalExamPassed),
        items: skItems.map((ans) => ({
          isCorrect: ans.isCorrect,
          points: ans.maxPoints,
          itemOrder: ans.itemOrder,
          totalItems: gradedAnswers.length,
          hasScenarioTag: ans.hasScenarioTag,
        })),
      });

      const prevScore = masteryUpdate.previousScore;
      const newScore = masteryUpdate.newScore;
      const diff = masteryUpdate.delta;

      await tx
        .insert(studentSkillStates)
        .values({
          accountId,
          skillId: skId,
          masteryScore: toDbMasteryScore(newScore),
          evidenceCount: masteryUpdate.updatedEvidenceCount,
          trend: Number(diff.toFixed(2)),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [studentSkillStates.accountId, studentSkillStates.skillId],
          set: {
            masteryScore: toDbMasteryScore(newScore),
            evidenceCount: masteryUpdate.updatedEvidenceCount,
            trend: Number(diff.toFixed(2)),
            updatedAt: now,
          },
        });

      updatedSkills.push({
        skillId: String(skId),
        code: sk?.code || String(skId),
        name: sk?.name || '',
        skillName: sk?.name || '',
        previousScore: prevScore,
        newScore,
        delta: diff >= 0 ? `+${diff} điểm` : `${diff} điểm`,
      });
    }

    if (assessment.sessionId && isPassed) {
      await tx
        .insert(sessionProgress)
        .values({
          accountId,
          sessionId: assessment.sessionId,
          lastPositionSec: 0,
          maxWatchedSec: 0,
          isCompleted: true,
          completedAt: now,
          lastActivityAt: now,
        })
        .onConflictDoUpdate({
          target: [sessionProgress.accountId, sessionProgress.sessionId],
          set: {
            isCompleted: true,
            completedAt: now,
            lastActivityAt: now,
          },
        });
    }

    if (isFinalExam && isPassed && enrollment) {
      await tx
        .update(enrollments)
        .set({
          finalExamPassed: true,
          status: 'COMPLETED',
          completedAt: now,
        })
        .where(eq(enrollments.id, enrollment.id));

      const [existingCert] = await tx
        .select()
        .from(certificates)
        .where(eq(certificates.enrollmentId, enrollment.id))
        .limit(1);

      if (existingCert && !existingCert.revokedAt) {
        issuedCertificateCode = existingCert.certificateCode;
      } else {
        const certCode =
          existingCert?.certificateCode ||
          `3T-CERT-${now.getFullYear()}-${enrollment.id}-${accountId}`;
        const hmacSig = crypto
          .createHmac('sha256', env.HMAC_CERTIFICATE_SECRET)
          .update(`${enrollment.id}:${accountId}:${certCode}`)
          .digest('hex');

        if (existingCert) {
          await tx
            .update(certificates)
            .set({
              hmacSignature: hmacSig,
              issuedAt: now,
              revokedAt: null,
              revokeReason: null,
            })
            .where(eq(certificates.id, existingCert.id));
        } else {
          await tx.insert(certificates).values({
            enrollmentId: enrollment.id,
            accountId,
            certificateCode: certCode,
            hmacSignature: hmacSig,
            issuedAt: now,
          });
        }
        issuedCertificateCode = certCode;

        await tx.insert(notifications).values({
          recipientId: accountId,
          type: 'CERTIFICATE_ISSUED',
          title: 'Chúc mừng bạn đã nhận Chứng chỉ tốt nghiệp!',
          body: `Hệ thống đã cấp chứng chỉ số ${certCode} xác thực chữ ký HMAC-SHA256.`,
          metadata: { certificateCode: certCode, cohortId: assessment.cohortId },
        });
      }
    }

    const [prof] = await tx
      .select({ interviewCredits: userProfiles.interviewCredits })
      .from(userProfiles)
      .where(eq(userProfiles.accountId, accountId))
      .limit(1);
    updatedInterviewCredits = prof?.interviewCredits ?? 0;

    return savedAttempt;
  });

  const submission = {
    attemptId: String(attempt.id),
    assessmentId: String(assessment.id),
    title: assessment.title,
    isFinalExam,
    submittedAt: (attempt.submittedAt || now).toLocaleString('vi-VN'),
    totalQuestions: items.length,
    correctCount,
    totalScore,
    maxPossibleScore,
    scoreOutOf10,
    scorePercent,
    scorePct: scorePercent,
    passed: isPassed,
    isPassed,
    selectedAnswers: selectedAnswersRecord,
    selectedIndices,
    integrityStatus: attempt.integrityStatus,
    wrongItems,
    remedialRecommendations: wrongItems,
    updatedSkills,
  };

  return {
    ...submission,
    submission,
    gradedAnswers,
    sessionMarkedCompleted: Boolean(assessment.sessionId && isPassed),
    isRetakeLocked: Boolean(isFinalExam && isPassed),
    certificateIssuedCode: issuedCertificateCode,
    issuedCertificateCode,
    bonusInterviewCreditsAdded,
    updatedInterviewCredits,
  };
}

// 4.1 GET /assessments/:assessmentId
assessmentRouter.get('/assessments/:assessmentId', requireAuth, async (req, res, next) => {
  try {
    const assessment = await resolveAssessment(req.params.assessmentId);
    if (!assessment) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'ASSESSMENT_NOT_FOUND',
        message: 'Không tìm thấy bài kiểm tra',
        error: {
          code: 'ASSESSMENT_NOT_FOUND',
          message: 'Không tìm thấy bài kiểm tra',
        },
      });
      return;
    }

    if (assessment.status === 'DRAFT' && req.user!.role === 'STUDENT') {
      const message =
        'Đề kiểm tra này đang được Giảng viên biên soạn (Nháp), chưa công bố cho học viên.';
      res.status(403).json({
        success: false,
        status: 403,
        code: 'ASSESSMENT_DRAFT_LOCKED',
        message,
        error: {
          code: 'ASSESSMENT_DRAFT_LOCKED',
          message,
        },
      });
      return;
    }

    const { enrollment, allCohortSessionsCompleted } = await verifyAssessmentAccess({
      assessment,
      userId: req.user!.id,
      userRole: req.user!.role,
    });

    const isFinalExam = assessment.purpose === 'FINAL_EXAM';
    if (isFinalExam && req.user!.role === 'STUDENT' && !allCohortSessionsCompleted) {
      const message =
        'Bạn cần hoàn thành đầy đủ 6/6 buổi học của đợt học trước khi vào phòng Thi cuối khóa.';
      res.status(403).json({
        success: false,
        status: 403,
        code: 'FINAL_EXAM_PREREQUISITES_INCOMPLETE',
        message,
        error: {
          code: 'FINAL_EXAM_PREREQUISITES_INCOMPLETE',
          message,
        },
      });
      return;
    }

    const [items, allSkills, myAttempts] = await Promise.all([
      db
        .select()
        .from(assessmentItems)
        .where(eq(assessmentItems.assessmentId, assessment.id))
        .orderBy(asc(assessmentItems.itemOrder)),
      db.select().from(skills),
      db
        .select()
        .from(assessmentAttempts)
        .where(
          and(
            eq(assessmentAttempts.assessmentId, assessment.id),
            eq(assessmentAttempts.accountId, req.user!.id)
          )
        )
        .orderBy(desc(assessmentAttempts.startedAt)),
    ]);

    const skillMap = new Map(allSkills.map((s) => [s.id, s]));
    const submittedAttempts = myAttempts.filter((a) => a.submittedAt !== null);
    const hasPassedAttempt = submittedAttempts.some((att) => Boolean(att.isPassed));
    const hasPassedFinalExam = Boolean(
      isFinalExam && (enrollment?.finalExamPassed || hasPassedAttempt)
    );
    const isRetakeLocked = Boolean(isFinalExam && hasPassedFinalExam);

    let activeAttemptId: string | undefined;
    if (req.user!.role === 'STUDENT' && !isRetakeLocked) {
      const openAttempt = await getOrCreateOpenAttempt({
        assessment,
        accountId: req.user!.id,
      });
      activeAttemptId = String(openAttempt.id);
    }

    // NEVER expose correctIndex or explanationMd before submission!
    const sanitizedPromptConfig = items.map((item, idx) => {
      const pCfg = (item.promptConfig || {}) as PromptConfigShape;
      const sk = skillMap.get(item.skillId);
      const number = pCfg.number ?? item.itemOrder ?? idx + 1;
      const prompt = pCfg.prompt || pCfg.question || '';
      const options = Array.isArray(pCfg.options) ? pCfg.options : [];
      const slideLabel = pCfg.slideLabel || '';
      const scenarioTag =
        pCfg.scenarioTag || (isFinalExam ? 'Tình huống thực chiến' : 'Câu hỏi củng cố');

      return {
        id: String(item.id),
        number,
        itemOrder: item.itemOrder,
        itemType: item.itemType,
        skillId: item.skillId,
        skillCode: sk?.code || String(item.skillId),
        skillName: sk?.name || '',
        scenarioTag,
        points: Number(item.points),
        prompt,
        options,
        slideLabel,
        promptConfig: {
          number,
          scenarioTag,
          prompt,
          options,
          slideLabel,
        },
      };
    });

    const timeLimitMinutes = assessment.durationMinutes || (isFinalExam ? 45 : 15);

    res.json({
      id: String(assessment.id),
      assessmentId: String(assessment.id),
      activeAttemptId,
      cohortId: String(assessment.cohortId),
      sessionId: assessment.sessionId ? String(assessment.sessionId) : undefined,
      purpose: assessment.purpose,
      isFinalExam,
      title: assessment.title,
      instructionsMd: assessment.instructionsMd,
      durationMinutes: timeLimitMinutes,
      timeLimitMinutes,
      questionCount: sanitizedPromptConfig.length,
      passScorePct: assessment.passScorePct,
      maxAttempts: assessment.maxAttempts,
      attemptsUsed: submittedAttempts.length,
      proctoringConfig: assessment.proctoringConfig,
      status: assessment.status,
      hasPassedFinalExam,
      isRetakeLocked,
      promptConfig: sanitizedPromptConfig,
      items: sanitizedPromptConfig,
      questions: sanitizedPromptConfig,
    });
  } catch (err) {
    next(err);
  }
});

// 4.1B POST /assessments/:assessmentId/start — Explicitly start or resume an assessment attempt
assessmentRouter.post('/assessments/:assessmentId/start', requireAuth, async (req, res, next) => {
  try {
    const assessment = await resolveAssessment(req.params.assessmentId);
    if (!assessment) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'ASSESSMENT_NOT_FOUND',
        message: 'Không tìm thấy bài kiểm tra',
      });
      return;
    }

    const { enrollment, allCohortSessionsCompleted } = await verifyAssessmentAccess({
      assessment,
      userId: req.user!.id,
      userRole: req.user!.role,
    });

    if (assessment.purpose === 'FINAL_EXAM' && req.user!.role === 'STUDENT') {
      if (enrollment?.finalExamPassed) {
        res.status(409).json({
          success: false,
          status: 409,
          code: 'FINAL_EXAM_ALREADY_PASSED',
          message: 'Bạn đã vượt qua kỳ thi cuối khóa này.',
        });
        return;
      }
      if (!allCohortSessionsCompleted) {
        res.status(403).json({
          success: false,
          status: 403,
          code: 'FINAL_EXAM_PREREQUISITES_INCOMPLETE',
          message: 'Bạn cần hoàn thành đầy đủ 6/6 buổi học trước khi bắt đầu kỳ thi cuối khóa.',
        });
        return;
      }
    }

    const openAttempt = await getOrCreateOpenAttempt({
      assessment,
      accountId: req.user!.id,
    });

    res.status(200).json({
      attemptId: String(openAttempt.id),
      assessmentId: String(assessment.id),
      attemptNumber: openAttempt.attemptNumber,
      startedAt: openAttempt.startedAt.toISOString(),
      expiresAt: openAttempt.expiresAt ? openAttempt.expiresAt.toISOString() : null,
      integrityStatus: openAttempt.integrityStatus,
      totalRiskScore: Number(openAttempt.totalRiskScore),
    });
  } catch (err) {
    next(err);
  }
});

// 4.2 POST /assessments/:assessmentId/submit
const submitSchema = z.object({
  answers: z.union([
    z.record(z.string(), z.union([z.number().int(), z.string()])),
    z.array(z.number().int()),
    z.array(
      z.object({
        itemId: z.union([z.number(), z.string()]).optional(),
        itemOrder: z.number().int().positive().optional(),
        questionNumber: z.number().int().positive().optional(),
        selectedIndex: z.number().int().min(-1).optional(),
        selectedIdx: z.number().int().min(-1).optional(),
        chosenIndex: z.number().int().min(-1).optional(),
        selectedOptionId: z.string().optional(),
        answerText: z.string().optional(),
      })
    ),
  ]),
  telemetryLog: z.unknown().optional(),
});

assessmentRouter.post(
  '/assessments/:assessmentId/submit',
  requireAuth,
  validate(submitSchema),
  async (req, res, next) => {
    try {
      const assessment = await resolveAssessment(req.params.assessmentId);
      if (!assessment) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'ASSESSMENT_NOT_FOUND',
          message: 'Không tìm thấy bài kiểm tra',
          error: {
            code: 'ASSESSMENT_NOT_FOUND',
            message: 'Không tìm thấy bài kiểm tra',
          },
        });
        return;
      }

      const result = await gradeAndRecordAssessmentSubmission({
        assessment,
        accountId: req.user!.id,
        userRole: req.user!.role,
        rawAnswers: req.body.answers,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// 4.3 GET /assessments/:assessmentId/result & /assessments/:assessmentId/results
async function handleGetAssessmentResult(req: any, res: any, next: any) {
  try {
    const assessment = await resolveAssessment(req.params.assessmentId);
    if (!assessment) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'ASSESSMENT_NOT_FOUND',
        message: 'Không tìm thấy bài kiểm tra',
        error: {
          code: 'ASSESSMENT_NOT_FOUND',
          message: 'Không tìm thấy bài kiểm tra',
        },
      });
      return;
    }

    const accountId = req.user!.id;
    const allMyAttempts = await db
      .select()
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.assessmentId, assessment.id),
          eq(assessmentAttempts.accountId, accountId)
        )
      )
      .orderBy(desc(assessmentAttempts.submittedAt), desc(assessmentAttempts.startedAt));

    const attempt = allMyAttempts.find((a) => a.submittedAt !== null);

    if (!attempt) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'ATTEMPT_NOT_FOUND',
        message: 'Chưa có kết quả bài làm đã nộp',
        error: {
          code: 'ATTEMPT_NOT_FOUND',
          message: 'Chưa có kết quả bài làm đã nộp',
        },
      });
      return;
    }

    const [items, allSkills, cohortAssessments] = await Promise.all([
      db
        .select()
        .from(assessmentItems)
        .where(eq(assessmentItems.assessmentId, assessment.id))
        .orderBy(asc(assessmentItems.itemOrder)),
      db.select().from(skills),
      db
        .select()
        .from(assessments)
        .where(eq(assessments.cohortId, assessment.cohortId)),
    ]);

    const finalExam = cohortAssessments.find((a) => a.purpose === 'FINAL_EXAM');
    const skillMap = new Map(allSkills.map((s) => [s.id, s]));
    const isFinalExam = assessment.purpose === 'FINAL_EXAM';

    const questionsWithExplanations = items.map((item, idx) => {
      const pCfg = (item.promptConfig || {}) as PromptConfigShape;
      const gCfg = (item.gradingConfig || {}) as GradingConfigShape;
      const sk = skillMap.get(item.skillId);
      const jumpSec = gCfg.reviewJumpSec ?? 180;

      return {
        id: String(item.id),
        number: pCfg.number ?? item.itemOrder ?? idx + 1,
        scenarioTag:
          pCfg.scenarioTag || (isFinalExam ? 'Tình huống thực chiến' : 'Câu hỏi củng cố'),
        skillId: String(item.skillId),
        skillCode: sk?.code || String(item.skillId),
        skillName: sk?.name || '',
        prompt: pCfg.prompt || pCfg.question || '',
        options: Array.isArray(pCfg.options) ? pCfg.options : [],
        correctIndex: resolveCorrectOptionIndex(gCfg),
        explanation: item.explanationMd || '',
        reviewTimestampLabel: gCfg.reviewTimestampLabel || '03:00 — 04:00',
        reviewJumpSec: jumpSec,
        reviewSegmentRangeSec: gCfg.reviewSegmentRangeSec || [jumpSec, jumpSec + 60],
        slideLabel: pCfg.slideLabel || '',
      };
    });

    const [answers, userSkills] = await Promise.all([
      db
        .select()
        .from(submissionAnswers)
        .where(eq(submissionAnswers.attemptId, attempt.id)),
      db
        .select()
        .from(studentSkillStates)
        .where(eq(studentSkillStates.accountId, accountId)),
    ]);

    const answerByItemId = new Map(answers.map((a) => [a.itemId, a]));
    const selectedAnswers: Record<number, number> = {};
    const selectedIndices: number[] = [];

    items.forEach((item, idx) => {
      const pCfg = (item.promptConfig || {}) as PromptConfigShape;
      const qNum = pCfg.number ?? item.itemOrder ?? idx + 1;
      const ans = answerByItemId.get(item.id);
      const rData = (ans?.responseData || {}) as { selectedIndex?: number };
      const chosen = rData.selectedIndex ?? -1;
      selectedAnswers[qNum] = chosen;
      selectedIndices.push(chosen);
    });

    const storedWrongItems = Array.isArray(attempt.remedialRecommendations)
      ? attempt.remedialRecommendations
      : [];

    const scorePercent = Math.round(Number(attempt.scorePct ?? 0));
    const scoreOutOf10 = Number((scorePercent / 10).toFixed(1));
    const passed = Boolean(attempt.isPassed);
    const correctCount =
      answers.length > 0
        ? answers.filter((a) => a.isCorrect).length
        : Math.round((scorePercent / 100) * items.length);

    const updatedSkills = userSkills.map((us) => {
      const sk = skillMap.get(us.skillId);
      const currentScore = normalizeMasteryScore(us.masteryScore);
      const rawTrend = Number(us.trend || 0);
      const deltaPoints = Math.abs(rawTrend) <= 1 && rawTrend !== 0
        ? Math.round(rawTrend * 100)
        : Math.round(rawTrend);
      return {
        skillId: String(us.skillId),
        code: sk?.code || String(us.skillId),
        name: sk?.name || '',
        skillName: sk?.name || '',
        previousScore: Math.min(100, Math.max(0, currentScore - deltaPoints)),
        newScore: currentScore,
        delta: deltaPoints >= 0 ? `+${deltaPoints} điểm` : `${deltaPoints} điểm`,
      };
    });

    const submission = {
      attemptId: String(attempt.id),
      assessmentId: String(assessment.id),
      title: assessment.title,
      isFinalExam,
      submittedAt: (attempt.submittedAt || attempt.startedAt).toLocaleString('vi-VN'),
      totalQuestions: items.length,
      correctCount,
      totalScore: Number(attempt.totalScore ?? correctCount),
      maxPossibleScore: Number(attempt.maxPossibleScore ?? items.length),
      scoreOutOf10,
      scorePercent,
      scorePct: scorePercent,
      passed,
      isPassed: passed,
      selectedAnswers,
      selectedIndices,
      integrityStatus: attempt.integrityStatus,
      totalRiskScore: Number(attempt.totalRiskScore ?? 0),
      verdictNote: attempt.verdictNote || undefined,
      wrongItems: storedWrongItems,
      remedialRecommendations: storedWrongItems,
      updatedSkills,
    };

    res.json({
      ...submission,
      cohortId: String(assessment.cohortId),
      sessionId: assessment.sessionId ? String(assessment.sessionId) : undefined,
      finalExamId: finalExam ? String(finalExam.id) : undefined,
      hasStoredAttempt: true,
      hasPassedFinalExam: Boolean(isFinalExam && passed),
      questionsWithExplanations,
      submission,
      attempt,
      answers,
    });
  } catch (err) {
    next(err);
  }
}

assessmentRouter.get('/assessments/:assessmentId/result', requireAuth, handleGetAssessmentResult);
assessmentRouter.get('/assessments/:assessmentId/results', requireAuth, handleGetAssessmentResult);

// 4.4 POST /assessments/:assessmentId/proctoring-events & /assessments/attempts/:attemptId/proctoring-events
const proctoringEventSchema = z.object({
  tier: z.enum(['EDGE', 'SERVER']).default('EDGE'),
  eventType: z.string().min(1),
  videoOffsetSec: z.number().int().min(0).optional(),
  confidence: z.number().min(0).max(1).default(0.95),
  snapshotR2Key: z.string().optional(),
  snapshotNote: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

assessmentRouter.post(
  '/assessments/:assessmentId/proctoring-events',
  requireAuth,
  validate(proctoringEventSchema),
  async (req, res, next) => {
    try {
      const assessment = await resolveAssessment(req.params.assessmentId);
      if (!assessment) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'ASSESSMENT_NOT_FOUND',
          message: 'Không tìm thấy bài kiểm tra',
        });
        return;
      }

      const accountId = req.user!.id;
      const { tier, eventType, videoOffsetSec, confidence, snapshotR2Key, snapshotNote, details } =
        req.body;

      const classified = classifyIncomingProctoringEvent(eventType, details);
      if (classified.benign) {
        res.status(200).json({
          assessmentId: String(assessment.id),
          recorded: false,
          benign: true,
          eventType,
          riskDelta: 0,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Auto-resolve or create open attempt so live proctoring events are NEVER dropped!
      const attempt = await getOrCreateOpenAttempt({ assessment, accountId });

      const newTotalRisk = Number(attempt.totalRiskScore) + classified.riskDelta;
      const newIntegrityStatus =
        attempt.integrityStatus === 'CONFIRMED_CHEAT'
          ? 'CONFIRMED_CHEAT'
          : newTotalRisk >= 60
            ? 'FLAGGED'
            : attempt.integrityStatus;

      await db.transaction(async (tx) => {
        await tx.insert(proctoringEvents).values({
          attemptId: attempt.id,
          tier,
          eventType: classified.eventType,
          videoOffsetSec,
          confidence,
          riskDelta: classified.riskDelta.toFixed(2),
          snapshotR2Key,
          details: { ...(details || {}), rawEventType: eventType, note: snapshotNote },
        });

        await tx
          .update(assessmentAttempts)
          .set({
            totalRiskScore: newTotalRisk.toFixed(2),
            integrityStatus: newIntegrityStatus,
          })
          .where(eq(assessmentAttempts.id, attempt.id));
      });

      res.status(201).json({
        attemptId: String(attempt.id),
        assessmentId: String(assessment.id),
        recorded: true,
        eventType: classified.eventType,
        riskDelta: classified.riskDelta,
        newTotalRiskScore: newTotalRisk,
        integrityStatus: newIntegrityStatus,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

assessmentRouter.post(
  '/assessments/attempts/:attemptId/proctoring-events',
  requireAuth,
  validate(proctoringEventSchema),
  async (req, res, next) => {
    try {
      const attemptId = Number(req.params.attemptId);
      const { tier, eventType, videoOffsetSec, confidence, snapshotR2Key, snapshotNote, details } =
        req.body;

      const [attempt] = await db
        .select()
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.id, attemptId))
        .limit(1);

      if (!attempt) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'ATTEMPT_NOT_FOUND',
          message: 'Không tìm thấy lượt làm bài',
        });
        return;
      }

      if (req.user!.role === 'STUDENT' && Number(attempt.accountId) !== Number(req.user!.id)) {
        res.status(403).json({
          success: false,
          status: 403,
          code: 'FORBIDDEN_ATTEMPT_OWNER',
          message: 'Bạn không có quyền gửi sự kiện giám sát cho lượt thi của người khác',
        });
        return;
      }

      const classified = classifyIncomingProctoringEvent(eventType, details);
      if (classified.benign) {
        res.status(200).json({
          recorded: false,
          benign: true,
          riskDelta: 0,
          newTotalRiskScore: Number(attempt.totalRiskScore),
          integrityStatus: attempt.integrityStatus,
        });
        return;
      }

      const newTotalRisk = Number(attempt.totalRiskScore) + classified.riskDelta;
      const newIntegrityStatus =
        attempt.integrityStatus === 'CONFIRMED_CHEAT'
          ? 'CONFIRMED_CHEAT'
          : newTotalRisk >= 60
            ? 'FLAGGED'
            : attempt.integrityStatus;

      await db.transaction(async (tx) => {
        await tx.insert(proctoringEvents).values({
          attemptId,
          tier,
          eventType: classified.eventType,
          videoOffsetSec,
          confidence,
          riskDelta: classified.riskDelta.toFixed(2),
          snapshotR2Key,
          details: { ...(details || {}), rawEventType: eventType, note: snapshotNote },
        });

        await tx
          .update(assessmentAttempts)
          .set({
            totalRiskScore: newTotalRisk.toFixed(2),
            integrityStatus: newIntegrityStatus,
          })
          .where(eq(assessmentAttempts.id, attemptId));
      });

      res.status(201).json({
        recorded: true,
        eventType: classified.eventType,
        riskDelta: classified.riskDelta,
        newTotalRiskScore: newTotalRisk,
        integrityStatus: newIntegrityStatus,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 4.5 POST /assessments/:assessmentId/proctoring-snapshot
//     Two-Tier Edge-Cloud CV Analysis (MediaPipe/YuNet + SolvePnP + YOLOv8n ONNX + Gemini Vision)
const proctoringSnapshotSchema = z.object({
  imageBase64: z.string().min(32),
  videoOffsetSec: z.number().int().min(0).optional(),
  escalateVlm: z.boolean().default(true),
});

interface AiProctoringCvResult {
  status: string;
  detectorTier1?: string;
  yoloObjectDetectorActive?: boolean;
  vlmTier2Escalation?: Record<string, unknown> | null;
  state: 'NORMAL' | 'WARNING' | 'ALERT';
  eventType: string;
  confidence: number;
  riskDelta: number;
  message: string;
  faceCount: number;
  headPose: { yawDeg: number; pitchDeg: number; rollDeg: number };
  prohibitedObjects: Array<Record<string, unknown>>;
  latencyMs?: number;
}

assessmentRouter.post(
  '/assessments/:assessmentId/proctoring-snapshot',
  requireAuth,
  validate(proctoringSnapshotSchema),
  async (req, res, next) => {
    try {
      const assessment = await resolveAssessment(req.params.assessmentId);
      if (!assessment) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'ASSESSMENT_NOT_FOUND',
          message: 'Không tìm thấy bài kiểm tra',
        });
        return;
      }

      const accountId = req.user!.id;
      const { imageBase64, videoOffsetSec, escalateVlm } = req.body;

      let cvResult: AiProctoringCvResult = {
        status: 'FALLBACK_HEARTBEAT',
        detectorTier1: 'CLIENT_WEBCAM_STREAM',
        yoloObjectDetectorActive: false,
        vlmTier2Escalation: null,
        state: 'NORMAL',
        eventType: 'CAMERA_NORMAL',
        confidence: 0.95,
        riskDelta: 0,
        message: 'Khung hình Camera ổn định — Tiếp tục làm bài thi.',
        faceCount: 1,
        headPose: { yawDeg: 0, pitchDeg: 0, rollDeg: 0 },
        prohibitedObjects: [],
        latencyMs: 0,
      };

      const aiBaseUrl = (env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
      try {
        const aiRes = await fetch(`${aiBaseUrl}/api/v1/ai/proctoring/analyze-frame`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-API-Key': env.INTERNAL_API_KEY,
          },
          body: JSON.stringify({ imageBase64, escalateVlm }),
          signal: AbortSignal.timeout(6500),
        });
        if (aiRes.ok) {
          const parsed = (await aiRes.json()) as Partial<AiProctoringCvResult>;
          if (parsed && typeof parsed.eventType === 'string') {
            cvResult = {
              ...cvResult,
              ...parsed,
            };
          }
        }
      } catch {
        // AI microservice offline in standalone dev: keep exam smooth without false strikes
      }

      const classified = classifyIncomingProctoringEvent(cvResult.eventType, {
        faceCount: cvResult.faceCount,
      });

      if (classified.benign || cvResult.riskDelta <= 0) {
        res.status(200).json({
          assessmentId: String(assessment.id),
          recorded: false,
          ...cvResult,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const attempt = await getOrCreateOpenAttempt({ assessment, accountId });
      const appliedRisk = cvResult.riskDelta > 0 ? cvResult.riskDelta : classified.riskDelta;
      const newTotalRisk = Number(attempt.totalRiskScore) + appliedRisk;
      const newIntegrityStatus =
        attempt.integrityStatus === 'CONFIRMED_CHEAT'
          ? 'CONFIRMED_CHEAT'
          : newTotalRisk >= 60
            ? 'FLAGGED'
            : attempt.integrityStatus;

      await db.transaction(async (tx) => {
        await tx.insert(proctoringEvents).values({
          attemptId: attempt.id,
          tier: 'SERVER',
          eventType: classified.eventType,
          videoOffsetSec,
          confidence: Math.min(1, Math.max(0, Number(cvResult.confidence ?? 0.9))),
          riskDelta: appliedRisk.toFixed(2),
          details: {
            detectorTier1: cvResult.detectorTier1,
            yoloObjectDetectorActive: cvResult.yoloObjectDetectorActive,
            faceCount: cvResult.faceCount,
            headPose: cvResult.headPose,
            prohibitedObjects: cvResult.prohibitedObjects,
            vlmTier2Escalation: cvResult.vlmTier2Escalation,
            note: cvResult.message,
          },
        });

        await tx
          .update(assessmentAttempts)
          .set({
            totalRiskScore: newTotalRisk.toFixed(2),
            integrityStatus: newIntegrityStatus,
          })
          .where(eq(assessmentAttempts.id, attempt.id));
      });

      res.status(201).json({
        attemptId: String(attempt.id),
        assessmentId: String(assessment.id),
        recorded: true,
        ...cvResult,
        eventType: classified.eventType,
        riskDelta: appliedRisk,
        newTotalRiskScore: newTotalRisk,
        integrityStatus: newIntegrityStatus,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);
