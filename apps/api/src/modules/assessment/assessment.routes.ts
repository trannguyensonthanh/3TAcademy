import { Router } from 'express';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';
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
  enrollments,
  certificates,
  userProfiles,
} from '../../db/schema/index.js';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { env } from '../../config/env.js';
import {
  resolveAssessment,
  normalizeMasteryScore,
  toDbMasteryScore,
} from '../../db/helpers.js';

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
  reviewTimestampLabel?: string;
  reviewJumpSec?: number;
  reviewSegmentRangeSec?: [number, number];
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

    const [items, allSkills, myAttempts, myEnrollments] = await Promise.all([
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
        .orderBy(desc(assessmentAttempts.submittedAt)),
      db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.accountId, req.user!.id),
            eq(enrollments.cohortId, assessment.cohortId)
          )
        )
        .limit(1),
    ]);

    const skillMap = new Map(allSkills.map((s) => [s.id, s]));
    const isFinalExam = assessment.purpose === 'FINAL_EXAM';
    const hasPassedAttempt = myAttempts.some((att) => Boolean(att.isPassed));
    const hasPassedFinalExam = Boolean(
      isFinalExam && (myEnrollments[0]?.finalExamPassed || hasPassedAttempt)
    );
    const isRetakeLocked = Boolean(isFinalExam && hasPassedFinalExam);

    const sanitizedPromptConfig = items.map((item, idx) => {
      const pCfg = (item.promptConfig || {}) as PromptConfigShape;
      const sk = skillMap.get(item.skillId);
      const number = pCfg.number ?? item.itemOrder ?? idx + 1;
      const prompt = pCfg.prompt || pCfg.question || '';
      const options = Array.isArray(pCfg.options) ? pCfg.options : [];
      const slideLabel = pCfg.slideLabel || '';
      const scenarioTag = pCfg.scenarioTag || (isFinalExam ? 'Tình huống thực chiến' : 'Câu hỏi củng cố');

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

    const timeLimitMinutes = assessment.durationMinutes || (isFinalExam ? 45 : 20);

    res.json({
      id: String(assessment.id),
      assessmentId: String(assessment.id),
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

// 4.2 POST /assessments/:assessmentId/submit
const submitSchema = z.object({
  answers: z.union([
    z.record(z.string(), z.number().int()),
    z.array(
      z.object({
        itemId: z.union([z.number(), z.string()]).optional(),
        itemOrder: z.number().int().positive().optional(),
        questionNumber: z.number().int().positive().optional(),
        selectedIndex: z.number().int().min(-1).optional(),
        selectedIdx: z.number().int().min(-1).optional(),
        chosenIndex: z.number().int().min(-1).optional(),
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

      const accountId = req.user!.id;
      const isFinalExam = assessment.purpose === 'FINAL_EXAM';

      const [existingEnrollment] = await db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.accountId, accountId),
            eq(enrollments.cohortId, assessment.cohortId)
          )
        )
        .limit(1);

      if (isFinalExam && existingEnrollment?.finalExamPassed) {
        const message =
          'Bạn đã vượt qua Kỳ Thi Cuối Khóa này. Hệ thống đã khóa làm lại để bảo toàn kết quả cấp chứng chỉ.';
        res.status(409).json({
          success: false,
          status: 409,
          code: 'FINAL_EXAM_ALREADY_PASSED',
          message,
          error: {
            code: 'FINAL_EXAM_ALREADY_PASSED',
            message,
          },
        });
        return;
      }

      const rawAnswers = req.body.answers;
      const [items, allSkills] = await Promise.all([
        db
          .select()
          .from(assessmentItems)
          .where(eq(assessmentItems.assessmentId, assessment.id))
          .orderBy(asc(assessmentItems.itemOrder)),
        db.select().from(skills),
      ]);

      const skillMap = new Map(allSkills.map((s) => [s.id, s]));

      let totalScore = 0;
      let maxPossibleScore = 0;
      let correctCount = 0;
      const selectedAnswersRecord: Record<number, number> = {};
      const selectedIndices: number[] = [];

      const gradedAnswers: Array<{
        itemId: number;
        skillId: number;
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
        const maxPts = Number(item.points);
        maxPossibleScore += maxPts;

        const pCfg = (item.promptConfig || {}) as PromptConfigShape;
        const gCfg = (item.gradingConfig || {}) as GradingConfigShape;
        const qNumber = pCfg.number ?? item.itemOrder ?? idx + 1;
        const correctIdx = gCfg.correctIndex ?? 0;
        const options = Array.isArray(pCfg.options) ? pCfg.options : [];
        const sk = skillMap.get(item.skillId);

        let chosenIndex = -1;
        if (Array.isArray(rawAnswers)) {
          const userAns =
            rawAnswers.find(
              (a) =>
                (a.itemId !== undefined && String(a.itemId) === String(item.id)) ||
                a.questionNumber === qNumber ||
                a.itemOrder === qNumber
            ) || rawAnswers[idx];
          chosenIndex =
            userAns?.selectedIndex ?? userAns?.selectedIdx ?? userAns?.chosenIndex ?? -1;
        } else if (rawAnswers && typeof rawAnswers === 'object') {
          const recordAns = rawAnswers as Record<string, number>;
          if (recordAns[String(qNumber)] !== undefined) {
            chosenIndex = Number(recordAns[String(qNumber)]);
          } else if (recordAns[String(idx)] !== undefined) {
            chosenIndex = Number(recordAns[String(idx)]);
          }
        }

        selectedAnswersRecord[qNumber] = chosenIndex;
        selectedIndices.push(chosenIndex);

        const isCorrect = chosenIndex === correctIdx;
        const pointsEarned = isCorrect ? maxPts : 0;

        if (isCorrect) {
          totalScore += pointsEarned;
          correctCount += 1;
        } else {
          const jumpSec = gCfg.reviewJumpSec ?? 10;
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
            reviewTimestampLabel: gCfg.reviewTimestampLabel || '00:10 — 00:25',
            reviewJumpSec: jumpSec,
            reviewSegmentRangeSec: gCfg.reviewSegmentRangeSec || [jumpSec, jumpSec + 15],
            slideLabel: pCfg.slideLabel || '',
          });
        }

        gradedAnswers.push({
          itemId: item.id,
          skillId: item.skillId,
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
      const isPassed = scorePercent >= assessment.passScorePct;
      const now = new Date();

      let issuedCertificateCode: string | undefined;
      let bonusInterviewCreditsAdded = 0;
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
        const [newAttempt] = await tx
          .insert(assessmentAttempts)
          .values({
            assessmentId: assessment.id,
            accountId,
            attemptNumber: 1,
            startedAt: now,
            submittedAt: now,
            gradingCompletedAt: now,
            totalScore: totalScore.toFixed(2),
            maxPossibleScore: maxPossibleScore.toFixed(2),
            scorePct: scorePercent.toFixed(2),
            isPassed,
            remedialRecommendations: wrongItems,
            totalRiskScore: '0.00',
            integrityStatus: 'CLEAN',
          })
          .returning();

        for (const ans of gradedAnswers) {
          await tx.insert(submissionAnswers).values({
            attemptId: newAttempt!.id,
            itemId: ans.itemId,
            responseData: { selectedIndex: ans.selectedIndex },
            gradingStatus: 'AUTO_GRADED',
            autoScore: ans.pointsEarned.toFixed(2),
            finalScore: ans.pointsEarned.toFixed(2),
            isCorrect: ans.isCorrect,
            feedbackMd: ans.explanationMd,
            gradedAt: now,
          });
        }

        const uniqueSkillIds = [...new Set(gradedAnswers.map((a) => a.skillId))];
        for (const skId of uniqueSkillIds) {
          const skItems = gradedAnswers.filter((a) => a.skillId === skId);
          const skRatio =
            skItems.filter((a) => a.isCorrect).length / Math.max(1, skItems.length);
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

          const prevScore = existingState
            ? normalizeMasteryScore(existingState.masteryScore)
            : 0;
          const targetScore = Math.round(skRatio * 100);
          const newScore = existingState
            ? Math.min(100, Math.max(prevScore, Math.round(prevScore * 0.7 + targetScore * 0.3)))
            : targetScore;
          const diff = newScore - prevScore;

          await tx
            .insert(studentSkillStates)
            .values({
              accountId,
              skillId: skId,
              masteryScore: toDbMasteryScore(newScore),
              evidenceCount: (existingState?.evidenceCount ?? 0) + 1,
              trend: Number((diff / 100).toFixed(2)),
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [studentSkillStates.accountId, studentSkillStates.skillId],
              set: {
                masteryScore: toDbMasteryScore(newScore),
                evidenceCount: (existingState?.evidenceCount ?? 0) + 1,
                trend: Number((diff / 100).toFixed(2)),
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

        if (isFinalExam && isPassed && existingEnrollment) {
          await tx
            .update(enrollments)
            .set({
              finalExamPassed: true,
              status: 'COMPLETED',
              completedAt: now,
            })
            .where(eq(enrollments.id, existingEnrollment.id));

          const [existingCert] = await tx
            .select()
            .from(certificates)
            .where(eq(certificates.enrollmentId, existingEnrollment.id))
            .limit(1);

          if (existingCert) {
            issuedCertificateCode = existingCert.certificateCode;
          } else {
            const certCode = `3T-CERT-${new Date().getFullYear()}-${existingEnrollment.id}-${accountId}`;
            const hmacSig = crypto
              .createHmac('sha256', env.HMAC_CERTIFICATE_SECRET)
              .update(`${existingEnrollment.id}:${accountId}:${certCode}`)
              .digest('hex');

            await tx.insert(certificates).values({
              enrollmentId: existingEnrollment.id,
              accountId,
              certificateCode: certCode,
              hmacSignature: hmacSig,
              issuedAt: now,
            });
            issuedCertificateCode = certCode;

            bonusInterviewCreditsAdded = 4;
            const [updatedProf] = await tx
              .update(userProfiles)
              .set({
                interviewCredits: sql`${userProfiles.interviewCredits} + 4`,
                updatedAt: now,
              })
              .where(eq(userProfiles.accountId, accountId))
              .returning();
            updatedInterviewCredits = updatedProf?.interviewCredits;
          }
        }

        return newAttempt!;
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

      res.json({
        ...submission,
        submission,
        sessionMarkedCompleted: Boolean(assessment.sessionId && isPassed),
        isRetakeLocked: Boolean(isFinalExam && isPassed),
        certificateIssuedCode: issuedCertificateCode,
        issuedCertificateCode,
        bonusInterviewCreditsAdded,
        updatedInterviewCredits,
      });
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
    const [attempt] = await db
      .select()
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.assessmentId, assessment.id),
          eq(assessmentAttempts.accountId, accountId)
        )
      )
      .orderBy(desc(assessmentAttempts.submittedAt))
      .limit(1);

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
      const jumpSec = gCfg.reviewJumpSec ?? 10;

      return {
        id: String(item.id),
        number: pCfg.number ?? item.itemOrder ?? idx + 1,
        scenarioTag: pCfg.scenarioTag || (isFinalExam ? 'Tình huống thực chiến' : 'Câu hỏi củng cố'),
        skillId: String(item.skillId),
        skillCode: sk?.code || String(item.skillId),
        skillName: sk?.name || '',
        prompt: pCfg.prompt || pCfg.question || '',
        options: Array.isArray(pCfg.options) ? pCfg.options : [],
        correctIndex: gCfg.correctIndex ?? 0,
        explanation: item.explanationMd || '',
        reviewTimestampLabel: gCfg.reviewTimestampLabel || '00:10 — 00:25',
        reviewJumpSec: jumpSec,
        reviewSegmentRangeSec: gCfg.reviewSegmentRangeSec || [jumpSec, jumpSec + 15],
        slideLabel: pCfg.slideLabel || '',
      };
    });

    if (!attempt) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'ATTEMPT_NOT_FOUND',
        message: 'Chưa có kết quả bài làm',
        error: {
          code: 'ATTEMPT_NOT_FOUND',
          message: 'Chưa có kết quả bài làm',
        },
      });
      return;
    }

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
      const deltaPoints = Math.round((us.trend || 0) * 100);
      return {
        skillId: String(us.skillId),
        code: sk?.code || String(us.skillId),
        name: sk?.name || '',
        skillName: sk?.name || '',
        previousScore: Math.max(0, currentScore - deltaPoints),
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

// 4.4 POST /assessments/attempts/:attemptId/proctoring-events & /assessments/:assessmentId/proctoring-events
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
      const accountId = req.user!.id;
      const { tier, eventType, videoOffsetSec, confidence, snapshotR2Key, snapshotNote, details } = req.body;

      const normalizedEventType = (
        ['NO_FACE', 'MULTI_FACE', 'FACE_MISMATCH', 'TAB_HIDDEN', 'FULLSCREEN_EXIT'].includes(
          eventType
        )
          ? eventType
          : 'TAB_HIDDEN'
      ) as 'NO_FACE' | 'MULTI_FACE' | 'FACE_MISMATCH' | 'TAB_HIDDEN' | 'FULLSCREEN_EXIT';

      const riskDeltaMap: Record<string, number> = {
        MULTI_FACE: 40,
        FACE_MISMATCH: 50,
        TAB_HIDDEN: 20,
        FULLSCREEN_EXIT: 15,
        NO_FACE: 15,
      };
      const riskDelta = riskDeltaMap[normalizedEventType] || 15;

      let [attempt] = assessment
        ? await db
            .select()
            .from(assessmentAttempts)
            .where(
              and(
                eq(assessmentAttempts.assessmentId, assessment.id),
                eq(assessmentAttempts.accountId, accountId)
              )
            )
            .orderBy(desc(assessmentAttempts.startedAt))
            .limit(1)
        : [];

      if (attempt) {
        const newTotalRisk = Number(attempt.totalRiskScore) + riskDelta;
        const newIntegrityStatus = newTotalRisk >= 60 ? 'FLAGGED' : attempt.integrityStatus;

        await db.transaction(async (tx) => {
          await tx.insert(proctoringEvents).values({
            attemptId: attempt!.id,
            tier,
            eventType: normalizedEventType,
            videoOffsetSec,
            confidence,
            riskDelta: riskDelta.toFixed(2),
            snapshotR2Key,
            details: { ...(details || {}), note: snapshotNote },
          });

          await tx
            .update(assessmentAttempts)
            .set({
              totalRiskScore: newTotalRisk.toFixed(2),
              integrityStatus: newIntegrityStatus,
            })
            .where(eq(assessmentAttempts.id, attempt!.id));
        });
      }

      res.status(201).json({
        assessmentId: String(assessment?.id ?? req.params.assessmentId),
        recorded: true,
        eventType: normalizedEventType,
        riskDelta,
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
      const { tier, eventType, videoOffsetSec, confidence, snapshotR2Key, snapshotNote, details } = req.body;

      const normalizedEventType = (
        ['NO_FACE', 'MULTI_FACE', 'FACE_MISMATCH', 'TAB_HIDDEN', 'FULLSCREEN_EXIT'].includes(
          eventType
        )
          ? eventType
          : 'TAB_HIDDEN'
      ) as 'NO_FACE' | 'MULTI_FACE' | 'FACE_MISMATCH' | 'TAB_HIDDEN' | 'FULLSCREEN_EXIT';

      const riskDeltaMap: Record<string, number> = {
        MULTI_FACE: 40,
        FACE_MISMATCH: 50,
        TAB_HIDDEN: 20,
        FULLSCREEN_EXIT: 15,
        NO_FACE: 15,
      };
      const riskDelta = riskDeltaMap[normalizedEventType] || 15;

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
          error: {
            code: 'ATTEMPT_NOT_FOUND',
            message: 'Không tìm thấy lượt làm bài',
          },
        });
        return;
      }

      const newTotalRisk = Number(attempt.totalRiskScore) + riskDelta;
      const newIntegrityStatus = newTotalRisk >= 60 ? 'FLAGGED' : attempt.integrityStatus;

      await db.transaction(async (tx) => {
        await tx.insert(proctoringEvents).values({
          attemptId,
          tier,
          eventType: normalizedEventType,
          videoOffsetSec,
          confidence,
          riskDelta: riskDelta.toFixed(2),
          snapshotR2Key,
          details: { ...(details || {}), note: snapshotNote },
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
        riskDelta,
        newTotalRiskScore: newTotalRisk,
        integrityStatus: newIntegrityStatus,
      });
    } catch (err) {
      next(err);
    }
  }
);
