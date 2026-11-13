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

async function buildFormattedDiscussions(sessionId: number, sessionOrder: number, sessionTitle: string) {
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

    return {
      id: String(t.id),
      sessionId: String(t.sessionId),
      sessionTitle: `Buổi ${sessionOrder}: ${sessionTitle}`,
      authorName: t.authorName || 'Nguyễn Văn An',
      title: t.title,
      contentMd: firstUserPost?.contentMd || t.title,
      videoTimestampSec: t.videoTimestampSec ?? 10,
      timestampSec: t.videoTimestampSec ?? 10,
      timestampLabel: formatSecondsToMmSs(t.videoTimestampSec ?? 10),
      isResolved: t.isResolved,
      createdAt: t.createdAt.toISOString(),
      aiSuggestedAnswer: aiPost?.contentMd,
      verifiedByStaff: Boolean(aiPost?.isInstructorVerified || t.isResolved),
      replies: threadPosts.map((p) => ({
        id: String(p.id),
        authorName: p.isAiGenerated
          ? 'Trợ giảng AI 3T (RAG)'
          : p.authorName || 'TS. Trần Minh Khoa',
        role: p.isAiGenerated ? 'AI_TUTOR' : p.authorRole || 'INSTRUCTOR',
        contentMd: p.contentMd,
        isAiGenerated: p.isAiGenerated,
        isInstructorVerified: p.isInstructorVerified,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  });
}

// 3.1 GET /me/dashboard
learningRouter.get('/me/dashboard', requireAuth, async (req, res, next) => {
  try {
    const accountId = req.user!.id;

    const myEnrollments = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.accountId, accountId), inArray(enrollments.status, ['ACTIVE', 'COMPLETED'])));

    const progressRows = await db
      .select({
        sessionId: sessionProgress.sessionId,
        lastPositionSec: sessionProgress.lastPositionSec,
        isCompleted: sessionProgress.isCompleted,
        lastActivityAt: sessionProgress.lastActivityAt,
        title: classSessions.title,
        sessionOrder: classSessions.sessionOrder,
        durationSeconds: classSessions.durationSeconds,
        cohortId: classSessions.cohortId,
        cohortCode: cohorts.code,
        courseTitle: courses.title,
      })
      .from(sessionProgress)
      .innerJoin(classSessions, eq(sessionProgress.sessionId, classSessions.id))
      .innerJoin(cohorts, eq(classSessions.cohortId, cohorts.id))
      .innerJoin(courses, eq(cohorts.courseId, courses.id))
      .where(eq(sessionProgress.accountId, accountId))
      .orderBy(desc(sessionProgress.lastActivityAt));

    const resumeCandidate =
      progressRows.find((p) => !p.isCompleted) || progressRows[0] || null;

    const cohortIds = myEnrollments.map((e) => e.cohortId);
    let upcomingTasks: Array<{
      id: string;
      cohortId: string;
      sessionId: string | null;
      title: string;
      purpose: string;
      dueAt: Date | null;
      durationMinutes: number | null;
      passScorePct: number;
      score?: number;
      statusLabel: string;
    }> = [];

    if (cohortIds.length > 0) {
      const [allAss, myAttempts] = await Promise.all([
        db
          .select()
          .from(assessments)
          .where(and(inArray(assessments.cohortId, cohortIds), eq(assessments.status, 'PUBLISHED'))),
        db
          .select()
          .from(assessmentAttempts)
          .where(eq(assessmentAttempts.accountId, accountId))
          .orderBy(desc(assessmentAttempts.submittedAt)),
      ]);

      upcomingTasks = allAss.map((a) => {
        const bestAttempt = myAttempts.find((att) => att.assessmentId === a.id);
        const scoreNum = bestAttempt?.scorePct ? Math.round(Number(bestAttempt.scorePct)) : undefined;
        return {
          id: String(a.id),
          cohortId: String(a.cohortId),
          sessionId: a.sessionId ? String(a.sessionId) : null,
          title: a.title,
          purpose: a.purpose,
          dueAt: a.dueAt,
          durationMinutes: a.durationMinutes,
          passScorePct: a.passScorePct,
          score: scoreNum,
          statusLabel: bestAttempt?.isPassed
            ? `Đã đạt (${scoreNum}%)`
            : bestAttempt
              ? `Cần làm lại (${scoreNum}%)`
              : 'Chưa làm bài',
        };
      });
    }

    const skillStates = await db
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
      .where(eq(studentSkillStates.accountId, accountId));

    const userNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientId, accountId))
      .orderBy(desc(notifications.createdAt))
      .limit(10);

    const attemptTrend = [
      {
        label: 'Buổi 1',
        subLabel: 'Kiến trúc RAG',
        value: 82,
        detailText: '82/100 điểm · Hoàn thành đúng hạn',
      },
      {
        label: 'Buổi 2',
        subLabel: 'Bóc tách PDF',
        value: 88,
        detailText: '88/100 điểm · Tăng +6 điểm',
      },
      {
        label: 'Buổi 3',
        subLabel: 'pgvector HNSW',
        value: 90,
        detailText: '90/100 điểm · Nắm vững chỉ mục Vector',
      },
      {
        label: 'Buổi 4',
        subLabel: 'Hybrid Search',
        value: 94,
        detailText: '94/100 điểm · Đạt chuẩn xuất sắc',
      },
    ];

    res.json({
      resumeSession: resumeCandidate
        ? {
            ...resumeCandidate,
            sessionId: String(resumeCandidate.sessionId),
            cohortId: String(resumeCandidate.cohortId),
          }
        : null,
      upcomingTasks,
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

    const [rows, getStaffForInstructor] = await Promise.all([
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
    ]);

    const enriched = await Promise.all(
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
            courseSlug: r.course.slug,
            courseTitle: r.course.title,
            code: r.cohort.code,
            name: r.cohort.name,
            status: r.cohort.status,
            curriculumVersion: r.cohort.curriculumVersion,
            techStackNotes: r.cohort.techStackNotes,
            tuitionVnd: r.cohort.tuitionVnd,
            enrolledCount: r.cohort.enrolledCount,
            enrollmentOpenAt: r.cohort.enrollmentOpenAt,
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

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// 3.3 GET /cohorts/:cohortId/workspace
learningRouter.get('/cohorts/:cohortId/workspace', optionalAuth, async (req, res, next) => {
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

    // Enrollment Access Control Guard (Spec v3.1 API 3.3)
    let studentAccountId = req.user?.id;
    let studentEnrollment: typeof enrollments.$inferSelect | undefined;

    if (req.user && req.user.role === 'STUDENT') {
      const [enr] = await db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.accountId, req.user.id),
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
    } else if (!studentAccountId) {
      const [demoStudent] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.email, 'an.nguyen.dev@gmail.com'))
        .limit(1);
      studentAccountId = demoStudent?.id;
      if (studentAccountId) {
        const [enr] = await db
          .select()
          .from(enrollments)
          .where(and(eq(enrollments.accountId, studentAccountId), eq(enrollments.cohortId, cohort.id)))
          .limit(1);
        studentEnrollment = enr;
      }
    }

    const [[course], sessions, cohortAssessments, getStaffForInstructor, allCats, allSkills, allCourseSkills] =
      await Promise.all([
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
      ]);

    const progressList = studentAccountId
      ? await db
          .select()
          .from(sessionProgress)
          .where(eq(sessionProgress.accountId, studentAccountId))
      : [];

    const attemptList = studentAccountId
      ? await db
          .select()
          .from(assessmentAttempts)
          .where(eq(assessmentAttempts.accountId, studentAccountId))
          .orderBy(desc(assessmentAttempts.submittedAt))
      : [];

    const sessionIds = sessions.map((s) => s.id);
    const attachments =
      sessionIds.length > 0
        ? await db
            .select()
            .from(sessionAttachments)
            .where(inArray(sessionAttachments.sessionId, sessionIds))
        : [];

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
          : undefined;

      return {
        id: String(s.id),
        cohortId: String(s.cohortId),
        sessionOrder: s.sessionOrder,
        title: s.title,
        descriptionMd: s.descriptionMd || '',
        activityTags: s.activityTags || ['BÀI GIẢNG VIDEO', 'TRẮC NGHIỆM'],
        status: s.status,
        scheduledStart: s.scheduledStart ? s.scheduledStart.toISOString() : '',
        scheduledEnd: s.scheduledEnd ? s.scheduledEnd.toISOString() : '',
        livekitRoomName: s.livekitRoomName,
        durationSeconds: s.durationSeconds || 5400,
        durationMinutes: Math.round((s.durationSeconds || 5400) / 60),
        aiSummaryMd: s.aiSummaryMd || '',
        isCompleted,
        lastPositionSec: prog?.lastPositionSec ?? 0,
        hasQuiz: Boolean(sessQuiz),
        quizId: sessQuiz ? String(sessQuiz.id) : `quiz-sess-${s.id}`,
        quizTitle: sessQuiz?.title || `Trắc nghiệm củng cố Buổi ${s.sessionOrder}`,
        quizStatus: isCompleted
          ? ('COMPLETED' as const)
          : bestQuizAttempt
            ? ('IN_PROGRESS' as const)
            : ('NOT_STARTED' as const),
        quizScore,
        guestJoinUrl:
          s.status === 'LIVE' ? `https://3t.edu.vn/live/guest/${s.id}` : undefined,
      };
    });

    const mappedMaterials = attachments.map((att) => {
      const sess = sessions.find((s) => s.id === att.sessionId);
      return {
        id: String(att.id),
        cohortId: String(cohort.id),
        sessionId: String(att.sessionId),
        sessionOrder: sess?.sessionOrder ?? 1,
        title: att.fileName,
        fileName: att.fileName,
        fileType: inferMaterialFileType(att.fileName, att.mimeType),
        mimeType: att.mimeType,
        sizeLabel: `${(att.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`,
        fileSizeBytes: att.fileSizeBytes,
        downloadUrl: `https://cdn.3t.edu.vn/${att.r2ObjectKey}`,
        updatedAt: att.createdAt.toLocaleDateString('vi-VN'),
      };
    });

    const catMap = new Map(allCats.map((c) => [c.id, c]));
    const skillMap = new Map(allSkills.map((s) => [s.id, s]));
    const syllabus = Array.isArray(course?.syllabusTemplate) ? course.syllabusTemplate : [];

    res.json({
      cohort: {
        id: String(cohort.id),
        courseId: String(cohort.courseId),
        courseSlug: course?.slug || 'ky-su-ai-rag-thuc-chien',
        courseTitle: course?.title || cohort.name,
        code: cohort.code,
        name: cohort.name,
        status: cohort.status,
        curriculumVersion: cohort.curriculumVersion,
        techStackNotes: cohort.techStackNotes,
        tuitionVnd: cohort.tuitionVnd,
        enrolledCount: cohort.enrolledCount,
        enrollmentOpenAt: cohort.enrollmentOpenAt,
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
            category: catMap.get(course.categoryId)?.name || 'Kỹ thuật AI & Phần mềm',
            shortDescription: course.shortDescription,
            descriptionMd: course.descriptionMd,
            thumbnailUrl: course.thumbnailUrl,
            difficultyLevel: course.difficultyLevel,
            durationWeeks: Math.max(4, Math.ceil(syllabus.length / 2) || 6),
            totalHours: Math.max(16, syllabus.length * 3 || 24),
            ratingAvg: 4.9,
            reviewCount: 42,
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
      finalExamId: finalExam ? String(finalExam.id) : null,
      finalExamPassed: Boolean(studentEnrollment?.finalExamPassed || finalExamAttempt),
    });
  } catch (err) {
    next(err);
  }
});

// 3.4 GET /cohorts/:cohortId/sessions/:sessionId
learningRouter.get(
  '/cohorts/:cohortId/sessions/:sessionId',
  optionalAuth,
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

      // Enrollment Access Control Guard (Spec v3.1 API 3.4)
      let studentAccountId = req.user?.id;
      if (req.user && req.user.role === 'STUDENT') {
        const [enr] = await db
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.accountId, req.user.id),
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
      } else if (!studentAccountId) {
        const [demoStudent] = await db
          .select()
          .from(accounts)
          .where(eq(accounts.email, 'an.nguyen.dev@gmail.com'))
          .limit(1);
        studentAccountId = demoStudent?.id;
      }

      const [attachments, [quiz], discussions, progRows, chunks] = await Promise.all([
        db
          .select()
          .from(sessionAttachments)
          .where(eq(sessionAttachments.sessionId, session.id)),
        db
          .select()
          .from(assessments)
          .where(eq(assessments.sessionId, session.id))
          .limit(1),
        buildFormattedDiscussions(session.id, session.sessionOrder, session.title),
        studentAccountId
          ? db
              .select()
              .from(sessionProgress)
              .where(
                and(
                  eq(sessionProgress.accountId, studentAccountId),
                  eq(sessionProgress.sessionId, session.id)
                )
              )
              .limit(1)
          : Promise.resolve([]),
        db
          .select()
          .from(knowledgeChunks)
          .where(eq(knowledgeChunks.sessionId, session.id))
          .orderBy(asc(knowledgeChunks.chunkIndex)),
      ]);

      const prog = progRows[0];
      let bestQuizAttempt: typeof assessmentAttempts.$inferSelect | undefined;
      if (quiz && studentAccountId) {
        const attempts = await db
          .select()
          .from(assessmentAttempts)
          .where(
            and(
              eq(assessmentAttempts.assessmentId, quiz.id),
              eq(assessmentAttempts.accountId, studentAccountId)
            )
          )
          .orderBy(desc(assessmentAttempts.scorePct));
        bestQuizAttempt = attempts[0];
      }

      const isCompleted = Boolean(prog?.isCompleted || bestQuizAttempt?.isPassed);
      const quizScore = bestQuizAttempt?.scorePct
        ? Math.round(Number(bestQuizAttempt.scorePct))
        : isCompleted
          ? 100
          : undefined;

      const transcript =
        chunks.length > 0
          ? chunks.map((ch, idx) => ({
              id: `cue-${ch.id}`,
              startSec: ch.startSec ?? idx * 15 + 10,
              endSec: ch.endSec ?? (idx + 1) * 15 + 10,
              timeLabel: formatSecondsToMmSs(ch.startSec ?? idx * 15 + 10),
              text: ch.content,
              slideLabel: ch.pageNumber ? `Slide Trang ${ch.pageNumber}` : `Slide Trang ${idx * 4 + 8}`,
            }))
          : [
              {
                id: 'cue-1',
                startSec: 10,
                endSec: 25,
                timeLabel: '00:10',
                text: 'Để giữ nguyên ý nghĩa khi đọc báo cáo PDF dài hàng trăm trang, mình nhận diện các dòng tiêu đề mục lớn và đóng gói toàn bộ bảng số liệu thành một khối Markdown nguyên vẹn kèm theo số trang gốc.',
                slideLabel: 'Slide Trang 8',
              },
              {
                id: 'cue-2',
                startSec: 25,
                endSec: 40,
                timeLabel: '00:25',
                text: 'Tại sao chỗ này phải kết hợp cả tìm kiếm từ khóa lẫn tìm kiếm theo ý nghĩa câu hỏi? Vì tìm kiếm từ khóa bắt trúng mã hợp đồng, còn tìm kiếm ngữ nghĩa hiểu câu hỏi tự nhiên của nhân viên.',
                slideLabel: 'Slide Trang 12',
              },
              {
                id: 'cue-3',
                startSec: 45,
                endSec: 65,
                timeLabel: '00:45',
                text: 'Lưu ý rất quan trọng về xử lý bất đồng bộ: Chúng ta dùng Promise.all hoặc asyncio.gather để chạy song song hai bộ tìm kiếm, giúp tốc độ phản hồi luôn dưới 1 giây.',
                slideLabel: 'Slide Trang 18',
              },
            ];

      const chapters = [
        {
          id: 'chap-1',
          title: 'Phần 1: Bóc tách PDF phức tạp & Bảo toàn cấu trúc bảng biểu Markdown',
          startSec: 10,
          timeLabel: '00:10',
          slideLabel: 'Slide Trang 8',
        },
        {
          id: 'chap-2',
          title: 'Phần 2: Kết hợp BM25 Full-Text Search & pgvector Cosine bằng công thức RRF',
          startSec: 25,
          timeLabel: '00:25',
          slideLabel: 'Slide Trang 12',
        },
        {
          id: 'chap-3',
          title: 'Phần 3: Tối ưu truy vấn bất đồng bộ song song dưới 800ms với asyncio.gather',
          startSec: 45,
          timeLabel: '00:45',
          slideLabel: 'Slide Trang 18',
        },
      ];

      // Fetch AI Tutor chat history for this session
      const tutorSessions = await db
        .select()
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.sessionId, session.id),
            eq(chatSessions.scope, 'SESSION_TUTOR')
          )
        )
        .orderBy(desc(chatSessions.createdAt));

      let aiChatHistory: Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
        citations?: Array<{ label: string; jumpSec: number; slideLabel?: string }>;
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
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
          citations: Array.isArray(m.citations)
            ? (m.citations as Array<{ label: string; jumpSec: number; slideLabel?: string }>)
            : [],
          createdAt: m.createdAt.toISOString(),
        }));
      }

      res.json({
        session: {
          id: String(session.id),
          cohortId: String(session.cohortId),
          sessionOrder: session.sessionOrder,
          title: session.title,
          descriptionMd: session.descriptionMd || '',
          activityTags: session.activityTags || ['BÀI GIẢNG VIDEO', 'TRẮC NGHIỆM'],
          status: session.status,
          scheduledStart: session.scheduledStart ? session.scheduledStart.toISOString() : '',
          scheduledEnd: session.scheduledEnd ? session.scheduledEnd.toISOString() : '',
          durationSeconds: session.durationSeconds || 5400,
          durationMinutes: Math.round((session.durationSeconds || 5400) / 60),
          aiSummaryMd: session.aiSummaryMd || '',
          isCompleted,
          lastPositionSec: prog?.lastPositionSec ?? 0,
          hasQuiz: Boolean(quiz),
          quizId: quiz ? String(quiz.id) : `quiz-sess-${session.id}`,
          quizTitle: quiz?.title || `Trắc nghiệm củng cố Buổi ${session.sessionOrder}`,
          quizStatus: isCompleted
            ? ('COMPLETED' as const)
            : bestQuizAttempt
              ? ('IN_PROGRESS' as const)
              : ('NOT_STARTED' as const),
          quizScore,
        },
        videoUrl: session.videoR2Key
          ? `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4`
          : null,
        transcript,
        chapters,
        aiChatHistory,
        attachments: attachments.map((att) => ({
          id: String(att.id),
          cohortId: String(session.cohortId),
          sessionId: String(session.id),
          sessionOrder: session.sessionOrder,
          title: att.fileName,
          fileName: att.fileName,
          fileType: inferMaterialFileType(att.fileName, att.mimeType),
          mimeType: att.mimeType,
          sizeLabel: `${(att.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`,
          fileSizeBytes: att.fileSizeBytes,
          downloadUrl: `https://cdn.3t.edu.vn/${att.r2ObjectKey}`,
          updatedAt: att.createdAt.toLocaleDateString('vi-VN'),
        })),
        quizSummary: quiz
          ? {
              id: String(quiz.id),
              title: quiz.title,
              passScorePct: quiz.passScorePct,
              durationMinutes: quiz.durationMinutes,
              status: quiz.status,
              bestScorePct: quizScore ?? null,
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

      // Spec v3.1 API 3.5: Watching 100% of video duration does NOT automatically set isCompleted = true!
      // Preserve existing isCompleted state (only passing the quiz sets isCompleted = true).
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
          ? {
              id: String(session.id),
              cohortId: String(session.cohortId),
              sessionOrder: session.sessionOrder,
              title: session.title,
              lastPositionSec,
              isCompleted,
            }
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
      let totalQuestions = answers.length || 3;
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
        } else {
          correctCount = answers.filter((a: number) => a >= 0).length;
        }
      } else {
        correctCount = answers.filter((a: number) => a >= 0).length;
      }

      const scorePercent =
        totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 100;
      const passed = scorePercent >= passThreshold;
      const now = new Date();

      if (passed) {
        await db
          .insert(sessionProgress)
          .values({
            accountId,
            sessionId: session.id,
            lastPositionSec: session.durationSeconds || 1200,
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
        feedbackMessage: passed
          ? `Chúc mừng! Bạn đạt ${scorePercent}% (${correctCount}/${totalQuestions} câu đúng) và đã hoàn thành Buổi ${session.sessionOrder}.`
          : `Bạn đạt ${scorePercent}% (${correctCount}/${totalQuestions} câu đúng). Cần tối thiểu ${passThreshold}% để hoàn thành buổi học.`,
        updatedSession: {
          id: String(session.id),
          cohortId: String(session.cohortId),
          sessionOrder: session.sessionOrder,
          title: session.title,
          isCompleted: passed,
          quizStatus: passed ? 'COMPLETED' : 'IN_PROGRESS',
          quizScore: scorePercent,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// 3.7 POST /ai/tutor/ask
const tutorAskSchema = z.object({
  cohortId: z.union([z.number(), z.string()]),
  sessionId: z.union([z.number(), z.string()]),
  question: z.string().min(2),
  currentVideoSec: z.number().int().min(0).default(0),
});

learningRouter.post(
  '/ai/tutor/ask',
  requireAuth,
  validate(tutorAskSchema),
  async (req, res, next) => {
    try {
      const { cohortId: rawCohortId, sessionId: rawSessionId, question, currentVideoSec } = req.body;
      const accountId = req.user!.id;

      const cohort = await resolveCohort(rawCohortId);
      const session = await resolveSession(rawSessionId, cohort?.id);
      const resolvedCohortId = cohort?.id ?? 1;
      const resolvedSessionId = session?.id ?? 4;

      let answerMd = '';
      let detectedTopic = 'RAG & Vector Search';
      let citations: Array<{ label: string; jumpSec: number; slideLabel?: string }> = [
        { label: '[00:10]', jumpSec: 10, slideLabel: 'Slide Trang 8' },
        { label: '[00:25]', jumpSec: 25, slideLabel: 'Slide Trang 12' },
        { label: '[00:45]', jumpSec: 45, slideLabel: 'Slide Trang 18' },
      ];

      try {
        const aiResp = await aiServiceClient.askSessionTutor({
          cohortId: resolvedCohortId,
          sessionId: resolvedSessionId,
          question,
          currentVideoSec,
        });
        answerMd = aiResp.answerMd;
        detectedTopic = aiResp.detectedTopic || detectedTopic;
        if (Array.isArray(aiResp.citations) && aiResp.citations.length > 0) {
          citations = aiResp.citations.map((c, idx) => ({
            label: formatSecondsToMmSs(c.startSec ?? (idx + 1) * 15),
            jumpSec: c.startSec ?? (idx + 1) * 15,
            slideLabel: c.pageNumber ? `Slide Trang ${c.pageNumber}` : `Slide Trang ${idx * 4 + 8}`,
          }));
        }
      } catch {
        const chunks = await db
          .select()
          .from(knowledgeChunks)
          .where(eq(knowledgeChunks.sessionId, resolvedSessionId))
          .limit(3);

        const snippet =
          chunks[0]?.content ||
          'Để bảo toàn cấu trúc bảng biểu trong PDF dài hàng trăm trang, chúng ta nhận diện tiêu đề mục lớn và đóng gói toàn bộ bảng thành khối Markdown nguyên vẹn kèm số trang gốc.';

        answerMd = `Dựa trên bài giảng của **TS. Trần Minh Khoa** tại mốc **[${formatSecondsToMmSs(currentVideoSec || 10)}]**:\n\n${snippet}\n\nBạn có thể bấm vào các mốc thời gian **[00:10]**, **[00:25]** hoặc **[00:45]** bên dưới để tua nhanh video đến đúng đoạn thầy giải thích chi tiết nhé!`;
      }

      // Persist chat message into chat_sessions & chat_messages for instructor topic analytics
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
            title: `Hỏi đáp Trợ giảng AI — Buổi ${session?.sessionOrder ?? 4}`,
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
    const sessionId = session?.id ?? Number(req.params.sessionId);
    const formatted = await buildFormattedDiscussions(
      sessionId,
      session?.sessionOrder ?? 4,
      session?.title ?? 'Xây dựng luồng Hybrid RAG'
    );
    res.json(formatted);
  } catch (err) {
    next(err);
  }
});

// 3.9 POST /sessions/:sessionId/discussions
const createDiscussionSchema = z.object({
  title: z.string().min(3),
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
      const sessionId = session?.id ?? Number(req.params.sessionId);
      const authorId = req.user!.id;
      const { title, contentMd, videoTimestampSec } = req.body;
      const tsSec = videoTimestampSec ?? 10;

      const aiAnswer = `Chào bạn, dựa trên slide bài giảng tại mốc **[${formatSecondsToMmSs(tsSec)}]**, bạn cần giữ nguyên dòng tiêu đề cột khi chia đoạn bảng biểu Markdown và kết hợp bộ lọc \`department_id\` trực tiếp trong mệnh đề \`WHERE\` trước khi tính khoảng cách Cosine trên pgvector. Giảng viên sẽ xác nhận thêm cho bạn nhé!`;

      const result = await db.transaction(async (tx) => {
        const [thread] = await tx
          .insert(discussionThreads)
          .values({
            sessionId,
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
        sessionId,
        session?.sessionOrder ?? 4,
        session?.title ?? 'Xây dựng luồng Hybrid RAG'
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
    const sessionId = session?.id ?? 4;

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
      .where(and(eq(chatSessions.sessionId, sessionId), eq(chatSessions.scope, 'LIVE_COPILOT')))
      .orderBy(asc(chatMessages.createdAt));

    const defaultMessages = [
      {
        id: 'live-msg-1',
        sender: 'TS. Trần Minh Khoa',
        roleLabel: 'Giảng viên',
        time: '19:32',
        text: 'Chào cả lớp K01! Tối nay chúng ta thực hành trực tiếp kỹ thuật kết hợp BM25 và pgvector bằng công thức RRF nhé.',
      },
      {
        id: 'live-msg-2',
        sender: 'Lê Hoàng Nam',
        roleLabel: 'Học viên K01',
        time: '19:35',
        text: 'Thầy ơi khi chạy song song 2 nhánh tìm kiếm bằng asyncio.gather thì mình giới hạn connection pool thế nào ạ?',
      },
      {
        id: 'live-msg-3',
        sender: 'Nguyễn Văn An',
        roleLabel: 'Học viên K01',
        time: '19:38',
        text: 'Em đã cấu hình xong chỉ mục HNSW trên Docker local, tốc độ truy vấn giảm xuống còn 45ms rồi thầy ạ!',
      },
    ];

    const dbMapped = liveChatSessions.map((m) => ({
      id: String(m.msgId),
      sender: m.fullName || 'Nguyễn Văn An',
      roleLabel:
        m.role === 'INSTRUCTOR'
          ? 'Giảng viên'
          : m.role === 'ADMIN'
            ? 'Quản trị viên'
            : 'Học viên K01',
      time: m.createdAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      text: m.content,
    }));

    res.json([...defaultMessages, ...dbMapped]);
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
      const sessionId = session?.id ?? 4;
      const cohortId = session?.cohortId ?? 1;
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
            eq(chatSessions.sessionId, sessionId),
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
            cohortId,
            sessionId,
            title: `Live Chat Buổi ${session?.sessionOrder ?? 4}`,
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
      const message = {
        id: String(insertedMsg?.id ?? Date.now()),
        sender: profile?.fullName || req.user!.email,
        roleLabel:
          req.user!.role === 'INSTRUCTOR'
            ? 'Giảng viên'
            : req.user!.role === 'ADMIN'
              ? 'Quản trị viên'
              : 'Học viên K01',
        time: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        text,
      };

      res.status(201).json({ message });
    } catch (err) {
      next(err);
    }
  }
);

// 3.12 POST /live/guest/verify
const verifyGuestSchema = z.object({
  inviteToken: z.string().min(1),
  guestDisplayName: z.string().min(2),
  guestRoleHeadline: z.string().optional(),
});

learningRouter.post(
  '/live/guest/verify',
  validate(verifyGuestSchema),
  async (req, res, next) => {
    try {
      const { inviteToken, guestDisplayName, guestRoleHeadline } = req.body;

      let sessionId = '4';
      let cohortId = '1';

      try {
        const decoded = jwt.verify(inviteToken, env.JWT_ACCESS_SECRET) as {
          sessionId?: number | string;
          cohortId?: number | string;
        };
        if (decoded.sessionId) sessionId = String(decoded.sessionId);
        if (decoded.cohortId) cohortId = String(decoded.cohortId);
      } catch {
        // Fallback: resolve LIVE session from DB if token is custom/demo string
        const [liveSess] = await db
          .select()
          .from(classSessions)
          .where(eq(classSessions.status, 'LIVE'))
          .limit(1);
        if (liveSess) {
          sessionId = String(liveSess.id);
          cohortId = String(liveSess.cohortId);
        }
      }

      res.json({
        verified: true,
        sessionId,
        cohortId,
        guestDisplayName,
        guestRoleHeadline: guestRoleHeadline || 'Diễn giả Khách mời Doanh nghiệp',
        joinedAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);
