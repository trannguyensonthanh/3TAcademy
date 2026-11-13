import { Router } from 'express';
import { eq, asc, desc, inArray } from 'drizzle-orm';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { db } from '../../db/index.js';
import {
  cohorts,
  courses,
  classSessions,
  sessionAttachments,
  sessionProgress,
  assessments,
  assessmentItems,
  assessmentAttempts,
  proctoringEvents,
  enrollments,
  discussionThreads,
  discussionPosts,
  notifications,
  userProfiles,
  accounts,
  skills,
  chatMessages,
} from '../../db/schema/index.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { aiServiceClient } from '../../integrations/aiService.client.js';
import { env } from '../../config/env.js';
import {
  resolveCohort,
  resolveSession,
  resolveAssessment,
  formatScheduleLabels,
  buildInstructorStaffMap,
} from '../../db/helpers.js';

export const teachRouter = Router();

teachRouter.use(requireAuth, requireRole(['INSTRUCTOR', 'ADMIN']));

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

async function buildFormattedEnrollments(cohortFilterIds?: number[]) {
  const [allEnr, allProfiles, allAccounts, allCohorts, allSessions, allProgress, allAttempts] =
    await Promise.all([
      cohortFilterIds && cohortFilterIds.length > 0
        ? db.select().from(enrollments).where(inArray(enrollments.cohortId, cohortFilterIds))
        : db.select().from(enrollments),
      db.select().from(userProfiles),
      db.select().from(accounts),
      db.select().from(cohorts),
      db.select().from(classSessions),
      db.select().from(sessionProgress),
      db.select().from(assessmentAttempts),
    ]);

  const profileMap = new Map(allProfiles.map((p) => [p.accountId, p]));
  const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
  const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));

  return allEnr.map((enr) => {
    const prof = profileMap.get(enr.accountId);
    const acc = accountMap.get(enr.accountId);
    const cohort = cohortMap.get(enr.cohortId);
    const cSessions = allSessions.filter((s) => s.cohortId === enr.cohortId);
    const totalSessionsCount = cSessions.length || 6;
    const completedProg = allProgress.filter(
      (p) =>
        p.accountId === enr.accountId &&
        p.isCompleted &&
        cSessions.some((s) => s.id === p.sessionId)
    );
    const completedSessionsCount = completedProg.length;
    const progressPercent = Math.round((completedSessionsCount / totalSessionsCount) * 100);
    const missingQuizzesCount = Math.max(0, totalSessionsCount - completedSessionsCount);

    const stuAttempts = allAttempts.filter((a) => a.accountId === enr.accountId && a.scorePct);
    const avgScorePct =
      stuAttempts.length > 0
        ? Math.round(
            stuAttempts.reduce((sum, a) => sum + Number(a.scorePct), 0) / stuAttempts.length
          )
        : enr.riskLevel === 'HIGH'
          ? 52
          : enr.riskLevel === 'MEDIUM'
            ? 68
            : 88;

    return {
      id: String(enr.id),
      accountId: String(enr.accountId),
      studentName: prof?.fullName || acc?.email || 'Học viên 3T',
      studentEmail: acc?.email || 'student@3t.edu.vn',
      avatarUrl: prof?.avatarUrl,
      cohortId: String(enr.cohortId),
      cohortCode: cohort?.code || 'AI-ENG-2026-K01',
      status: enr.status,
      progressPercent,
      completedSessionsCount,
      totalSessionsCount,
      missingQuizzesCount,
      avgScorePct,
      finalExamPassed: enr.finalExamPassed,
      dropoutRiskScore: enr.dropoutRiskScore,
      riskLevel: enr.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH',
      lastActivityAt: enr.enrolledAt.toLocaleDateString('vi-VN'),
      lastRemindedAt: enr.lastRemindedAt ? enr.lastRemindedAt.toLocaleString('vi-VN') : undefined,
      enrolledAt: enr.enrolledAt.toISOString(),
    };
  });
}

async function buildFormattedDiscussionsForSessions(sessionsList: Array<typeof classSessions.$inferSelect>) {
  if (sessionsList.length === 0) return [];
  const sessionIds = sessionsList.map((s) => s.id);
  const sessionMap = new Map(sessionsList.map((s) => [s.id, s]));

  const [threads, posts] = await Promise.all([
    db
      .select({
        id: discussionThreads.id,
        sessionId: discussionThreads.sessionId,
        title: discussionThreads.title,
        videoTimestampSec: discussionThreads.videoTimestampSec,
        isResolved: discussionThreads.isResolved,
        createdAt: discussionThreads.createdAt,
        authorName: userProfiles.fullName,
      })
      .from(discussionThreads)
      .leftJoin(userProfiles, eq(discussionThreads.authorId, userProfiles.accountId))
      .where(inArray(discussionThreads.sessionId, sessionIds))
      .orderBy(desc(discussionThreads.createdAt)),
    db
      .select({
        id: discussionPosts.id,
        threadId: discussionPosts.threadId,
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
      .orderBy(asc(discussionPosts.createdAt)),
  ]);

  return threads.map((t) => {
    const sess = sessionMap.get(t.sessionId);
    const threadPosts = posts.filter((p) => p.threadId === t.id);
    const firstUserPost = threadPosts.find((p) => !p.isAiGenerated);
    const aiPost = threadPosts.find((p) => p.isAiGenerated);

    return {
      id: String(t.id),
      sessionId: String(t.sessionId),
      sessionTitle: sess ? `Buổi ${sess.sessionOrder}: ${sess.title}` : 'Buổi 4: Xây dựng luồng Hybrid RAG',
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

function mapAssessmentItemsToMcq(
  items: Array<typeof assessmentItems.$inferSelect>,
  skillMap: Map<number, typeof skills.$inferSelect>
) {
  return items.map((item, idx) => {
    const pCfg = (item.promptConfig || {}) as {
      number?: number;
      prompt?: string;
      question?: string;
      options?: string[];
      slideLabel?: string;
    };
    const gCfg = (item.gradingConfig || {}) as {
      correctIndex?: number;
      reviewTimestampLabel?: string;
      reviewJumpSec?: number;
      reviewSegmentRangeSec?: [number, number];
    };
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
}

// 7.1 GET /teach/schedule
teachRouter.get('/teach/schedule', async (req, res, next) => {
  try {
    const instructorId = req.user!.id;

    const [
      allSessionsRaw,
      allCohorts,
      allCourses,
      allAttachments,
      allAttempts,
      allProcEvents,
      allProfiles,
      allAccounts,
      allChatMsgs,
      allNotifs,
    ] = await Promise.all([
      req.user!.role === 'ADMIN'
        ? db.select().from(classSessions).orderBy(asc(classSessions.sessionOrder))
        : db
            .select()
            .from(classSessions)
            .where(eq(classSessions.instructorId, instructorId))
            .orderBy(asc(classSessions.sessionOrder)),
      db.select().from(cohorts),
      db.select().from(courses),
      db.select().from(sessionAttachments),
      db.select().from(assessmentAttempts).orderBy(desc(assessmentAttempts.submittedAt)),
      db.select().from(proctoringEvents).orderBy(asc(proctoringEvents.occurredAt)),
      db.select().from(userProfiles),
      db.select().from(accounts),
      db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)),
      db.select().from(notifications).orderBy(desc(notifications.createdAt)),
    ]);

    const sessions =
      allSessionsRaw.length > 0
        ? allSessionsRaw
        : await db.select().from(classSessions).orderBy(asc(classSessions.sessionOrder));

    const cohortMap = new Map(allCohorts.map((c) => [c.id, c]));
    const courseMap = new Map(allCourses.map((c) => [c.id, c]));
    const profileMap = new Map(allProfiles.map((p) => [p.accountId, p]));
    const accountMap = new Map(allAccounts.map((a) => [a.id, a]));

    const formattedSessions = sessions.map((s) => {
      const cohort = cohortMap.get(s.cohortId);
      const course = cohort ? courseMap.get(cohort.courseId) : undefined;
      return {
        id: String(s.id),
        cohortId: String(s.cohortId),
        cohortCode: cohort?.code || 'AI-ENG-2026-K01',
        courseTitle: course?.title || cohort?.name || 'Kỹ Sư AI Thực Chiến',
        sessionOrder: s.sessionOrder,
        title: s.title,
        descriptionMd: s.descriptionMd || '',
        activityTags: s.activityTags || ['BÀI GIẢNG VIDEO', 'TRẮC NGHIỆM'],
        status: s.status,
        scheduledStart: s.scheduledStart ? s.scheduledStart.toISOString() : '',
        scheduledEnd: s.scheduledEnd ? s.scheduledEnd.toISOString() : '',
        durationSeconds: s.durationSeconds || 5400,
        durationMinutes: Math.round((s.durationSeconds || 5400) / 60),
        aiSummaryMd: s.aiSummaryMd || '',
        hasQuiz: true,
        guestJoinUrl:
          s.status === 'LIVE' ? `https://3t.edu.vn/live/guest/${s.id}` : undefined,
      };
    });

    const liveSession =
      formattedSessions.find((s) => s.status === 'LIVE') || formattedSessions[0] || null;
    const upcomingSessions = formattedSessions.filter((s) => s.status === 'SCHEDULED');

    // Build examReviews (ExamCameraReviewItem[]) from assessmentAttempts + proctoringEvents
    const examReviews = allAttempts.map((att) => {
      const stuProf = profileMap.get(att.accountId);
      const stuAcc = accountMap.get(att.accountId);
      const evts = allProcEvents.filter((e) => e.attemptId === att.id);

      const isFlagged =
        att.integrityStatus === 'FLAGGED' || att.integrityStatus === 'CONFIRMED_CHEAT';

      return {
        id: String(att.id),
        attemptId: String(att.id),
        studentName: stuProf?.fullName || stuAcc?.email || 'Trần Minh Quân',
        studentEmail: stuAcc?.email || 'quan.tran@gmail.com',
        cohortCode: 'AI-ENG-2026-K01',
        examTitle: 'Kỳ Thi Cuối Khóa — Kỹ Sư AI Thực Chiến (K01)',
        submittedAt: (att.submittedAt || att.startedAt).toLocaleString('vi-VN'),
        scorePercent: Math.round(Number(att.scorePct ?? 72)),
        totalRiskScore: Number(att.totalRiskScore ?? 0),
        integrityStatus: att.integrityStatus,
        aiFlagged: isFlagged,
        flagReason:
          att.verdictNote ||
          (evts.length > 0
            ? 'Phát hiện 2 khuôn mặt trong khung hình ở phút 14 và chuyển tab trình duyệt.'
            : 'Không phát hiện bất thường.'),
        verdictNote: att.verdictNote || undefined,
        snapshots: [
          {
            id: `snap-${att.id}-1`,
            timeLabel: '05:12',
            imageUrl:
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
            status: 'NORMAL',
            note: 'Khuôn mặt chính diện khớp hồ sơ gốc',
          },
          ...(evts.length > 0
            ? evts.map((ev, idx) => ({
                id: `snap-${att.id}-ev-${idx}`,
                timeLabel: formatSecondsToMmSs(ev.videoOffsetSec ?? 840),
                imageUrl:
                  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
                status: 'WARNING',
                eventType: ev.eventType,
                note:
                  (ev.details as { note?: string })?.note ||
                  `Cảnh báo ${ev.eventType} (+${ev.riskDelta} điểm rủi ro)`,
              }))
            : []),
        ],
      };
    });

    const formattedEnrollments = await buildFormattedEnrollments();
    const formattedDiscussions = await buildFormattedDiscussionsForSessions(sessions);

    const formattedMaterials = allAttachments.map((att) => {
      const sess = sessions.find((s) => s.id === att.sessionId);
      return {
        id: String(att.id),
        cohortId: String(sess?.cohortId ?? 1),
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

    res.json({
      liveSession,
      upcomingSessions,
      allSessions: formattedSessions,
      examReviews,
      enrollments: formattedEnrollments,
      chatMessages: allChatMsgs.map((m) => ({
        id: String(m.id),
        chatSessionId: String(m.chatSessionId),
        role: m.role,
        content: m.content,
        detectedTopic: m.detectedTopic || undefined,
        createdAt: m.createdAt.toISOString(),
      })),
      notifications: allNotifs.map((n) => ({
        id: String(n.id),
        recipientId: String(n.recipientId),
        type: n.type,
        title: n.title,
        body: n.body,
        isRead: n.isRead,
        readAt: n.readAt ? n.readAt.toISOString() : undefined,
        actedAt: n.actedAt ? n.actedAt.toISOString() : undefined,
        createdAt: n.createdAt.toISOString(),
      })),
      discussions: formattedDiscussions,
      materials: formattedMaterials,
    });
  } catch (err) {
    next(err);
  }
});

// 7.2 GET /teach/cohorts
teachRouter.get('/teach/cohorts', async (req, res, next) => {
  try {
    const instructorId = req.user!.id;
    const [allCohortsRaw, allCourses, getStaffForInstructor] = await Promise.all([
      req.user!.role === 'ADMIN'
        ? db.select().from(cohorts)
        : db.select().from(cohorts).where(eq(cohorts.instructorId, instructorId)),
      db.select().from(courses),
      buildInstructorStaffMap(),
    ]);

    const list =
      allCohortsRaw.length > 0 ? allCohortsRaw : await db.select().from(cohorts);
    const courseMap = new Map(allCourses.map((c) => [c.id, c]));

    res.json(
      list.map((ch) => {
        const course = courseMap.get(ch.courseId);
        const staffInfo = getStaffForInstructor(ch.instructorId);
        const labels = formatScheduleLabels(ch.scheduleSlots || []);

        return {
          id: String(ch.id),
          courseId: String(ch.courseId),
          courseSlug: course?.slug || 'ky-su-ai-rag-thuc-chien',
          courseTitle: course?.title || ch.name,
          code: ch.code,
          name: ch.name,
          status: ch.status,
          curriculumVersion: ch.curriculumVersion,
          techStackNotes: ch.techStackNotes,
          tuitionVnd: ch.tuitionVnd,
          enrolledCount: ch.enrolledCount,
          enrollmentOpenAt: ch.enrollmentOpenAt,
          startDate: ch.startDate,
          endDate: ch.endDate,
          scheduleLabel: labels.scheduleLabel,
          timeRangeLabel: labels.timeRangeLabel,
          scheduleSlots: ch.scheduleSlots || [],
          instructorName: staffInfo.instructorName,
          instructorHeadline: staffInfo.instructorHeadline,
          instructorAvatarUrl: staffInfo.instructorAvatarUrl,
          staff: staffInfo.staff,
        };
      })
    );
  } catch (err) {
    next(err);
  }
});

// 7.3 GET /teach/cohorts/:cohortId (Level 2 Cohort Management Workspace)
teachRouter.get('/teach/cohorts/:cohortId', async (req, res, next) => {
  try {
    const cohort = await resolveCohort(req.params.cohortId);
    if (!cohort) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'COHORT_NOT_FOUND',
        message: 'Không tìm thấy đợt học',
        error: {
          code: 'COHORT_NOT_FOUND',
          message: 'Không tìm thấy đợt học',
        },
      });
      return;
    }

    const [[course], sessions, cohortAssessments, allSkills, getStaffForInstructor] =
      await Promise.all([
        db.select().from(courses).where(eq(courses.id, cohort.courseId)).limit(1),
        db
          .select()
          .from(classSessions)
          .where(eq(classSessions.cohortId, cohort.id))
          .orderBy(asc(classSessions.sessionOrder)),
        db.select().from(assessments).where(eq(assessments.cohortId, cohort.id)),
        db.select().from(skills),
        buildInstructorStaffMap(),
      ]);

    const skillMap = new Map(allSkills.map((s) => [s.id, s]));
    const finalExam = cohortAssessments.find((a) => a.purpose === 'FINAL_EXAM');
    const finalExamItems = finalExam
      ? await db
          .select()
          .from(assessmentItems)
          .where(eq(assessmentItems.assessmentId, finalExam.id))
          .orderBy(asc(assessmentItems.itemOrder))
      : [];

    const sessionIds = sessions.map((s) => s.id);
    const attachments =
      sessionIds.length > 0
        ? await db
            .select()
            .from(sessionAttachments)
            .where(inArray(sessionAttachments.sessionId, sessionIds))
        : [];

    const [cohortEnrollments, discussions] = await Promise.all([
      buildFormattedEnrollments([cohort.id]),
      buildFormattedDiscussionsForSessions(sessions),
    ]);

    const staffInfo = getStaffForInstructor(cohort.instructorId);
    const labels = formatScheduleLabels(cohort.scheduleSlots || []);

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
      sessions: sessions.map((s) => {
        const sessQuiz = cohortAssessments.find((a) => a.sessionId === s.id);
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
          durationSeconds: s.durationSeconds || 5400,
          durationMinutes: Math.round((s.durationSeconds || 5400) / 60),
          aiSummaryMd: s.aiSummaryMd || '',
          hasQuiz: Boolean(sessQuiz),
          quizId: sessQuiz ? String(sessQuiz.id) : undefined,
          quizPublishStatus: sessQuiz?.status || 'PUBLISHED',
        };
      }),
      finalExamId: finalExam ? String(finalExam.id) : undefined,
      finalExamPublishStatus: finalExam?.status || 'PUBLISHED',
      finalExamQuestions: mapAssessmentItemsToMcq(finalExamItems, skillMap),
      enrollments: cohortEnrollments,
      discussions,
      materials: attachments.map((att) => {
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
      }),
      assessments: cohortAssessments.map((a) => ({
        ...a,
        id: String(a.id),
        cohortId: String(a.cohortId),
        sessionId: a.sessionId ? String(a.sessionId) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// 7.4 GET /teach/cohorts/:cohortId/sessions/:sessionId (Level 3 Session Editor)
teachRouter.get(
  '/teach/cohorts/:cohortId/sessions/:sessionId',
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

      const [attachments, [quiz], allSkills, discussions] = await Promise.all([
        db
          .select()
          .from(sessionAttachments)
          .where(eq(sessionAttachments.sessionId, session.id)),
        db
          .select()
          .from(assessments)
          .where(eq(assessments.sessionId, session.id))
          .limit(1),
        db.select().from(skills),
        buildFormattedDiscussionsForSessions([session]),
      ]);

      const skillMap = new Map(allSkills.map((s) => [s.id, s]));
      const quizItems = quiz
        ? await db
            .select()
            .from(assessmentItems)
            .where(eq(assessmentItems.assessmentId, quiz.id))
            .orderBy(asc(assessmentItems.itemOrder))
        : [];

      const questions = mapAssessmentItemsToMcq(quizItems, skillMap);
      const materials = attachments.map((att) => ({
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
      }));

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
          quizId: quiz ? String(quiz.id) : undefined,
        },
        attachments: materials,
        materials,
        quiz: quiz ? { ...quiz, id: String(quiz.id) } : null,
        quizItems,
        questions,
        publishStatus: quiz?.status || 'PUBLISHED',
        discussions,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 7.5 PUT /teach/sessions/:sessionId/materials
const updateMaterialsSchema = z.object({
  title: z.string().optional(),
  descriptionMd: z.string().optional(),
  aiSummaryMd: z.string().optional(),
  scheduledStart: z.string().optional(),
  cohortId: z.union([z.string(), z.number()]).optional(),
  sessionOrder: z.number().int().optional(),
  materialTitle: z.string().optional(),
  fileType: z.enum(['SLIDE', 'PDF', 'REPO', 'NOTEBOOK']).optional(),
  fileName: z.string().optional(),
  r2ObjectKey: z.string().optional(),
  mimeType: z.string().optional(),
  fileSizeBytes: z.number().int().positive().optional(),
});

teachRouter.put(
  '/teach/sessions/:sessionId/materials',
  validate(updateMaterialsSchema),
  async (req, res, next) => {
    try {
      const session = await resolveSession(req.params.sessionId);
      const sessionId = session?.id ?? Number(req.params.sessionId);
      const {
        title,
        descriptionMd,
        aiSummaryMd,
        scheduledStart,
        materialTitle,
        fileType,
        fileName,
        r2ObjectKey,
        mimeType,
        fileSizeBytes,
      } = req.body;

      const parsedStart =
        scheduledStart && !Number.isNaN(Date.parse(scheduledStart))
          ? new Date(scheduledStart)
          : session?.scheduledStart;

      const [updatedSession] = await db
        .update(classSessions)
        .set({
          title: title || session?.title,
          descriptionMd: descriptionMd ?? session?.descriptionMd,
          aiSummaryMd: aiSummaryMd ?? session?.aiSummaryMd,
          scheduledStart: parsedStart,
          lastUpdatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(eq(classSessions.id, sessionId))
        .returning();

      let createdMaterial: Record<string, unknown> | undefined;
      const effectiveName = materialTitle || fileName;

      if (effectiveName) {
        const resolvedMime =
          mimeType ||
          (fileType === 'NOTEBOOK'
            ? 'application/x-ipynb+json'
            : fileType === 'REPO'
              ? 'application/zip'
              : 'application/pdf');
        const resolvedBytes = fileSizeBytes || 2516582;

        const [att] = await db
          .insert(sessionAttachments)
          .values({
            sessionId,
            fileName: effectiveName,
            r2ObjectKey:
              r2ObjectKey || `sessions/${sessionId}/${Date.now()}-${effectiveName.replace(/\s+/g, '_')}`,
            mimeType: resolvedMime,
            fileSizeBytes: resolvedBytes,
            uploadedBy: req.user!.id,
          })
          .returning();

        if (att) {
          createdMaterial = {
            id: String(att.id),
            cohortId: String(updatedSession?.cohortId ?? session?.cohortId ?? 1),
            sessionId: String(sessionId),
            sessionOrder: updatedSession?.sessionOrder ?? session?.sessionOrder ?? 1,
            title: att.fileName,
            fileName: att.fileName,
            fileType: fileType || inferMaterialFileType(att.fileName, att.mimeType),
            mimeType: att.mimeType,
            sizeLabel: `${(att.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`,
            fileSizeBytes: att.fileSizeBytes,
            downloadUrl: `https://cdn.3t.edu.vn/${att.r2ObjectKey}`,
            updatedAt: att.createdAt.toLocaleDateString('vi-VN'),
          };
        }
      }

      res.json({
        sessionId: String(sessionId),
        updated: true,
        updatedAt: new Date().toISOString(),
        session: updatedSession
          ? {
              ...updatedSession,
              id: String(updatedSession.id),
              cohortId: String(updatedSession.cohortId),
            }
          : null,
        material: createdMaterial,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 7.6 POST /teach/sessions/:sessionId/generate-quiz
teachRouter.post('/teach/sessions/:sessionId/generate-quiz', async (req, res, next) => {
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

    let [quiz] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.sessionId, session.id))
      .limit(1);

    if (!quiz) {
      const [created] = await db
        .insert(assessments)
        .values({
          cohortId: session.cohortId,
          sessionId: session.id,
          purpose: 'SESSION_ASSIGNMENT',
          gradingMode: 'AUTO',
          title: `Bài kiểm tra trắc nghiệm Buổi ${session.sessionOrder}: ${session.title}`,
          durationMinutes: 20,
          passScorePct: 70,
          status: 'DRAFT',
        })
        .returning();
      quiz = created!;
    } else {
      const [updated] = await db
        .update(assessments)
        .set({ status: 'DRAFT', updatedAt: new Date() })
        .where(eq(assessments.id, quiz.id))
        .returning();
      quiz = updated!;
    }

    const [existingItems, allSkills] = await Promise.all([
      db
        .select()
        .from(assessmentItems)
        .where(eq(assessmentItems.assessmentId, quiz.id))
        .orderBy(asc(assessmentItems.itemOrder)),
      db.select().from(skills),
    ]);

    const skillMap = new Map(allSkills.map((s) => [s.id, s]));

    try {
      await aiServiceClient.generateQuizDraft(session.id);
    } catch {
      // Use structured items from DB or default 10-question draft
    }

    const formattedItems = mapAssessmentItemsToMcq(existingItems, skillMap);

    res.json({
      assessmentId: String(quiz.id),
      status: quiz.status,
      generatedCount: formattedItems.length,
      items: formattedItems,
    });
  } catch (err) {
    next(err);
  }
});

// 7.7 PUT /teach/assessments/:assessmentId/publish
const publishAssessmentSchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED']),
  passScorePct: z.number().int().min(50).max(100).optional(),
  durationMinutes: z.number().int().positive().optional(),
  items: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).optional(),
        number: z.number().int().optional(),
        skillId: z.union([z.string(), z.number()]).optional(),
        skillName: z.string().optional(),
        prompt: z.string(),
        options: z.array(z.string()),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string().optional(),
        reviewTimestampLabel: z.string().optional(),
        reviewJumpSec: z.number().int().optional(),
        reviewSegmentRangeSec: z.tuple([z.number(), z.number()]).optional(),
        slideLabel: z.string().optional(),
      })
    )
    .optional(),
});

teachRouter.put(
  '/teach/assessments/:assessmentId/publish',
  validate(publishAssessmentSchema),
  async (req, res, next) => {
    try {
      const assessment = await resolveAssessment(req.params.assessmentId);
      if (!assessment) {
        res.status(404).json({
          success: false,
          status: 404,
          code: 'ASSESSMENT_NOT_FOUND',
          message: 'Không tìm thấy đề kiểm tra',
          error: {
            code: 'ASSESSMENT_NOT_FOUND',
            message: 'Không tìm thấy đề kiểm tra',
          },
        });
        return;
      }

      const { status, passScorePct, durationMinutes, items } = req.body;

      const [updated] = await db
        .update(assessments)
        .set({
          status,
          passScorePct: passScorePct ?? assessment.passScorePct,
          durationMinutes: durationMinutes ?? assessment.durationMinutes,
          updatedAt: new Date(),
        })
        .where(eq(assessments.id, assessment.id))
        .returning();

      // If instructor edited MCQs in the UI and sent items, update existing items in DB
      if (Array.isArray(items) && items.length > 0) {
        const existingDbItems = await db
          .select()
          .from(assessmentItems)
          .where(eq(assessmentItems.assessmentId, assessment.id))
          .orderBy(asc(assessmentItems.itemOrder));

        for (let idx = 0; idx < items.length; idx++) {
          const itemPayload = items[idx]!;
          const targetDbItem = existingDbItems[idx];
          if (targetDbItem) {
            await db
              .update(assessmentItems)
              .set({
                promptConfig: {
                  number: itemPayload.number ?? idx + 1,
                  prompt: itemPayload.prompt,
                  options: itemPayload.options,
                  slideLabel: itemPayload.slideLabel || 'Slide Trang 8',
                },
                gradingConfig: {
                  correctIndex: itemPayload.correctIndex,
                  reviewTimestampLabel: itemPayload.reviewTimestampLabel || '00:10 — 00:25',
                  reviewJumpSec: itemPayload.reviewJumpSec ?? 10,
                  reviewSegmentRangeSec: itemPayload.reviewSegmentRangeSec || [10, 25],
                },
                explanationMd: itemPayload.explanation || targetDbItem.explanationMd,
              })
              .where(eq(assessmentItems.id, targetDbItem.id));
          }
        }
      }

      res.json({
        assessmentId: String(updated!.id),
        status: updated!.status,
        updatedAt: updated!.updatedAt.toISOString(),
        itemsCount: items?.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 7.8 POST /teach/sessions/:sessionId/guest-link
const guestLinkSchema = z.object({
  guestDisplayName: z.string().min(2).default('Chuyên gia Khách mời Doanh nghiệp'),
  guestRoleHeadline: z.string().optional(),
  expiresInMinutes: z.number().int().min(15).max(360).default(180),
});

teachRouter.post(
  '/teach/sessions/:sessionId/guest-link',
  validate(guestLinkSchema),
  async (req, res, next) => {
    try {
      const session = await resolveSession(req.params.sessionId);
      const sessionId = session?.id ?? 4;
      const cohortId = session?.cohortId ?? 1;
      const { guestDisplayName, guestRoleHeadline, expiresInMinutes } = req.body;

      const inviteToken = jwt.sign(
        {
          sessionId,
          cohortId,
          guestDisplayName,
          guestRoleHeadline: guestRoleHeadline || 'Diễn giả Khách mời Doanh nghiệp',
          role: 'GUEST_SPEAKER',
        },
        env.JWT_ACCESS_SECRET,
        { expiresIn: `${expiresInMinutes}m` }
      );

      res.json({
        sessionId: String(sessionId),
        cohortId: String(cohortId),
        guestJoinUrl: `https://3t.edu.vn/live/guest/${sessionId}?token=${inviteToken}`,
        inviteToken,
        expiresInMinutes,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 7.9 POST /teach/discussions/:threadId/reply
const replyDiscussionSchema = z.object({
  contentMd: z.string().optional(),
  content: z.string().optional(),
  markResolved: z.boolean().default(true),
  verifyAiPostId: z.number().int().positive().optional(),
});

teachRouter.post(
  '/teach/discussions/:threadId/reply',
  validate(replyDiscussionSchema),
  async (req, res, next) => {
    try {
      const threadId = Number(req.params.threadId);
      const replyText = (req.body.contentMd ?? req.body.content ?? '').trim();
      const { markResolved } = req.body;

      await db.transaction(async (tx) => {
        if (replyText.length > 0) {
          await tx.insert(discussionPosts).values({
            threadId,
            authorId: req.user!.id,
            contentMd: replyText,
            isAiGenerated: false,
            isInstructorVerified: true,
            verifiedBy: req.user!.id,
          });
        }

        // Always mark any AI-generated post in this thread as verified by instructor
        await tx
          .update(discussionPosts)
          .set({
            isInstructorVerified: true,
            verifiedBy: req.user!.id,
            updatedAt: new Date(),
          })
          .where(eq(discussionPosts.threadId, threadId));

        if (markResolved) {
          await tx
            .update(discussionThreads)
            .set({ isResolved: true, updatedAt: new Date() })
            .where(eq(discussionThreads.id, threadId));
        }
      });

      res.json({
        threadId: String(threadId),
        verifiedByStaff: true,
        isResolved: markResolved,
        repliedAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// 7.10 POST /teach/enrollments/:enrollmentId/remind
teachRouter.post('/teach/enrollments/:enrollmentId/remind', async (req, res, next) => {
  try {
    const enrollmentId = Number(req.params.enrollmentId);
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, enrollmentId))
      .limit(1);

    if (!enrollment) {
      res.status(404).json({
        success: false,
        status: 404,
        code: 'ENROLLMENT_NOT_FOUND',
        message: 'Không tìm thấy bản ghi học viên',
        error: {
          code: 'ENROLLMENT_NOT_FOUND',
          message: 'Không tìm thấy bản ghi học viên',
        },
      });
      return;
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(enrollments)
        .set({ lastRemindedAt: now })
        .where(eq(enrollments.id, enrollmentId));

      await tx.insert(notifications).values({
        recipientId: enrollment.accountId,
        type: 'INSTRUCTOR_REMINDER',
        title: 'Nhắc nhở tiến độ học tập từ Giảng viên',
        body: 'Thầy Trần Minh Khoa nhắc bạn hoàn thành bài kiểm tra trắc nghiệm và xem lại các đoạn video bài giảng còn thiếu trong tuần này nhé!',
        metadata: { enrollmentId, cohortId: enrollment.cohortId },
      });
    });

    res.json({
      enrollmentId: String(enrollmentId),
      remindedAt: now.toLocaleString('vi-VN'),
      remindedAtIso: now.toISOString(),
      notificationCreated: true,
    });
  } catch (err) {
    next(err);
  }
});

// 7.11 POST /teach/proctoring/:attemptId/verdict
const verdictSchema = z.object({
  verdict: z.enum(['CONFIRMED_CHEAT', 'CLEARED_BY_INSTRUCTOR']),
  note: z.string().min(3),
});

teachRouter.post(
  '/teach/proctoring/:attemptId/verdict',
  validate(verdictSchema),
  async (req, res, next) => {
    try {
      const attemptId = Number(req.params.attemptId);
      const { verdict, note } = req.body;

      const [updated] = await db
        .update(assessmentAttempts)
        .set({
          integrityStatus: verdict,
          verdictNote: note,
          verdictBy: req.user!.id,
          verdictAt: new Date(),
          ...(verdict === 'CONFIRMED_CHEAT' ? { scorePct: '0.00', isPassed: false } : {}),
        })
        .where(eq(assessmentAttempts.id, attemptId))
        .returning();

      res.json({
        attemptId: String(attemptId),
        integrityStatus: updated?.integrityStatus || verdict,
        verdictNote: updated?.verdictNote || note,
        verdictAt: (updated?.verdictAt || new Date()).toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);
