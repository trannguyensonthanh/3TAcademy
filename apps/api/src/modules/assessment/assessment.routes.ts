import { Router } from 'express';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../../db/index.js';
import {
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

    const sanitizedItems = items.map((item, idx) => {
      const pCfg = (item.promptConfig || {}) as PromptConfigShape;
      const sk = skillMap.get(item.skillId);
      return {
        id: String(item.id),
        number: pCfg.number ?? item.itemOrder ?? idx + 1,
        itemOrder: item.itemOrder,
        itemType: item.itemType,
        skillId: item.skillId,
        skillName: sk?.name || 'Kỹ thuật RAG & Vector Search',
        points: Number(item.points),
        prompt: pCfg.prompt || pCfg.question || '',
        options: Array.isArray(pCfg.options) ? pCfg.options : [],
        slideLabel: pCfg.slideLabel || 'Slide Trang 8',
        promptConfig: {
          number: pCfg.number ?? item.itemOrder ?? idx + 1,
          prompt: pCfg.prompt || pCfg.question || '',
          options: Array.isArray(pCfg.options) ? pCfg.options : [],
          slideLabel: pCfg.slideLabel || 'Slide Trang 8',
        },
      };
    });

    res.json({
      id: String(assessment.id),
      cohortId: String(assessment.cohortId),
      sessionId: assessment.sessionId ? String(assessment.sessionId) : null,
      purpose: assessment.purpose,
      isFinalExam,
      title: assessment.title,
      instructionsMd: assessment.instructionsMd,
      durationMinutes: assessment.durationMinutes || (isFinalExam ? 45 : 20),
      passScorePct: assessment.passScorePct,
      maxAttempts: assessment.maxAttempts,
      proctoringConfig: assessment.proctoringConfig,
      status: assessment.status,
      hasPassedFinalExam,
      isRetakeLocked,
      items: sanitizedItems,
      questions: sanitizedItems,
    });
  } catch (err) {
    next(err);
  }
});

// 4.2 POST /assessments/:assessmentId/submit
const submitSchema = z.object({
  answers: z.array(
    z.object({
      itemId: z.union([z.number(), z.string()]).optional(),
      questionNumber: z.number().int().positive().optional(),
      selectedIndex: z.number().int().min(-1).optional(),
      chosenIndex: z.number().int().min(-1).optional(),
      answerText: z.string().optional(),
    })
  ),
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

      // Check Final Exam 1-attempt pass lock (Spec v3.1 API 4.1 & 4.2)
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

      const { answers } = req.body;
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

        const userAns =
          answers.find(
            (a: { itemId?: number | string; questionNumber?: number }) =>
              (a.itemId !== undefined && String(a.itemId) === String(item.id)) ||
              a.questionNumber === qNumber
          ) || answers[idx];

        const chosenIndex =
          userAns?.selectedIndex ?? userAns?.chosenIndex ?? -1;
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
            skillName: sk?.name || 'Xây dựng luồng Hybrid RAG',
            prompt: pCfg.prompt || pCfg.question || '',
            options,
            chosenIndex,
            chosenOptionText:
              chosenIndex >= 0 && options[chosenIndex]
                ? options[chosenIndex]!
                : 'Chưa chọn đáp án',
            correctIndex: correctIdx,
            correctOptionText: options[correctIdx] || 'Đáp án A',
            explanation:
              item.explanationMd ||
              'Xem lại đoạn bài giảng tương ứng để nắm vững kiến thức trọng tâm.',
            reviewTimestampLabel: gCfg.reviewTimestampLabel || '00:10 — 00:25',
            reviewJumpSec: jumpSec,
            reviewSegmentRangeSec: gCfg.reviewSegmentRangeSec || [jumpSec, jumpSec + 15],
            slideLabel: pCfg.slideLabel || 'Slide Trang 8',
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
        maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 100;
      const isPassed = scorePercent >= assessment.passScorePct;
      const now = new Date();

      let issuedCertificateCode: string | undefined;
      let bonusInterviewCreditsAdded = 0;
      let updatedInterviewCredits: number | undefined;

      const updatedSkills: Array<{
        skillId: string;
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

        // Update student_skill_states on 0..100 display scale
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
            : 75;
          const targetScore = Math.round(skRatio * 100);
          const newScore = existingState
            ? Math.min(100, Math.max(prevScore, Math.round(prevScore * 0.7 + targetScore * 0.3 + (skRatio >= 0.7 ? 4 : 0))))
            : Math.max(70, targetScore);
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
            skillName: sk?.name || 'Kỹ năng Thực chiến AI',
            previousScore: prevScore,
            newScore,
            delta: diff >= 0 ? `+${diff} điểm` : `${diff} điểm`,
          });
        }

        // If Session Quiz passed -> mark session_progress.isCompleted = true
        if (assessment.sessionId && isPassed) {
          await tx
            .insert(sessionProgress)
            .values({
              accountId,
              sessionId: assessment.sessionId,
              lastPositionSec: 1200,
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

        // If Final Exam passed -> mark enrollment.finalExamPassed = true, issue Certificate & +4 Interview Credits
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
            const certCode = `3T-AI-2026-K01-00${accountId}`;
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

            // Bonus +4 interview credits per API 4.2 & 8.7
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

      res.json({
        attemptId: String(attempt.id),
        assessmentId: String(assessment.id),
        isFinalExam,
        submittedAt: (attempt.submittedAt || now).toLocaleString('vi-VN'),
        totalQuestions: items.length,
        correctCount,
        totalScore,
        maxPossibleScore,
        scorePercent,
        scorePct: scorePercent,
        passed: isPassed,
        isPassed,
        integrityStatus: attempt.integrityStatus,
        wrongItems,
        remedialRecommendations: wrongItems,
        updatedSkills,
        issuedCertificateCode,
        bonusInterviewCreditsAdded,
        updatedInterviewCredits,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 4.3 GET /assessments/:assessmentId/result
assessmentRouter.get(
  '/assessments/:assessmentId/result',
  requireAuth,
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

      const [items, allSkills] = await Promise.all([
        db
          .select()
          .from(assessmentItems)
          .where(eq(assessmentItems.assessmentId, assessment.id))
          .orderBy(asc(assessmentItems.itemOrder)),
        db.select().from(skills),
      ]);

      const skillMap = new Map(allSkills.map((s) => [s.id, s]));
      const questionsWithExplanations = items.map((item, idx) => {
        const pCfg = (item.promptConfig || {}) as PromptConfigShape;
        const gCfg = (item.gradingConfig || {}) as GradingConfigShape;
        const sk = skillMap.get(item.skillId);
        const jumpSec = gCfg.reviewJumpSec ?? 10;

        return {
          id: String(item.id),
          number: pCfg.number ?? item.itemOrder ?? idx + 1,
          skillId: String(item.skillId),
          skillName: sk?.name || 'Xây dựng luồng Hybrid RAG',
          prompt: pCfg.prompt || pCfg.question || '',
          options: Array.isArray(pCfg.options) ? pCfg.options : [],
          correctIndex: gCfg.correctIndex ?? 0,
          explanation:
            item.explanationMd ||
            'Xem lại đoạn bài giảng tương ứng để nắm vững kiến thức trọng tâm.',
          reviewTimestampLabel: gCfg.reviewTimestampLabel || '00:10 — 00:25',
          reviewJumpSec: jumpSec,
          reviewSegmentRangeSec: gCfg.reviewSegmentRangeSec || [jumpSec, jumpSec + 15],
          slideLabel: pCfg.slideLabel || 'Slide Trang 8',
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

      const answers = await db
        .select()
        .from(submissionAnswers)
        .where(eq(submissionAnswers.attemptId, attempt.id));

      const storedWrongItems = Array.isArray(attempt.remedialRecommendations)
        ? attempt.remedialRecommendations
        : [];

      const scorePercent = Math.round(Number(attempt.scorePct ?? 0));
      const isFinalExam = assessment.purpose === 'FINAL_EXAM';
      const passed = Boolean(attempt.isPassed);
      const correctCount =
        answers.length > 0
          ? answers.filter((a) => a.isCorrect).length
          : Math.round((scorePercent / 100) * items.length);

      const submission = {
        attemptId: String(attempt.id),
        assessmentId: String(assessment.id),
        isFinalExam,
        submittedAt: (attempt.submittedAt || attempt.startedAt).toLocaleString('vi-VN'),
        totalQuestions: items.length,
        correctCount,
        totalScore: Number(attempt.totalScore ?? correctCount),
        maxPossibleScore: Number(attempt.maxPossibleScore ?? items.length),
        scorePercent,
        scorePct: scorePercent,
        passed,
        isPassed: passed,
        integrityStatus: attempt.integrityStatus,
        wrongItems: storedWrongItems,
        remedialRecommendations: storedWrongItems,
        updatedSkills: [
          {
            skillId: '5',
            skillName: 'Xây dựng luồng Hybrid RAG',
            previousScore: 80,
            newScore: 86,
            delta: '+6 điểm',
          },
        ],
      };

      res.json({
        ...submission,
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
);

// 4.4 POST /assessments/attempts/:attemptId/proctoring-events
const proctoringEventSchema = z.object({
  tier: z.enum(['EDGE', 'SERVER']).default('EDGE'),
  eventType: z.enum(['NO_FACE', 'MULTI_FACE', 'FACE_MISMATCH', 'TAB_HIDDEN', 'FULLSCREEN_EXIT']),
  videoOffsetSec: z.number().int().min(0).optional(),
  confidence: z.number().min(0).max(1).default(0.95),
  snapshotR2Key: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

assessmentRouter.post(
  '/assessments/attempts/:attemptId/proctoring-events',
  requireAuth,
  validate(proctoringEventSchema),
  async (req, res, next) => {
    try {
      const attemptId = Number(req.params.attemptId);
      const { tier, eventType, videoOffsetSec, confidence, snapshotR2Key, details } = req.body;

      const riskDeltaMap: Record<string, number> = {
        MULTI_FACE: 40,
        FACE_MISMATCH: 50,
        TAB_HIDDEN: 20,
        FULLSCREEN_EXIT: 15,
        NO_FACE: 15,
      };
      const riskDelta = riskDeltaMap[eventType] || 15;

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
          eventType,
          videoOffsetSec,
          confidence,
          riskDelta: riskDelta.toFixed(2),
          snapshotR2Key,
          details: details || {},
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
