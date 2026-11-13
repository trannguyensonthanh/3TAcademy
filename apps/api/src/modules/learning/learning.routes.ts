import { Router } from 'express';
import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { db } from '../../db/index.js';
import {
  enrollments,
  cohorts,
  courses,
  classSessions,
  sessionProgress,
  sessionAttachments,
  assessments,
  assessmentItems,
  assessmentAttempts,
  studentSkillStates,
  skills,
  courseSkills,
  categories,
  notifications,
  discussionThreads,
  discussionPosts,
  userProfiles,
  accounts,
  knowledgeChunks,
  chatSessions,
  chatMessages,
  orders,
  paymentTransactions,
} from '../../db/schema/index.js';
import { requireAuth, optionalAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { aiServiceClient } from '../../integrations/aiService.client.js';
import { env } from '../../config/env.js';
import {
  resolveCohort,
  resolveSession,
  normalizeMasteryScore,
  formatScheduleLabels,
  buildInstructorStaffMap,
} from '../../db/helpers.js';

export const learningRouter = Router();

function formatSecondsToMmSs(sec: number | null | undefined): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function inferMaterialFileType(
  fileName: string,
  mimeType: string
): 'SLIDE' | 'PDF' | 'REPO' | 'NOTEBOOK' {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.ipynb') || lower.includes('notebook')) return 'NOTEBOOK';
  if (lower.includes('github') || lower.endsWith('.zip') || lower.includes('repo')) return 'REPO';
  if (lower.includes('slide') || lower.endsWith('.pptx')) return 'SLIDE';
  if (mimeType.includes('pdf') || lower.endsWith('.pdf')) return 'PDF';
  return 'PDF';
}

export async function buildFormattedDiscussions(
  sessionId: number,
  sessionOrder: number,
  sessionTitle: string,
  cohortIdStr?: string
) {
  const threads = await db
    .select({
      id: discussionThreads.id,
      sessionId: discussionThreads.sessionId,
      title: discussionThreads.title,
      videoTimestampSec: discussionThreads.videoTimestampSec,
      isResolved: discussionThreads.isResolved,
      createdAt: discussionThreads.createdAt,
      authorId: discussionThreads.authorId,
      authorName: userProfiles.fullName,
    })
    .from(discussionThreads)
    .leftJoin(userProfiles, eq(discussionThreads.authorId, userProfiles.accountId))
    .where(eq(discussionThreads.sessionId, sessionId))
    .orderBy(desc(discussionThreads.createdAt));

  const posts = await db
    .select({
      id: discussionPosts.id,
      threadId: discussionPosts.threadId,
      authorId: discussionPosts.authorId,
      contentMd: discussionPosts.contentMd,
      isAiGenerated: discussionPosts.isAiGenerated,
      isInstructorVerified: discussionPosts.isInstructorVerified,
      createdAt: discussionPosts.createdAt,
      authorName: userProfiles.fullName,
      authorRole: accounts.role,
    })
    .from(discussionPosts)
    .leftJoin(userProfiles, eq(discussionPosts.authorId, userProfiles.accountId))
    .leftJoin(accounts, eq(discussionPosts.authorId, accounts.id))
    .orderBy(asc(discussionPosts.createdAt));

  return threads.map((t) => {
    const threadPosts = posts.filter((p) => p.threadId === t.id);
    const firstUserPost = threadPosts.find((p) => !p.isAiGenerated);
    const aiPost = threadPosts.find((p) => p.isAiGenerated);
    const tsSec = t.videoTimestampSec ?? 0;

    return {
      id: String(t.id),
      cohortId: cohortIdStr || '',
      sessionId: String(t.sessionId),
      sessionOrder,
      sessionTitle: `Buổi ${sessionOrder}: ${sessionTitle}`,
      authorName: t.authorName || '',
      title: t.title,
      questionTitle: t.title,
      questionBody: firstUserPost?.contentMd || t.title,
      contentMd: firstUserPost?.contentMd || t.title,
      videoTimestampSec: tsSec,
      timestampSec: tsSec,
      timestampLabel: formatSecondsToMmSs(tsSec),
      isResolved: t.isResolved,
      createdAt: t.createdAt.toISOString(),
      aiSuggestedAnswer: aiPost?.contentMd,
      hasAiSuggestion: Boolean(aiPost),
      verifiedByStaff: Boolean(aiPost?.isInstructorVerified || t.isResolved),
      replies: threadPosts.map((p) => ({
        id: String(p.id),
        authorName: p.isAiGenerated ? 'Trợ giảng AI 3T (RAG)' : p.authorName || '',
        authorRole: (p.isAiGenerated
          ? 'AI_TUTOR'
          : p.authorRole === 'INSTRUCTOR' || p.authorRole === 'ADMIN'
            ? 'INSTRUCTOR'
            : 'STUDENT') as 'STUDENT' | 'INSTRUCTOR' | 'AI_TUTOR',
        role: p.isAiGenerated ? 'AI_TUTOR' : p.authorRole || 'INSTRUCTOR',
        content: p.contentMd,
        contentMd: p.contentMd,
        isAiGenerated: p.isAiGenerated,
        isInstructorVerified: p.isInstructorVerified,
        isVerifiedByStaff: p.isInstructorVerified,
        isOfficialVerify: p.isInstructorVerified,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  });
}

function mapClassSessionDto(
  s: typeof classSessions.$inferSelect,
  opts: {
    hostInstructorName?: string;
    isCompleted?: boolean;
    lastPositionSec?: number;
    attachmentsCount?: number;
    assessmentId?: string;
    quizScore?: number | null;
    quizQuestions?: Array<{
      id: string;
      question: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }>;
    aiCitations?: Array<{
      timestampSec: number;
      timestampLabel: string;
      topic: string;
      snippet: string;
    }>;
  } = {}
) {
  const isCompleted = Boolean(opts.isCompleted);
  const quizScore = opts.quizScore ?? (isCompleted ? 100 : null);
  const quizStatus: 'PASSED' | 'PENDING' | 'NOT_STARTED' = isCompleted
    ? 'PASSED'
    : quizScore !== null && quizScore !== undefined
      ? 'PENDING'
      : 'NOT_STARTED';

  return {
    id: String(s.id),
    cohortId: String(s.cohortId),
    sessionOrder: s.sessionOrder,
    title: s.title,
    descriptionMd: s.descriptionMd || '',
    activityTags: (s.activityTags || ['THEORY', 'LIVE_CODING']) as Array<
      'THEORY' | 'LIVE_CODING' | 'EXERCISE_REVIEW' | 'WORKSHOP'
    >,
    hostInstructorName: opts.hostInstructorName || '',
    scheduledStart: s.scheduledStart ? s.scheduledStart.toISOString() : '',
    scheduledEnd: s.scheduledEnd ? s.scheduledEnd.toISOString() : '',
    status: s.status as 'LIVE' | 'SCHEDULED' | 'REPLAY_READY',
    videoR2Key: s.videoR2Key || '',
    videoProvider: (s.videoProvider || 'R2_HLS_AES128') as 'R2_HLS_AES128' | 'BUNNY_STREAM',
    livekitRoomName: s.livekitRoomName,
    durationSeconds: s.durationSeconds || 5400,
    durationMinutes: Math.round((s.durationSeconds || 5400) / 60),
    isCompleted,
    lastPositionSec: opts.lastPositionSec ?? 0,
    aiSummaryMd: s.aiSummaryMd || '',
    attachmentsCount: opts.attachmentsCount ?? 0,
    assessmentId: opts.assessmentId,
    hasQuiz: Boolean(opts.assessmentId),
    quizId: opts.assessmentId || `quiz-sess-${s.id}`,
    quizTitle: `Trắc nghiệm củng cố Buổi ${s.sessionOrder}`,
    quizStatus,
    quizScore,
    quizQuestions: opts.quizQuestions || [],
    aiCitations: opts.aiCitations || [],
    guestJoinUrl:
      s.status === 'LIVE' ? `https://3t.edu.vn/live/guest/${s.id}` : undefined,
  };
}

// 3.1 GET /me/dashboard
learningRouter.get('/me/dashboard', requireAuth, async (req, res, next) => {
  try {
    const accountId = req.user!.id;

    const [myEnrollments, getStaffForInstructor] = await Promise.all([
      db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.accountId, accountId),
            inArray(enrollments.status, ['ACTIVE', 'COMPLETED'])
          )
        ),
      buildInstructorStaffMap(),
    ]);

    const cohortIds = myEnrollments.map((e) => e.cohortId);

    const [enrolledCohorts, enrolledSessions, progressRows, allAss, myAttempts, skillStates, userNotifs] =
      await Promise.all([
        cohortIds.length > 0
          ? db.select().from(cohorts).where(inArray(cohorts.id, cohortIds))
          : Promise.resolve([]),
        cohortIds.length > 0
          ? db
              .select()
              .from(classSessions)
              .where(inArray(classSessions.cohortId, cohortIds))
              .orderBy(asc(classSessions.sessionOrder))
          : Promise.resolve([]),
        db
          .select()
          .from(sessionProgress)
          .where(eq(sessionProgress.accountId, accountId))
          .orderBy(desc(sessionProgress.lastActivityAt)),
        cohortIds.length > 0
          ? db
              .select()
              .from(assessments)
              .where(
                and(inArray(assessments.cohortId, cohortIds), eq(assessments.status, 'PUBLISHED'))
              )
          : Promise.resolve([]),
        db
          .select()
          .from(assessmentAttempts)
          .where(eq(assessmentAttempts.accountId, accountId))
          .orderBy(desc(assessmentAttempts.submittedAt)),
        db
          .select({
            skillId: studentSkillStates.skillId,
            code: skills.code,
            name: skills.name,
            masteryScore: studentSkillStates.masteryScore,
            evidenceCount: studentSkillStates.evidenceCount,
            trend: studentSkillStates.trend,
            updatedAt: studentSkillStates.updatedAt,
          })
          .from(studentSkillStates)
          .innerJoin(skills, eq(studentSkillStates.skillId, skills.id))
          .where(eq(studentSkillStates.accountId, accountId)),
        db
          .select()
          .from(notifications)
          .where(eq(notifications.recipientId, accountId))
          .orderBy(desc(notifications.createdAt))
          .limit(10),
      ]);

    const cohortMap = new Map(enrolledCohorts.map((c) => [c.id, c]));
    const progressMap = new Map(progressRows.map((p) => [p.sessionId, p]));

    const mappedSessions = enrolledSessions.map((s) => {
      const cohort = cohortMap.get(s.cohortId);
      const staffInfo = cohort ? getStaffForInstructor(cohort.instructorId) : undefined;
      const prog = progressMap.get(s.id);
      const sessQuiz = allAss.find((a) => a.sessionId === s.id);
      const bestAttempt = sessQuiz
        ? myAttempts.find((att) => att.assessmentId === sessQuiz.id)
        : undefined;
      const isCompleted = Boolean(prog?.isCompleted || bestAttempt?.isPassed);
      const quizScore = bestAttempt?.scorePct
        ? Math.round(Number(bestAttempt.scorePct))
        : isCompleted
          ? 100
          : null;

      return mapClassSessionDto(s, {
        hostInstructorName: staffInfo?.instructorName,
        isCompleted,
        lastPositionSec: prog?.lastPositionSec ?? 0,
        assessmentId: sessQuiz ? String(sessQuiz.id) : undefined,
        quizScore,
      });
    });

    const liveSession =
      mappedSessions.find((s) => s.status === 'LIVE') || mappedSessions[0] || null;

    const resumeSession =
      mappedSessions.find((s) => !s.isCompleted && s.lastPositionSec > 0) ||
      mappedSessions.find((s) => !s.isCompleted) ||
      mappedSessions[0] ||
      null;

    const upcomingTasks = allAss.map((a) => {
      const cohort = cohortMap.get(a.cohortId);
      const bestAttempt = myAttempts.find((att) => att.assessmentId === a.id);
      const scoreNum = bestAttempt?.scorePct ? Math.round(Number(bestAttempt.scorePct)) : null;
      const isPassed = Boolean(bestAttempt?.isPassed);

      return {
        id: String(a.id),
        sessionId: a.sessionId ? String(a.sessionId) : String(mappedSessions[0]?.id || ''),
        cohortId: String(a.cohortId),
        cohortCode: cohort?.code || '',
        title: a.title,
        type: (a.purpose === 'FINAL_EXAM' ? 'PROJECT_MILESTONE' : 'SESSION_ASSIGNMENT') as
          | 'SESSION_ASSIGNMENT'
          | 'PROJECT_MILESTONE',
        dueText: a.dueAt ? a.dueAt.toLocaleDateString('vi-VN') : 'Tuần này',
        urgency: (isPassed ? 'SAFE' : bestAttempt ? 'WARNING' : 'URGENT') as
          | 'SAFE'
          | 'WARNING'
          | 'URGENT',
        score: scoreNum,
        statusLabel: isPassed
          ? `Đã đạt (${scoreNum}%)`
          : bestAttempt
            ? `Cần làm lại (${scoreNum}%)`
            : 'Chưa làm bài',
      };
    });

    // Dynamic attemptTrend from student's actual assessment attempts
    const chronologicalAttempts = [...myAttempts].reverse();
    const attemptTrend = chronologicalAttempts.map((att, idx) => {
      const ass = allAss.find((a) => a.id === att.assessmentId);
      const sess = ass?.sessionId
        ? enrolledSessions.find((s) => s.id === ass.sessionId)
        : undefined;
      const val = Math.round(Number(att.scorePct || 0));
      return {
        label: sess ? `Buổi ${sess.sessionOrder}` : `Lượt ${idx + 1}`,
        subLabel: sess?.title || ass?.title || '',
        value: val,
        detailText: `${val}/100 điểm · ${att.isPassed ? 'Đạt chuẩn' : 'Cần ôn tập thêm'}`,
      };
    });

    const completedSessionsCount = progressRows.filter((p) => p.isCompleted).length;

    res.json({
      liveSession,
      resumeSession,
      upcomingTasks,
      streakDays: completedSessionsCount,
      skillMastery: skillStates.map((s) => {
        const score = normalizeMasteryScore(s.masteryScore);
        return {
          skillId: String(s.skillId),
          code: s.code,
          skillName: s.name,
          score,
          masteryScore: score,
          evidenceCount: s.evidenceCount,
          trend: s.trend > 0 ? `+${Math.round(s.trend * 100)}%` : 'Ổn định',
          lastUpdated: s.updatedAt.toLocaleDateString('vi-VN'),
        };
      }),
      attemptTrend,
      notifications: userNotifs.map((n) => ({
        id: String(n.id),
        type: n.type,
        title: n.title,
        body: n.body,
        isRead: n.isRead,
        readAt: n.readAt ? n.readAt.toISOString() : undefined,
        actedAt: n.actedAt ? n.actedAt.toISOString() : undefined,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// 3.2 GET /me/enrollments
learningRouter.get('/me/enrollments', requireAuth, async (req, res, next) => {
  try {
    const accountId = req.user!.id;

    const [rows, getStaffForInstructor, paidOrders] = await Promise.all([
      db
        .select({
          enrollmentId: enrollments.id,
          status: enrollments.status,
          finalExamPassed: enrollments.finalExamPassed,
          dropoutRiskScore: enrollments.dropoutRiskScore,
          riskLevel: enrollments.riskLevel,
          enrolledAt: enrollments.enrolledAt,
          cohort: cohorts,
          course: courses,
        })
        .from(enrollments)
        .innerJoin(cohorts, eq(enrollments.cohortId, cohorts.id))
        .innerJoin(courses, eq(cohorts.courseId, courses.id))
        .where(
          and(
            eq(enrollments.accountId, accountId),
            inArray(enrollments.status, ['ACTIVE', 'COMPLETED'])
          )
        ),
      buildInstructorStaffMap(),
      db
        .select()
        .from(orders)
        .where(and(eq(orders.accountId, accountId), eq(orders.status, 'PAID')))
        .orderBy(desc(orders.paidAt)),
    ]);

    const enrichedEnrollments = await Promise.all(
      rows.map(async (r) => {
        const allSessions = await db
          .select()
          .from(classSessions)
          .where(eq(classSessions.cohortId, r.cohort.id));

        const completedRows = await db
          .select()
          .from(sessionProgress)
          .innerJoin(classSessions, eq(sessionProgress.sessionId, classSessions.id))
          .where(
            and(
              eq(sessionProgress.accountId, accountId),
              eq(classSessions.cohortId, r.cohort.id),
              eq(sessionProgress.isCompleted, true)
            )
          );

        const totalSessionsCount = allSessions.length || 1;
        const completedSessionsCount = completedRows.length;
        const progressPercent = Math.round((completedSessionsCount / totalSessionsCount) * 100);
        const staffInfo = getStaffForInstructor(r.cohort.instructorId);
        const labels = formatScheduleLabels(r.cohort.scheduleSlots || []);

        return {
          id: String(r.enrollmentId),
          cohortId: String(r.cohort.id),
          cohortCode: r.cohort.code,
          status: r.status,
          progressPercent,
          completedSessionsCount,
          totalSessionsCount,
          finalExamPassed: r.finalExamPassed,
          dropoutRiskScore: r.dropoutRiskScore,
          riskLevel: r.riskLevel,
          enrolledAt: r.enrolledAt,
          cohort: {
            id: String(r.cohort.id),
            courseId: String(r.course.id),
            instructorId: String(r.cohort.instructorId),
            courseSlug: r.course.slug,
            courseTitle: r.course.title,
            code: r.cohort.code,
            name: r.cohort.name,
            status: r.cohort.status,
            curriculumVersion: r.cohort.curriculumVersion,
            techStackNotes: r.cohort.techStackNotes,
            tuitionVnd: r.cohort.tuitionVnd,
            enrolledCount: r.cohort.enrolledCount,
            enrollmentOpenAt: r.cohort.enrollmentOpenAt.toISOString(),
            startDate: r.cohort.startDate,
            endDate: r.cohort.endDate,
            scheduleLabel: labels.scheduleLabel,
            timeRangeLabel: labels.timeRangeLabel,
            scheduleSlots: r.cohort.scheduleSlots || [],
            instructorName: staffInfo.instructorName,
            instructorHeadline: staffInfo.instructorHeadline,
            instructorAvatarUrl: staffInfo.instructorAvatarUrl,
            staff: staffInfo.staff,
          },
          course: {
            id: String(r.course.id),
            title: r.course.title,
            slug: r.course.slug,
            thumbnailUrl: r.course.thumbnailUrl,
            difficultyLevel: r.course.difficultyLevel,
          },
        };
      })
    );

    const receipts = await Promise.all(
      paidOrders.map(async (ord) => {
        const [cohort] = await db
          .select()
          .from(cohorts)
          .where(eq(cohorts.id, ord.cohortId))
          .limit(1);
        const [course] = cohort
          ? await db.select().from(courses).where(eq(courses.id, cohort.courseId)).limit(1)
          : [];
        const [tx] = await db
          .select()
          .from(paymentTransactions)
          .where(eq(paymentTransactions.orderId, ord.id))
          .limit(1);

        return {
          orderCode: ord.orderCode,
          cohortCode: cohort?.code || '',
          courseTitle: course?.title || cohort?.name || '',
          amountVnd: ord.amountVnd,
          paidAt: (ord.paidAt || ord.createdAt).toLocaleString('vi-VN'),
          bankName: env.SEPAY_BANK_NAME,
          transactionRef: tx?.gatewayTxnId || `FT-${ord.orderCode}`,
        };
      })
    );

    res.json({
      enrolledCohortIds: enrichedEnrollments.map((e) => e.cohortId),
      cohorts: enrichedEnrollments.map((e) => e.cohort),
      receipts,
      enrollments: enrichedEnrollments,
    });
  } catch (err) {
    next(err);
  }
});

// 3.3 GET /cohorts/:cohortId/workspace
learningRouter.get('/cohorts/:cohortId/workspace', requireAuth, async (req, res, next) => {
  try {
    const cohort = await resolveCohort(req.params.cohortId);
    if (!cohort) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'COHORT_NOT_FOUND',
        message: 'Không tìm thấy lớp học',
        error: {
          code: 'COHORT_NOT_FOUND',
          message: 'Không tìm thấy lớp học',
        },
      });
      return;
    }

    const studentAccountId = req.user!.id;
    let studentEnrollment: typeof enrollments.$inferSelect | undefined;

    if (req.user!.role === 'STUDENT') {
      const [enr] = await db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.accountId, studentAccountId),
            eq(enrollments.cohortId, cohort.id),
            inArray(enrollments.status, ['ACTIVE', 'COMPLETED'])
          )
        )
        .limit(1);

      if (!enr) {
        const message = 'Bạn chưa ghi danh hoặc chưa hoàn tất thanh toán học phí cho đợt học này';
        res.status(403).json({
          success: false,
          status: 403,
          code: 'NOT_ENROLLED_IN_COHORT',
          message,
          error: {
            code: 'NOT_ENROLLED_IN_COHORT',
            message,
          },
        });
        return;
      }
      studentEnrollment = enr;
    }

    const [
      [course],
      sessions,
      cohortAssessments,
      getStaffForInstructor,
      allCats,
      allSkills,
      allCourseSkills,
      progressList,
      attemptList,
    ] = await Promise.all([
      db.select().from(courses).where(eq(courses.id, cohort.courseId)).limit(1),
      db
        .select()
        .from(classSessions)
        .where(eq(classSessions.cohortId, cohort.id))
        .orderBy(asc(classSessions.sessionOrder)),
      db.select().from(assessments).where(eq(assessments.cohortId, cohort.id)),
      buildInstructorStaffMap(),
      db.select().from(categories),
      db.select().from(skills),
      db.select().from(courseSkills),
      db
        .select()
        .from(sessionProgress)
        .where(eq(sessionProgress.accountId, studentAccountId)),
      db
        .select()
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.accountId, studentAccountId))
        .orderBy(desc(assessmentAttempts.submittedAt)),
    ]);

    const sessionIds = sessions.map((s) => s.id);
    const [attachments, allAssessmentItems, allChunks] = await Promise.all([
      sessionIds.length > 0
        ? db
            .select()
            .from(sessionAttachments)
            .where(inArray(sessionAttachments.sessionId, sessionIds))
        : Promise.resolve([]),
      cohortAssessments.length > 0
        ? db
            .select()
            .from(assessmentItems)
            .where(
              inArray(
                assessmentItems.assessmentId,
                cohortAssessments.map((a) => a.id)
              )
            )
            .orderBy(asc(assessmentItems.itemOrder))
        : Promise.resolve([]),
      sessionIds.length > 0
        ? db
            .select()
            .from(knowledgeChunks)
            .where(inArray(knowledgeChunks.sessionId, sessionIds))
            .orderBy(asc(knowledgeChunks.chunkIndex))
        : Promise.resolve([]),
    ]);

    const progressMap = new Map(progressList.map((p) => [p.sessionId, p]));
    const staffInfo = getStaffForInstructor(cohort.instructorId);
    const labels = formatScheduleLabels(cohort.scheduleSlots || []);

    const finalExam = cohortAssessments.find((a) => a.purpose === 'FINAL_EXAM');
    const finalExamAttempt = finalExam
      ? attemptList.find((att) => att.assessmentId === finalExam.id && att.isPassed)
      : undefined;

    const mappedSessions = sessions.map((s) => {
      const prog = progressMap.get(s.id);
      const sessQuiz = cohortAssessments.find(
        (a) => a.sessionId === s.id && a.purpose === 'SESSION_ASSIGNMENT'
      );
      const bestQuizAttempt = sessQuiz
        ? attemptList.find((att) => att.assessmentId === sessQuiz.id)
        : undefined;

      const isCompleted = Boolean(prog?.isCompleted || bestQuizAttempt?.isPassed);
      const quizScore = bestQuizAttempt?.scorePct
        ? Math.round(Number(bestQuizAttempt.scorePct))
        : isCompleted
          ? 100
          : null;

      const sessAttachments = attachments.filter((att) => att.sessionId === s.id);
      const quizItems = sessQuiz
        ? allAssessmentItems.filter((item) => item.assessmentId === sessQuiz.id)
        : [];
      const sessChunks = allChunks.filter((ch) => ch.sessionId === s.id);

      const quizQuestions = quizItems.map((item) => {
        const pCfg = (item.promptConfig || {}) as { prompt?: string; question?: string; options?: string[] };
        const gCfg = (item.gradingConfig || {}) as { correctIndex?: number };
        return {
          id: String(item.id),
          question: pCfg.prompt || pCfg.question || '',
          options: Array.isArray(pCfg.options) ? pCfg.options : [],
          correctIndex: gCfg.correctIndex ?? 0,
          explanation: item.explanationMd || '',
        };
      });

      const aiCitations = sessChunks.map((ch, idx) => {
        const sec = ch.startSec ?? idx * 15 + 10;
        return {
          timestampSec: sec,
          timestampLabel: formatSecondsToMmSs(sec),
          topic: ch.pageNumber ? `Slide Trang ${ch.pageNumber}` : `Phần ${idx + 1}`,
          snippet: ch.content,
        };
      });

      return mapClassSessionDto(s, {
        hostInstructorName: staffInfo.instructorName,
        isCompleted,
        lastPositionSec: prog?.lastPositionSec ?? 0,
        attachmentsCount: sessAttachments.length,
        assessmentId: sessQuiz ? String(sessQuiz.id) : undefined,
        quizScore,
        quizQuestions,
        aiCitations,
      });
    });

    const mappedMaterials = attachments.map((att) => {
      const sess = sessions.find((s) => s.id === att.sessionId);
      const fileType = inferMaterialFileType(att.fileName, att.mimeType);
      const sizeStr = `${(att.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
      return {
        id: String(att.id),
        cohortId: String(cohort.id),
        sessionId: String(att.sessionId),
        sessionOrder: sess?.sessionOrder ?? 1,
        title: att.fileName,
        fileName: att.fileName,
        fileType,
        type: fileType,
        mimeType: att.mimeType,
        fileSize: sizeStr,
        sizeLabel: sizeStr,
        fileSizeBytes: att.fileSizeBytes,
        downloadUrl: `https://cdn.3t.edu.vn/${att.r2ObjectKey}`,
        updatedAt: att.createdAt.toLocaleDateString('vi-VN'),
      };
    });

    const catMap = new Map(allCats.map((c) => [c.id, c]));
    const skillMap = new Map(allSkills.map((s) => [s.id, s]));
    const syllabus = Array.isArray(course?.syllabusTemplate) ? course.syllabusTemplate : [];
    const eligibleForFinalExam =
      mappedSessions.length > 0 && mappedSessions.every((s) => s.isCompleted);

    res.json({
      cohort: {
        id: String(cohort.id),
        courseId: String(cohort.courseId),
        instructorId: String(cohort.instructorId),
        courseSlug: course?.slug || '',
        courseTitle: course?.title || cohort.name,
        code: cohort.code,
        name: cohort.name,
        status: cohort.status,
        curriculumVersion: cohort.curriculumVersion,
        techStackNotes: cohort.techStackNotes,
        tuitionVnd: cohort.tuitionVnd,
        enrolledCount: cohort.enrolledCount,
        enrollmentOpenAt: cohort.enrollmentOpenAt.toISOString(),
        startDate: cohort.startDate,
        endDate: cohort.endDate,
        scheduleLabel: labels.scheduleLabel,
        timeRangeLabel: labels.timeRangeLabel,
        scheduleSlots: cohort.scheduleSlots || [],
        instructorName: staffInfo.instructorName,
        instructorHeadline: staffInfo.instructorHeadline,
        instructorAvatarUrl: staffInfo.instructorAvatarUrl,
        staff: staffInfo.staff,
      },
      course: course
        ? {
            id: String(course.id),
            slug: course.slug,
            title: course.title,
            category: catMap.get(course.categoryId)?.name || '',
            shortDescription: course.shortDescription,
            descriptionMd: course.descriptionMd,
            thumbnailUrl: course.thumbnailUrl,
            difficultyLevel: course.difficultyLevel,
            durationWeeks: syllabus.length > 0 ? Math.ceil(syllabus.length / 2) : 0,
            totalHours: syllabus.length * 3,
            ratingAvg: 0,
            reviewCount: 0,
            syllabusTemplate: syllabus,
            skills: allCourseSkills
              .filter((cs) => cs.courseId === course.id)
              .map((cs) => {
                const sk = skillMap.get(cs.skillId);
                return sk
                  ? {
                      id: String(sk.id),
                      type: cs.skillRole,
                      code: sk.code,
                      name: sk.name,
                    }
                  : null;
              })
              .filter((x): x is NonNullable<typeof x> => x !== null),
          }
        : null,
      sessions: mappedSessions,
      materials: mappedMaterials,
      assessments: cohortAssessments.map((a) => ({
        ...a,
        id: String(a.id),
        cohortId: String(a.cohortId),
        sessionId: a.sessionId ? String(a.sessionId) : null,
      })),
      finalExamId: finalExam ? String(finalExam.id) : undefined,
      finalExamPassed: Boolean(studentEnrollment?.finalExamPassed || finalExamAttempt),
      eligibleForFinalExam,
    });
  } catch (err) {
    next(err);
  }
});

// 3.4 GET /cohorts/:cohortId/sessions/:sessionId
learningRouter.get(
  '/cohorts/:cohortId/sessions/:sessionId',
  requireAuth,
  async (req, res, next) => {
    try {
      const cohort = await resolveCohort(req.params.cohortId);
      const session = await resolveSession(req.params.sessionId, cohort?.id);

      if (!session) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy buổi học',
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Không tìm thấy buổi học',
          },
        });
        return;
      }

      const studentAccountId = req.user!.id;
      if (req.user!.role === 'STUDENT') {
        const [enr] = await db
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.accountId, studentAccountId),
              eq(enrollments.cohortId, session.cohortId),
              inArray(enrollments.status, ['ACTIVE', 'COMPLETED'])
            )
          )
          .limit(1);

        if (!enr) {
          const message = 'Bạn chưa ghi danh hoặc chưa hoàn tất thanh toán học phí cho đợt học này';
          res.status(403).json({
            success: false,
            status: 403,
            code: 'NOT_ENROLLED_IN_COHORT',
            message,
            error: {
              code: 'NOT_ENROLLED_IN_COHORT',
              message,
            },
          });
          return;
        }
      }

      const [attachments, [quiz], discussions, progRows, chunks, getStaffForInstructor] =
        await Promise.all([
          db
            .select()
            .from(sessionAttachments)
            .where(eq(sessionAttachments.sessionId, session.id)),
          db
            .select()
            .from(assessments)
            .where(eq(assessments.sessionId, session.id))
            .limit(1),
          buildFormattedDiscussions(
            session.id,
            session.sessionOrder,
            session.title,
            String(session.cohortId)
          ),
          db
            .select()
            .from(sessionProgress)
            .where(
              and(
                eq(sessionProgress.accountId, studentAccountId),
                eq(sessionProgress.sessionId, session.id)
              )
            )
            .limit(1),
          db
            .select()
            .from(knowledgeChunks)
            .where(eq(knowledgeChunks.sessionId, session.id))
            .orderBy(asc(knowledgeChunks.chunkIndex)),
          buildInstructorStaffMap(),
        ]);

      const prog = progRows[0];
      const staffInfo = getStaffForInstructor(session.instructorId);

      let bestQuizAttempt: typeof assessmentAttempts.$inferSelect | undefined;
      let quizItems: Array<typeof assessmentItems.$inferSelect> = [];
      if (quiz) {
        const [attempts, items] = await Promise.all([
          db
            .select()
            .from(assessmentAttempts)
            .where(
              and(
                eq(assessmentAttempts.assessmentId, quiz.id),
                eq(assessmentAttempts.accountId, studentAccountId)
              )
            )
            .orderBy(desc(assessmentAttempts.scorePct)),
          db
            .select()
            .from(assessmentItems)
            .where(eq(assessmentItems.assessmentId, quiz.id))
            .orderBy(asc(assessmentItems.itemOrder)),
        ]);
        bestQuizAttempt = attempts[0];
        quizItems = items;
      }

      const isCompleted = Boolean(prog?.isCompleted || bestQuizAttempt?.isPassed);
      const quizScore = bestQuizAttempt?.scorePct
        ? Math.round(Number(bestQuizAttempt.scorePct))
        : isCompleted
          ? 100
          : null;

      const quizQuestions = quizItems.map((item) => {
        const pCfg = (item.promptConfig || {}) as { prompt?: string; question?: string; options?: string[] };
        const gCfg = (item.gradingConfig || {}) as { correctIndex?: number };
        return {
          id: String(item.id),
          question: pCfg.prompt || pCfg.question || '',
          options: Array.isArray(pCfg.options) ? pCfg.options : [],
          correctIndex: gCfg.correctIndex ?? 0,
          explanation: item.explanationMd || '',
        };
      });

      const aiCitations = chunks.map((ch, idx) => {
        const sec = ch.startSec ?? idx * 15 + 10;
        return {
          timestampSec: sec,
          timestampLabel: formatSecondsToMmSs(sec),
          topic: ch.pageNumber ? `Slide Trang ${ch.pageNumber}` : `Phần ${idx + 1}`,
          snippet: ch.content,
        };
      });

      const transcript = chunks.map((ch, idx) => {
        const sec = ch.startSec ?? idx * 15 + 10;
        const slidePage = ch.pageNumber ?? idx * 4 + 8;
        return {
          id: `cue-${ch.id}`,
          sec,
          startSec: sec,
          endSec: ch.endSec ?? (idx + 1) * 15 + 10,
          timeLabel: formatSecondsToMmSs(sec),
          speaker: staffInfo.instructorName,
          text: ch.content,
          slidePage,
          slideLabel: `Slide Trang ${slidePage}`,
        };
      });

      const chapters = chunks.map((ch, idx) => {
        const sec = ch.startSec ?? idx * 15 + 10;
        const slidePage = ch.pageNumber ?? idx * 4 + 8;
        return {
          id: `chap-${ch.id}`,
          sec,
          startSec: sec,
          timeLabel: formatSecondsToMmSs(sec),
          title: `Phần ${idx + 1}: ${ch.content.slice(0, 72)}`,
          slideRange: `Slide ${slidePage}`,
          slideLabel: `Slide Trang ${slidePage}`,
        };
      });

      const tutorSessions = await db
        .select()
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.accountId, studentAccountId),
            eq(chatSessions.sessionId, session.id),
            eq(chatSessions.scope, 'SESSION_TUTOR')
          )
        )
        .orderBy(desc(chatSessions.createdAt));

      let aiChatHistory: Array<{
        id: string;
        role: 'AI' | 'USER';
        content: string;
        citations?: Array<{ label: string; jumpSec: number; slideLabel: string }>;
        createdAt: string;
      }> = [];

      if (tutorSessions[0]) {
        const msgs = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.chatSessionId, tutorSessions[0].id))
          .orderBy(asc(chatMessages.createdAt));

        aiChatHistory = msgs.map((m) => ({
          id: String(m.id),
          role: m.role === 'assistant' ? 'AI' : 'USER',
          content: m.content,
          citations: Array.isArray(m.citations)
            ? (m.citations as Array<{ label: string; jumpSec: number; slideLabel: string }>)
            : [],
          createdAt: m.createdAt.toISOString(),
        }));
      }

      res.json({
        session: mapClassSessionDto(session, {
          hostInstructorName: staffInfo.instructorName,
          isCompleted,
          lastPositionSec: prog?.lastPositionSec ?? 0,
          attachmentsCount: attachments.length,
          assessmentId: quiz ? String(quiz.id) : undefined,
          quizScore,
          quizQuestions,
          aiCitations,
        }),
        videoUrl: session.videoR2Key
          ? `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4`
          : '',
        transcript,
        chapters,
        aiChatHistory,
        attachments: attachments.map((att) => {
          const fileType = inferMaterialFileType(att.fileName, att.mimeType);
          const sizeStr = `${(att.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
          return {
            id: String(att.id),
            cohortId: String(session.cohortId),
            sessionId: String(session.id),
            sessionOrder: session.sessionOrder,
            title: att.fileName,
            fileName: att.fileName,
            fileType,
            type: fileType,
            mimeType: att.mimeType,
            fileSize: sizeStr,
            sizeLabel: sizeStr,
            fileSizeBytes: att.fileSizeBytes,
            downloadUrl: `https://cdn.3t.edu.vn/${att.r2ObjectKey}`,
            updatedAt: att.createdAt.toLocaleDateString('vi-VN'),
          };
        }),
        quizSummary: quiz
          ? {
              id: String(quiz.id),
              assessmentId: String(quiz.id),
              title: quiz.title,
              questionCount: quizItems.length,
              passScorePct: quiz.passScorePct,
              passingScoreOutOf10: Number((quiz.passScorePct / 10).toFixed(1)),
              durationMinutes: quiz.durationMinutes,
              status: quiz.status,
              bestScorePercent: quizScore,
              bestScorePct: quizScore,
              isCompleted,
              isPassed: isCompleted,
            }
          : null,
        discussions,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 3.5 PUT /sessions/:sessionId/progress
const progressSchema = z.object({
  lastPositionSec: z.number().int().min(0),
  durationSeconds: z.number().int().positive().optional(),
});

learningRouter.put(
  '/sessions/:sessionId/progress',
  requireAuth,
  validate(progressSchema),
  async (req, res, next) => {
    try {
      const session = await resolveSession(req.params.sessionId);
      const sessionId = session?.id ?? Number(req.params.sessionId);
      const accountId = req.user!.id;
      const { lastPositionSec } = req.body;

      const [existingProg] = await db
        .select()
        .from(sessionProgress)
        .where(
          and(
            eq(sessionProgress.accountId, accountId),
            eq(sessionProgress.sessionId, sessionId)
          )
        )
        .limit(1);

      const isCompleted = existingProg?.isCompleted ?? false;
      const now = new Date();

      await db
        .insert(sessionProgress)
        .values({
          accountId,
          sessionId,
          lastPositionSec,
          isCompleted,
          completedAt: existingProg?.completedAt ?? null,
          lastActivityAt: now,
        })
        .onConflictDoUpdate({
          target: [sessionProgress.accountId, sessionProgress.sessionId],
          set: {
            lastPositionSec,
            lastActivityAt: now,
          },
        });

      res.json({
        sessionId: String(sessionId),
        lastPositionSec,
        isCompleted,
        savedAt: now.toISOString(),
        updatedSession: session
          ? mapClassSessionDto(session, { isCompleted, lastPositionSec })
          : undefined,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 3.6 POST /sessions/:sessionId/quiz-submit
const quickQuizSubmitSchema = z.object({
  answers: z.array(z.number().int()),
});

learningRouter.post(
  '/sessions/:sessionId/quiz-submit',
  requireAuth,
  validate(quickQuizSubmitSchema),
  async (req, res, next) => {
    try {
      const session = await resolveSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy buổi học',
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Không tìm thấy buổi học',
          },
        });
        return;
      }

      const accountId = req.user!.id;
      const { answers } = req.body;

      const [quiz] = await db
        .select()
        .from(assessments)
        .where(eq(assessments.sessionId, session.id))
        .limit(1);

      let correctCount = 0;
      let totalQuestions = answers.length;
      const passThreshold = quiz?.passScorePct ?? 70;

      if (quiz) {
        const items = await db
          .select()
          .from(assessmentItems)
          .where(eq(assessmentItems.assessmentId, quiz.id))
          .orderBy(asc(assessmentItems.itemOrder));

        if (items.length > 0) {
          totalQuestions = items.length;
          items.forEach((item, idx) => {
            const gCfg = item.gradingConfig as { correctIndex?: number };
            const pCfg = item.promptConfig as { correctIndex?: number };
            const expectedIdx = gCfg?.correctIndex ?? pCfg?.correctIndex ?? 0;
            if (answers[idx] === expectedIdx) {
              correctCount += 1;
            }
          });
        }
      }

      const scorePercent =
        totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
      const passed = scorePercent >= passThreshold;
      const now = new Date();

      if (passed) {
        await db
          .insert(sessionProgress)
          .values({
            accountId,
            sessionId: session.id,
            lastPositionSec: session.durationSeconds || 0,
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

      if (quiz) {
        await db.insert(assessmentAttempts).values({
          assessmentId: quiz.id,
          accountId,
          attemptNumber: 1,
          startedAt: now,
          submittedAt: now,
          gradingCompletedAt: now,
          totalScore: String(correctCount),
          maxPossibleScore: String(totalQuestions),
          scorePct: String(scorePercent),
          isPassed: passed,
          remedialRecommendations: [],
          totalRiskScore: '0.00',
          integrityStatus: 'CLEAN',
        });
      }

      res.json({
        scorePercent,
        correctCount,
        totalQuestions,
        passed,
        newQuizStatus: passed ? 'PASSED' : 'PENDING',
        sessionCompleted: passed,
        feedbackMessage: passed
          ? `Chúc mừng! Bạn đạt ${scorePercent}% (${correctCount}/${totalQuestions} câu đúng) và đã hoàn thành Buổi ${session.sessionOrder}.`
          : `Bạn đạt ${scorePercent}% (${correctCount}/${totalQuestions} câu đúng). Cần tối thiểu ${passThreshold}% để hoàn thành buổi học.`,
        updatedSession: mapClassSessionDto(session, {
          isCompleted: passed,
          quizScore: scorePercent,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

// 3.7 POST /ai/tutor/ask
const tutorAskSchema = z.object({
  cohortId: z.union([z.number(), z.string()]).optional(),
  sessionId: z.union([z.number(), z.string()]),
  question: z.string().min(2),
  currentVideoSec: z.number().int().min(0).optional(),
  currentTimestampSec: z.number().int().min(0).optional(),
});

learningRouter.post(
  '/ai/tutor/ask',
  requireAuth,
  validate(tutorAskSchema),
  async (req, res, next) => {
    try {
      const {
        cohortId: rawCohortId,
        sessionId: rawSessionId,
        question,
        currentVideoSec,
        currentTimestampSec,
      } = req.body;
      const accountId = req.user!.id;
      const videoSec = currentVideoSec ?? currentTimestampSec ?? 0;

      const cohort = rawCohortId ? await resolveCohort(rawCohortId) : undefined;
      const session = await resolveSession(rawSessionId, cohort?.id);
      if (!session) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy buổi học',
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Không tìm thấy buổi học',
          },
        });
        return;
      }

      const resolvedCohortId = session.cohortId;
      const resolvedSessionId = session.id;

      let answerMd = '';
      let detectedTopic = 'RAG & Vector Search';
      let citations: Array<{ label: string; jumpSec: number; slideLabel: string }> = [];

      try {
        const aiResp = await aiServiceClient.askSessionTutor({
          cohortId: resolvedCohortId,
          sessionId: resolvedSessionId,
          question,
          currentVideoSec: videoSec,
        });
        answerMd = aiResp.answerMd;
        detectedTopic = aiResp.detectedTopic || detectedTopic;
        if (Array.isArray(aiResp.citations) && aiResp.citations.length > 0) {
          citations = aiResp.citations.map((c, idx) => ({
            label: `[${formatSecondsToMmSs(c.startSec ?? (idx + 1) * 15)}]`,
            jumpSec: c.startSec ?? (idx + 1) * 15,
            slideLabel: c.pageNumber ? `Slide Trang ${c.pageNumber}` : `Slide Trang ${idx * 4 + 8}`,
          }));
        }
      } catch {
        const chunks = await db
          .select()
          .from(knowledgeChunks)
          .where(eq(knowledgeChunks.sessionId, resolvedSessionId))
          .orderBy(asc(knowledgeChunks.chunkIndex))
          .limit(3);

        citations = chunks.map((ch, idx) => {
          const sec = ch.startSec ?? (idx + 1) * 15;
          return {
            label: `[${formatSecondsToMmSs(sec)}]`,
            jumpSec: sec,
            slideLabel: ch.pageNumber ? `Slide Trang ${ch.pageNumber}` : `Slide Trang ${idx * 4 + 8}`,
          };
        });

        const snippet = chunks.map((c) => c.content).join('\n\n');
        answerMd = snippet
          ? `Dựa trên nội dung bài giảng tại mốc **[${formatSecondsToMmSs(videoSec)}]**:\n\n${snippet}`
          : `Câu hỏi của bạn tại mốc **[${formatSecondsToMmSs(videoSec)}]** đã được ghi nhận.`;
      }

      let [chatSess] = await db
        .select()
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.accountId, accountId),
            eq(chatSessions.sessionId, resolvedSessionId),
            eq(chatSessions.scope, 'SESSION_TUTOR')
          )
        )
        .limit(1);

      if (!chatSess) {
        const [created] = await db
          .insert(chatSessions)
          .values({
            accountId,
            scope: 'SESSION_TUTOR',
            cohortId: resolvedCohortId,
            sessionId: resolvedSessionId,
            title: `Hỏi đáp Trợ giảng AI — Buổi ${session.sessionOrder}`,
          })
          .returning();
        chatSess = created;
      }

      if (chatSess) {
        await db.insert(chatMessages).values([
          {
            chatSessionId: chatSess.id,
            role: 'user',
            content: question,
            detectedTopic,
          },
          {
            chatSessionId: chatSess.id,
            role: 'assistant',
            content: answerMd,
            citations,
            llmProvider: 'gemini',
            llmModel: 'gemini-2.5-flash',
          },
        ]);
      }

      res.json({
        answerMd,
        detectedTopic,
        citations,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 3.8 GET /sessions/:sessionId/discussions
learningRouter.get('/sessions/:sessionId/discussions', async (req, res, next) => {
  try {
    const session = await resolveSession(req.params.sessionId);
    if (!session) {
      res.json([]);
      return;
    }
    const formatted = await buildFormattedDiscussions(
      session.id,
      session.sessionOrder,
      session.title,
      String(session.cohortId)
    );
    res.json(formatted);
  } catch (err) {
    next(err);
  }
});

// 3.9 POST /sessions/:sessionId/discussions
const createDiscussionSchema = z.object({
  title: z.string().optional(),
  contentMd: z.string().min(3),
  videoTimestampSec: z.number().int().min(0).optional(),
});

learningRouter.post(
  '/sessions/:sessionId/discussions',
  requireAuth,
  validate(createDiscussionSchema),
  async (req, res, next) => {
    try {
      const session = await resolveSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy buổi học',
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Không tìm thấy buổi học',
          },
        });
        return;
      }

      const authorId = req.user!.id;
      const { title: rawTitle, contentMd, videoTimestampSec } = req.body;
      const title = rawTitle && rawTitle.trim().length >= 3 ? rawTitle.trim() : contentMd.slice(0, 80);
      const tsSec = videoTimestampSec ?? 0;

      const chunks = await db
        .select()
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.sessionId, session.id))
        .orderBy(asc(knowledgeChunks.chunkIndex))
        .limit(1);

      const aiAnswer = chunks[0]?.content
        ? `Gợi ý từ Trợ giảng AI tại mốc **[${formatSecondsToMmSs(tsSec)}]**: ${chunks[0].content}`
        : `Gợi ý từ Trợ giảng AI tại mốc **[${formatSecondsToMmSs(tsSec)}]**: Câu hỏi của bạn đã được chuyển tới Giảng viên phụ trách lớp để xác thực.`;

      const result = await db.transaction(async (tx) => {
        const [thread] = await tx
          .insert(discussionThreads)
          .values({
            sessionId: session.id,
            authorId,
            title,
            videoTimestampSec: tsSec,
          })
          .returning();

        await tx.insert(discussionPosts).values({
          threadId: thread!.id,
          authorId,
          contentMd,
          isAiGenerated: false,
        });

        await tx.insert(discussionPosts).values({
          threadId: thread!.id,
          authorId: null,
          contentMd: aiAnswer,
          isAiGenerated: true,
          isInstructorVerified: false,
        });

        return thread!;
      });

      const allThreads = await buildFormattedDiscussions(
        session.id,
        session.sessionOrder,
        session.title,
        String(session.cohortId)
      );
      const createdThread = allThreads.find((t) => t.id === String(result.id)) || allThreads[0];

      res.status(201).json({
        threadId: String(result.id),
        status: 'CREATED',
        videoTimestampSec: result.videoTimestampSec,
        thread: createdThread,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 3.10 GET /sessions/:sessionId/chat-messages
learningRouter.get('/sessions/:sessionId/chat-messages', optionalAuth, async (req, res, next) => {
  try {
    const session = await resolveSession(req.params.sessionId);
    if (!session) {
      res.json([]);
      return;
    }

    const liveChatSessions = await db
      .select({
        msgId: chatMessages.id,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
        accountId: chatSessions.accountId,
        fullName: userProfiles.fullName,
        role: accounts.role,
      })
      .from(chatMessages)
      .innerJoin(chatSessions, eq(chatMessages.chatSessionId, chatSessions.id))
      .leftJoin(userProfiles, eq(chatSessions.accountId, userProfiles.accountId))
      .leftJoin(accounts, eq(chatSessions.accountId, accounts.id))
      .where(and(eq(chatSessions.sessionId, session.id), eq(chatSessions.scope, 'LIVE_COPILOT')))
      .orderBy(asc(chatMessages.createdAt));

    const dbMapped = liveChatSessions.map((m) => {
      const isStaff = m.role === 'INSTRUCTOR' || m.role === 'ADMIN';
      const roleLabel =
        m.role === 'INSTRUCTOR'
          ? 'Giảng viên'
          : m.role === 'ADMIN'
            ? 'Quản trị viên'
            : 'Học viên';
      const timeLabel = m.createdAt.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const senderName = m.fullName || 'Học viên';

      return {
        id: String(m.msgId),
        sessionId: String(session.id),
        senderName,
        sender: senderName,
        senderRole: roleLabel,
        roleLabel,
        timeLabel,
        time: timeLabel,
        text: m.content,
        isStaff,
      };
    });

    res.json(dbMapped);
  } catch (err) {
    next(err);
  }
});

// 3.11 POST /sessions/:sessionId/chat-messages
const sendLiveChatSchema = z.object({
  text: z.string().min(1, 'Nội dung tin nhắn không được để trống'),
});

learningRouter.post(
  '/sessions/:sessionId/chat-messages',
  requireAuth,
  validate(sendLiveChatSchema),
  async (req, res, next) => {
    try {
      const session = await resolveSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'SESSION_NOT_FOUND',
          message: 'Không tìm thấy buổi học',
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Không tìm thấy buổi học',
          },
        });
        return;
      }

      const accountId = req.user!.id;
      const { text } = req.body;

      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.accountId, accountId))
        .limit(1);

      let [liveChatSess] = await db
        .select()
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.accountId, accountId),
            eq(chatSessions.sessionId, session.id),
            eq(chatSessions.scope, 'LIVE_COPILOT')
          )
        )
        .limit(1);

      if (!liveChatSess) {
        const [created] = await db
          .insert(chatSessions)
          .values({
            accountId,
            scope: 'LIVE_COPILOT',
            cohortId: session.cohortId,
            sessionId: session.id,
            title: `Live Chat Buổi ${session.sessionOrder}`,
          })
          .returning();
        liveChatSess = created;
      }

      const [insertedMsg] = await db
        .insert(chatMessages)
        .values({
          chatSessionId: liveChatSess!.id,
          role: 'user',
          content: text,
        })
        .returning();

      const now = insertedMsg?.createdAt ?? new Date();
      const isStaff = req.user!.role === 'INSTRUCTOR' || req.user!.role === 'ADMIN';
      const roleLabel =
        req.user!.role === 'INSTRUCTOR'
          ? 'Giảng viên'
          : req.user!.role === 'ADMIN'
            ? 'Quản trị viên'
            : 'Học viên';
      const timeLabel = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const senderName = profile?.fullName || req.user!.email;

      const message = {
        id: String(insertedMsg?.id ?? Date.now()),
        sessionId: String(session.id),
        senderName,
        sender: senderName,
        senderRole: roleLabel,
        roleLabel,
        timeLabel,
        time: timeLabel,
        text,
        isStaff,
      };

      res.status(201).json(message);
    } catch (err) {
      next(err);
    }
  }
);

// 3.12 POST /live/guest/verify
const verifyGuestSchema = z.object({
  token: z.string().optional(),
  inviteToken: z.string().optional(),
  sessionId: z.union([z.string(), z.number()]).optional(),
  guestDisplayName: z.string().optional(),
  guestRoleHeadline: z.string().optional(),
});

learningRouter.post(
  '/live/guest/verify',
  validate(verifyGuestSchema),
  async (req, res, next) => {
    try {
      const rawToken = req.body.token || req.body.inviteToken || '';
      const rawSessionId = req.body.sessionId;
      const guestDisplayName = req.body.guestDisplayName || 'Diễn giả Khách mời';
      const guestRoleHeadline = req.body.guestRoleHeadline || 'Diễn giả Khách mời Doanh nghiệp';

      let decodedSessionId: string | number | undefined = rawSessionId;
      let decodedRoleLabel = guestRoleHeadline;

      if (rawToken) {
        try {
          const decoded = jwt.verify(rawToken, env.JWT_ACCESS_SECRET) as {
            sessionId?: number | string;
            guestRoleHeadline?: string;
          };
          if (decoded.sessionId) decodedSessionId = decoded.sessionId;
          if (decoded.guestRoleHeadline) decodedRoleLabel = decoded.guestRoleHeadline;
        } catch {
          res.status(401).json({
            valid: false,
            verified: false,
            message: 'Mã mời Khách mời không hợp lệ hoặc đã hết hạn.',
          });
          return;
        }
      }

      const session = decodedSessionId
        ? await resolveSession(decodedSessionId)
        : (
            await db
              .select()
              .from(classSessions)
              .where(eq(classSessions.status, 'LIVE'))
              .limit(1)
          )[0];

      if (!session) {
        res.status(404).json({
          valid: false,
          verified: false,
          message: 'Không tìm thấy phòng học trực tuyến.',
        });
        return;
      }

      const getStaffForInstructor = await buildInstructorStaffMap();
      const staffInfo = getStaffForInstructor(session.instructorId);

      res.json({
        valid: true,
        verified: true,
        sessionId: String(session.id),
        cohortId: String(session.cohortId),
        sessionTitle: session.title,
        hostInstructorName: staffInfo.instructorName,
        guestDisplayName,
        guestRoleLabel: decodedRoleLabel,
        guestRoleHeadline: decodedRoleLabel,
        joinedAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);
